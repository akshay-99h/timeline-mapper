// Core shared types for Roamline.

/** A single location fix, normalized from any Google Timeline format. */
export interface TimelinePoint {
  lat: number;
  lng: number;
  /** epoch milliseconds */
  t: number;
  kind: "path" | "visit" | "activity" | "raw";
  /** GPS accuracy in meters, when the source provides it (raw records) */
  accuracy?: number;
}

export interface ParseSummary {
  /** points found in the file before any filtering */
  total: number;
  /** points kept after dedup + filters */
  kept: number;
  droppedDuplicates: number;
  droppedOutliers: number;
  droppedInaccurate: number;
  /** epoch ms of first/last kept point */
  start: number;
  end: number;
  distanceKm: number;
  /** true when the file contained raw sensor records (Records.json style) */
  hasRawRecords: boolean;
  /** human-readable list of formats detected in the file */
  formats: string[];
}

export interface ParseResult {
  points: TimelinePoint[];
  summary: ParseSummary;
}

export interface ParseOptions {
  /** speed-based GPS outlier rejection (on by default) */
  filterOutliers: boolean;
  /** include raw location records if present (off by default, noisy) */
  includeRawRecords: boolean;
  /** max accuracy radius (m) accepted for raw records */
  rawAccuracyLimit: number;
}

export interface PrivacyZone {
  id: string;
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export type CameraMode = "fixed" | "steady" | "dynamic";
export type Compression = "off" | "gentle" | "balanced" | "strong";

export interface VideoFormat {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const VIDEO_FORMATS: VideoFormat[] = [
  { id: "square-480", label: "Square 480", width: 480, height: 480 },
  { id: "square-720", label: "Square 720", width: 720, height: 720 },
  { id: "square-1080", label: "Square 1080", width: 1080, height: 1080 },
  { id: "portrait", label: "Portrait 9:16", width: 1080, height: 1920 },
  { id: "landscape", label: "Landscape 16:9", width: 1920, height: 1080 },
];

export interface JourneyConfig {
  /** epoch ms range selected by the user */
  rangeStart: number;
  rangeEnd: number;
  name: string;
  /** supports {year} and {name} placeholders */
  titleTemplate: string;
  /** seconds, 10..300 */
  duration: number;
  camera: CameraMode;
  compression: Compression;
  formatId: string;
  /** basemap theme id (lib/mapstyle.ts MAP_THEMES) */
  mapThemeId: string;
  /** trail color id (lib/mapstyle.ts TRAIL_PALETTES) */
  trailId: string;
  /** label stops with their arrival dates in the video */
  showStopDates: boolean;
  privacyZones: PrivacyZone[];
}

export interface LibraryVideo {
  id: string;
  title: string;
  createdAt: number;
  mime: string;
  blob: Blob;
  thumb: Blob | null;
  duration: number;
  width: number;
  height: number;
  distanceKm: number;
  rangeLabel: string;
}

/** A point resampled onto the animation timeline. */
export interface TrackSample {
  lat: number;
  lng: number;
  /** seconds on the animation clock */
  at: number;
  /** epoch ms of the underlying real moment */
  realT: number;
  /** cumulative real distance in km at this sample */
  distKm: number;
}
