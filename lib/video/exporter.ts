// Client-side video export.
//
// Strategy A (preferred, Chrome/Edge/Safari 16.4+): WebCodecs VideoEncoder
// producing H.264, muxed into MP4 by mp4-muxer. Deterministic frame-by-frame:
// we seek the animation clock, wait for map tiles, composite, encode. Output
// timing is exact regardless of machine speed.
//
// Strategy B (fallback): MediaRecorder on canvas.captureStream() producing
// WebM in real time.
//
// Both run against a dedicated hidden MapLibre map sized to the target
// resolution, so preview quality never limits export quality.

import { maplibregl } from "../maplibre";
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { cameraAt, buildCameraTrack } from "../camera";
import { JourneyRenderer } from "../renderer";
import type { Journey } from "../journey";
import { formatDistance } from "../geo";
import { mapTheme, trailPalette } from "../mapstyle";

export interface ExportProgress {
  /** 0..1 */
  fraction: number;
  /** estimated seconds remaining, or null while calibrating */
  etaSeconds: number | null;
  phase: "preparing" | "rendering" | "finalizing";
}

export interface ExportRequest {
  journey: Journey;
  width: number;
  height: number;
  title: string;
  locale: string;
  cameraMode: "fixed" | "steady" | "dynamic";
  /** basemap theme id (lib/mapstyle.ts) */
  mapThemeId: string;
  /** trail palette id (lib/mapstyle.ts) */
  trailId: string;
  /** label stops with their arrival dates */
  showStopDates: boolean;
  fps?: number;
  onProgress: (p: ExportProgress) => void;
  signal: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  mime: string;
  thumb: Blob | null;
}

export function webCodecsSupported(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

export async function exportVideo(req: ExportRequest): Promise<ExportResult> {
  const fps = req.fps ?? 30;
  req.onProgress({ fraction: 0, etaSeconds: null, phase: "preparing" });

  const stage = createStage(req.width, req.height);
  try {
    const map = await createExportMap(stage.mapDiv, req);
    try {
      if (webCodecsSupported()) {
        return await encodeWithWebCodecs(req, map, stage, fps);
      }
      return await encodeWithMediaRecorder(req, map, stage, fps);
    } finally {
      map.remove();
    }
  } finally {
    stage.root.remove();
  }
}

// ---------------------------------------------------------------------------

interface Stage {
  root: HTMLDivElement;
  mapDiv: HTMLDivElement;
  composite: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

function createStage(w: number, h: number): Stage {
  const root = document.createElement("div");
  // Rendered but invisible; display:none would break WebGL.
  root.style.cssText = `position:fixed;left:0;top:0;width:${w}px;height:${h}px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden;`;
  const mapDiv = document.createElement("div");
  mapDiv.style.cssText = "width:100%;height:100%;";
  root.appendChild(mapDiv);
  document.body.appendChild(root);

  const composite = document.createElement("canvas");
  composite.width = w;
  composite.height = h;
  const ctx = composite.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
  return { root, mapDiv, composite, ctx };
}

function createExportMap(container: HTMLDivElement, req: ExportRequest): Promise<maplibregl.Map> {
  return new Promise((resolve, reject) => {
    const start = cameraAt(buildCameraTrack(req.journey, req.cameraMode, req.width, req.height), req.journey, 0);
    const map = new maplibregl.Map({
      container,
      style: mapTheme(req.mapThemeId).style,
      center: [start.lng, start.lat],
      zoom: start.zoom,
      pitch: start.pitch,
      bearing: start.bearing,
      interactive: false,
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      fadeDuration: 0,
      // devicePixelRatio 1: the container IS the target resolution
      pixelRatio: 1,
    });
    // Browsers throttle requestAnimationFrame in hidden/background tabs,
    // which would stall MapLibre's render loop and freeze the export.
    // Forcing synchronous redraws on a timer keeps frames flowing.
    const ticker = setInterval(() => {
      try { map.redraw(); } catch { /* mid-teardown */ }
    }, 80);
    map.once("remove", () => clearInterval(ticker));
    map.once("load", () => resolve(map));
    map.once("error", (e) => reject(e.error ?? new Error("MAP_LOAD_FAILED")));
  });
}

/** Wait until the map has settled (tiles loaded) or a timeout passes. */
function waitForMap(map: maplibregl.Map, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (map.loaded() && map.areTilesLoaded()) {
      resolve();
      return;
    }
    const timer = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(timer);
      map.off("idle", done);
      resolve();
    }
    map.on("idle", done);
  });
}

function makeRenderer(req: ExportRequest): JourneyRenderer {
  return new JourneyRenderer(req.journey, {
    trailRgb: trailPalette(req.trailId).rgb,
    attribution: mapTheme(req.mapThemeId).attribution,
    showStopDates: req.showStopDates,
  });
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Export cancelled", "AbortError");
}

async function renderFrame(
  req: ExportRequest,
  map: maplibregl.Map,
  stage: Stage,
  renderer: JourneyRenderer,
  track: ReturnType<typeof buildCameraTrack>,
  t: number,
  tileWait: number
) {
  const cam = cameraAt(track, req.journey, t);
  map.jumpTo({
    center: [cam.lng, cam.lat],
    zoom: cam.zoom,
    pitch: cam.pitch,
    bearing: cam.bearing,
  });
  await waitForMap(map, tileWait);
  stage.ctx.setTransform(1, 0, 0, 1, 0, 0);
  stage.ctx.clearRect(0, 0, req.width, req.height);
  stage.ctx.drawImage(map.getCanvas(), 0, 0, req.width, req.height);
  renderer.render(stage.ctx, map, t, req.width, req.height, 1, {
    title: req.title,
    locale: req.locale,
    showHud: true,
  });
}

// ---------------------------------------------------------------------------
// Strategy A: WebCodecs + mp4-muxer

async function encodeWithWebCodecs(
  req: ExportRequest,
  map: maplibregl.Map,
  stage: Stage,
  fps: number
): Promise<ExportResult> {
  const { journey, width, height } = req;
  const totalFrames = Math.ceil(journey.totalSeconds * fps);
  const track = buildCameraTrack(journey, req.cameraMode, width, height);
  const renderer = makeRenderer(req);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height },
    fastStart: "in-memory",
  });

  let encoderError: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encoderError = e; },
  });

  const bitrate = Math.min(20_000_000, Math.round(width * height * fps * 0.14));
  const codec = width * height > 1280 * 720 ? "avc1.640029" : "avc1.4d0028"; // High/Main
  const config: VideoEncoderConfig = {
    codec,
    width,
    height,
    bitrate,
    framerate: fps,
  };
  const support = await VideoEncoder.isConfigSupported(config);
  if (!support.supported) {
    // Retry with baseline before giving up on WebCodecs entirely.
    config.codec = "avc1.42001f";
    const retry = await VideoEncoder.isConfigSupported(config);
    if (!retry.supported) {
      encoder.close();
      return encodeWithMediaRecorder(req, map, stage, fps);
    }
  }
  encoder.configure(config);

  let thumb: Blob | null = null;
  const started = performance.now();

  for (let i = 0; i < totalFrames; i++) {
    throwIfAborted(req.signal);
    const t = i / fps;
    await renderFrame(req, map, stage, renderer, track, t, i === 0 ? 4000 : 350);
    if (encoderError) throw encoderError;

    const frame = new VideoFrame(stage.composite, {
      timestamp: Math.round((i * 1_000_000) / fps),
      duration: Math.round(1_000_000 / fps),
    });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();

    // backpressure: don't let the encode queue balloon
    if (encoder.encodeQueueSize > 8) {
      await new Promise<void>((r) => {
        const check = () => (encoder.encodeQueueSize <= 4 ? r() : setTimeout(check, 15));
        check();
      });
    }

    // grab a thumbnail ~70% through (journey mostly drawn, still zoomed in)
    if (thumb === null && i === Math.floor(totalFrames * 0.7)) {
      thumb = await canvasToBlob(stage.composite, 0.6, 480);
    }

    const elapsed = (performance.now() - started) / 1000;
    const fraction = (i + 1) / totalFrames;
    req.onProgress({
      fraction: fraction * 0.97,
      etaSeconds: i > 10 ? (elapsed / (i + 1)) * (totalFrames - i - 1) : null,
      phase: "rendering",
    });
  }

  req.onProgress({ fraction: 0.98, etaSeconds: 2, phase: "finalizing" });
  await encoder.flush();
  encoder.close();
  muxer.finalize();

  const blob = new Blob([target.buffer], { type: "video/mp4" });
  req.onProgress({ fraction: 1, etaSeconds: 0, phase: "finalizing" });
  return { blob, mime: "video/mp4", thumb };
}

// ---------------------------------------------------------------------------
// Strategy B: MediaRecorder (WebM, realtime)

async function encodeWithMediaRecorder(
  req: ExportRequest,
  map: maplibregl.Map,
  stage: Stage,
  fps: number
): Promise<ExportResult> {
  const { journey, width, height } = req;
  const track = buildCameraTrack(journey, req.cameraMode, width, height);
  const renderer = makeRenderer(req);

  const stream = stage.composite.captureStream(fps);
  const mimeCandidates = [
    "video/mp4;codecs=avc1",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error("RECORDING_UNSUPPORTED");

  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: Math.min(16_000_000, width * height * fps * 0.12),
  });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  let thumb: Blob | null = null;
  const done = new Promise<void>((resolve) => { rec.onstop = () => resolve(); });
  rec.start(500);

  const totalFrames = Math.ceil(journey.totalSeconds * fps);
  const started = performance.now();
  // Realtime-ish loop: render as fast as we can but pace to wall clock so the
  // recorded stream duration matches the journey duration.
  for (let i = 0; i < totalFrames; i++) {
    if (req.signal.aborted) { rec.stop(); throw new DOMException("Export cancelled", "AbortError"); }
    const t = i / fps;
    await renderFrame(req, map, stage, renderer, track, t, i === 0 ? 4000 : 120);
    if (thumb === null && i === Math.floor(totalFrames * 0.7)) {
      thumb = await canvasToBlob(stage.composite, 0.6, 480);
    }
    const wallTarget = started + (t * 1000);
    const wait = wallTarget - performance.now();
    if (wait > 0) await sleep(wait);
    req.onProgress({
      fraction: ((i + 1) / totalFrames) * 0.97,
      etaSeconds: journey.totalSeconds - t,
      phase: "rendering",
    });
  }
  rec.stop();
  await done;

  const outMime = mime.startsWith("video/mp4") ? "video/mp4" : "video/webm";
  req.onProgress({ fraction: 1, etaSeconds: 0, phase: "finalizing" });
  return { blob: new Blob(chunks, { type: outMime }), mime: outMime, thumb };
}

// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number, maxW: number): Promise<Blob | null> {
  const scale = Math.min(1, maxW / canvas.width);
  const c = document.createElement("canvas");
  c.width = Math.round(canvas.width * scale);
  c.height = Math.round(canvas.height * scale);
  c.getContext("2d")?.drawImage(canvas, 0, 0, c.width, c.height);
  return new Promise((resolve) => c.toBlob(resolve, "image/jpeg", quality));
}

export interface RouteCardRequest {
  journey: Journey;
  width: number;
  height: number;
  title: string;
  locale: string;
  mapThemeId: string;
  trailId: string;
  showStopDates: boolean;
  /** e.g. "Jan 2025 – Aug 2025", shown in the stats row */
  rangeLabel: string;
}

/**
 * Designer route card: a static, share-ready image of the whole journey
 * (full-bright trail, stop dates, big typography). Works for any source and
 * is especially nice for single GPX activities from Strava or Apple Watch.
 */
export async function exportRouteCard(card: RouteCardRequest): Promise<Blob | null> {
  const { journey, width, height, title, locale } = card;
  const stage = createStage(width, height);
  const req: ExportRequest = {
    journey, width, height, title, locale,
    cameraMode: "fixed",
    mapThemeId: card.mapThemeId,
    trailId: card.trailId,
    showStopDates: card.showStopDates,
    onProgress: () => {},
    signal: new AbortController().signal,
  };
  try {
    const map = await createExportMap(stage.mapDiv, req);
    try {
      const renderer = makeRenderer(req);
      const track = buildCameraTrack(journey, "fixed", width, height);
      const cam = track.overview;
      // pull back slightly so the route breathes inside the card
      map.jumpTo({ center: [cam.lng, cam.lat], zoom: Math.max(1, cam.zoom - 0.2), pitch: 0, bearing: 0 });
      await waitForMap(map, 6000);
      stage.ctx.clearRect(0, 0, width, height);
      stage.ctx.drawImage(map.getCanvas(), 0, 0, width, height);
      renderer.renderPoster(stage.ctx, map, width, height, {
        title,
        locale,
        rangeLabel: card.rangeLabel,
        distanceLabel: formatDistance(journey.totalKm, locale),
      });
      return await new Promise((resolve) => stage.composite.toBlob(resolve, "image/png"));
    } finally {
      map.remove();
    }
  } finally {
    stage.root.remove();
  }
}
