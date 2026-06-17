import type { CSSProperties } from "react";
import { cn } from "@/components/ui/cn";
import type { DieRoll } from "@/lib/domain/types";

/**
 * A 3D die styled to match the arena: a charcoal-purple cube with gold edges
 * and glowing numbers that tumbles and settles flat on its FRONT face — which
 * always shows the rolled value. The other five faces carry their own (stable,
 * deterministic) numbers so it reads like a real die while it spins.
 * Honors prefers-reduced-motion (the global rule disables the tumble).
 */
const FACES: { cls: string; depth: string }[] = [
  { cls: "dice3d-face--front", depth: "" }, // index 0 = the rolled value
  { cls: "dice3d-face--back", depth: "brightness-[0.7]" },
  { cls: "dice3d-face--right", depth: "brightness-90" },
  { cls: "dice3d-face--left", depth: "brightness-90" },
  { cls: "dice3d-face--top", depth: "brightness-110" },
  { cls: "dice3d-face--bottom", depth: "brightness-[0.68]" },
];

/**
 * Filler numbers for the five non-result faces. Deterministic (seeded by the
 * value + sides) so the die never reshuffles between renders mid-tumble.
 */
function faceNumbers(value: number, sides: number): number[] {
  let s = ((value * 73856093) ^ (sides * 19349663)) >>> 0;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const used = new Set<number>([value]);
  const out = [value];
  for (let i = 0; i < 5; i++) {
    let n = 1 + Math.floor(rand() * sides);
    let tries = 0;
    while (sides >= 6 && used.has(n) && tries < 12) {
      n = 1 + Math.floor(rand() * sides);
      tries++;
    }
    used.add(n);
    out.push(n);
  }
  return out; // [front, back, right, left, top, bottom]
}

/** Glow palette: a green 20, a red 1 (d20), gold otherwise — like the arena. */
function numStyle(v: number, sides: number): CSSProperties {
  let color = "#ffd57c";
  let glow = "#ffab1f";
  if (sides === 20 && v === 20) {
    color = "#7dff98";
    glow = "#13e24a";
  } else if (sides === 20 && v === 1) {
    color = "#ff5d5d";
    glow = "#ff1515";
  }
  return { color, textShadow: `0 0 7px ${glow}, 0 0 2px ${glow}` };
}

const sizeFor = (v: number) =>
  v >= 100 ? "text-xs" : v >= 10 ? "text-base" : "text-xl";

export function Dice3D({
  roll,
  rolling,
  delayMs = 0,
}: {
  roll: DieRoll;
  rolling?: boolean;
  delayMs?: number;
}) {
  const isD20 = roll.sides === 20;
  const crit = isD20 && roll.value === 20 && !roll.dropped;
  const fumble = isD20 && roll.value === 1 && !roll.dropped;
  const numbers = faceNumbers(roll.value, roll.sides);

  return (
    <div className="dice3d-scene" title={`d${roll.sides}`}>
      <div
        className={cn(
          "dice3d-cube",
          rolling && "is-rolling",
          crit && "dice3d-cube--crit",
          fumble && "dice3d-cube--fumble",
          roll.dropped && "dice3d-cube--dropped",
        )}
        style={rolling ? { animationDelay: `${delayMs}ms` } : undefined}
      >
        {FACES.map((f, i) => (
          <div
            key={f.cls}
            className={cn(
              "dice3d-face numerals font-display font-bold",
              f.cls,
              f.depth,
              sizeFor(numbers[i]),
              roll.dropped && "line-through",
            )}
            style={numStyle(numbers[i], roll.sides)}
          >
            {numbers[i]}
          </div>
        ))}
      </div>
      <span className="dice3d-label">d{roll.sides}</span>
    </div>
  );
}
