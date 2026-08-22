// Journey builder: turns filtered TimelinePoints into an animation-ready
// track. This is where long-trip time compression and great-circle
// densification happen.
//
// The idea: every segment between consecutive points gets a WEIGHT on the
// animation clock. Weight is distance^alpha, so with alpha < 1 a 9,000 km
// flight no longer eats the whole video while a 3 km cycle ride vanishes.
// Real timestamps are preserved alongside so HUD dates stay truthful.

import { boundsOf, haversineKm, slerp, type Bounds } from "./geo";
import type { Compression, JourneyConfig, PrivacyZone, TimelinePoint, TrackSample } from "./types";

export interface Journey {
  samples: TrackSample[];
  bounds: Bounds;
  totalKm: number;
  /** seconds of animated travel (excludes the ending zoom-out hold) */
  travelSeconds: number;
  /** full video length in seconds */
  totalSeconds: number;
  /** seconds reserved at the end for the zoom-out + hold */
  endingSeconds: number;
}

const ALPHA: Record<Compression, number> = {
  off: 1,
  gentle: 0.85,
  balanced: 0.7,
  strong: 0.5,
};

/** Segments longer than this get densified along the great circle. */
const DENSIFY_KM = 120;

export function inPrivacyZone(lat: number, lng: number, zones: PrivacyZone[]): boolean {
  for (const z of zones) {
    if (lat >= z.minLat && lat <= z.maxLat && lng >= z.minLng && lng <= z.maxLng) return true;
  }
  return false;
}

export function filterForJourney(points: TimelinePoint[], config: JourneyConfig): TimelinePoint[] {
  const out: TimelinePoint[] = [];
  for (const p of points) {
    if (p.t < config.rangeStart || p.t > config.rangeEnd) continue;
    if (config.privacyZones.length && inPrivacyZone(p.lat, p.lng, config.privacyZones)) continue;
    out.push(p);
  }
  return out;
}

export function buildJourney(points: TimelinePoint[], config: JourneyConfig): Journey | null {
  const pts = filterForJourney(points, config);
  if (pts.length < 2) return null;

  const endingSeconds = Math.min(2, Math.max(1.5, config.duration * 0.04));
  const introHold = 0.6; // brief hold on the start point
  const travelSeconds = Math.max(1, config.duration - endingSeconds - introHold);
  const alpha = ALPHA[config.compression];

  // 1. densify long hops along the great circle, carry real time by lerp
  interface Node { lat: number; lng: number; realT: number; distKm: number }
  const nodes: Node[] = [{ lat: pts[0].lat, lng: pts[0].lng, realT: pts[0].t, distKm: 0 }];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = haversineKm(a.lat, a.lng, b.lat, b.lng);
    if (d > DENSIFY_KM) {
      const steps = Math.min(96, Math.ceil(d / 60));
      for (let s = 1; s < steps; s++) {
        const f = s / steps;
        const [la, ln] = slerp(a.lat, a.lng, b.lat, b.lng, f);
        const prev = nodes[nodes.length - 1];
        const dd = haversineKm(prev.lat, prev.lng, la, ln);
        total += dd;
        nodes.push({ lat: la, lng: ln, realT: a.t + (b.t - a.t) * f, distKm: total });
      }
    }
    const prev = nodes[nodes.length - 1];
    const dd = haversineKm(prev.lat, prev.lng, b.lat, b.lng);
    total += dd;
    nodes.push({ lat: b.lat, lng: b.lng, realT: b.t, distKm: total });
  }
  if (total < 0.05) return null; // nothing actually moved

  // 2. assign animation weights per segment
  const weights: number[] = new Array(nodes.length).fill(0);
  let wSum = 0;
  for (let i = 1; i < nodes.length; i++) {
    const d = nodes[i].distKm - nodes[i - 1].distKm;
    // small floor so dwell points still tick time forward
    const w = Math.pow(Math.max(d, 0.001), alpha);
    weights[i] = w;
    wSum += w;
  }

  // 3. cumulative weight -> animation seconds
  const samples: TrackSample[] = [];
  let acc = 0;
  for (let i = 0; i < nodes.length; i++) {
    acc += weights[i];
    samples.push({
      lat: nodes[i].lat,
      lng: nodes[i].lng,
      at: introHold + (acc / wSum) * travelSeconds,
      realT: nodes[i].realT,
      distKm: nodes[i].distKm,
    });
  }
  samples[0].at = 0; // the intro hold sits on the first point

  return {
    samples,
    bounds: boundsOf(samples),
    totalKm: total,
    travelSeconds,
    totalSeconds: introHold + travelSeconds + endingSeconds,
    endingSeconds,
  };
}

/** Binary search: index of the last sample at or before animation time t. */
export function sampleIndexAt(samples: TrackSample[], t: number): number {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].at <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Interpolated position + stats at animation time t. */
export function stateAt(journey: Journey, t: number) {
  const s = journey.samples;
  const tt = Math.min(t, s[s.length - 1].at);
  const i = sampleIndexAt(s, tt);
  const a = s[i];
  const b = s[Math.min(i + 1, s.length - 1)];
  const span = b.at - a.at;
  const f = span > 1e-6 ? Math.min(1, Math.max(0, (tt - a.at) / span)) : 0;
  const d = haversineKm(a.lat, a.lng, b.lat, b.lng);
  const [lat, lng] = d > 30 ? slerp(a.lat, a.lng, b.lat, b.lng, f) : [
    a.lat + (b.lat - a.lat) * f,
    lngLerp(a.lng, b.lng, f),
  ];
  return {
    lat,
    lng,
    distKm: a.distKm + (b.distKm - a.distKm) * f,
    realT: a.realT + (b.realT - a.realT) * f,
    index: i,
    frac: f,
  };
}

function lngLerp(a: number, b: number, f: number): number {
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return a + d * f;
}
