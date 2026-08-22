"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  FileMagnifyingGlass,
  FilmReel,
  Play,
  ShieldCheck,
  VideoCamera,
} from "@phosphor-icons/react";
import { Globe } from "@/components/Globe";
import { useApp } from "@/lib/store";
import { generateSampleJourney, SAMPLE_NAME } from "@/lib/sample";

export default function Landing() {
  const { t, setData, setJourneyName } = useApp();
  const router = useRouter();
  const reduce = useReducedMotion();

  const loadSample = () => {
    setJourneyName(SAMPLE_NAME);
    setData(generateSampleJourney(), "sample-journey");
    router.push("/studio");
  };

  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 22 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <div className="min-h-[100dvh]">
      {/* ------------------------------------------------------------ hero */}
      <section className="relative min-h-[100dvh] overflow-hidden">
        <Globe />

        <div className="relative mx-auto flex min-h-[100dvh] max-w-[1400px] items-end px-4 pb-16 sm:px-8 md:items-center md:pb-0">
          <div className="max-w-xl pt-24 md:pt-0">
            <motion.h1
              {...rise(0.05)}
              className="text-4xl font-semibold leading-[1.04] tracking-tight sm:text-5xl lg:text-6xl"
            >
              {t("heroTitle")}
            </motion.h1>
            <motion.p {...rise(0.16)} className="mt-5 max-w-md text-[16px] leading-relaxed text-dim">
              {t("heroBody")}
            </motion.p>
            <motion.div {...rise(0.27)} className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/studio"
                className="group flex items-center gap-2 rounded-full bg-accent px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_32px_var(--accent-glow)] transition-all hover:brightness-110 active:scale-[0.98]"
              >
                {t("openStudio")}
                <ArrowRight size={16} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <button
                type="button"
                onClick={loadSample}
                className="flex items-center gap-2 rounded-full border border-line-strong bg-[var(--scrim)] px-6 py-3.5 text-[15px] font-medium backdrop-blur-xl transition-colors hover:border-strong hover:bg-elev active:scale-[0.98]"
              >
                <Play size={15} weight="fill" className="text-accent" />
                {t("loadSample")}
              </button>
            </motion.div>
            <motion.p {...rise(0.38)} className="mt-6 flex items-center gap-2 text-[13px] text-faint">
              <ShieldCheck size={15} className="shrink-0 text-ok" weight="fill" />
              {t("privacyNote")}
            </motion.p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- features */}
      <section className="mx-auto max-w-[1400px] px-4 py-24 sm:px-8 md:py-36">
        <div className="grid gap-4 md:grid-cols-12">
          <FeatureCard
            className="md:col-span-7"
            icon={<FilmReel size={22} weight="duotone" />}
            title={t("featCameraTitle")}
            body={t("featCameraBody")}
            visual="camera"
          />
          <FeatureCard
            className="md:col-span-5"
            icon={<FileMagnifyingGlass size={22} weight="duotone" />}
            title={t("featParseTitle")}
            body={t("featParseBody")}
            visual="formats"
          />
          <FeatureCard
            className="md:col-span-5"
            icon={<ShieldCheck size={22} weight="duotone" />}
            title={t("privacyTitle")}
            body={t("privacyBody2")}
            visual="privacy"
          />
          <FeatureCard
            className="md:col-span-7"
            icon={<VideoCamera size={22} weight="duotone" />}
            title={t("featVideoTitle")}
            body={t("featVideoBody")}
            visual="video"
          />
        </div>
      </section>

      {/* ------------------------------------------------------- final CTA */}
      <section className="hairline-t">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center px-4 py-24 text-center sm:px-8 md:py-32">
          <p className="font-mono text-[13px] text-accent">{t("tagline")}</p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("yourFilm")}
          </h2>
          <Link
            href="/studio"
            className="mt-8 flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_32px_var(--accent-glow)] transition-all hover:brightness-110 active:scale-[0.98]"
          >
            {t("openStudio")}
            <ArrowRight size={16} weight="bold" />
          </Link>
          <p className="mt-5 text-[13px] text-faint">{t("landingLibraryHint")}</p>
        </div>
      </section>

      <footer className="hairline-t">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-6 text-[12px] text-faint sm:px-8">
          <span>Roamline</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="transition-colors hover:text-ink">
              Privacy
            </Link>
            <span>© OpenStreetMap contributors · © CARTO</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  className,
  icon,
  title,
  body,
  visual,
}: {
  className?: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  visual: "camera" | "formats" | "privacy" | "video";
}) {
  const reduce = useReducedMotion();
  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
      className={`panel relative overflow-hidden p-7 sm:p-9 ${className ?? ""}`}
    >
      <CardBackdrop visual={visual} />
      <div className="relative">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
          {icon}
        </div>
        <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 max-w-md text-[14px] leading-relaxed text-dim">{body}</p>
      </div>
    </motion.article>
  );
}

function CardBackdrop({ visual }: { visual: string }) {
  // quiet generative backdrops so the bento isn't flat text-on-panel
  if (visual === "camera") {
    return (
      <svg aria-hidden className="absolute -right-8 -top-8 h-56 w-56 opacity-[0.14]" viewBox="0 0 200 200">
        <path
          d="M20 160 C 60 40, 120 180, 180 30"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="180" cy="30" r="6" fill="var(--accent)" />
      </svg>
    );
  }
  if (visual === "video") {
    return (
      <div aria-hidden className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-[radial-gradient(circle,var(--accent-soft),transparent_65%)]" />
    );
  }
  if (visual === "privacy") {
    return (
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(0deg,var(--accent-soft),transparent)] opacity-60" />
    );
  }
  return (
    <svg aria-hidden className="absolute -right-6 -bottom-6 h-44 w-44 opacity-[0.12]" viewBox="0 0 160 160">
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={10 + i * 14} y={10 + i * 22} width={100} height={10} rx={5} fill="var(--accent)" />
      ))}
    </svg>
  );
}
