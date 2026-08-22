// Spherical geometry helpers. All distances in km, angles in degrees.

const R = 6371;
const D2R = Math.PI / 180;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * D2R;
  const dLng = (lng2 - lng1) * D2R;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Great-circle interpolation (slerp) between two coordinates.
 * Returns [lat, lng]. Handles antimeridian crossings correctly because the
 * math happens on the unit sphere, not in lat/lng space.
 */
export function slerp(
  lat1: number, lng1: number, lat2: number, lng2: number, f: number
): [number, number] {
  const p1 = toVec(lat1, lng1);
  const p2 = toVec(lat2, lng2);
  const dot = Math.min(1, Math.max(-1, p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-9) return [lat1 + (lat2 - lat1) * f, lat1 === lat2 && lng1 === lng2 ? lng1 : lerpLng(lng1, lng2, f)];
  const so = Math.sin(omega);
  const a = Math.sin((1 - f) * omega) / so;
  const b = Math.sin(f * omega) / so;
  const x = a * p1[0] + b * p2[0];
  const y = a * p1[1] + b * p2[1];
  const z = a * p1[2] + b * p2[2];
  return [Math.asin(z) / D2R, Math.atan2(y, x) / D2R];
}

function toVec(lat: number, lng: number): [number, number, number] {
  const la = lat * D2R;
  const lo = lng * D2R;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

/** Interpolate longitude along the shortest arc (handles the date line). */
export function lerpLng(a: number, b: number, f: number): number {
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  const out = a + d * f;
  return out > 180 ? out - 360 : out < -180 ? out + 360 : out;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Bounds of a set of points. Longitudes are unwrapped around the first point
 * so a journey crossing the date line produces a tight box instead of a
 * world-spanning one; minLng/maxLng may fall outside [-180, 180], which
 * MapLibre accepts.
 */
export function boundsOf(points: { lat: number; lng: number }[]): Bounds {
  let minLat = 90, maxLat = -90, minLng = Infinity, maxLng = -Infinity;
  let prev = points.length ? points[0].lng : 0;
  let offset = 0;
  for (const p of points) {
    let lng = p.lng + offset;
    const d = lng - prev;
    if (d > 180) { offset -= 360; lng -= 360; }
    else if (d < -180) { offset += 360; lng += 360; }
    prev = lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

/** Approximate zoom level that fits the given bounds into a viewport. */
export function zoomForBounds(b: Bounds, width: number, height: number, padding = 80): number {
  const lngSpan = Math.max(0.0005, b.maxLng - b.minLng);
  // World is 512px at zoom 0 (maplibre tileSize 512). Mercator x is linear in lng.
  const w = Math.max(50, width - padding * 2);
  const h = Math.max(50, height - padding * 2);
  const zx = Math.log2((w * 360) / (lngSpan * 512));
  // Mercator vertical span
  const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2));
  const ySpan = Math.abs(mercY(Math.min(85, b.maxLat)) - mercY(Math.max(-85, b.minLat)));
  const zy = Math.log2((h * 2 * Math.PI) / (ySpan * 512));
  return Math.min(zx, zy, 17);
}

export function formatDistance(km: number, locale = "en"): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 100) return `${km.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
  return `${Math.round(km).toLocaleString(locale)} km`;
}
