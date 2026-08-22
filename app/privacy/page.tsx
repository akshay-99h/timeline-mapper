"use client";

import { ShieldCheck } from "@phosphor-icons/react";
import { useApp } from "@/lib/store";

export default function PrivacyPage() {
  const { t } = useApp();
  return (
    <div className="mx-auto min-h-[100dvh] max-w-2xl px-4 pb-24 pt-28 sm:px-8">
      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-accent-soft">
        <ShieldCheck size={28} className="text-accent" weight="duotone" />
      </div>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">{t("privacyTitle")}</h1>
      <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-dim">
        <p>{t("privacyBody1")}</p>
        <p>{t("privacyBody2")}</p>
        <p>{t("privacyBody3")}</p>
      </div>
      <div className="panel mt-8 p-6">
        <h2 className="text-[14px] font-semibold">Network requests made by this app</h2>
        <ul className="mt-3 space-y-2 font-mono text-[12px] text-dim">
          <li>basemaps.cartocdn.com (map style + vector tiles)</li>
          <li>fonts (bundled locally, no request)</li>
        </ul>
      </div>
    </div>
  );
}
