// Camera path computation.
//
// Rather than chasing the marker live (which jitters on dense city data), we
// precompute a camera keyframe track at a fixed cadence and smooth it with
// repeated box blurs. The renderer then just interpolates keyframes.

import { boundsOf, zoomForBounds, lerpLng } from "./geo";
import { stateAt, type Journey } from "./journey";
import type { CameraMode } from "./types";

export interface CameraKeyframe {
  lat: number;
  lng: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface CameraTrack {
  /** keyframe cadence in seconds */
  dt: number;
  frames: CameraKeyframe[];
  /** camera that shows the entire journey (used by the ending zoom-out) */
  overview: CameraKeyframe;
}

const KEY_DT = 0.1;

interface ModeTuning {
  /** seconds of track (each side) considered when choosing local zoom */
  window: number;
  /** number of smoothing passes over position/zoom */
  passes: number;
  /** half-width of each box blur pass, in keyframes */
  radius: number;
  maxZoom: number;
  pitch: number;
  bearingDrift: number; // deg per second, dynamic mode only
}

const TUNING: Record<Exclude<CameraMode, "fixed">, ModeTuning> = {
  steady: { window: 6, passes: 3, radius: 22, maxZoom: 11.5, pitch: 0, bearingDrift: 0 },
  dynamic: { window: 3.5, passes: 2, radius: 12, maxZoom: 13, pitch: 42, bearingDrift: 1.2 },
};

export function buildCameraTrack(
  journey: Journey,
  mode: CameraMode,
  viewportW: number,
  viewportH: number
): CameraTrack {
  const b = journey.bounds;
  const overview: CameraKeyframe = {
    lat: (b.minLat + b.maxLat) / 2,
    lng: wrap((b.minLng + b.maxLng) / 2),
    zoom: Math.max(1.1, zoomForBounds(b, viewportW, viewportH, Math.min(viewportW, viewportH) * 0.12)),
    pitch: 0,
    bearing: 0,
  };

  const n = Math.max(2, Math.ceil(journey.totalSeconds / KEY_DT) + 1);

  if (mode === "fixed") {
    return { dt: KEY_DT, frames: new Array(n).fill(overview), overview };
  }

  const tune = TUNING[mode];
  const lats = new Float64Array(n);
  const lngs = new Float64Array(n); // unwrapped
  const zooms = new Float64Array(n);

  let lngOffset = 0;
  let prevLng: number | null = null;

  for (let i = 0; i < n; i++) {
    const t = i * KEY_DT;
    const s = stateAt(journey, t);

    // unwrap longitude so smoothing never averages across the date line
    let lng = s.lng + lngOffset;
    if (prevLng != null) {
      while (lng - prevLng > 180) { lngOffset -= 360; lng -= 360; }
      while (lng - prevLng < -180) { lngOffset += 360; lng += 360; }
    }
    prevLng = lng;
    lats[i] = s.lat;
    lngs[i] = lng;

    // local zoom: fit the piece of track inside +-window seconds
    const local = windowPoints(journey, t, tune.window);
    const lb = boundsOf(local);
    const z = zoomForBounds(lb, viewportW, viewportH, Math.min(viewportW, viewportH) * 0.22);
    zooms[i] = Math.min(tune.maxZoom, Math.max(overview.zoom, z));
  }

  for (let p = 0; p < tune.passes; p++) {
    boxBlur(lats, tune.radius);
    boxBlur(lngs, tune.radius);
    boxBlur(zooms, tune.radius * 2); // zoom likes to be extra calm
  }

  const frames: CameraKeyframe[] = new Array(n);
  for (let i = 0; i < n; i++) {
    frames[i] = {
      lat: lats[i],
      lng: wrap(lngs[i]),
      zoom: zooms[i],
      pitch: tune.pitch,
      bearing: tune.bearingDrift ? (i * KEY_DT * tune.bearingDrift) % 360 : 0,
    };
  }

  return { dt: KEY_DT, frames, overview };
}

function windowPoints(journey: Journey, t: number, w: number) {
  const pts: { lat: number; lng: number }[] = [];
  const steps = 8;
  for (let k = -steps; k <= steps; k++) {
    const s = stateAt(journey, Math.max(0, Math.min(journey.totalSeconds, t + (k / steps) * w)));
    pts.push({ lat: s.lat, lng: s.lng });
  }
  return pts;
}

function boxBlur(arr: Float64Array, radius: number) {
  const n = arr.length;
  if (radius < 1 || n < 3) return;
  const src = Float64Array.from(arr);
  let sum = 0;
  let count = 0;
  // sliding window
  for (let i = -radius; i <= radius; i++) {
    const j = clampIdx(i, n);
    sum += src[j];
    count++;
  }
  for (let i = 0; i < n; i++) {
    arr[i] = sum / count;
    const drop = clampIdx(i - radius, n);
    const add = clampIdx(i + radius + 1, n);
    sum += src[add] - src[drop];
  }
}

function clampIdx(i: number, n: number): number {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}

function wrap(lng: number): number {
  while (lng > 180) lng -= 360;
  while (lng < -180) lng += 360;
  return lng;
}

/**
 * Camera state at time t, including the ending zoom-out: during the final
 * `endingSeconds` the camera eases from its tracked position to the overview.
 */
export function cameraAt(track: CameraTrack, journey: Journey, t: number): CameraKeyframe {
  const endStart = journey.totalSeconds - journey.endingSeconds;
  const idx = t / track.dt;
  const i = Math.min(track.frames.length - 1, Math.max(0, Math.floor(idx)));
  const j = Math.min(track.frames.length - 1, i + 1);
  const f = Math.min(1, Math.max(0, idx - i));
  const a = track.frames[i];
  const b = track.frames[j];
  const base: CameraKeyframe = {
    lat: a.lat + (b.lat - a.lat) * f,
    lng: lerpLng(a.lng, b.lng, f),
    zoom: a.zoom + (b.zoom - a.zoom) * f,
    pitch: a.pitch + (b.pitch - a.pitch) * f,
    bearing: a.bearing + (b.bearing - a.bearing) * f,
  };
  if (t <= endStart) return base;

  // ease-in-out toward the overview
  const e = Math.min(1, (t - endStart) / journey.endingSeconds);
  const k = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
  return {
    lat: base.lat + (track.overview.lat - base.lat) * k,
    lng: lerpLng(base.lng, track.overview.lng, k),
    zoom: base.zoom + (track.overview.zoom - base.zoom) * k,
    pitch: base.pitch * (1 - k),
    bearing: base.bearing * (1 - k),
  };
}
