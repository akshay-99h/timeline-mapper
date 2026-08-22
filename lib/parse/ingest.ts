// Multi-source ingestion. Worker-safe (no DOM).
//
// Accepts any mix of:
//   - Google Timeline JSON (all four historical shapes)
//   - Whole ZIP archives: Google Takeout, Apple Health export - relevant
//     entries (.json / .gpx / .kml) are found automatically
//   - GPX tracks (Apple Watch workout routes, Strava, Garmin, ...)
//   - KML with gx:Track (legacy Google Timeline)
//
// All sources are merged into one point cloud, then cleaned up and
// summarized in a single pass so cross-file dedup and outlier filtering
// work properly.

import { collectTimeline, finalizeParse, type CollectResult } from "./parser";
import { parseGpx, parseKml } from "./tracks";
import { isZip, readZip } from "./zip";
import type { ParseOptions, ParseResult, TimelinePoint } from "../types";

export interface IngestFile {
  name: string;
  /** ArrayBuffer for anything that might be a ZIP, string for text files */
  data: ArrayBuffer | string;
}

interface Merged {
  points: TimelinePoint[];
  formats: Set<string>;
  total: number;
  droppedInaccurate: number;
  hasRawRecords: boolean;
  recognizedSources: number;
}

export async function ingestFiles(
  files: IngestFile[],
  options: Partial<ParseOptions>
): Promise<ParseResult> {
  const merged: Merged = {
    points: [],
    formats: new Set(),
    total: 0,
    droppedInaccurate: 0,
    hasRawRecords: false,
    recognizedSources: 0,
  };

  for (const file of files) {
    if (typeof file.data !== "string" && isZip(file.data)) {
      await ingestZip(file.data, options, merged);
    } else {
      const text =
        typeof file.data === "string" ? file.data : new TextDecoder().decode(file.data);
      ingestText(file.name, text, options, merged);
    }
  }

  if (merged.recognizedSources === 0) {
    throw new Error("UNRECOGNIZED_FORMAT");
  }

  const collected: CollectResult = {
    points: merged.points,
    formats: [...merged.formats],
    total: merged.total,
    droppedInaccurate: merged.droppedInaccurate,
    hasRawRecords: merged.hasRawRecords,
  };
  return finalizeParse(collected, options);
}

async function ingestZip(buf: ArrayBuffer, options: Partial<ParseOptions>, merged: Merged) {
  let entries;
  try {
    entries = readZip(buf);
  } catch {
    return; // corrupt/unsupported archive: skip, other files may still work
  }
  for (const entry of entries) {
    const name = entry.name;
    if (name.includes("__MACOSX/") || /(^|\/)\./.test(name)) continue;
    if (!/\.(json|gpx|kml)$/i.test(name)) continue;
    // Guard against pathological archive members (export.xml is filtered by
    // extension already; this catches oversized JSON blobs).
    if (entry.size > 900 * 1024 * 1024) continue;
    try {
      const bytes = await entry.read();
      ingestText(name, new TextDecoder().decode(bytes), options, merged);
    } catch {
      // one unreadable entry shouldn't sink the archive
    }
  }
}

function ingestText(name: string, text: string, options: Partial<ParseOptions>, merged: Merged) {
  const lower = name.toLowerCase();
  try {
    if (lower.endsWith(".gpx") || text.slice(0, 512).includes("<gpx")) {
      const pts = parseGpx(text);
      if (pts.length > 0) {
        merged.points.push(...pts);
        merged.total += pts.length;
        merged.formats.add("gpx");
        merged.recognizedSources++;
      }
      return;
    }
    if (lower.endsWith(".kml") || text.slice(0, 512).includes("<kml")) {
      const pts = parseKml(text);
      if (pts.length > 0) {
        merged.points.push(...pts);
        merged.total += pts.length;
        merged.formats.add("kml");
        merged.recognizedSources++;
      }
      return;
    }
    const json = JSON.parse(text);
    const c = collectTimeline(json, options);
    merged.points.push(...c.points);
    merged.total += c.total;
    merged.droppedInaccurate += c.droppedInaccurate;
    merged.hasRawRecords = merged.hasRawRecords || c.hasRawRecords;
    for (const f of c.formats) merged.formats.add(f);
    merged.recognizedSources++;
  } catch {
    // unrecognized single source: keep going, the caller checks the total
  }
}
