import { cn } from "@/components/ui/cn";
import type { DieRoll } from "@/lib/domain/types";

/** A single rolled die rendered as an inked token. */
export function DiceChip({
  roll,
  rolling,
  display,
}: {
  roll: DieRoll;
  rolling?: boolean;
  /** Override the shown number (used while tumbling). */
  display?: number;
}) {
  const isD20 = roll.sides === 20;
  const crit = isD20 && roll.value === 20 && !roll.dropped;
  const fumble = isD20 && roll.value === 1 && !roll.dropped;
  const value = display ?? roll.value;

  return (
    <div
      className={cn(
        "relative flex h-14 w-14 select-none items-center justify-center rounded-xl border-2 font-display text-xl font-bold shadow-card transition-all",
        rolling && "animate-dice-tumble",
        roll.dropped
          ? "border-parchment-400/60 bg-parchment-200/60 text-ink-faint line-through opacity-60"
          : crit
            ? "border-gilt bg-gradient-to-br from-brass-light to-brass text-leather shadow-gilt"
            : fumble
              ? "border-oxblood bg-gradient-to-br from-oxblood-light to-oxblood text-parchment-50 shadow-oxblood"
              : "border-parchment-400 bg-parchment-50 text-ink",
      )}
    >
      <span className="numerals">{value}</span>
      <span className="absolute -bottom-2 right-1 rounded bg-leather/85 px-1 text-[0.6rem] font-semibold text-parchment-100">
        d{roll.sides}
      </span>
    </div>
  );
}
