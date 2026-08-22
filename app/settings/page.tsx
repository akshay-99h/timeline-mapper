"use client";

// Settings: language, theme, defaults, privacy zones, settings export.

import { DownloadSimple, Trash } from "@phosphor-icons/react";
import { LANGS } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { VIDEO_FORMATS } from "@/lib/types";

export default function SettingsPage() {
  const app = useApp();
  const { t } = app;

  const exportSettings = () => {
    const data = {
      lang: app.lang,
      theme: app.theme,
      titleTemplate: app.titleTemplate,
      duration: app.duration,
      camera: app.camera,
      compression: app.compression,
      formatId: app.formatId,
      privacyZones: app.privacyZones,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roamline-settings.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="mx-auto min-h-[100dvh] max-w-2xl px-4 pb-24 pt-28 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">{t("settings")}</h1>

      <section className="panel mt-8 p-6">
        <h2 className="text-[14px] font-semibold">{t("language")}</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => app.setSettings({ lang: l.id })}
              className={`rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${
                app.lang === l.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line text-dim hover:border-line-strong hover:text-ink"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel mt-4 p-6">
        <h2 className="text-[14px] font-semibold">{t("theme")}</h2>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-sunken p-1">
          {(
            [
              ["system", t("themeSystem")],
              ["dark", t("themeDark")],
              ["light", t("themeLight")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => app.setSettings({ theme: id })}
              className={`rounded-full py-2 text-[13px] font-medium transition-colors ${
                app.theme === id ? "bg-elev text-ink shadow-sm" : "text-dim hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="panel mt-4 p-6">
        <h2 className="text-[14px] font-semibold">{t("defaults")}</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor="def-template" className="text-[12px] font-medium text-dim">
              {t("titleTemplate")}
            </label>
            <input
              id="def-template"
              type="text"
              value={app.titleTemplate}
              onChange={(e) => app.setSettings({ titleTemplate: e.target.value })}
              className="input font-mono"
            />
            <p className="text-[11px] text-faint">{t("titleTemplateHint")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="def-format" className="text-[12px] font-medium text-dim">
              {t("format")}
            </label>
            <select
              id="def-format"
              value={app.formatId}
              onChange={(e) => app.setSettings({ formatId: e.target.value })}
              className="input"
            >
              {VIDEO_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label} ({f.width}×{f.height})
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="panel mt-4 p-6">
        <h2 className="text-[14px] font-semibold">{t("privacyZones")}</h2>
        {app.privacyZones.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {app.privacyZones.map((z) => (
              <li key={z.id} className="flex items-center justify-between rounded-xl bg-sunken px-4 py-2.5">
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
          <p className="mt-2 text-[13px] text-faint">{t("noZones")}</p>
        )}
      </section>

      <button type="button" onClick={exportSettings} className="btn-secondary mt-6">
        <DownloadSimple size={16} />
        {t("exportSettings")}
      </button>
    </div>
  );
}
