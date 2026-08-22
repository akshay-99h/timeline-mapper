"use client";

// Step 3: live animated preview. Runs the exact same renderer and camera
// logic as the video export, just at screen resolution in real time.

import { useEffect, useMemo, useRef, useState } from "react";
import { maplibregl } from "@/lib/maplibre";
import { ArrowCounterClockwise, Pause, Play } from "@phosphor-icons/react";
import { buildCameraTrack, cameraAt, type CameraTrack } from "@/lib/camera";
import { buildJourney, type Journey } from "@/lib/journey";
import { JourneyRenderer } from "@/lib/renderer";
import { mapTheme, trailPalette } from "@/lib/mapstyle";
import { useApp } from "@/lib/store";
import { VIDEO_FORMATS } from "@/lib/types";

export function PreviewStep() {
  const app = useApp();
  const { t, data } = app;

  const config = app.currentConfig();
  const zonesKey = JSON.stringify(config.privacyZones);
  const journey = useMemo(
    () => (data ? buildJourney(data.points, config) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, config.rangeStart, config.rangeEnd, config.duration, config.compression, zonesKey]
  );

  if (!data) return null;
  if (!journey) {
    return (
      <div className="panel mx-auto max-w-md p-8 text-center">
        <p className="text-[14px] text-dim">{t("parseErrorEmpty")}</p>
      </div>
    );
  }
  return <Player journey={journey} />;
}

function Player({ journey }: { journey: Journey }) {
  const app = useApp();
  const { t, lang, formatId, camera, mapThemeId, trailId, showStopDates } = app;
  const title = app.resolvedTitle();
  const theme = mapTheme(mapThemeId);

  const format = VIDEO_FORMATS.find((f) => f.id === formatId) ?? VIDEO_FORMATS[2];
  const frameRef = useRef<HTMLDivElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const playingRef = useRef(true);
  const tRef = useRef(0);
  const seekRef = useRef<((t: number) => void) | null>(null);

  // size the stage: fit format aspect into available space
  const [stage, setStage] = useState({ w: 640, h: 640 });
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      const maxW = el.clientWidth;
      const maxH = Math.min(window.innerHeight * 0.62, 640);
      const ar = format.width / format.height;
      let w = maxW;
      let h = w / ar;
      if (h > maxH) {
        h = maxH;
        w = h * ar;
      }
      setStage({ w: Math.round(w), h: Math.round(h) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [format.width, format.height]);

  // the animation loop
  useEffect(() => {
    const mapDiv = mapDivRef.current;
    const overlay = overlayRef.current;
    if (!mapDiv || !overlay || stage.w < 60) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    overlay.width = stage.w * dpr;
    overlay.height = stage.h * dpr;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    const track: CameraTrack = buildCameraTrack(journey, camera, stage.w, stage.h);
    const renderer = new JourneyRenderer(journey, {
      trailRgb: trailPalette(trailId).rgb,
      attribution: theme.attribution,
      showStopDates,
    });
    const cam0 = cameraAt(track, journey, tRef.current);

    const map = new maplibregl.Map({
      container: mapDiv,
      style: theme.style,
      center: [cam0.lng, cam0.lat],
      zoom: cam0.zoom,
      pitch: cam0.pitch,
      bearing: cam0.bearing,
      interactive: false,
      attributionControl: false,
      fadeDuration: 120,
    });

    let raf = 0;
    let last = performance.now();
    let ready = false;

    // Same resilience the globe and exporter need with MapLibre v6: the map
    // can mis-measure a container that mounts mid-transition, and its render
    // loop stalls if rAF is throttled. Watch size ourselves and force
    // periodic redraws so the basemap always paints.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapDiv);
    const ticker = setInterval(() => {
      try { map.redraw(); } catch { /* mid-teardown */ }
    }, 200);

    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__previewMap = map;
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!ready) return;
      if (playingRef.current) {
        tRef.current = tRef.current + dt;
        if (tRef.current >= journey.totalSeconds) {
          tRef.current = journey.totalSeconds;
          playingRef.current = false;
          setPlaying(false);
        }
      }
      const tt = tRef.current;
      const cam = cameraAt(track, journey, tt);
      map.jumpTo({ center: [cam.lng, cam.lat], zoom: cam.zoom, pitch: cam.pitch, bearing: cam.bearing });
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      renderer.render(ctx, map, tt, stage.w, stage.h, dpr, {
        title,
        locale: lang,
        showHud: true,
      });
      setProgress(tt / journey.totalSeconds);
    };

    map.once("load", () => {
      map.resize();
      ready = true;
    });
    raf = requestAnimationFrame(frame);

    seekRef.current = (t: number) => {
      tRef.current = t * journey.totalSeconds;
    };

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(ticker);
      ro.disconnect();
      seekRef.current = null;
      map.remove();
    };
  }, [journey, stage.w, stage.h, camera, title, lang, theme, trailId, showStopDates]);

  // restart when journey changes
  useEffect(() => {
    tRef.current = 0;
    playingRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on journey swap
    setPlaying(true);
  }, [journey]);

  // keyboard: space toggles play (studio page dispatches this event)
  useEffect(() => {
    const onToggle = () => {
      playingRef.current = !playingRef.current;
      setPlaying(playingRef.current);
    };
    window.addEventListener("roamline:toggleplay", onToggle);
    return () => window.removeEventListener("roamline:toggleplay", onToggle);
  }, []);

  const toggle = () => {
    if (tRef.current >= journey.totalSeconds) tRef.current = 0;
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
  };
  const restart = () => {
    tRef.current = 0;
    playingRef.current = true;
    setPlaying(true);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div ref={frameRef} className="flex justify-center">
        <div
          className="relative overflow-hidden rounded-2xl border border-line bg-sunken shadow-2xl"
          style={{ width: stage.w, height: stage.h }}
        >
          {/* inline styles: MapLibre's unlayered .maplibregl-map CSS overrides
              Tailwind's layered position utilities, so classes alone collapse
              this div to height 0 */}
          <div ref={mapDivRef} style={{ position: "absolute", inset: 0 }} />
          <canvas
            ref={overlayRef}
            className="pointer-events-none absolute inset-0"
            style={{ width: stage.w, height: stage.h }}
          />
        </div>
      </div>

      {/* transport controls */}
      <div className="mx-auto mt-5 flex max-w-xl items-center gap-4">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? t("pause") : t("play")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-[0_4px_20px_var(--accent-glow)] transition-transform active:scale-95"
        >
          {playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
        </button>
        <input
          type="range"
          aria-label={t("preview")}
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={(e) => {
            const f = Number(e.target.value) / 1000;
            seekRef.current?.(f);
            setProgress(f);
          }}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-sunken accent-[var(--accent)]"
        />
        <button
          type="button"
          onClick={restart}
          aria-label={t("restart")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-dim transition-colors hover:border-line-strong hover:text-ink"
        >
          <ArrowCounterClockwise size={15} />
        </button>
      </div>
      <p className="mt-3 text-center font-mono text-[11px] text-faint">{t("keyboardHint")}</p>
    </div>
  );
}
