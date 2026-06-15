import { D20Icon } from "@/components/ui/icons";

export default function Loading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-ink-faint">
      <D20Icon className="h-10 w-10 animate-dice-tumble text-brass" />
      <p className="font-display text-sm uppercase tracking-[0.25em]">
        Lighting the candles…
      </p>
    </div>
  );
}
