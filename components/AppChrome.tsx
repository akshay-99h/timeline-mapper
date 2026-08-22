"use client";

// App shell: navigation, theme application, toasts, first-run privacy notice,
// service worker registration.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  FilmSlate,
  GearSix,
  HeartStraight,
  MoonStars,
  ShieldCheck,
  SunDim,
  VideoCamera,
} from "@phosphor-icons/react";
import { useApp } from "@/lib/store";

export function AppChrome({ children }: { children: React.ReactNode }) {
  const { hydrate, hydrated, theme, setSettings, toasts, onboarded, t } = useApp();
  const pathname = usePathname();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // apply + persist theme choice
  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    if (theme === "system") {
      delete root.dataset.theme;
      try { localStorage.removeItem("roamline-theme"); } catch {}
    } else {
      root.dataset.theme = theme;
      try { localStorage.setItem("roamline-theme", theme); } catch {}
    }
  }, [theme, hydrated]);

  // register the app-shell service worker (production only)
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const isDarkNow = () =>
    document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const links = [
    { href: "/studio", label: "Studio", icon: FilmSlate },
    { href: "/health", label: t("navHealth"), icon: HeartStraight },
    { href: "/library", label: t("library"), icon: VideoCamera },
    { href: "/settings", label: t("settings"), icon: GearSix },
  ];

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-full border border-line bg-[var(--scrim)] py-2 pl-3 pr-4 backdrop-blur-xl transition-colors hover:border-line-strong"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 [animation:pulse-dot_2.4s_ease-in-out_infinite]" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Roamline</span>
          </Link>

          <nav
            aria-label="Main"
            className="flex items-center gap-1 rounded-full border border-line bg-[var(--scrim)] p-1.5 backdrop-blur-xl"
          >
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-accent text-white"
                      : "text-dim hover:bg-sunken hover:text-ink"
                  }`}
                >
                  <Icon size={15} weight={active ? "fill" : "regular"} />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              aria-label={t("theme")}
              onClick={() => setSettings({ theme: isDarkNow() ? "light" : "dark" })}
              className="flex h-8 w-8 items-center justify-center rounded-full text-dim transition-colors hover:bg-sunken hover:text-ink"
            >
              <ThemeIcon />
            </button>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      {/* toasts */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-[80] flex flex-col items-center gap-2 px-4"
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 320, damping: 26 }}
              className={`pointer-events-auto flex items-center gap-2 rounded-full border px-4 py-2.5 text-[13px] font-medium shadow-lg backdrop-blur-xl ${
                toast.kind === "error"
                  ? "border-[color:var(--danger)]/30 bg-[var(--scrim)] text-[color:var(--danger)]"
                  : toast.kind === "success"
                    ? "border-[color:var(--success)]/30 bg-[var(--scrim)] text-[color:var(--success)]"
                    : "border-line bg-[var(--scrim)] text-ink"
              }`}
            >
              {toast.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {hydrated && !onboarded && <PrivacyNotice />}
    </>
  );
}

function ThemeIcon() {
  // .show-dark/.show-light are theme-gated in globals.css
  return (
    <span className="block h-4 w-4">
      <SunDim size={16} className="show-dark" />
      <MoonStars size={16} className="show-light" />
    </span>
  );
}

function PrivacyNotice() {
  const { setSettings, t } = useApp();
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-title"
      >
        <motion.div
          initial={{ y: 32, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="panel w-full max-w-md p-7"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft">
            <ShieldCheck size={24} className="text-accent" weight="duotone" />
          </div>
          <h2 id="privacy-title" className="mt-4 text-xl font-semibold tracking-tight">
            {t("privacyTitle")}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-dim">{t("privacyBody1")}</p>
          <p className="mt-2 text-[14px] leading-relaxed text-dim">{t("privacyBody2")}</p>
          <button
            type="button"
            onClick={() => setSettings({ onboarded: true })}
            className="mt-6 w-full rounded-full bg-accent py-3 text-[14px] font-semibold text-white transition-transform active:scale-[0.98]"
          >
            {t("gotIt")}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
