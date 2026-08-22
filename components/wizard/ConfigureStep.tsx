"use client";

// Step 2: journey configuration. Date range, naming, duration, camera,
// compression, output format, privacy zones (drawn on a live map).

import { useEffect, useMemo, useRef, useState } from "react";
import { maplibregl } from "@/lib/maplibre";
import { Trash, PencilSimpleLine } from "@phosphor-icons/react";
import { MAP_STYLE_DARK, MAP_THEMES, TRAIL_PALETTES } from "@/lib/mapstyle";

/** approximate look of each basemap for the picker swatches */
const THEME_SWATCH: Record<string, string> = {
  midnight: "linear-gradient(135deg, #101017 40%, #252e3a)",
  daylight: "linear-gradient(135deg, #f4f2ee 40%, #cfd8dc)",
  voyager: "linear-gradient(135deg, #f7f1e4 40%, #aad3df)",
  satellite: "linear-gradient(135deg, #1d2b1e 30%, #3e5a3a 60%, #274a63)",
  terrain: "linear-gradient(135deg, #e8f0e0 30%, #c5b98a 60%, #8aa5c9)",
};
import { filterForJourney } from "@/lib/journey";
import { useApp } from "@/lib/store";
import { VIDEO_FORMATS, type PrivacyZone } from "@/lib/types";

const DURATIONS = [15, 30, 45, 60, 90, 120];
const DAY = 86_400_000;

type RangeMode = "year" | "months" | "custom";

export function ConfigureStep() {
  const app = useApp();
  const { t, data } = app;
  const summary = data?.summary;

  const years = useMemo(() => {
    if (!summary) return [];
    const out: number[] = [];
    for (let y = new Date(summary.start).getFullYear(); y <= new Date(summary.end).getFullYear(); y++) {
      out.push(y);
    }
    return out.reverse();
  }, [summary]);

  const [mode, setMode] = useState<RangeMode>("year");

  if (!summary) return null;

  const setYear = (y: number) => {
    const start = Math.max(Date.UTC(y, 0, 1), summary.start);
    const end = Math.min(Date.UTC(y, 11, 31, 23, 59, 59), summary.end);
    app.setRange(start, end);
  };

  const activePoints = data ? filterForJourney(data.points, app.currentConfig()).length : 0;

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1fr_360px]">
      {/* -------------------------------------------------- left column */}
      <div className="space-y-4">
        {/* naming */}
        <section className="panel p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("journeyName")} htmlFor="journey-name">
              <input
                id="journey-name"
                type="text"
                value={app.journeyName}
                onChange={(e) => app.setJourneyName(e.target.value)}
                className="input"
              />
            </Field>
            <Field label={t("titleTemplate")} htmlFor="title-template" hint={t("titleTemplateHint")}>
              <input
                id="title-template"
                type="text"
                value={app.titleTemplate}
                onChange={(e) => app.setSettings({ titleTemplate: e.target.value })}
                className="input font-mono"
              />
            </Field>
          </div>
          <p className="mt-4 rounded-xl bg-sunken px-4 py-2.5 font-mono text-[13px] text-dim">
            → {app.resolvedTitle()}
          </p>
        </section>

        {/* date range */}
        <section className="panel p-6">
          <SectionTitle>{t("dateRange")}</SectionTitle>
          <div className="mt-3 flex gap-1 rounded-full bg-sunken p-1">
            {(
              [
                ["year", t("fullYear")],
                ["months", t("months")],
                ["custom", t("custom")],
              ] as [RangeMode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
                  mode === m ? "bg-elev text-ink shadow-sm" : "text-dim hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {mode === "year" && (
              <div className="flex flex-wrap gap-2">
                {years.map((y) => {
                  const active =
                    new Date(app.rangeStart).getFullYear() === y &&
                    new Date(app.rangeEnd).getFullYear() === y;
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => setYear(y)}
                      className={`rounded-full border px-4 py-2 font-mono text-[13px] font-semibold transition-colors ${
                        active
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-line text-dim hover:border-line-strong hover:text-ink"
                      }`}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            )}
            {mode === "months" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <MonthInput
                  label="From"
                  value={app.rangeStart}
                  onChange={(ms) => app.setRange(ms, app.rangeEnd)}
                />
                <MonthInput
                  label="To"
                  value={app.rangeEnd}
                  end
                  onChange={(ms) => app.setRange(app.rangeStart, ms)}
                />
              </div>
            )}
            {mode === "custom" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <DateInput
                  label="From"
                  value={app.rangeStart}
                  onChange={(ms) => app.setRange(ms, app.rangeEnd)}
                />
                <DateInput
                  label="To"
                  value={app.rangeEnd}
                  onChange={(ms) => app.setRange(app.rangeStart, ms + DAY - 1)}
                />
              </div>
            )}
          </div>
          <p className="mt-4 font-mono text-[12px] text-faint">
            {activePoints.toLocaleString()} {t("points")}
          </p>
        </section>

        {/* privacy zones */}
        <section className="panel p-6">
          <SectionTitle>{t("privacyZones")}</SectionTitle>
          <p className="mt-1 text-[13px] leading-relaxed text-dim">{t("privacyZonesHint")}</p>
          <ZoneMap />
          {app.privacyZones.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {app.privacyZones.map((z) => (
                <li
                  key={z.id}
                  className="flex items-center justify-between rounded-xl bg-sunken px-4 py-2.5"
                >
                  <span className="font-mono text-[12px] text-dim">
                    {z.name} · {z.minLat.toFixed(2)},{z.minLng.toFixed(2)} → {z.maxLat.toFixed(2)},{z.maxLng.toFixed(2)}
                  </span>
                  <button
                    type="button"
                    aria-label={t("delete")}
                    onClick={() => app.removeZone(z.id)}
                    className="text-faint transition-colors hover:text-[color:var(--danger)]"
                  >
                    <Trash size={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[12px] text-faint">{t("noZones")}</p>
          )}
        </section>
      </div>

      {/* -------------------------------------------------- right column */}
      <div className="space-y-4">
        <section className="panel p-6">
          <SectionTitle>{t("duration")}</SectionTitle>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => app.setSettings({ duration: d })}
                className={`rounded-xl border py-2.5 font-mono text-[13px] font-semibold transition-colors ${
                  app.duration === d
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line text-dim hover:border-line-strong hover:text-ink"
                }`}
              >
                {d}{t("seconds")}
              </button>
            ))}
          </div>
          <Field label={t("customSeconds")} htmlFor="custom-duration" className="mt-4">
            <input
              id="custom-duration"
              type="number"
              min={10}
              max={300}
              value={app.duration}
              onChange={(e) => {
                const v = Math.max(10, Math.min(300, Number(e.target.value) || 10));
                app.setSettings({ duration: v });
              }}
              className="input font-mono"
            />
          </Field>
        </section>

        <section className="panel p-6">
          <SectionTitle>{t("cameraMode")}</SectionTitle>
          <div className="mt-3 space-y-2">
            {(
              [
                ["fixed", t("cameraFixed"), t("cameraFixedHint")],
                ["steady", t("cameraSteady"), t("cameraSteadyHint")],
                ["dynamic", t("cameraDynamic"), t("cameraDynamicHint")],
              ] as const
            ).map(([id, label, hint]) => (
              <button
                key={id}
                type="button"
                onClick={() => app.setSettings({ camera: id })}
                className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                  app.camera === id
                    ? "border-accent bg-accent-soft"
                    : "border-line hover:border-line-strong"
                }`}
              >
                <span className={`text-[13px] font-semibold ${app.camera === id ? "text-accent" : ""}`}>
                  {label}
                </span>
                <span className="ml-2 text-[12px] text-faint">{hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel p-6">
          <SectionTitle>{t("compression")}</SectionTitle>
          <div className="mt-3 grid grid-cols-4 gap-1 rounded-full bg-sunken p-1">
            {(
              [
                ["off", t("compOff")],
                ["gentle", t("compGentle")],
                ["balanced", t("compBalanced")],
                ["strong", t("compStrong")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => app.setSettings({ compression: id })}
                className={`rounded-full py-2 text-[12px] font-medium transition-colors ${
                  app.compression === id ? "bg-elev text-ink shadow-sm" : "text-dim hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-faint">{t("compressionHint")}</p>
        </section>

        <section className="panel p-6">
          <SectionTitle>{t("look")}</SectionTitle>
          <p className="mt-3 text-[12px] font-medium text-dim">{t("mapStyle")}</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {MAP_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => app.setSettings({ mapThemeId: theme.id })}
                className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-colors ${
                  app.mapThemeId === theme.id
                    ? "border-accent bg-accent-soft"
                    : "border-line hover:border-line-strong"
                }`}
              >
                <span
                  className="block h-8 w-full rounded-md border border-line"
                  style={{ background: THEME_SWATCH[theme.id] ?? "#333" }}
                />
                <span className={`text-[11px] font-medium ${app.mapThemeId === theme.id ? "text-accent" : "text-dim"}`}>
                  {t(theme.labelKey)}
                </span>
              </button>
            ))}
          </div>
          <label className="mt-4 flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-[12px] font-medium text-dim">{t("stopDates")}</span>
              <span className="block text-[11px] text-faint">{t("stopDatesHint")}</span>
            </span>
            <input
              type="checkbox"
              checked={app.showStopDates}
              onChange={(e) => app.setSettings({ showStopDates: e.target.checked })}
              className="h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
          </label>
          <p className="mt-4 text-[12px] font-medium text-dim">{t("trailColor")}</p>
          <div className="mt-2 flex flex-wrap gap-2.5">
            {TRAIL_PALETTES.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-label={p.id}
                aria-pressed={app.trailId === p.id}
                onClick={() => app.setSettings({ trailId: p.id })}
                className={`h-9 w-9 rounded-full border-2 transition-transform active:scale-90 ${
                  app.trailId === p.id ? "scale-110 border-[color:var(--text)]" : "border-transparent"
                }`}
                style={{ background: p.hex, boxShadow: app.trailId === p.id ? `0 0 14px ${p.hex}66` : undefined }}
              />
            ))}
          </div>
        </section>

        <section className="panel p-6">
          <SectionTitle>{t("format")}</SectionTitle>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {VIDEO_FORMATS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => app.setSettings({ formatId: f.id })}
                className={`flex flex-col items-center gap-2 rounded-xl border py-3.5 transition-colors ${
                  app.formatId === f.id
                    ? "border-accent bg-accent-soft"
                    : "border-line hover:border-line-strong"
                }`}
              >
                <span
                  className={`block rounded-[3px] border-2 ${
                    app.formatId === f.id ? "border-accent" : "border-faint"
                  }`}
                  style={{
                    width: f.width >= f.height ? 26 : 26 * (f.width / f.height),
                    height: f.height >= f.width ? 26 : 26 * (f.height / f.width),
                  }}
                />
                <span className={`text-[11px] font-medium ${app.formatId === f.id ? "text-accent" : "text-dim"}`}>
                  {f.label}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- helpers

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[14px] font-semibold tracking-tight">{children}</h3>;
}

function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
  hidden,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <label htmlFor={htmlFor} className="text-[12px] font-medium text-dim">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-faint">{hint}</p>}
    </div>
  );
}

function MonthInput({
  label,
  value,
  end,
  onChange,
}: {
  label: string;
  value: number;
  end?: boolean;
  onChange: (ms: number) => void;
}) {
  const d = new Date(value);
  const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return (
    <Field label={label} htmlFor={`month-${label}`}>
      <input
        id={`month-${label}`}
        type="month"
        value={str}
        onChange={(e) => {
          const [y, m] = e.target.value.split("-").map(Number);
          if (!y || !m) return;
          onChange(end ? Date.UTC(y, m, 0, 23, 59, 59) : Date.UTC(y, m - 1, 1));
        }}
        className="input font-mono"
      />
    </Field>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (ms: number) => void;
}) {
  const d = new Date(value);
  const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return (
    <Field label={label} htmlFor={`date-${label}`}>
      <input
        id={`date-${label}`}
        type="date"
        value={str}
        onChange={(e) => {
          const ms = Date.parse(e.target.value);
          if (Number.isFinite(ms)) onChange(ms);
        }}
        className="input font-mono"
      />
    </Field>
  );
}

/** Mini map for drawing rectangular privacy zones with shift-drag. */
function ZoneMap() {
  const { data, privacyZones, addZone, t } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !data) return;

    const map = new maplibregl.Map({
      container: el,
      style: MAP_STYLE_DARK,
      center: [data.points[0]?.lng ?? 0, data.points[0]?.lat ?? 20],
      zoom: 8,
      boxZoom: false,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // v6 can mis-measure containers that mount mid-transition
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    map.once("load", () => map.resize());

    // rectangle drawing overlay
    const rect = document.createElement("div");
    rect.style.cssText =
      "position:absolute;display:none;border:1.5px solid var(--accent);background:var(--accent-soft);pointer-events:none;z-index:5;";
    el.appendChild(rect);

    let start: { x: number; y: number } | null = null;

    const onDown = (e: MouseEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      map.dragPan.disable();
      const r = el.getBoundingClientRect();
      start = { x: e.clientX - r.left, y: e.clientY - r.top };
      rect.style.display = "block";
      setDrawing(true);
    };
    const onMove = (e: MouseEvent) => {
      if (!start) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      rect.style.left = `${Math.min(start.x, x)}px`;
      rect.style.top = `${Math.min(start.y, y)}px`;
      rect.style.width = `${Math.abs(x - start.x)}px`;
      rect.style.height = `${Math.abs(y - start.y)}px`;
    };
    const onUp = (e: MouseEvent) => {
      if (!start) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const a = map.unproject([Math.min(start.x, x), Math.min(start.y, y)]);
      const b = map.unproject([Math.max(start.x, x), Math.max(start.y, y)]);
      if (Math.abs(x - start.x) > 8 && Math.abs(y - start.y) > 8) {
        addZone({
          id: `zone-${Date.now()}`,
          name: `Zone ${privacyZonesCount() + 1}`,
          minLat: Math.min(a.lat, b.lat),
          maxLat: Math.max(a.lat, b.lat),
          minLng: Math.min(a.lng, b.lng),
          maxLng: Math.max(a.lng, b.lng),
        });
      }
      start = null;
      rect.style.display = "none";
      map.dragPan.enable();
      setDrawing(false);
    };
    const privacyZonesCount = () => useApp.getState().privacyZones.length;

    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      rect.remove();
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data != null]);

  // reflect zones on the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const fc = {
        type: "FeatureCollection" as const,
        features: privacyZones.map((z: PrivacyZone) => ({
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "Polygon" as const,
            coordinates: [[
              [z.minLng, z.minLat],
              [z.maxLng, z.minLat],
              [z.maxLng, z.maxLat],
              [z.minLng, z.maxLat],
              [z.minLng, z.minLat],
            ]],
          },
        })),
      };
      const src = map.getSource("zones") as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(fc);
      else {
        map.addSource("zones", { type: "geojson", data: fc });
        map.addLayer({
          id: "zones-fill",
          type: "fill",
          source: "zones",
          paint: { "fill-color": "#ff4269", "fill-opacity": 0.14 },
        });
        map.addLayer({
          id: "zones-line",
          type: "line",
          source: "zones",
          paint: { "line-color": "#ff4269", "line-width": 1.5, "line-dasharray": [2, 1.5] },
        });
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [privacyZones]);

  return (
    <div className="relative mt-4 overflow-hidden rounded-xl border border-line">
      {/* inline size: MapLibre's own CSS can override Tailwind's layered utilities */}
      <div ref={ref} style={{ height: 256, width: "100%" }} />
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-[var(--scrim)] px-3 py-1.5 text-[11px] font-medium backdrop-blur-md">
        <PencilSimpleLine size={12} className="text-accent" />
        {drawing ? "…" : t("zoneDrawHint")}
      </div>
    </div>
  );
}
