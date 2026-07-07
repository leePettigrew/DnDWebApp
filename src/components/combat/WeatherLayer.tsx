"use client";

import { useEffect, useRef } from "react";

type Kind = "rain" | "snow" | "embers" | "mist";

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  ph: number;
}

/**
 * Ambient weather drawn over the battle map (map-image pixel space, under the
 * toolbars, above the tokens). Pure eye-candy: a small rAF particle loop that
 * only runs while a weather kind is active.
 */
export function WeatherLayer({ w, h, kind }: { w: number; h: number; kind: Kind }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || w <= 0 || h <= 0) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const rnd = Math.random;
    const area = w * h;
    const count =
      kind === "mist"
        ? Math.min(14, Math.max(6, Math.round(area / 300_000)))
        : Math.min(420, Math.max(80, Math.round(area / 9000)));

    const spawn = (anywhere: boolean): P => {
      switch (kind) {
        case "rain":
          return { x: rnd() * (w + 100) - 50, y: anywhere ? rnd() * h : -20, vx: -2 - rnd() * 1.5, vy: 16 + rnd() * 10, r: 9 + rnd() * 8, a: 0.22 + rnd() * 0.22, ph: 0 };
        case "snow":
          return { x: rnd() * w, y: anywhere ? rnd() * h : -10, vx: 0, vy: 0.7 + rnd() * 1.2, r: 1.5 + rnd() * 2.2, a: 0.4 + rnd() * 0.4, ph: rnd() * Math.PI * 2 };
        case "embers":
          return { x: rnd() * w, y: anywhere ? rnd() * h : h + 10, vx: 0, vy: -(0.5 + rnd() * 1.1), r: 1.2 + rnd() * 1.8, a: 0.3 + rnd() * 0.5, ph: rnd() * Math.PI * 2 };
        case "mist":
          return { x: rnd() * w, y: rnd() * h, vx: 0.15 + rnd() * 0.2, vy: 0, r: 80 + rnd() * 160, a: 0.05 + rnd() * 0.07, ph: rnd() * Math.PI * 2 };
      }
    };
    const parts: P[] = Array.from({ length: count }, () => spawn(true));

    let raf = 0;
    let t = 0;
    let alive = true;
    const step = () => {
      if (!alive) return;
      t += 1;
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (kind === "rain") {
          ctx.strokeStyle = `rgba(165, 195, 225, ${p.a})`;
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 1.4, p.y - p.vy * 0.9);
          ctx.stroke();
          p.x += p.vx;
          p.y += p.vy;
          if (p.y > h + 20) parts[i] = spawn(false);
        } else if (kind === "snow") {
          ctx.fillStyle = `rgba(240, 246, 252, ${p.a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          p.x += Math.sin(t * 0.02 + p.ph) * 0.6;
          p.y += p.vy;
          if (p.y > h + 10) parts[i] = spawn(false);
        } else if (kind === "embers") {
          const glow = p.a * (0.7 + 0.3 * Math.sin(t * 0.1 + p.ph));
          ctx.fillStyle = `rgba(255, 150, 60, ${glow})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          p.x += Math.sin(t * 0.03 + p.ph) * 0.5;
          p.y += p.vy;
          if (p.y < -10) parts[i] = spawn(false);
        } else {
          // mist — big soft drifting blobs
          const wob = 0.85 + 0.15 * Math.sin(t * 0.008 + p.ph);
          const g = ctx.createRadialGradient(p.x, p.y, p.r * 0.15, p.x, p.y, p.r * wob);
          g.addColorStop(0, `rgba(205, 215, 222, ${p.a})`);
          g.addColorStop(1, "rgba(205, 215, 222, 0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * wob, 0, Math.PI * 2);
          ctx.fill();
          p.x += p.vx;
          if (p.x - p.r > w) p.x = -p.r;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [w, h, kind]);

  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      className="pointer-events-none absolute left-0 top-0"
    />
  );
}
