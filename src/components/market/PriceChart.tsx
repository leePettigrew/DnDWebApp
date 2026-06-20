"use client";

import { cn } from "@/components/ui/cn";

/** A labelled SVG line chart of a commodity's recorded daily price. */
export function PriceChart({
  points,
  height = 180,
}: {
  points: { day: number; value: number }[];
  height?: number;
}) {
  if (points.length < 2) {
    return (
      <p className="py-10 text-center text-sm text-ink-faint">
        Not enough price history yet — let the market run a few days (Economy → Simulation).
      </p>
    );
  }

  const w = 600;
  const h = height;
  const padL = 38;
  const padR = 12;
  const padT = 12;
  const padB = 20;

  const vals = points.map((p) => p.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) {
    min = Math.max(0, min - 1);
    max += 1;
  }
  const days = points.map((p) => p.day);
  const dmin = days[0];
  const dmax = days[days.length - 1];

  const x = (day: number) => padL + ((day - dmin) / (dmax - dmin || 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB);

  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(dmax).toFixed(1)},${(h - padB).toFixed(1)} L${x(dmin).toFixed(1)},${(h - padB).toFixed(1)} Z`;

  const ticks = 4;
  const gridY = Array.from({ length: ticks + 1 }, (_, i) => min + (i / ticks) * (max - min));
  const up = vals[vals.length - 1] >= vals[0];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none" style={{ maxHeight: h }}>
      {gridY.map((g, i) => (
        <g key={i}>
          <line
            x1={padL}
            x2={w - padR}
            y1={y(g)}
            y2={y(g)}
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-parchment-400/60"
          />
          <text x={padL - 4} y={y(g) + 3} textAnchor="end" className="fill-ink-faint text-[9px]">
            {Math.round(g)}
          </text>
        </g>
      ))}
      <path d={area} className={cn(up ? "fill-forest/10" : "fill-oxblood/10")} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        className={cn(up ? "text-forest" : "text-oxblood")}
      />
      {points.map((p) => (
        <circle key={p.day} cx={x(p.day)} cy={y(p.value)} r={1.6} className={cn(up ? "fill-forest" : "fill-oxblood")} />
      ))}
      <text x={padL} y={h - 5} className="fill-ink-faint text-[9px]">day {dmin}</text>
      <text x={w - padR} y={h - 5} textAnchor="end" className="fill-ink-faint text-[9px]">day {dmax}</text>
    </svg>
  );
}
