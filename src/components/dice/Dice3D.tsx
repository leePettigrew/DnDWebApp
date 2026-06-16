import { cn } from "@/components/ui/cn";
import type { DieRoll } from "@/lib/domain/types";

/**
 * A real 3D die: a CSS cube (perspective + transform-style: preserve-3d) with
 * six shaded faces that tumbles while rolling and settles to a resting tilt.
 * All faces show the rolled value, so it reads no matter how it lands.
 * Honors prefers-reduced-motion (the global rule disables the tumble).
 */
const FACES: { cls: string; depth: string }[] = [
  { cls: "dice3d-face--front", depth: "" },
  { cls: "dice3d-face--back", depth: "brightness-[0.72]" },
  { cls: "dice3d-face--right", depth: "brightness-90" },
  { cls: "dice3d-face--left", depth: "brightness-90" },
  { cls: "dice3d-face--top", depth: "brightness-110" },
  { cls: "dice3d-face--bottom", depth: "brightness-[0.7]" },
];

export function Dice3D({
  roll,
  rolling,
  display,
  delayMs = 0,
}: {
  roll: DieRoll;
  rolling?: boolean;
  /** Override the shown number (used while tumbling). */
  display?: number;
  delayMs?: number;
}) {
  const isD20 = roll.sides === 20;
  const crit = isD20 && roll.value === 20 && !roll.dropped;
  const fumble = isD20 && roll.value === 1 && !roll.dropped;
  const value = display ?? roll.value;

  const faceColor = roll.dropped
    ? "bg-parchment-200 border-parchment-400 text-ink-faint"
    : crit
      ? "border-gilt bg-brass text-leather"
      : fumble
        ? "border-oxblood bg-oxblood-light text-parchment-50"
        : "border-parchment-400 bg-parchment-50 text-ink";

  const sizeCls = value >= 100 ? "text-sm" : value >= 10 ? "text-lg" : "text-2xl";

  return (
    <div className="dice3d-scene" title={`d${roll.sides}`}>
      <div
        className={cn(
          "dice3d-cube",
          rolling && "is-rolling",
          roll.dropped && "opacity-60",
          crit && "drop-shadow-[0_0_10px_rgba(230,199,114,0.7)]",
        )}
        style={rolling ? { animationDelay: `${delayMs}ms` } : undefined}
      >
        {FACES.map((f) => (
          <div
            key={f.cls}
            className={cn(
              "dice3d-face numerals font-display font-bold",
              f.cls,
              f.depth,
              sizeCls,
              faceColor,
              roll.dropped && "line-through",
            )}
          >
            {value}
          </div>
        ))}
      </div>
      <span className="dice3d-label">d{roll.sides}</span>
    </div>
  );
}
