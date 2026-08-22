// A fictional but plausible sample year: home base in Greater Noida West
// (Delhi NCR) with trips across India and Asia. Lets people try the whole
// app without touching real data.

import { slerp, haversineKm } from "./geo";
import type { ParseResult, TimelinePoint } from "./types";

interface Stop {
  lat: number;
  lng: number;
  /** days spent here */
  days: number;
  /** local wandering radius in km while at the stop */
  wander: number;
}

const HOME = { lat: 28.607, lng: 77.437 }; // Greater Noida West

// One fictional traveler's 2025, out of Greater Noida West.
const STOPS: Stop[] = [
  { ...HOME, days: 26, wander: 14 },                     // home (NCR wandering)
  { lat: 26.9124, lng: 75.7873, days: 3, wander: 5 },    // Jaipur
  { lat: 24.5854, lng: 73.7125, days: 3, wander: 4 },    // Udaipur
  { ...HOME, days: 24, wander: 12 },                     // home
  { lat: 30.0869, lng: 78.2676, days: 3, wander: 5 },    // Rishikesh
  { lat: 32.2396, lng: 77.1887, days: 4, wander: 7 },    // Manali
  { ...HOME, days: 30, wander: 13 },                     // home
  { lat: 19.076, lng: 72.8777, days: 3, wander: 6 },     // Mumbai
  { lat: 15.4909, lng: 73.8278, days: 5, wander: 8 },    // Goa
  { ...HOME, days: 28, wander: 12 },                     // home
  { lat: 25.2048, lng: 55.2708, days: 4, wander: 6 },    // Dubai
  { ...HOME, days: 32, wander: 13 },                     // home
  { lat: 25.3176, lng: 82.9739, days: 3, wander: 4 },    // Varanasi
  { ...HOME, days: 26, wander: 12 },                     // home
  { lat: 13.7563, lng: 100.5018, days: 4, wander: 6 },   // Bangkok
  { lat: 3.139, lng: 101.6869, days: 3, wander: 5 },     // Kuala Lumpur
  { lat: 1.3521, lng: 103.8198, days: 3, wander: 4 },    // Singapore
  { ...HOME, days: 34, wander: 13 },                     // home
  { lat: 34.1526, lng: 77.5771, days: 5, wander: 9 },    // Leh
  { ...HOME, days: 28, wander: 12 },                     // home
];

// Deterministic pseudo-random so the sample is identical for everyone.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SAMPLE_NAME = "A year from Greater Noida";

export function generateSampleJourney(): ParseResult {
  const rnd = mulberry32(20250101);
  const points: TimelinePoint[] = [];
  let t = Date.UTC(2025, 0, 4, 9, 0, 0);
  const DAY = 86_400_000;

  const pushPoint = (lat: number, lng: number, kind: TimelinePoint["kind"]) => {
    points.push({ lat, lng, t, kind });
  };

  for (let i = 0; i < STOPS.length; i++) {
    const stop = STOPS[i];

    // local wandering: a couple of fixes per day around the stop
    const fixes = Math.max(2, Math.round(stop.days * 2.2));
    for (let f = 0; f < fixes; f++) {
      const ang = rnd() * Math.PI * 2;
      const r = (rnd() ** 1.6) * stop.wander; // bias toward center
      const dLat = (r / 111) * Math.sin(ang);
      const dLng = (r / (111 * Math.cos((stop.lat * Math.PI) / 180))) * Math.cos(ang);
      pushPoint(stop.lat + dLat, stop.lng + dLng, "path");
      t += (stop.days * DAY) / fixes;
    }

    // travel leg to the next stop
    const next = STOPS[i + 1];
    if (!next) break;
    const dist = haversineKm(stop.lat, stop.lng, next.lat, next.lng);
    const hours = dist > 700 ? 2 + dist / 800 : 1 + dist / 90; // fly vs drive
    const legSteps = Math.max(4, Math.min(40, Math.round(dist / 40)));
    for (let s = 1; s < legSteps; s++) {
      const f = s / legSteps;
      const [la, ln] = slerp(stop.lat, stop.lng, next.lat, next.lng, f);
      t += (hours * 3_600_000) / legSteps;
      pushPoint(la, ln, "activity");
    }
  }

  let distanceKm = 0;
  for (let i = 1; i < points.length; i++) {
    distanceKm += haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }

  return {
    points,
    summary: {
      total: points.length,
      kept: points.length,
      droppedDuplicates: 0,
      droppedOutliers: 0,
      droppedInaccurate: 0,
      start: points[0].t,
      end: points[points.length - 1].t,
      distanceKm,
      hasRawRecords: false,
      formats: ["sample"],
    },
  };
}
