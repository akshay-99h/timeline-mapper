// Trail + HUD renderer.
//
// One renderer serves both the interactive preview and the offline video
// export: it draws onto a 2D canvas layered over (or composited with) the
// MapLibre canvas. The trail is re-projected every frame because the camera
// moves; to keep that cheap the journey is decimated to a bounded number of
// draw samples up front.

import type { Map as MapLibreMap } from "maplibre-gl";
import { stateAt, type Journey } from "./journey";
import { formatDistance, haversineKm } from "./geo";
import type { TrackSample } from "./types";

export interface HudOptions {
  title: string;
  locale: string;
  showHud: boolean;
}

const MAX_DRAW_SAMPLES = 2600;
/** portion of the drawn trail (by recency) that fades out */
const FADE_TAIL = 0.55;

export interface RendererOptions {
  /** trail color as "r, g, b" (see lib/mapstyle.ts TRAIL_PALETTES) */
  trailRgb?: string;
  /** attribution line burned into the HUD (varies by basemap) */
  attribution?: string;
  /** label each detected stop with its arrival date */
  showStopDates?: boolean;
}

/** A dwell of >= STOP_MIN_HOURS within STOP_RADIUS_KM, labeled with arrival. */
interface StopLabel {
  lat: number;
  lng: number;
  /** animation time when the marker arrives */
  at: number;
  /** epoch ms of arrival, formatted per-locale at draw time */
  realT: number;
}

const STOP_RADIUS_KM = 14;
const STOP_MIN_HOURS = 20;
const STOP_DEDUPE_KM = 40;
const MAX_STOPS = 24;

export class JourneyRenderer {
  private draw: TrackSample[];
  private journey: Journey;
  private trail: string;
  private attribution: string;
  private stops: StopLabel[];
  private showStops: boolean;
  /** poster mode disables the age fade so the full route is lit */
  private fullBright = false;

  constructor(journey: Journey, options?: RendererOptions) {
    this.journey = journey;
    this.draw = decimate(journey.samples, MAX_DRAW_SAMPLES);
    this.trail = options?.trailRgb ?? "255, 66, 105";
    this.attribution = options?.attribution ?? "© OpenStreetMap contributors © CARTO";
    this.showStops = options?.showStopDates ?? false;
    this.stops = this.showStops ? detectStops(journey.samples) : [];
  }

  /**
   * Render one frame at animation time t.
   * `ctx` is the overlay/composite 2D context; `map` provides projection.
   * `w`/`h` are CSS-pixel dimensions of the target; `scale` maps CSS px to
   * device px on the target canvas.
   */
  render(
    ctx: CanvasRenderingContext2D,
    map: MapLibreMap,
    t: number,
    w: number,
    h: number,
    scale: number,
    hud: HudOptions
  ) {
    ctx.save();
    ctx.scale(scale, scale);

    const state = stateAt(this.journey, t);

    // ----- project visible portion of the trail
    const pts: { x: number; y: number; at: number }[] = [];
    for (const s of this.draw) {
      if (s.at > t) break;
      const p = map.project([s.lng, s.lat]);
      pts.push({ x: p.x, y: p.y, at: s.at });
    }
    const head = map.project([state.lng, state.lat]);
    pts.push({ x: head.x, y: head.y, at: t });

    if (pts.length > 1) {
      this.strokeTrail(ctx, pts, t, w, h);
    }

    // ----- stop date labels
    if (this.showStops) {
      this.drawStopLabels(ctx, map, t, w, h, hud.locale);
    }

    // ----- pulsing head marker
    this.drawMarker(ctx, head.x, head.y, t);

    // ----- HUD
    if (hud.showHud) {
      this.drawHud(ctx, state.distKm, state.realT, t, w, h, hud);
    }

    ctx.restore();
  }

  /**
   * Designer route card ("screenshot"): full route lit, stop dates, big
   * typography. Used by the poster/share-image export; sized for social.
   */
  renderPoster(
    ctx: CanvasRenderingContext2D,
    map: MapLibreMap,
    w: number,
    h: number,
    opts: { title: string; locale: string; rangeLabel: string; distanceLabel: string }
  ) {
    const t = this.journey.totalSeconds;
    this.fullBright = true;
    ctx.save();

    // full trail
    const pts: { x: number; y: number; at: number }[] = this.draw.map((s) => {
      const p = map.project([s.lng, s.lat]);
      return { x: p.x, y: p.y, at: s.at };
    });
    if (pts.length > 1) this.strokeTrail(ctx, pts, t, w, h);

    // start + end markers
    const first = pts[0];
    const last = pts[pts.length - 1];
    for (const [p, r] of [[first, 3.5], [last, 5]] as const) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * (Math.max(w, h) / 640), 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.6 * (Math.max(w, h) / 640), 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${this.trail})`;
      ctx.fill();
    }

    if (this.showStops) this.drawStopLabels(ctx, map, t, w, h, opts.locale);

    // ----- card typography
    const u = Math.max(w, h) / 640;
    const pad = 30 * u;

    // bottom panel scrim
    const scrim = ctx.createLinearGradient(0, h * 0.55, 0, h);
    scrim.addColorStop(0, "rgba(8, 8, 12, 0)");
    scrim.addColorStop(0.55, "rgba(8, 8, 12, 0.55)");
    scrim.addColorStop(1, "rgba(8, 8, 12, 0.9)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, h * 0.55, w, h * 0.45);

    // wordmark, top-left
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.beginPath();
    ctx.arc(pad * 0.75, pad * 0.78, 4 * u, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${this.trail})`;
    ctx.fill();
    ctx.font = `600 ${13 * u}px "Geist", system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillText("Roamline", pad * 0.75 + 10 * u, pad * 0.55);

    // title
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 ${34 * u}px "Geist", system-ui, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(opts.title, pad, h - pad - 34 * u, w - pad * 2);

    // stats row
    ctx.font = `600 ${14 * u}px "Geist Mono", ui-monospace, monospace`;
    ctx.fillStyle = `rgb(${this.trail})`;
    const dist = opts.distanceLabel;
    ctx.fillText(dist, pad, h - pad);
    const distW = ctx.measureText(dist).width;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(`  ·  ${opts.rangeLabel}`, pad + distW, h - pad);

    // attribution
    ctx.font = `400 ${8.5 * u}px system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(this.attribution, w - pad * 0.4, h - pad * 0.35);
    ctx.textAlign = "left";

    ctx.restore();
    this.fullBright = false;
  }

  private drawStopLabels(
    ctx: CanvasRenderingContext2D,
    map: MapLibreMap,
    t: number,
    w: number,
    h: number,
    locale: string
  ) {
    const u = Math.max(w, h) / 640;
    const placed: { x: number; y: number }[] = [];
    ctx.font = `600 ${10 * u}px "Geist Mono", ui-monospace, monospace`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    for (const stop of this.stops) {
      if (stop.at > t) continue;
      const p = map.project([stop.lng, stop.lat]);
      if (p.x < -40 || p.y < -20 || p.x > w + 40 || p.y > h + 20) continue;
      // greedy overlap avoidance
      if (placed.some((q) => Math.abs(q.x - p.x) < 90 * u && Math.abs(q.y - p.y) < 22 * u)) continue;
      placed.push({ x: p.x, y: p.y });

      const alpha = Math.min(1, (t - stop.at) / 0.6);
      const label = new Date(stop.realT)
        .toLocaleDateString(locale, { month: "short", day: "numeric" })
        .toUpperCase();
      const textW = ctx.measureText(label).width;
      const bx = p.x + 9 * u;
      const by = p.y - 8 * u;
      const bh = 16 * u;

      // anchor dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.6 * u, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.9 * alpha})`;
      ctx.fill();

      // pill
      ctx.beginPath();
      roundRect(ctx, bx, by, textW + 12 * u, bh, bh / 2);
      ctx.fillStyle = `rgba(10, 10, 16, ${0.72 * alpha})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${this.trail}, ${0.5 * alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = `rgba(255,255,255,${0.92 * alpha})`;
      ctx.fillText(label, bx + 6 * u, by + bh / 2 + 0.5);
    }
    ctx.textBaseline = "alphabetic";
  }

  private strokeTrail(
    ctx: CanvasRenderingContext2D,
    pts: { x: number; y: number; at: number }[],
    t: number,
    w: number,
    h: number
  ) {
    const px = Math.max(w, h) / 640; // resolution-independent line weight
    // Age-based fade: draw the path in chunks with varying alpha. Chunks keep
    // the pass count low (a per-segment stroke would be too slow).
    const CHUNKS = 24;
    const per = Math.max(2, Math.ceil(pts.length / CHUNKS));

    for (let pass = 0; pass < 2; pass++) {
      // pass 0: soft glow, pass 1: bright core
      for (let c = 0; c < pts.length - 1; c += per) {
        const end = Math.min(pts.length - 1, c + per);
        const midAt = pts[Math.min(pts.length - 1, c + (per >> 1))].at;
        const age = (t - midAt) / Math.max(1, this.journey.travelSeconds);
        // newest FADE_TAIL of the journey time is fully lit, older fades to floor
        const fade = this.fullBright
          ? 1
          : age <= 0 ? 1 : Math.max(0.28, 1 - Math.max(0, age - (1 - FADE_TAIL)) / FADE_TAIL);

        ctx.beginPath();
        ctx.moveTo(pts[c].x, pts[c].y);
        for (let i = c + 1; i <= end; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        if (pass === 0) {
          ctx.strokeStyle = `rgba(${this.trail}, ${0.16 * fade})`;
          ctx.lineWidth = 9 * px;
        } else {
          ctx.strokeStyle = `rgba(${this.trail}, ${0.95 * fade})`;
          ctx.lineWidth = 2.6 * px;
        }
        ctx.stroke();
      }
    }
  }

  private drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
    const px = 1;
    const pulse = (t % 1.6) / 1.6;
    // expanding ring
    ctx.beginPath();
    ctx.arc(x, y, 6 + pulse * 16, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${this.trail}, ${0.5 * (1 - pulse)})`;
    ctx.lineWidth = 2 * px;
    ctx.stroke();
    // glow
    const grad = ctx.createRadialGradient(x, y, 0, x, y, 14);
    grad.addColorStop(0, `rgba(${this.trail}, 0.55)`);
    grad.addColorStop(1, `rgba(${this.trail}, 0)`);
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    // core
    ctx.beginPath();
    ctx.arc(x, y, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${this.trail})`;
    ctx.fill();
  }

  private drawHud(
    ctx: CanvasRenderingContext2D,
    distKm: number,
    realT: number,
    t: number,
    w: number,
    h: number,
    hud: HudOptions
  ) {
    const u = Math.max(w, h) / 640; // HUD unit
    const pad = 18 * u;
    const mono = `600 ${13 * u}px "Geist Mono", ui-monospace, monospace`;
    const sans = `600 ${15 * u}px "Geist", system-ui, sans-serif`;

    // bottom scrim for legibility
    const scrim = ctx.createLinearGradient(0, h - 110 * u, 0, h);
    scrim.addColorStop(0, "rgba(8, 8, 12, 0)");
    scrim.addColorStop(1, "rgba(8, 8, 12, 0.72)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, h - 110 * u, w, 110 * u);
    const top = ctx.createLinearGradient(0, 0, 0, 80 * u);
    top.addColorStop(0, "rgba(8, 8, 12, 0.6)");
    top.addColorStop(1, "rgba(8, 8, 12, 0)");
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, w, 80 * u);

    // title, top-left
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = sans;
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fillText(hud.title, pad, pad);

    // date, bottom-left
    const date = new Date(realT).toLocaleDateString(hud.locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    ctx.font = mono;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(date.toUpperCase(), pad, h - pad - 20 * u);

    // distance, bottom-left large
    ctx.font = `700 ${24 * u}px "Geist Mono", ui-monospace, monospace`;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(formatDistance(distKm, hud.locale), pad, h - pad + 4 * u);

    // progress hairline, very bottom
    const prog = Math.min(1, t / this.journey.totalSeconds);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(0, h - 3 * u, w, 3 * u);
    ctx.fillStyle = `rgb(${this.trail})`;
    ctx.fillRect(0, h - 3 * u, w * prog, 3 * u);

    // attribution, bottom-right (required by OSM/CARTO)
    ctx.font = `400 ${8.5 * u}px system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(this.attribution, w - pad * 0.5, h - pad * 0.45);
    ctx.textAlign = "left";
  }
}

/** Rounded-rect path helper (roundRect isn't in older canvas typings). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Dwell detection for stop-date labels: spans that stay within
 *  STOP_RADIUS_KM for at least STOP_MIN_HOURS, deduped by proximity. */
function detectStops(samples: TrackSample[]): StopLabel[] {
  const found: (StopLabel & { dwellMs: number })[] = [];
  let anchor = 0;
  for (let i = 1; i <= samples.length; i++) {
    const leaving =
      i === samples.length ||
      haversineKm(samples[anchor].lat, samples[anchor].lng, samples[i].lat, samples[i].lng) >
        STOP_RADIUS_KM;
    if (!leaving) continue;
    const dwellMs = samples[i - 1].realT - samples[anchor].realT;
    if (dwellMs >= STOP_MIN_HOURS * 3_600_000) {
      const a = samples[anchor];
      const near = found.find(
        (s) => haversineKm(s.lat, s.lng, a.lat, a.lng) < STOP_DEDUPE_KM
      );
      if (near) {
        near.dwellMs += dwellMs; // repeat visits strengthen the first label
      } else {
        found.push({ lat: a.lat, lng: a.lng, at: a.at, realT: a.realT, dwellMs });
      }
    }
    anchor = i;
  }
  return found
    .sort((a, b) => b.dwellMs - a.dwellMs)
    .slice(0, MAX_STOPS)
    .sort((a, b) => a.at - b.at)
    .map(({ lat, lng, at, realT }) => ({ lat, lng, at, realT }));
}

/** Keep at most `max` samples, always keeping first and last. */
function decimate(samples: TrackSample[], max: number): TrackSample[] {
  if (samples.length <= max) return samples;
  const out: TrackSample[] = [];
  const step = (samples.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(samples[Math.round(i * step)]);
  }
  return out;
}
