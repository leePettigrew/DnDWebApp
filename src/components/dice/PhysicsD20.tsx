"use client";

import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

const SIZE = 84; // die SVG box
const RADIUS = 38; // collision radius
const FRICTION = 0.986;
const ANG_FRICTION = 0.965;
const RESTITUTION = 0.64;
const SETTLE_SPEED = 0.3;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const d20 = () => Math.floor(Math.random() * 20) + 1;

interface Phys {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  va: number;
  held: boolean;
  grabDX: number;
  grabDY: number;
  rolling: boolean;
  history: { x: number; y: number; t: number }[];
  bounds: { w: number; h: number };
}

/**
 * An optional, physics-based d20 you can grab and throw across a tray — purely
 * for the drama of a special roll. Grab-drag-fling with momentum, wall bounce,
 * and spin; it tumbles and settles on a face. Respects prefers-reduced-motion
 * (skips the tumble and settles instantly).
 */
export function PhysicsD20() {
  const reduced = useReducedMotion();
  const trayRef = useRef<HTMLDivElement>(null);
  const dieRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);

  const phys = useRef<Phys>({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    va: 0,
    held: false,
    grabDX: 0,
    grabDY: 0,
    rolling: false,
    history: [],
    bounds: { w: 0, h: 0 },
  });

  const [result, setResult] = useState<number | null>(null);
  const [phase, setPhase] = useState<"idle" | "rolling" | "settled">("idle");

  function applyTransform() {
    const p = phys.current;
    if (dieRef.current) {
      dieRef.current.style.transform = `translate(${p.x - SIZE / 2}px, ${p.y - SIZE / 2}px) rotate(${p.angle}deg)`;
    }
  }
  const showNum = (n: number) => {
    if (numRef.current) numRef.current.textContent = String(n);
  };

  function settle() {
    const n = d20();
    phys.current.rolling = false;
    showNum(n);
    setResult(n);
    setPhase("settled");
  }

  // Centre the die and track the tray size.
  useEffect(() => {
    const tray = trayRef.current;
    if (!tray) return;
    const measure = () => {
      const r = tray.getBoundingClientRect();
      phys.current.bounds = { w: r.width, h: r.height };
    };
    measure();
    const p = phys.current;
    p.x = p.bounds.w / 2;
    p.y = p.bounds.h / 2;
    applyTransform();
    showNum(20);
    const ro = new ResizeObserver(measure);
    ro.observe(tray);
    return () => ro.disconnect();
  }, []);

  // Physics loop (only does work while a throw is in flight).
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(2.5, (now - last) / 16.67);
      last = now;
      const p = phys.current;
      if (p.rolling && !p.held) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.va * dt;
        const r = RADIUS;
        if (p.x < r) {
          p.x = r;
          p.vx = Math.abs(p.vx) * RESTITUTION;
          p.va += (Math.random() - 0.5) * 8;
        } else if (p.x > p.bounds.w - r) {
          p.x = p.bounds.w - r;
          p.vx = -Math.abs(p.vx) * RESTITUTION;
          p.va += (Math.random() - 0.5) * 8;
        }
        if (p.y < r) {
          p.y = r;
          p.vy = Math.abs(p.vy) * RESTITUTION;
          p.va += (Math.random() - 0.5) * 8;
        } else if (p.y > p.bounds.h - r) {
          p.y = p.bounds.h - r;
          p.vy = -Math.abs(p.vy) * RESTITUTION;
          p.va += (Math.random() - 0.5) * 8;
        }
        p.vx *= FRICTION;
        p.vy *= FRICTION;
        p.va *= ANG_FRICTION;
        applyTransform();
        if (Math.random() < 0.3) showNum(d20());
        if (Math.hypot(p.vx, p.vy) < SETTLE_SPEED && Math.abs(p.va) < 0.7) {
          settle();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  function pointerInTray(e: React.PointerEvent) {
    const r = trayRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    const p = phys.current;
    const pt = pointerInTray(e);
    if (Math.hypot(pt.x - p.x, pt.y - p.y) > RADIUS * 1.7) return; // grab the die
    trayRef.current?.setPointerCapture(e.pointerId);
    p.held = true;
    p.rolling = false;
    p.vx = p.vy = p.va = 0;
    p.grabDX = pt.x - p.x;
    p.grabDY = pt.y - p.y;
    p.history = [{ x: p.x, y: p.y, t: performance.now() }];
    setPhase("idle");
    setResult(null);
  }

  function onPointerMove(e: React.PointerEvent) {
    const p = phys.current;
    if (!p.held) return;
    const pt = pointerInTray(e);
    const prevX = p.x;
    p.x = clamp(pt.x - p.grabDX, RADIUS, p.bounds.w - RADIUS);
    p.y = clamp(pt.y - p.grabDY, RADIUS, p.bounds.h - RADIUS);
    p.angle += (p.x - prevX) * 0.4;
    p.history.push({ x: p.x, y: p.y, t: performance.now() });
    if (p.history.length > 6) p.history.shift();
    applyTransform();
  }

  function release() {
    const p = phys.current;
    p.held = false;
    const h = p.history;
    let vx = 0;
    let vy = 0;
    if (h.length >= 2) {
      const a = h[0];
      const b = h[h.length - 1];
      const dt = b.t - a.t || 16;
      vx = ((b.x - a.x) / dt) * 16;
      vy = ((b.y - a.y) / dt) * 16;
    }
    p.history = [];
    const speed = Math.hypot(vx, vy);
    if (reduced || speed < 1.2) {
      settle();
      return;
    }
    p.vx = vx;
    p.vy = vy;
    p.va = (vx + vy) * 0.7 + (Math.random() - 0.5) * 16;
    p.rolling = true;
    setResult(null);
    setPhase("rolling");
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!phys.current.held) return;
    try {
      trayRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    release();
  }

  function tossForMe() {
    const p = phys.current;
    p.held = false;
    p.x = p.bounds.w * (0.25 + Math.random() * 0.5);
    p.y = p.bounds.h * (0.25 + Math.random() * 0.5);
    if (reduced) {
      applyTransform();
      settle();
      return;
    }
    const dir = Math.random() * Math.PI * 2;
    const power = 9 + Math.random() * 7;
    p.vx = Math.cos(dir) * power;
    p.vy = Math.sin(dir) * power;
    p.va = (Math.random() - 0.5) * 40;
    p.rolling = true;
    setResult(null);
    setPhase("rolling");
  }

  const crit = phase === "settled" && result === 20;
  const fumble = phase === "settled" && result === 1;

  return (
    <Panel
      title="Physical Toss"
      eyebrow="Grab &amp; fling — just for the drama"
      action={
        <Button variant="secondary" size="sm" onClick={tossForMe}>
          Toss for me
        </Button>
      }
    >
      <div
        ref={trayRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative h-72 w-full touch-none select-none overflow-hidden rounded-card border-2 border-parchment-400/70"
        style={{
          background:
            "radial-gradient(120% 120% at 30% 20%, #2a2016 0%, #17110b 70%)",
          boxShadow: "inset 0 0 40px rgba(0,0,0,0.6)",
          cursor: "grab",
        }}
      >
        <div
          ref={dieRef}
          className={cn(
            "absolute left-0 top-0 will-change-transform",
            phase === "rolling" && "drop-shadow-[0_6px_10px_rgba(0,0,0,0.55)]",
            crit && "animate-pulse-glow",
          )}
          style={{ width: SIZE, height: SIZE }}
        >
          <svg viewBox="0 0 84 84" width={SIZE} height={SIZE} className="overflow-visible">
            <defs>
              <linearGradient id="d20grad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0"
                  stopColor={crit ? "#F0D585" : fumble ? "#d6794a" : "#D4A95A"}
                />
                <stop
                  offset="1"
                  stopColor={crit ? "#B98A3C" : fumble ? "#8a2f1c" : "#8A6526"}
                />
              </linearGradient>
            </defs>
            <polygon
              points="42,3 77,23 77,61 42,81 7,61 7,23"
              fill="url(#d20grad)"
              stroke="#5E2020"
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
            <polygon
              points="42,16 20,59 64,59"
              fill="rgba(255,248,226,0.45)"
              stroke="#5E2020"
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            <g stroke="#5E2020" strokeWidth={1.3} opacity={0.85}>
              <line x1="42" y1="3" x2="42" y2="16" />
              <line x1="7" y1="23" x2="20" y2="59" />
              <line x1="77" y1="23" x2="64" y2="59" />
              <line x1="42" y1="81" x2="20" y2="59" />
              <line x1="42" y1="81" x2="64" y2="59" />
            </g>
            <g stroke="#5E2020" strokeWidth={1} opacity={0.4}>
              <line x1="7" y1="23" x2="42" y2="16" />
              <line x1="77" y1="23" x2="42" y2="16" />
            </g>
          </svg>
          <span
            ref={numRef}
            className="numerals pointer-events-none absolute inset-0 flex items-center justify-center pt-1.5 font-display text-2xl font-black text-leather"
          >
            20
          </span>
        </div>

        {/* Result flourish */}
        {phase === "settled" && result !== null && (
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 animate-fade-in-up">
            <span
              className={cn(
                "rounded-full border px-3 py-1 font-display text-sm font-bold",
                crit
                  ? "border-gilt bg-brass/20 text-brass-light"
                  : fumble
                    ? "border-oxblood bg-oxblood/20 text-oxblood-light"
                    : "border-parchment-400/60 bg-parchment-100/90 text-ink",
              )}
            >
              {crit ? "Critical — 20!" : fumble ? "Fumble — 1" : `You threw ${result}`}
            </span>
          </div>
        )}

        {phase === "idle" && result === null && (
          <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 text-xs uppercase tracking-[0.2em] text-parchment-300/70">
            Grab the die &amp; fling it
          </p>
        )}
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        A for-fun physical roll — drag the die and let go to send it tumbling.
        Read your result off the die. (Not logged to the shared roll history.)
      </p>
    </Panel>
  );
}
