// GPX and KML track parsers.
//
// GPX covers Apple Health workout routes (apple_health_export/workout-routes/
// *.gpx), Strava and Garmin bulk exports, and most sports watches.
// KML covers Google's legacy Timeline exports (gx:Track).
//
// Regex-based on purpose: DOMParser doesn't exist in web workers, and these
// two formats are shallow enough that regex extraction is reliable.

import { parseTime } from "./parser";
import type { TimelinePoint } from "../types";

/** <trkpt lat=".." lon=".."> ... <time>..</time> ... </trkpt> */
export function parseGpx(text: string): TimelinePoint[] {
  const points: TimelinePoint[] = [];
  const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const attrs = m[1];
    const body = m[2];
    const lat = attr(attrs, "lat");
    const lon = attr(attrs, "lon");
    if (lat == null || lon == null) continue;
    const timeMatch = /<time>([^<]+)<\/time>/.exec(body);
    const t = timeMatch ? parseTime(timeMatch[1].trim()) : null;
    if (t == null) continue; // untimed points can't be animated
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) continue;
    points.push({ lat, lng: lon, t, kind: "path" });
  }
  return points;
}

function attr(attrs: string, name: string): number | null {
  const m = new RegExp(`${name}\\s*=\\s*"([^"]+)"`).exec(attrs);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

/**
 * KML gx:Track: interleaved <when> timestamps and <gx:coord>lon lat alt</gx:coord>
 * positions, paired in document order.
 */
export function parseKml(text: string): TimelinePoint[] {
  const points: TimelinePoint[] = [];
  const whens: number[] = [];
  const coords: [number, number][] = [];
  const re = /<when>([^<]+)<\/when>|<gx:coord>([^<]+)<\/gx:coord>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1] != null) {
      const t = parseTime(m[1].trim());
      if (t != null) whens.push(t);
    } else if (m[2] != null) {
      const parts = m[2].trim().split(/\s+/).map(Number);
      if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
        coords.push([parts[1], parts[0]]); // gx:coord is "lon lat alt"
      }
    }
  }
  const n = Math.min(whens.length, coords.length);
  for (let i = 0; i < n; i++) {
    const [lat, lng] = coords[i];
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) continue;
    points.push({ lat, lng, t: whens[i], kind: "path" });
  }
  return points;
}
