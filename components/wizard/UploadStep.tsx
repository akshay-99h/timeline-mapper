"use client";

// Step 1: file intake. Drag-and-drop or picker for any mix of Timeline JSON,
// whole Takeout / Apple Health ZIPs, GPX and KML tracks. Worker-based
// parsing, raw-records opt-in, and a load summary.

import { useCallback, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  AndroidLogo,
  AppleLogo,
  CloudArrowUp,
  FolderOpen,
  GoogleLogo,
  HeartStraight,
  Play,
  Warning,
} from "@phosphor-icons/react";
import { parseTimelineFiles } from "@/lib/parse";
import { collectDroppedFiles } from "@/lib/parse/dropped";
import { formatDistance } from "@/lib/geo";
import { generateSampleJourney, SAMPLE_NAME } from "@/lib/sample";
import { useApp } from "@/lib/store";

// Kept module-local so toggling "include raw records" can re-parse without
// asking for the files again. Never persisted.
let lastFiles: File[] | null = null;

const MAX_TOTAL_BYTES = 1200 * 1024 * 1024;

export function UploadStep() {
  const { t, lang, data, setData, parseOptions, setParseOptions, setJourneyName } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const runParse = useCallback(
    async (files: File[], includeRaw: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const result = await parseTimelineFiles(files, {
          ...parseOptions,
          includeRawRecords: includeRaw,
        });
        if (result.points.length < 2 && !result.summary.hasRawRecords) {
          setError(t("parseErrorEmpty"));
          setBusy(false);
          return;
        }
        setData(result, files.map((f) => f.name).join(", "));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg === "UNRECOGNIZED_FORMAT") setError(t("parseErrorFormat"));
        else setError(t("parseErrorJson"));
      }
      setBusy(false);
    },
    [parseOptions, setData, t]
  );

  const handleFiles = useCallback(
    async (list: FileList | File[]) => {
      let files = [...list];
      if (files.length === 0) return;
      // Folder pickers hand over everything inside (incl. Apple Health's
      // 500 MB export.xml); keep only parseable types when any are present.
      const wanted = files.filter((f) => /\.(json|gpx|kml|zip)$/i.test(f.name));
      if (wanted.length > 0) files = wanted;
      const totalBytes = files.reduce((s, f) => s + f.size, 0);
      if (totalBytes > MAX_TOTAL_BYTES) {
        setError(t("parseErrorJson"));
        return;
      }
      lastFiles = files;
      await runParse(files, parseOptions.includeRawRecords);
    },
    [runParse, parseOptions.includeRawRecords, t]
  );

  const toggleRaw = async (on: boolean) => {
    setParseOptions({ includeRawRecords: on });
    if (lastFiles) {
      await runParse(lastFiles, on);
    }
  };

  const loadSample = () => {
    setJourneyName(SAMPLE_NAME);
    setData(generateSampleJourney(), "sample-journey");
  };

  const summary = data?.summary;

  return (
    <div className="mx-auto max-w-2xl">
      {/* dropzone */}
      <motion.label
        initial={false}
        animate={{ scale: dragOver ? 1.015 : 1 }}
        htmlFor="timeline-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          // folder-aware: walks dropped directories (apple_health_export/ etc.)
          void collectDroppedFiles(e.dataTransfer).then((files) => {
            if (files.length) void handleFiles(files);
          });
        }}
        className={`panel relative flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-3 border-dashed p-10 text-center transition-colors ${
          dragOver ? "border-accent bg-accent-soft" : "hover:border-line-strong"
        }`}
      >
        <input
          ref={inputRef}
          id="timeline-file"
          type="file"
          multiple
          accept=".json,.zip,.gpx,.kml,application/json,application/zip"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {busy ? (
          <>
            <div className="skeleton h-12 w-12 rounded-2xl" />
            <p className="text-[15px] font-medium">{t("parsing")}</p>
            <div className="skeleton h-3 w-48" />
          </>
        ) : (
          <>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft">
              <CloudArrowUp size={28} className="text-accent" weight="duotone" />
            </div>
            <p className="text-lg font-semibold tracking-tight">{t("dropTitle")}</p>
            <p className="max-w-sm text-[13px] leading-relaxed text-dim">{t("dropBody")}</p>
            <p className="mt-1 rounded-full bg-sunken px-3.5 py-1.5 font-mono text-[11px] text-faint">
              {t("dropHint")}
            </p>
          </>
        )}
      </motion.label>

      {/* folder picker: extracted exports (apple_health_export/, Takeout/) */}
      {!busy && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-medium text-faint transition-colors hover:text-ink"
          >
            <FolderOpen size={14} />
            {t("chooseFolder")}
          </button>
          <input
            ref={folderInputRef}
            type="file"
            // non-standard but universally supported attribute for folder pickers
            {...({ webkitdirectory: "" } as Record<string, string>)}
            multiple
            className="sr-only"
            aria-label={t("chooseFolder")}
            onChange={(e) => {
              if (e.target.files?.length) void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="mt-4 rounded-2xl border border-[color:var(--danger)]/30 bg-[color:var(--danger)]/5 p-4 text-[13px] leading-relaxed text-[color:var(--danger)]"
        >
          {error}
        </motion.div>
      )}

      {/* raw records warning + opt-in */}
      {summary?.hasRawRecords && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel mt-4 flex items-start gap-3 p-5"
        >
          <Warning size={20} className="mt-0.5 shrink-0 text-accent" weight="duotone" />
          <div className="flex-1">
            <p className="text-[14px] font-semibold">{t("rawWarningTitle")}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-dim">
              {t("rawWarningBody", { limit: parseOptions.rawAccuracyLimit })}
            </p>
            <label className="mt-3 flex w-fit cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={parseOptions.includeRawRecords}
                onChange={(e) => void toggleRaw(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              <span className="text-[13px] font-medium">{t("includeRaw")}</span>
            </label>
          </div>
        </motion.div>
      )}

      {/* summary after load */}
      {summary && summary.kept > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel mt-4 p-6"
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Stat label={t("summaryPoints")} value={summary.kept.toLocaleString(lang)} />
            <Stat
              label={t("summaryRange")}
              value={`${shortDate(summary.start, lang)} – ${shortDate(summary.end, lang)}`}
            />
            <Stat label={t("summaryDistance")} value={formatDistance(summary.distanceKm, lang)} />
            <Stat
              label={t("summaryFiltered")}
              value={(summary.droppedOutliers + summary.droppedDuplicates + summary.droppedInaccurate).toLocaleString(lang)}
            />
          </div>
          <p className="mt-4 font-mono text-[11px] text-faint">
            {summary.formats.join(" · ")}
          </p>
        </motion.div>
      )}

      {/* per-platform export instructions */}
      {!summary && !busy && <ExportHowTo />}

      {/* sample */}
      {!summary && !busy && (
        <button
          type="button"
          onClick={loadSample}
          className="mx-auto mt-6 flex items-center gap-2 rounded-full border border-line px-5 py-2.5 text-[13px] font-medium text-dim transition-colors hover:border-line-strong hover:text-ink"
        >
          <Play size={13} weight="fill" className="text-accent" />
          {t("loadSample")}
        </button>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 font-mono text-[15px] font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function shortDate(t: number, locale: string) {
  return new Date(t).toLocaleDateString(locale, { month: "short", year: "2-digit" });
}

/** "Where to find your file": Android / iPhone / Takeout / Apple Health,
 *  each with steps and the exact file that export produces. */
function ExportHowTo() {
  const { t } = useApp();
  const [platform, setPlatform] = useState<"android" | "ios" | "takeout" | "apple">("android");

  const tabs = [
    { id: "android", label: t("platformAndroid"), icon: <AndroidLogo size={15} /> },
    { id: "ios", label: t("platformIos"), icon: <AppleLogo size={15} /> },
    { id: "takeout", label: t("platformTakeout"), icon: <GoogleLogo size={15} /> },
    { id: "apple", label: t("platformApple"), icon: <HeartStraight size={15} /> },
  ] as const;

  const body: Record<typeof platform, { steps: string; file: string }> = {
    android: { steps: t("howToAndroid"), file: t("howToAndroidFile") },
    ios: { steps: t("howToIos"), file: t("howToIosFile") },
    takeout: { steps: t("howToTakeout"), file: t("howToTakeoutFile") },
    apple: { steps: t("howToApple"), file: t("howToAppleFile") },
  };

  return (
    <section className="panel mt-4 p-5">
      <div className="flex flex-col gap-3">
        <h3 className="text-[13px] font-semibold">{t("howToTitle")}</h3>
        <div className="flex w-fit flex-wrap gap-1 rounded-full bg-sunken p-1" role="tablist" aria-label={t("howToTitle")}>
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={platform === id}
              onClick={() => setPlatform(id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                platform === id ? "bg-elev text-ink shadow-sm" : "text-dim hover:text-ink"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-dim">{body[platform].steps}</p>
      <p className="mt-2 w-fit rounded-full bg-sunken px-3 py-1.5 font-mono text-[11px] text-faint">
        {body[platform].file}
      </p>
    </section>
  );
}
