"use client";

// A restrained one-shot confetti burst for the success screen.
// Hand-rolled (no library): ~90 particles, 1.8s, honors reduced motion.

import { useEffect, useRef } from "react";

export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = (canvas.width = canvas.offsetWidth * dpr);
    const h = (canvas.height = canvas.offsetHeight * dpr);

    const colors = ["#ff4269", "#ffb1c1", "#ffffff", "#ffd166"];
    const parts = Array.from({ length: 90 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.35,
      vx: (Math.random() - 0.5) * 9 * dpr,
      vy: (-6 - Math.random() * 7) * dpr,
      size: (3 + Math.random() * 4) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      if (t > 1.8) {
        ctx.clearRect(0, 0, w, h);
        return;
      }
      raf = requestAnimationFrame(tick);
      ctx.clearRect(0, 0, w, h);
      const fade = t > 1.2 ? 1 - (t - 1.2) / 0.6 : 1;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.32 * dpr;
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -top-10 z-10 mx-auto h-[420px] w-full max-w-2xl"
    />
  );
}
