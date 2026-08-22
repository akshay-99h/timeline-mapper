"use client";

// Health report: streams an Apple Health export.xml (or export.zip / the
// extracted folder) through a worker and renders an aggregated dashboard.
// Like everything else here: fully local, nothing leaves the device.

import { useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Barbell,
  FireSimple,
  FolderOpen,
  Footprints,
  HeartStraight,
  Path,
  Stairs,
} from "@phosphor-icons/react";
import { analyzeHealthFile, findHealthFile, type HealthSummary } from "@/lib/health";
import { collectDroppedFiles } from "@/lib/parse/dropped";
import { formatDistance } from "@/lib/geo";
import { useApp } from "@/lib/store";

type Phase =
  | { kind: "idle" }
  | { kind: "working"; fraction: number }
  | { kind: "done"; summary: HealthSummary }
  | { kind: "error" };

export default function HealthPage() {
  const { t, lang } = useApp();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);

  const run = async (files: File[]) => {
    // export.xml can hide inside a folder pick; health accepts .xml too
    const file =
      findHealthFile(files) ?? files.find((f) => /\.(xml|zip)$/i.test(f.name)) ?? files[0];
    if (!file) return;
    setPhase({ kind: "working", fraction: 0 });
    try {
      const summary = await analyzeHealthFile(file, (p) =>
        setPhase({ kind: "working", fraction: p.fraction })
      );
      setPhase({ kind: "done", summary });
    } catch {
      setPhase({ kind: "error" });
    }
  };

  return (
    <div className="mx-auto min-h-[100dvh] max-w-4xl px-4 pb-24 pt-28 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">{t("healthTitle")}</h1>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-dim">{t("healthIntro")}</p>

      {phase.kind !== "done" && (
        <>
          <label
            htmlFor="health-file"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void collectDroppedFiles(e.dataTransfer, /\.(xml|zip)$/i).then((files) => {
                if (files.length) void run(files);
              });
            }}
            className={`panel mt-8 flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 border-dashed p-8 text-center transition-colors ${
              dragOver ? "border-accent bg-accent-soft" : "hover:border-line-strong"
            }`}
          >
            <input
              id="health-file"
              type="file"
              accept=".xml,.zip,application/xml,application/zip"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) void run([...e.target.files]);
                e.target.value = "";
              }}
            />
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft">
              <HeartStraight size={26} className="text-accent" weight="duotone" />
            </div>
            {phase.kind === "working" ? (
              <div className="w-full max-w-xs">
                <p className="text-[14px] font-medium">{t("healthParsing")}</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-200"
                    style={{ width: `${Math.round(phase.fraction * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <p className="text-[15px] font-semibold tracking-tight">{t("healthDrop")}</p>
                <p className="rounded-full bg-sunken px-3.5 py-1.5 font-mono text-[11px] text-faint">
                  export.zip · export.xml
                </p>
              </>
            )}
          </label>
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => folderRef.current?.click()}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-medium text-faint transition-colors hover:text-ink"
            >
              <FolderOpen size={14} />
              {t("chooseFolder")}
            </button>
            <input
              ref={folderRef}
              type="file"
              {...({ webkitdirectory: "" } as Record<string, string>)}
              multiple
              className="sr-only"
              aria-label={t("chooseFolder")}
              onChange={(e) => {
                if (e.target.files?.length) void run([...e.target.files]);
                e.target.value = "";
              }}
            />
          </div>
          {phase.kind === "error" && (
            <p role="alert" className="mt-4 text-center text-[13px] text-[color:var(--danger)]">
              {t("healthError")}
            </p>
          )}
          <p className="mt-6 text-center text-[12px] text-faint">{t("privacyNote")}</p>
        </>
      )}

      {phase.kind === "done" && <Dashboard summary={phase.summary} lang={lang} />}
    </div>
  );
}

// ---------------------------------------------------------------- dashboard

function Dashboard({ summary: s, lang }: { summary: HealthSummary; lang: string }) {
  const { t } = useApp();
  const fmt = (n: number) => Math.round(n).toLocaleString(lang);
  const rangeLabel = `${monthLabel(s.rangeStart, lang)} – ${monthLabel(s.rangeEnd, lang)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mt-8"
    >
      <p className="font-mono text-[12px] text-faint">
        {rangeLabel} · {fmt(s.daysWithData)} {t("healthDays")}
      </p>

      {/* stat tiles */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Tile
          icon={<Footprints size={20} weight="duotone" />}
          label={t("healthSteps")}
          value={fmt(s.totals.steps)}
          sub={`${fmt(s.daily.steps)} ${t("healthPerDay")}`}
        />
        <Tile
          icon={<Path size={20} weight="duotone" />}
          label={t("summaryDistance")}
          value={formatDistance(s.totals.distanceKm, lang)}
          sub={`${formatDistance(s.daily.distanceKm, lang)} ${t("healthPerDay")}`}
        />
        <Tile
          icon={<FireSimple size={20} weight="duotone" />}
          label={t("healthEnergy")}
          value={`${fmt(s.totals.activeKcal)} kcal`}
          sub={`${fmt(s.daily.activeKcal)} ${t("healthPerDay")}`}
        />
        <Tile
          icon={<Barbell size={20} weight="duotone" />}
          label={t("healthWorkouts")}
          value={fmt(s.totals.workouts)}
          sub={`${fmt(s.totals.workoutMin / 60)} ${t("healthHours")}`}
        />
        {(s.restingHr || s.avgHr != null) && (
          <Tile
            icon={<HeartStraight size={20} weight="duotone" />}
            label={s.restingHr ? t("healthRestingHr") : t("healthAvgHr")}
            value={`${Math.round(s.restingHr ? s.restingHr.avg : s.avgHr!)} bpm`}
            sub={
              s.restingHr
                ? `${Math.round(s.restingHr.min)}–${Math.round(s.restingHr.max)} bpm`
                : t("healthAvgHrSub")
            }
          />
        )}
        <Tile
          icon={<Stairs size={20} weight="duotone" />}
          label={t("healthFlights")}
          value={fmt(s.totals.flights)}
          sub={s.bestDay ? `${t("healthBestDay")}: ${fmt(s.bestDay.steps)} (${s.bestDay.date})` : ""}
        />
      </div>

      {/* monthly steps chart */}
      <section className="panel mt-4 p-6">
        <h2 className="text-[14px] font-semibold">{t("healthMonthly")}</h2>
        <MonthlyChart summary={s} />
      </section>

      {/* workout breakdown */}
      {s.workoutTypes.length > 0 && (
        <section className="panel mt-4 p-6">
          <h2 className="text-[14px] font-semibold">{t("healthWorkoutTypes")}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {s.workoutTypes.slice(0, 8).map((w) => (
              <div key={w.type} className="flex items-baseline justify-between gap-3 rounded-xl bg-sunken px-4 py-3">
                <span className="text-[13px] font-medium">{w.type}</span>
                <span className="font-mono text-[12px] text-dim">
                  ×{w.count} · {Math.round(w.minutes / 60)}h
                  {w.km > 1 ? ` · ${formatDistance(w.km, lang)}` : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </motion.div>
  );
}

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 text-accent">{icon}
        <span className="text-[11px] font-medium uppercase tracking-wide text-faint">{label}</span>
      </div>
      <p className="mt-2 font-mono text-[22px] font-bold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 font-mono text-[11px] text-faint">{sub}</p>}
    </div>
  );
}

/** Simple theme-aware SVG bar chart: steps per month with workout overlay. */
function MonthlyChart({ summary: s }: { summary: HealthSummary }) {
  const months = s.monthly.slice(-24); // last 2 years max
  const maxSteps = Math.max(1, ...months.map((m) => m.steps));
  const W = 720;
  const H = 160;
  const gap = 3;
  const bw = W / months.length - gap;

  return (
    <div className="mt-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="min-w-[540px]" role="img" aria-label="Monthly steps">
        {months.map((m, i) => {
          const h = Math.max(2, (m.steps / maxSteps) * H);
          const x = i * (bw + gap);
          return (
            <g key={m.ym}>
              <rect
                x={x}
                y={H - h}
                width={bw}
                height={h}
                rx={3}
                fill="var(--accent)"
                opacity={0.24 + 0.7 * (m.steps / maxSteps)}
              />
              {(i % Math.ceil(months.length / 8) === 0 || i === months.length - 1) && (
                <text
                  x={x + bw / 2}
                  y={H + 15}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--text-faint)"
                  fontFamily="var(--font-geist-mono), monospace"
                >
                  {m.ym.slice(2).replace("-", "/")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function monthLabel(t: number, locale: string) {
  return new Date(t).toLocaleDateString(locale, { month: "short", year: "numeric" });
}
