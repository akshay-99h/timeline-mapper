import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ingestFiles } from "./ingest";
import { parseGpx, parseKml } from "./tracks";

const fixtureText = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

const iso = (s: string) => Date.parse(s);

describe("parseGpx", () => {
  it("reads timed trackpoints in any attribute order", () => {
    expect(parseGpx(fixtureText("workout-route.gpx"))).toEqual([
      { lat: 37.774929, lng: -122.419416, t: iso("2023-09-10T07:00:00Z"), kind: "path" },
      { lat: 37.7752, lng: -122.4189, t: iso("2023-09-10T07:00:30Z"), kind: "path" },
      { lat: 37.7759, lng: -122.4177, t: iso("2023-09-10T07:01:30Z"), kind: "path" },
    ]);
  });

  it("skips untimed points, (0,0) fixes and the <metadata> timestamp", () => {
    const times = parseGpx(fixtureText("workout-route.gpx")).map((p) => p.t);
    expect(times).not.toContain(iso("2023-09-10T06:59:00Z"));
    expect(times).not.toContain(iso("2023-09-10T07:01:00Z"));
    expect(parseGpx("<gpx><trk><trkseg></trkseg></trk></gpx>")).toEqual([]);
  });
});

describe("parseKml", () => {
  it("pairs gx:Track <when> and lon-lat <gx:coord> entries in order", () => {
    expect(parseKml(fixtureText("location-history.kml"))).toEqual([
      { lat: 51.5007292, lng: -0.1246254, t: iso("2019-01-05T14:00:00Z"), kind: "path" },
      { lat: 51.503364, lng: -0.127625, t: iso("2019-01-05T14:05:00Z"), kind: "path" },
      { lat: 51.5014, lng: -0.1419, t: iso("2019-01-05T14:10:00Z"), kind: "path" },
    ]);
  });
});

describe("ingestFiles", () => {
  it("merges GPX and Timeline JSON sources and ignores unrelated files", async () => {
    const timelineBytes = new TextEncoder().encode(fixtureText("timeline-phone.json")).slice().buffer;

    const { points, summary } = await ingestFiles(
      [
        { name: "route.gpx", data: fixtureText("workout-route.gpx") },
        { name: "Timeline.json", data: timelineBytes },
        { name: "notes.txt", data: "not a timeline" },
      ],
      {}
    );

    expect([...summary.formats].sort()).toEqual(["activities", "gpx", "timelinePath", "visits"]);
    expect(summary).toMatchObject({ total: 9, kept: 8, droppedDuplicates: 1 });
    // chronological across sources: the 2023 run comes before the 2024 timeline
    expect(points[0].t).toBe(iso("2023-09-10T07:00:00Z"));
    expect(points[points.length - 1].t).toBe(iso("2024-03-01T08:30:00Z"));
  });

  it("rejects when no file is recognizable", async () => {
    await expect(ingestFiles([{ name: "notes.txt", data: "hello" }], {})).rejects.toThrow(
      "UNRECOGNIZED_FORMAT"
    );
  });
});
