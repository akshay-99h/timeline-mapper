import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { finalizeParse, parseCoord, parseTime, parseTimeline } from "./parser";
import type { TimelinePoint } from "../types";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));

const iso = (s: string) => Date.parse(s);

describe("parseCoord", () => {
  it("reads every coordinate shape Google has shipped", () => {
    expect(parseCoord("geo:52.520008,13.404954")).toEqual([52.520008, 13.404954]);
    expect(parseCoord("48.8583701°, 2.2944813°")).toEqual([48.8583701, 2.2944813]);
    expect(parseCoord({ latitudeE7: 407127753, longitudeE7: -740059728 })).toEqual([40.7127753, -74.0059728]);
    expect(parseCoord({ latE7: 407250000, lngE7: -740000000 })).toEqual([40.725, -74]);
    expect(parseCoord({ latitude: "51.5", longitude: "-0.12" })).toEqual([51.5, -0.12]);
    expect(parseCoord({ latLng: "10°, 20°" })).toEqual([10, 20]);
  });

  it("rejects the (0,0) sentinel, out-of-range values and junk", () => {
    expect(parseCoord("geo:0,0")).toBeNull();
    expect(parseCoord({ lat: 91, lng: 0 })).toBeNull();
    expect(parseCoord({ lat: 10, lng: 181 })).toBeNull();
    expect(parseCoord("not a coordinate")).toBeNull();
    expect(parseCoord(null)).toBeNull();
  });
});

describe("parseTime", () => {
  it("normalizes ISO strings and s/ms/µs epochs to epoch ms", () => {
    const ms = iso("2019-01-05T15:00:00Z");
    expect(parseTime("2019-01-05T16:00:00.000+01:00")).toBe(ms);
    expect(parseTime(ms / 1000)).toBe(ms);
    expect(parseTime(String(ms))).toBe(ms);
    expect(parseTime(ms * 1000)).toBe(ms);
  });

  it("returns null for missing or unparseable values", () => {
    expect(parseTime(undefined)).toBeNull();
    expect(parseTime("yesterday-ish")).toBeNull();
    expect(parseTime(0)).toBeNull();
  });
});

describe("parseTimeline", () => {
  it("parses the phone-local Timeline.json segment array", () => {
    const { points, summary } = parseTimeline(fixture("timeline-phone.json"));

    // The activity start repeats the visit's departure fix, so it is deduped.
    expect(points.map((p) => [p.kind, p.t])).toEqual([
      ["visit", iso("2024-03-01T07:00:00Z")],
      ["visit", iso("2024-03-01T08:00:00Z")],
      ["path", iso("2024-03-01T08:10:00Z")],
      ["path", iso("2024-03-01T08:20:00Z")],
      ["activity", iso("2024-03-01T08:30:00Z")],
    ]);
    expect(points[2]).toMatchObject({ lat: 52.515, lng: 13.4 });
    expect(summary).toMatchObject({
      total: 6,
      kept: 5,
      droppedDuplicates: 1,
      droppedOutliers: 0,
      hasRawRecords: false,
      start: iso("2024-03-01T07:00:00Z"),
      end: iso("2024-03-01T08:30:00Z"),
    });
    expect([...summary.formats].sort()).toEqual(["activities", "timelinePath", "visits"]);
    expect(summary.distanceKm).toBeGreaterThan(1);
    expect(summary.distanceKm).toBeLessThan(3);
  });

  it("parses Takeout semanticSegments with degree-mark latLng strings", () => {
    const { points, summary } = parseTimeline(fixture("location-history.json"));

    expect(points).toEqual([
      { lat: 48.8583701, lng: 2.2944813, t: iso("2024-05-10T08:05:00Z"), kind: "path", accuracy: undefined },
      { lat: 48.8606111, lng: 2.337644, t: iso("2024-05-10T08:40:00Z"), kind: "path", accuracy: undefined },
      { lat: 48.8606111, lng: 2.337644, t: iso("2024-05-10T10:00:00Z"), kind: "visit", accuracy: undefined },
      { lat: 48.8606111, lng: 2.337644, t: iso("2024-05-10T12:00:00Z"), kind: "visit", accuracy: undefined },
    ]);
    expect(summary.formats).toEqual(["timelinePath", "visits"]);
  });

  it("parses classic Semantic Location History and spreads waypoints over the leg", () => {
    const { points, summary } = parseTimeline(fixture("semantic-2019-01.json"));
    const legStart = iso("2019-01-05T15:00:00Z");

    expect(points.map((p) => [p.kind, p.t])).toEqual([
      ["visit", iso("2019-01-05T14:00:00Z")],
      ["visit", legStart],
      ["path", legStart + 10 * 60_000],
      ["path", legStart + 20 * 60_000],
      ["activity", iso("2019-01-05T15:30:00Z")],
    ]);
    expect(points[4]).toMatchObject({ lat: 40.7484405, lng: -73.9856644 });
    expect(summary.droppedDuplicates).toBe(1);
    expect(summary.formats).toEqual(["placeVisits", "activitySegments"]);
  });

  it("only ingests raw Records.json fixes when asked, applying the accuracy cutoff", () => {
    const records = fixture("records.json");

    const skipped = parseTimeline(records);
    expect(skipped.points).toEqual([]);
    expect(skipped.summary).toMatchObject({ hasRawRecords: true, formats: ["rawRecords"], kept: 0 });

    const included = parseTimeline(records, { includeRawRecords: true });
    expect(included.points).toEqual([
      { lat: 51.5007292, lng: -0.1246254, t: iso("2016-07-01T09:00:00Z"), kind: "raw", accuracy: 12 },
      { lat: 51.503364, lng: -0.127625, t: iso("2016-07-01T09:20:00Z"), kind: "raw", accuracy: 20 },
    ]);
    expect(included.summary).toMatchObject({ total: 3, kept: 2, droppedInaccurate: 1 });

    const loose = parseTimeline(records, { includeRawRecords: true, rawAccuracyLimit: 2000 });
    expect(loose.summary).toMatchObject({ kept: 3, droppedInaccurate: 0 });
  });

  it("throws UNRECOGNIZED_FORMAT for JSON that isn't a timeline", () => {
    expect(() => parseTimeline({ hello: "world" })).toThrow("UNRECOGNIZED_FORMAT");
  });
});

describe("finalizeParse cleanup", () => {
  const t0 = iso("2024-01-01T12:00:00Z");
  const pt = (lat: number, lng: number, dtSec: number): TimelinePoint => ({
    lat,
    lng,
    t: t0 + dtSec * 1000,
    kind: "path",
  });
  const collected = (points: TimelinePoint[]) => ({
    points,
    formats: ["timelinePath"],
    total: points.length,
    droppedInaccurate: 0,
    hasRawRecords: false,
  });

  it("drops a single-point GPS spike but keeps sustained jumps", () => {
    const spike = finalizeParse(
      collected([pt(52.52, 13.405, 0), pt(40.71, -74.0, 60), pt(52.521, 13.406, 120)])
    );
    expect(spike.summary.droppedOutliers).toBe(1);
    expect(spike.points.map((p) => p.lat)).toEqual([52.52, 52.521]);

    // Berlin -> New York and staying there (e.g. a data gap over a flight)
    const flight = finalizeParse(
      collected([pt(52.52, 13.405, 0), pt(40.71, -74.0, 60), pt(40.711, -74.001, 120)])
    );
    expect(flight.summary.droppedOutliers).toBe(0);
    expect(flight.points).toHaveLength(3);
  });

  it("keeps spikes when outlier filtering is off", () => {
    const result = finalizeParse(
      collected([pt(52.52, 13.405, 0), pt(40.71, -74.0, 60), pt(52.521, 13.406, 120)]),
      { filterOutliers: false }
    );
    expect(result.points).toHaveLength(3);
  });

  it("sorts chronologically and removes same-second duplicates", () => {
    const result = finalizeParse(
      collected([pt(52.5201, 13.4051, 30), pt(52.52, 13.405, 0), pt(52.52, 13.405, 0.5)])
    );
    expect(result.points.map((p) => p.t)).toEqual([t0, t0 + 30_000]);
    expect(result.summary.droppedDuplicates).toBe(1);
  });
});
