"use client";

// "My videos": local IndexedDB library with thumbnails and re-download.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { DownloadSimple, FilmSlate, Trash } from "@phosphor-icons/react";
import { deleteVideo, listVideos } from "@/lib/db";
import { formatDistance } from "@/lib/geo";
import { useApp } from "@/lib/store";
import type { LibraryVideo } from "@/lib/types";

export default function LibraryPage() {
  const { t, lang, toast } = useApp();
  const [videos, setVideos] = useState<LibraryVideo[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    try {
      const all = await listVideos();
      setVideos(all);
      setThumbs((prev) => {
        const next: Record<string, string> = {};
        for (const v of all) {
          next[v.id] = prev[v.id] ?? (v.thumb ? URL.createObjectURL(v.thumb) : "");
        }
        return next;
      });
    } catch {
      setVideos([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load, resolves post-paint
    void refresh();
  }, [refresh]);

  // revoke object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(thumbs).forEach((u) => u && URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = (v: LibraryVideo) => {
    const url = URL.createObjectURL(v.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${v.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}.${v.mime === "video/mp4" ? "mp4" : "webm"}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const remove = async (v: LibraryVideo) => {
    await deleteVideo(v.id);
    toast(t("delete"), "info");
    void refresh();
  };

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[1400px] px-4 pb-24 pt-28 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">{t("library")}</h1>

      {videos === null && (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton aspect-square" />
          ))}
        </div>
      )}

      {videos?.length === 0 && (
        <div className="mx-auto mt-20 max-w-sm text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-accent-soft">
            <FilmSlate size={30} className="text-accent" weight="duotone" />
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight">{t("libraryEmpty")}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-dim">{t("libraryEmptyBody")}</p>
          <Link href="/studio" className="btn-primary mx-auto mt-6 w-fit">
            {t("makeFirst")}
          </Link>
        </div>
      )}

      {videos && videos.length > 0 && (
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v, i) => (
            <motion.article
              key={v.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="panel group overflow-hidden"
            >
              <div className="relative aspect-square overflow-hidden bg-sunken">
                {thumbs[v.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbs[v.id]}
                    alt={v.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-faint">
                    <FilmSlate size={40} weight="duotone" />
                  </div>
                )}
                <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[11px] text-white backdrop-blur">
                  {Math.round(v.duration)}s · {v.width}×{v.height}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h3 className="truncate text-[14px] font-semibold">{v.title}</h3>
                  <p className="mt-0.5 font-mono text-[11px] text-faint">
                    {v.rangeLabel} · {formatDistance(v.distanceKm, lang)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={t("download")}
                    onClick={() => download(v)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-dim transition-colors hover:bg-sunken hover:text-ink"
                  >
                    <DownloadSimple size={17} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("delete")}
                    onClick={() => void remove(v)}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-dim transition-colors hover:bg-sunken hover:text-[color:var(--danger)]"
                  >
                    <Trash size={17} />
                  </button>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </div>
  );
}
