"use client";

// Health report: streams an Apple Health export.xml (or export.zip / the
// extracted folder) through a worker, then filters/summarizes the per-day
// dataset instantly client-side. Fully local, nothing leaves the device.

import { useMemo, useRef, useState } from "react";
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
import {
  analyzeHealthFile,
  findHealthFile,
  summarize,
  yearsIn,
  type HealthData,
  type HealthSummary,
} from "@/lib/health";
import { collectDroppedFiles } from "@/lib/parse/dropped";
import { formatDistance } from "@/lib/geo";
import { useApp } from "@/lib/store";
import { ChartTooltip, type TooltipRow } from "@/components/ui/chart-tooltip";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { DateRange } from "react-day-picker";

type Phase =
  | { kind: "idle" }
  | { kind: "working"; fraction: number }
  | { kind: "done"; data: HealthData }
  | { kind: "error" };

export default function HealthPage() {
  const { t } = useApp();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);

  const run = async (files: File[]) => {
    const file =
      findHealthFile(files) ?? files.find((f) => /\.(xml|zip)$/i.test(f.name)) ?? files[0];
    if (!file) return;
    setPhase({ kind: "working", fraction: 0 });
    try {
      const data = await analyzeHealthFile(file, (p) =>
        setPhase({ kind: "working", fraction: p.fraction })
      );
      setPhase({ kind: "done", data });
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

      {phase.kind === "done" && <Dashboard data={phase.data} />}
    </div>
  );
}

// ---------------------------------------------------------------- dashboard

function Dashboard({ data }: { data: HealthData }) {
  const { t, lang } = useApp();
  const years = useMemo(() => yearsIn(data), [data]);
  const [range, setRange] = useState<{ start?: string; end?: string }>({});
  const summary = useMemo(
    () => summarize(data, range.start, range.end),
    [data, range.start, range.end]
  );

  const setYear = (y: number | null) =>
    setRange(y == null ? {} : { start: `${y}-01-01`, end: `${y}-12-31` });
  const activeYear =
    range.start && range.end && range.start === `${range.start.slice(0, 4)}-01-01` &&
    range.end === `${range.start.slice(0, 4)}-12-31`
      ? Number(range.start.slice(0, 4))
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="mt-8"
    >
      {/* date filter: year chips + custom range */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setYear(null)}
          aria-pressed={!range.start && !range.end}
          className={`rounded-full border px-4 py-1.5 text-[12px] font-semibold transition-colors ${
            !range.start && !range.end
              ? "border-accent bg-accent-soft text-accent"
              : "border-line text-dim hover:border-line-strong hover:text-ink"
          }`}
        >
          {t("healthAllTime")}
        </button>
        {years.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => setYear(y)}
            aria-pressed={activeYear === y}
            className={`rounded-full border px-4 py-1.5 font-mono text-[12px] font-semibold transition-colors ${
              activeYear === y
                ? "border-accent bg-accent-soft text-accent"
                : "border-line text-dim hover:border-line-strong hover:text-ink"
            }`}
          >
            {y}
          </button>
        ))}
        <span className="mx-1 hidden h-4 w-px bg-line sm:block" aria-hidden />
        {/* shadcn ranged date picker */}
        <DateRangePicker
          value={toDateRange(range)}
          onChange={(r) =>
            setRange({
              start: r?.from ? toKey(r.from) : undefined,
              end: r?.to ? toKey(r.to) : r?.from ? toKey(r.from) : undefined,
            })
          }
          placeholder={t("healthPickRange")}
          locale={lang}
        />
      </div>

      {summary ? (
        <SummaryView summary={summary} data={data} lang={lang} />
      ) : (
        <p className="mt-10 text-center text-[13px] text-faint">{t("parseErrorEmpty")}</p>
      )}
    </motion.div>
  );
}

/** "YYYY-MM-DD" in local time (toISOString would shift across midnight). */
function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toDateRange(r: { start?: string; end?: string }): DateRange | undefined {
  if (!r.start && !r.end) return undefined;
  return {
    from: r.start ? new Date(r.start + "T00:00:00") : undefined,
    to: r.end ? new Date(r.end + "T00:00:00") : undefined,
  };
}

function SummaryView({
  summary: s,
  data,
  lang,
}: {
  summary: HealthSummary;
  data: HealthData;
  lang: string;
}) {
  const { t } = useApp();
  const [drillYm, setDrillYm] = useState<string | null>(null);
  const fmt = (n: number) => Math.round(n).toLocaleString(lang);
  const rangeLabel = `${monthLabel(s.rangeStart, lang)} – ${monthLabel(s.rangeEnd, lang)}`;

  return (
    <>
      <p className="mt-5 font-mono text-[12px] text-faint">
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
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[14px] font-semibold">{t("healthMonthly")}</h2>
          <span className="text-[11px] text-faint">{t("healthClickHint")}</span>
        </div>
        <MonthlyChart
          summary={s}
          lang={lang}
          selectedYm={drillYm}
          onBarClick={(ym) => setDrillYm((cur) => (cur === ym ? null : ym))}
        />
      </section>

      {/* per-month drill-down */}
      {drillYm && (
        <MonthDetail data={data} ym={drillYm} lang={lang} onClose={() => setDrillYm(null)} />
      )}

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
    </>
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

/** Theme-aware SVG bar chart with a shadcn-style hover tooltip.
 *  Bars are clickable and open the per-month drill-down. */
function MonthlyChart({
  summary: s,
  lang,
  selectedYm,
  onBarClick,
}: {
  summary: HealthSummary;
  lang: string;
  selectedYm: string | null;
  onBarClick: (ym: string) => void;
}) {
  const { t } = useApp();
  const months = s.monthly.slice(-24); // last 2 years max
  const maxSteps = Math.max(1, ...months.map((m) => m.steps));
  const W = 720;
  const H = 160;
  const gap = 3;
  const bw = W / months.length - gap;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; rows: TooltipRow[] } | null>(null);

  const showTip = (e: React.MouseEvent, mIdx: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const m = months[mIdx];
    const rect = wrap.getBoundingClientRect();
    const rows: TooltipRow[] = [
      { label: t("healthSteps"), value: Math.round(m.steps).toLocaleString(lang) },
      {
        label: t("healthWorkouts"),
        value: `${Math.round(m.workoutMin / 60)} ${t("healthHours")}`,
        color: "var(--text-faint)",
      },
    ];
    if (m.activeKcal > 0) {
      rows.push({
        label: t("healthEnergy"),
        value: `${Math.round(m.activeKcal).toLocaleString(lang)} kcal`,
        color: "color-mix(in srgb, var(--accent) 55%, transparent)",
      });
    }
    setTip({
      x: e.clientX - rect.left,
      y: Math.max(0, e.clientY - rect.top - 96),
      title: monthLabel(Date.parse(m.ym + "-01"), lang),
      rows,
    });
  };

  return (
    <div ref={wrapRef} className="relative mt-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H + 22}`} className="min-w-[540px]" role="img" aria-label={t("healthMonthly")}>
        {months.map((m, i) => {
          const h = Math.max(2, (m.steps / maxSteps) * H);
          const x = i * (bw + gap);
          return (
            <g key={m.ym}>
              {/* invisible full-height hit area: hover tooltip + click drill-down */}
              <rect
                x={x}
                y={0}
                width={bw + gap}
                height={H}
                fill="transparent"
                cursor="pointer"
                role="button"
                aria-label={m.ym}
                onMouseEnter={(e) => showTip(e, i)}
                onMouseMove={(e) => showTip(e, i)}
                onMouseLeave={() => setTip(null)}
                onClick={() => onBarClick(m.ym)}
              />
              <rect
                x={x}
                y={H - h}
                width={bw}
                height={h}
                rx={3}
                fill="var(--accent)"
                opacity={selectedYm === m.ym ? 1 : 0.24 + 0.7 * (m.steps / maxSteps)}
                stroke={selectedYm === m.ym ? "var(--text)" : "none"}
                strokeWidth={selectedYm === m.ym ? 1.5 : 0}
                pointerEvents="none"
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
      {tip && <ChartTooltip x={tip.x} y={tip.y} title={tip.title} rows={tip.rows} />}
    </div>
  );
}

/** Expanded view for one month: daily bars, month stats, workouts list. */
function MonthDetail({
  data,
  ym,
  lang,
  onClose,
}: {
  data: HealthData;
  ym: string;
  lang: string;
  onClose: () => void;
}) {
  const { t } = useApp();
  const days = useMemo(() => data.days.filter((d) => d.date.startsWith(ym)), [data, ym]);
  const workouts = useMemo(() => data.workouts.filter((w) => w.day.startsWith(ym)), [data, ym]);
  const totals = useMemo(
    () =>
      days.reduce(
        (acc, d) => ({
          steps: acc.steps + d.steps,
          distKm: acc.distKm + d.distKm,
          kcal: acc.kcal + d.kcal,
        }),
        { steps: 0, distKm: 0, kcal: 0 }
      ),
    [days]
  );
  const fmt = (n: number) => Math.round(n).toLocaleString(lang);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; rows: TooltipRow[] } | null>(null);
  const maxSteps = Math.max(1, ...days.map((d) => d.steps));
  const W = 720;
  const H = 120;
  const gap = 2;
  const bw = W / Math.max(days.length, 1) - gap;

  const showTip = (e: React.MouseEvent, d: (typeof days)[number]) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const rows: TooltipRow[] = [
      { label: t("healthSteps"), value: fmt(d.steps) },
      { label: t("summaryDistance"), value: formatDistance(d.distKm, lang), color: "var(--text-faint)" },
    ];
    if (d.kcal > 0) {
      rows.push({
        label: t("healthEnergy"),
        value: `${fmt(d.kcal)} kcal`,
        color: "color-mix(in srgb, var(--accent) 55%, transparent)",
      });
    }
    setTip({
      x: e.clientX - rect.left,
      y: Math.max(0, e.clientY - rect.top - 96),
      title: new Date(d.date + "T00:00:00").toLocaleDateString(lang, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      rows,
    });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="panel mt-4 border-accent/30 p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold">
          {monthLabel(Date.parse(ym + "-01T00:00:00"), lang)}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("cancel")}
          className="flex h-7 w-7 items-center justify-center rounded-full text-faint transition-colors hover:bg-sunken hover:text-ink"
        >
          ✕
        </button>
      </div>

      <p className="mt-1 font-mono text-[12px] text-dim">
        {fmt(totals.steps)} {t("healthSteps").toLowerCase()} · {formatDistance(totals.distKm, lang)}
        {totals.kcal > 0 ? ` · ${fmt(totals.kcal)} kcal` : ""} · {workouts.length}{" "}
        {t("healthWorkouts").toLowerCase()}
      </p>

      {/* daily bars */}
      <div ref={wrapRef} className="relative mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H + 20}`} className="min-w-[540px]" role="img" aria-label={t("healthDaily")}>
          {days.map((d, i) => {
            const h = Math.max(2, (d.steps / maxSteps) * H);
            const x = i * (bw + gap);
            const dayNum = Number(d.date.slice(8));
            return (
              <g key={d.date}>
                <rect
                  x={x}
                  y={0}
                  width={bw + gap}
                  height={H}
                  fill="transparent"
                  onMouseEnter={(e) => showTip(e, d)}
                  onMouseMove={(e) => showTip(e, d)}
                  onMouseLeave={() => setTip(null)}
                />
                <rect
                  x={x}
                  y={H - h}
                  width={bw}
                  height={h}
                  rx={2}
                  fill="var(--accent)"
                  opacity={0.3 + 0.65 * (d.steps / maxSteps)}
                  pointerEvents="none"
                />
                {(dayNum === 1 || dayNum % 7 === 0) && (
                  <text
                    x={x + bw / 2}
                    y={H + 14}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--text-faint)"
                    fontFamily="var(--font-geist-mono), monospace"
                  >
                    {dayNum}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {tip && <ChartTooltip x={tip.x} y={tip.y} title={tip.title} rows={tip.rows} />}
      </div>

      {/* workouts that month */}
      {workouts.length > 0 && (
        <div className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
          {workouts.map((w, i) => (
            <div
              key={`${w.day}-${i}`}
              className="flex items-baseline justify-between gap-3 rounded-xl bg-sunken px-4 py-2.5"
            >
              <span className="text-[13px] font-medium">
                {w.type}
                <span className="ml-2 font-mono text-[11px] text-faint">
                  {new Date(w.day + "T00:00:00").toLocaleDateString(lang, { month: "short", day: "numeric" })}
                </span>
              </span>
              <span className="font-mono text-[12px] text-dim">
                {Math.round(w.minutes)} min
                {w.km > 0.5 ? ` · ${formatDistance(w.km, lang)}` : ""}
                {w.kcal > 10 ? ` · ${Math.round(w.kcal)} kcal` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </motion.section>
  );
}

function monthLabel(t: number, locale: string) {
  return new Date(t).toLocaleDateString(locale, { month: "short", year: "numeric" });
}
