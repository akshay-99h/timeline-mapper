"use client";

// Step 4: render the video, then play / download / share / save poster.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  DownloadSimple,
  FilmSlate,
  ImageSquare,
  ShareNetwork,
  X,
} from "@phosphor-icons/react";
import { buildJourney } from "@/lib/journey";
import { exportRouteCard, exportVideo, webCodecsSupported, type ExportProgress } from "@/lib/video/exporter";
import { saveVideo } from "@/lib/db";
import { formatDistance } from "@/lib/geo";
import { useApp } from "@/lib/store";
import { VIDEO_FORMATS, type LibraryVideo } from "@/lib/types";
import { Confetti } from "@/components/Confetti";

type Phase =
  | { kind: "idle" }
  | { kind: "working"; progress: ExportProgress }
  | { kind: "done"; video: LibraryVideo; url: string }
  | { kind: "error"; message: string };

export function GenerateStep() {
  const app = useApp();
  const { t, lang, data } = app;
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);

  const config = app.currentConfig();
  const zonesKey = JSON.stringify(config.privacyZones);
  const journey = useMemo(
    () => (data ? buildJourney(data.points, config) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, config.rangeStart, config.rangeEnd, config.duration, config.compression, zonesKey]
  );
  const format = VIDEO_FORMATS.find((f) => f.id === app.formatId) ?? VIDEO_FORMATS[2];
  const title = app.resolvedTitle();

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  if (!data || !journey) {
    return (
      <div className="panel mx-auto max-w-md p-8 text-center">
        <p className="text-[14px] text-dim">{t("noData")}</p>
      </div>
    );
  }

  const start = async () => {
    const abort = new AbortController();
    abortRef.current = abort;
    setPhase({ kind: "working", progress: { fraction: 0, etaSeconds: null, phase: "preparing" } });
    try {
      const result = await exportVideo({
        journey,
        width: format.width,
        height: format.height,
        title,
        locale: lang,
        cameraMode: app.camera,
        mapThemeId: app.mapThemeId,
        trailId: app.trailId,
        showStopDates: app.showStopDates,
        onProgress: (p) => setPhase({ kind: "working", progress: p }),
        signal: abort.signal,
      });
      const video: LibraryVideo = {
        id: `v-${Date.now()}`,
        title,
        createdAt: Date.now(),
        mime: result.mime,
        blob: result.blob,
        thumb: result.thumb,
        duration: journey.totalSeconds,
        width: format.width,
        height: format.height,
        distanceKm: journey.totalKm,
        rangeLabel: `${shortDate(config.rangeStart, lang)} – ${shortDate(config.rangeEnd, lang)}`,
      };
      try {
        await saveVideo(video);
        app.toast(t("savedToLibrary"), "success");
      } catch {
        // library save is best-effort (private browsing etc.)
      }
      const url = URL.createObjectURL(result.blob);
      urlRef.current = url;
      setPhase({ kind: "done", video, url });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        app.toast(t("cancelled"), "info");
        setPhase({ kind: "idle" });
      } else {
        console.error(err);
        setPhase({ kind: "error", message: t("error") });
      }
    }
  };

  const download = () => {
    if (phase.kind !== "done") return;
    const a = document.createElement("a");
    a.href = phase.url;
    a.download = `${slug(title)}.${phase.video.mime === "video/mp4" ? "mp4" : "webm"}`;
    a.click();
  };

  const share = async () => {
    if (phase.kind !== "done") return;
    const file = new File(
      [phase.video.blob],
      `${slug(title)}.${phase.video.mime === "video/mp4" ? "mp4" : "webm"}`,
      { type: phase.video.mime }
    );
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
      } catch {
        // user dismissed the sheet
      }
    } else {
      app.toast(t("shareUnavailable"), "info");
    }
  };

  const savePoster = async () => {
    const blob = await exportRouteCard({
      journey,
      width: 1080,
      height: 1350, // 4:5, plays nicely with social feeds
      title,
      locale: lang,
      mapThemeId: app.mapThemeId,
      trailId: app.trailId,
      showStopDates: app.showStopDates,
      rangeLabel: `${shortDate(config.rangeStart, lang)} – ${shortDate(config.rangeEnd, lang)}`,
    });
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(title)}-card.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // ------------------------------------------------------------ rendering

  if (phase.kind === "done") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative mx-auto max-w-2xl text-center"
      >
        <Confetti />
        <h2 className="text-2xl font-semibold tracking-tight">{t("done")}</h2>
        <p className="mt-1 font-mono text-[13px] text-dim">
          {title} · {formatDistance(journey.totalKm, lang)}
        </p>
        <video
          src={phase.url}
          controls
          playsInline
          autoPlay
          loop
          muted
          className="mx-auto mt-6 max-h-[56vh] rounded-2xl border border-line shadow-2xl"
          style={{ aspectRatio: `${format.width} / ${format.height}` }}
        />
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={download} className="btn-primary">
            <DownloadSimple size={16} weight="bold" />
            {t("download")}
          </button>
          <button type="button" onClick={share} className="btn-secondary">
            <ShareNetwork size={16} />
            {t("share")}
          </button>
          <button type="button" onClick={savePoster} className="btn-secondary">
            <ImageSquare size={16} />
            {t("saveOverview")}
          </button>
        </div>
      </motion.div>
    );
  }

  if (phase.kind === "working") {
    const p = phase.progress;
    return (
      <div className="mx-auto max-w-md">
        <div className="panel p-8 text-center">
          <p className="text-lg font-semibold tracking-tight">{t("generating")}</p>
          <p className="mt-1 font-mono text-[12px] text-faint">
            {format.width}×{format.height} · {Math.round(journey.totalSeconds)}s
          </p>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-sunken">
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={false}
              animate={{ width: `${Math.round(p.fraction * 100)}%` }}
              transition={{ duration: 0.25, ease: "linear" }}
            />
          </div>
          <p className="mt-3 font-mono text-[12px] text-dim" aria-live="polite">
            {Math.round(p.fraction * 100)}% ·{" "}
            {p.etaSeconds != null ? t("eta", { s: Math.max(1, Math.round(p.etaSeconds)) }) : t("calibrating")}
          </p>
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="mx-auto mt-6 flex items-center gap-1.5 rounded-full border border-line px-5 py-2 text-[13px] font-medium text-dim transition-colors hover:border-line-strong hover:text-ink"
          >
            <X size={13} />
            {t("cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md text-center">
      <div className="panel p-8">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft">
          <FilmSlate size={28} className="text-accent" weight="duotone" />
        </div>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 font-mono text-[13px] text-dim">
          {format.label} · {app.duration}{t("seconds")} · {formatDistance(journey.totalKm, lang)}
        </p>
        {!webCodecsSupported() && (
          <p className="mt-3 text-[12px] leading-relaxed text-faint">{t("webmNote")}</p>
        )}
        {phase.kind === "error" && (
          <p role="alert" className="mt-3 text-[13px] text-[color:var(--danger)]">
            {phase.message}
          </p>
        )}
        <button type="button" onClick={start} className="btn-primary mx-auto mt-6">
          <FilmSlate size={16} weight="fill" />
          {phase.kind === "error" ? t("tryAgain") : t("generate")}
        </button>
      </div>
    </div>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "roamline";
}

function shortDate(t: number, locale: string) {
  return new Date(t).toLocaleDateString(locale, { month: "short", year: "numeric" });
}
