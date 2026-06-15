import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "neutral" | "brass" | "oxblood" | "forest" | "arcane";

const tones: Record<Tone, string> = {
  neutral: "bg-parchment-300/70 text-ink-soft border-parchment-400",
  brass: "bg-brass/15 text-brass-dark border-brass/40",
  oxblood: "bg-oxblood/12 text-oxblood border-oxblood/35",
  forest: "bg-forest/12 text-forest border-forest/35",
  arcane: "bg-arcane/12 text-arcane border-arcane/35",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
