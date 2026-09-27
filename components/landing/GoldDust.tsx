"use client";

import { useEffect, useRef } from "react";
import { cx } from "@/components/ui/cx";

type Particle = {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  a: number;
  tw: number;
  ph: number;
  c: number;
};

function makeSprite(core: string, halo: string): HTMLCanvasElement {
  const s = document.createElement("canvas");
  s.width = s.height = 64;
  const g = s.getContext("2d");
  if (!g) return s;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, core);
  grad.addColorStop(0.18, halo);
  grad.addColorStop(1, "rgba(255,181,71,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return s;
}

/** Lightweight drifting gold dust on a 2D canvas. Static when the user prefers reduced motion. */
export function GoldDust({ count = 120, className }: { count?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const sprites = [
      makeSprite("rgba(255,226,170,1)", "rgba(255,181,71,0.38)"),
      makeSprite("rgba(255,210,122,1)", "rgba(200,132,31,0.32)"),
    ];
    const n = window.innerWidth < 640 ? Math.round(count * 0.6) : count;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = performance.now();
    let parts: Particle[] = [];

    const spawn = (anywhere: boolean): Particle => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 8,
      r: 0.35 + Math.random() ** 2.2 * 1.9,
      vx: (Math.random() - 0.5) * 0.006,
      vy: -(0.003 + Math.random() * 0.011),
      a: 0.12 + Math.random() * 0.6,
      tw: 0.4 + Math.random() * 1.4,
      ph: Math.random() * Math.PI * 2,
      c: Math.random() < 0.72 ? 0 : 1,
    });

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        const twinkle = 0.55 + 0.45 * Math.sin(t * 0.001 * p.tw + p.ph);
        const size = p.r * 7;
        ctx.globalAlpha = p.a * twinkle;
        ctx.drawImage(sprites[p.c], p.x - size / 2, p.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (parts.length === 0 && w > 0 && h > 0) parts = Array.from({ length: n }, () => spawn(true));
      if (reduce) draw(0);
    };

    const step = (t: number) => {
      const dt = Math.min(64, t - last);
      last = t;
      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y < -12) Object.assign(p, spawn(false));
        if (p.x < -12) p.x = w + 12;
        else if (p.x > w + 12) p.x = -12;
      }
      draw(t);
      raf = requestAnimationFrame(step);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    if (!reduce) raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [count]);

  return <canvas ref={ref} aria-hidden className={cx("pointer-events-none h-full w-full", className)} />;
}
