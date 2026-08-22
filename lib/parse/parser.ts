// Google Maps Timeline parser.
//
// Google has shipped at least four incompatible export shapes over the years.
// This module normalizes all of them into TimelinePoint[]:
//
//  1. Phone-local export (2024+, Android/iOS "Timeline.json"):
//     a top-level ARRAY of segments with startTime/endTime and one of
//     { timelinePath: [{ point: "geo:lat,lng", ... }] }
//     { visit: { topCandidate: { placeLocation: "geo:lat,lng" } } }
//     { activity: { start: "geo:...", end: "geo:..." } }
//
//  2. The same segments wrapped in { "semanticSegments": [...] }, where
//     coordinates may instead be { latLng: "12.34°, 56.78°" } objects
//     (Takeout "location-history.json").
//
//  3. Classic Takeout "Semantic Location History" monthly files:
//     { timelineObjects: [{ activitySegment | placeVisit }] } with E7
//     integer coordinates and waypointPath / simplifiedRawPath.
//
//  4. Raw "Records.json": { locations: [{ latitudeE7, longitudeE7,
//     timestamp | timestampMs, accuracy }] } - millions of noisy fixes.
//     Only ingested when the user opts in, with an accuracy cutoff.
//
// Coordinates additionally appear as bare "lat,lng" strings, {lat,lng},
// {latitude,longitude} and {latE7,lngE7} - parseCoord handles all of them.

import { haversineKm } from "../geo";
import type { ParseOptions, ParseResult, TimelinePoint } from "../types";

export const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  filterOutliers: true,
  includeRawRecords: false,
  rawAccuracyLimit: 100,
};

/** Any speed above this between consecutive fixes is treated as a GPS glitch. */
const MAX_SPEED_KMH = 1100; // fastest commercial flight + margin

// ---------------------------------------------------------------------------
// low-level value parsing

export function parseCoord(v: unknown): [number, number] | null {
  if (v == null) return null;
  if (typeof v === "string") {
    let s = v.trim();
    if (s.startsWith("geo:")) s = s.slice(4);
    // strip degree marks: "12.34°, 56.78°"
    s = s.replace(/[°\s]/g, "");
    const parts = s.split(",");
    if (parts.length === 2) {
      const lat = Number(parts[0]);
      const lng = Number(parts[1]);
      if (valid(lat, lng)) return [lat, lng];
    }
    return null;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.latLng != null) return parseCoord(o.latLng);
    if (o.point != null) return parseCoord(o.point);
    if (o.placeLocation != null) return parseCoord(o.placeLocation);
    if (typeof o.latitudeE7 === "number" && typeof o.longitudeE7 === "number") {
      const lat = o.latitudeE7 / 1e7;
      const lng = o.longitudeE7 / 1e7;
      if (valid(lat, lng)) return [lat, lng];
    }
    if (typeof o.latE7 === "number" && typeof o.lngE7 === "number") {
      const lat = o.latE7 / 1e7;
      const lng = o.lngE7 / 1e7;
      if (valid(lat, lng)) return [lat, lng];
    }
    const lat = num(o.lat ?? o.latitude);
    const lng = num(o.lng ?? o.lon ?? o.longitude);
    if (lat != null && lng != null && valid(lat, lng)) return [lat, lng];
  }
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/°/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function valid(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    // (0,0) is the classic "no fix" sentinel
    !(lat === 0 && lng === 0)
  );
}

export function parseTime(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return normalizeEpoch(v);
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d+$/.test(s)) return normalizeEpoch(Number(s));
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function normalizeEpoch(n: number): number | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > 1e14) return Math.round(n / 1000); // microseconds
  if (n > 1e11) return Math.round(n);        // milliseconds
  return Math.round(n * 1000);               // seconds
}

// ---------------------------------------------------------------------------
// segment extraction

interface Collector {
  points: TimelinePoint[];
  formats: Set<string>;
  rawTotal: number;
  droppedInaccurate: number;
}

function push(c: Collector, lat: number, lng: number, t: number | null, kind: TimelinePoint["kind"], accuracy?: number) {
  if (t == null) return;
  c.points.push({ lat, lng, t, kind, accuracy });
}

/** Segments from formats 1 & 2 (phone export / semanticSegments). */
function collectSemanticSegment(c: Collector, seg: Record<string, unknown>) {
  const start = parseTime(seg.startTime);
  const end = parseTime(seg.endTime);

  const tp = seg.timelinePath;
  if (Array.isArray(tp)) {
    c.formats.add("timelinePath");
    for (const raw of tp) {
      const o = raw as Record<string, unknown>;
      const coord = parseCoord(o.point ?? o);
      if (!coord) continue;
      let t = parseTime(o.time);
      if (t == null && start != null) {
        const off = num(o.durationMinutesOffsetFromStartTime);
        t = off != null ? start + off * 60_000 : start;
      }
      push(c, coord[0], coord[1], t ?? start, "path");
    }
  }

  const visit = seg.visit as Record<string, unknown> | undefined;
  if (visit) {
    c.formats.add("visits");
    const top = (visit.topCandidate ?? visit) as Record<string, unknown>;
    const coord = parseCoord(top.placeLocation ?? top.location ?? top);
    if (coord) {
      // A visit spans time; represent it as a point at arrival and departure
      // so the marker dwells there on the animation clock.
      push(c, coord[0], coord[1], start, "visit");
      if (end != null && end !== start) push(c, coord[0], coord[1], end, "visit");
    }
  }

  const act = seg.activity as Record<string, unknown> | undefined;
  if (act) {
    c.formats.add("activities");
    const s = parseCoord(act.start);
    const e = parseCoord(act.end);
    if (s) push(c, s[0], s[1], start, "activity");
    if (e) push(c, e[0], e[1], end ?? start, "activity");
  }

  // Some exports put a bare position on the segment
  if (!tp && !visit && !act) {
    const coord = parseCoord(seg.point ?? seg.position ?? seg);
    if (coord && (start != null || end != null)) {
      c.formats.add("points");
      push(c, coord[0], coord[1], start ?? end, "path");
    }
  }
}

/** Classic Takeout timelineObjects (format 3). */
function collectTimelineObject(c: Collector, obj: Record<string, unknown>) {
  const asg = obj.activitySegment as Record<string, unknown> | undefined;
  if (asg) {
    c.formats.add("activitySegments");
    const dur = (asg.duration ?? {}) as Record<string, unknown>;
    const start = parseTime(dur.startTimestamp ?? dur.startTimestampMs);
    const end = parseTime(dur.endTimestamp ?? dur.endTimestampMs);
    const s = parseCoord(asg.startLocation);
    const e = parseCoord(asg.endLocation);
    if (s) push(c, s[0], s[1], start, "activity");

    // Prefer the detailed raw path when present, else waypoints spread over the leg.
    const srp = (asg.simplifiedRawPath as Record<string, unknown> | undefined)?.points;
    if (Array.isArray(srp)) {
      for (const raw of srp) {
        const o = raw as Record<string, unknown>;
        const coord = parseCoord(o);
        if (!coord) continue;
        push(c, coord[0], coord[1], parseTime(o.timestamp ?? o.timestampMs) ?? start, "path", num(o.accuracyMeters) ?? undefined);
      }
    } else {
      const wps = (asg.waypointPath as Record<string, unknown> | undefined)?.waypoints;
      if (Array.isArray(wps) && start != null && end != null && wps.length > 0) {
        wps.forEach((raw, i) => {
          const coord = parseCoord(raw);
          if (!coord) return;
          const t = start + ((end - start) * (i + 1)) / (wps.length + 1);
          push(c, coord[0], coord[1], t, "path");
        });
      }
    }
    if (e) push(c, e[0], e[1], end, "activity");
  }

  const pv = obj.placeVisit as Record<string, unknown> | undefined;
  if (pv) {
    c.formats.add("placeVisits");
    const dur = (pv.duration ?? {}) as Record<string, unknown>;
    const start = parseTime(dur.startTimestamp ?? dur.startTimestampMs);
    const end = parseTime(dur.endTimestamp ?? dur.endTimestampMs);
    const coord = parseCoord(pv.location);
    if (coord) {
      push(c, coord[0], coord[1], start, "visit");
      if (end != null && end !== start) push(c, coord[0], coord[1], end, "visit");
    }
  }
}

/** Raw Records.json locations (format 4). */
function collectRawRecords(c: Collector, locations: unknown[], opts: ParseOptions) {
  c.formats.add("rawRecords");
  for (const raw of locations) {
    const o = raw as Record<string, unknown>;
    c.rawTotal++;
    const acc = num(o.accuracy);
    if (acc != null && acc > opts.rawAccuracyLimit) {
      c.droppedInaccurate++;
      continue;
    }
    const coord = parseCoord(o);
    if (!coord) continue;
    push(c, coord[0], coord[1], parseTime(o.timestamp ?? o.timestampMs), "raw", acc ?? undefined);
  }
}

// ---------------------------------------------------------------------------
// main entry

/** Intermediate result of the collection phase, before the cleanup pipeline.
 *  Lets multi-file ingestion merge several sources and finalize once. */
export interface CollectResult {
  points: TimelinePoint[];
  formats: string[];
  total: number;
  droppedInaccurate: number;
  hasRawRecords: boolean;
}

export function collectTimeline(json: unknown, options?: Partial<ParseOptions>): CollectResult {
  const opts = { ...DEFAULT_PARSE_OPTIONS, ...options };
  const c: Collector = { points: [], formats: new Set(), rawTotal: 0, droppedInaccurate: 0 };

  const root = json as Record<string, unknown>;
  let hasRawRecords = false;

  if (Array.isArray(json)) {
    // Format 1 (segments) or format 5 (bare raw location array)
    const first = (json[0] ?? {}) as Record<string, unknown>;
    if (first.latitudeE7 != null || first.timestampMs != null || (first.accuracy != null && first.timestamp != null)) {
      hasRawRecords = true;
      if (opts.includeRawRecords) collectRawRecords(c, json, opts);
      else c.formats.add("rawRecords");
    } else {
      for (const seg of json) {
        if (seg && typeof seg === "object") collectSemanticSegment(c, seg as Record<string, unknown>);
      }
    }
  } else if (root && typeof root === "object") {
    if (Array.isArray(root.semanticSegments)) {
      for (const seg of root.semanticSegments) {
        if (seg && typeof seg === "object") collectSemanticSegment(c, seg as Record<string, unknown>);
      }
    }
    if (Array.isArray(root.timelineObjects)) {
      for (const obj of root.timelineObjects) {
        if (obj && typeof obj === "object") collectTimelineObject(c, obj as Record<string, unknown>);
      }
    }
    if (Array.isArray(root.locations)) {
      hasRawRecords = true;
      if (opts.includeRawRecords) collectRawRecords(c, root.locations, opts);
      else c.formats.add("rawRecords");
    }
    // rawSignals nested inside 2024+ exports
    if (Array.isArray(root.rawSignals)) {
      hasRawRecords = true;
      if (opts.includeRawRecords) {
        const locs = root.rawSignals
          .map((s) => (s as Record<string, unknown>).position)
          .filter(Boolean);
        collectRawRecords(c, locs as unknown[], opts);
      }
    }
  }

  if (c.points.length === 0 && c.formats.size === 0) {
    throw new Error("UNRECOGNIZED_FORMAT");
  }

  return {
    points: c.points,
    formats: [...c.formats],
    total: c.points.length + c.droppedInaccurate,
    droppedInaccurate: c.droppedInaccurate,
    hasRawRecords,
  };
}

/** Cleanup pipeline: sort, dedupe, outlier-filter, summarize. */
export function finalizeParse(
  collected: CollectResult,
  options?: Partial<ParseOptions>
): ParseResult {
  const opts = { ...DEFAULT_PARSE_OPTIONS, ...options };
  const c = { points: collected.points };
  const { total, droppedInaccurate, hasRawRecords } = collected;

  // chronological order
  c.points.sort((a, b) => a.t - b.t);

  // dedup: identical timestamp + near-identical position, or exact repeats
  const deduped: TimelinePoint[] = [];
  let droppedDuplicates = 0;
  for (const p of c.points) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      Math.abs(p.t - prev.t) < 1000 &&
      Math.abs(p.lat - prev.lat) < 1e-5 &&
      Math.abs(p.lng - prev.lng) < 1e-5
    ) {
      droppedDuplicates++;
      continue;
    }
    deduped.push(p);
  }

  // conservative speed-based outlier rejection: drop single-point spikes
  let kept = deduped;
  let droppedOutliers = 0;
  if (opts.filterOutliers && deduped.length > 2) {
    kept = [deduped[0]];
    for (let i = 1; i < deduped.length; i++) {
      const p = deduped[i];
      const prev = kept[kept.length - 1];
      const dtH = Math.max(1 / 3600, (p.t - prev.t) / 3_600_000);
      const speed = haversineKm(prev.lat, prev.lng, p.lat, p.lng) / dtH;
      if (speed > MAX_SPEED_KMH) {
        // Spike if the next point agrees with prev rather than with p.
        const next = deduped[i + 1];
        if (next) {
          const dtH2 = Math.max(1 / 3600, (next.t - prev.t) / 3_600_000);
          const speed2 = haversineKm(prev.lat, prev.lng, next.lat, next.lng) / dtH2;
          if (speed2 < MAX_SPEED_KMH) {
            droppedOutliers++;
            continue; // p was a glitch
          }
        }
        // Sustained jump (e.g. data gap over a flight): keep it.
      }
      kept.push(p);
    }
  }

  let distanceKm = 0;
  for (let i = 1; i < kept.length; i++) {
    distanceKm += haversineKm(kept[i - 1].lat, kept[i - 1].lng, kept[i].lat, kept[i].lng);
  }

  return {
    points: kept,
    summary: {
      total,
      kept: kept.length,
      droppedDuplicates,
      droppedOutliers,
      droppedInaccurate,
      start: kept.length ? kept[0].t : 0,
      end: kept.length ? kept[kept.length - 1].t : 0,
      distanceKm,
      hasRawRecords,
      formats: collected.formats,
    },
  };
}

/** Single-source convenience wrapper (also the unit-test entry point). */
export function parseTimeline(json: unknown, options?: Partial<ParseOptions>): ParseResult {
  return finalizeParse(collectTimeline(json, options), options);
}
