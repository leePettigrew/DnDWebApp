"use client";

import { useConnectionStatus } from "@/lib/data/hooks";
import { cn } from "@/components/ui/cn";
import type { ConnectionStatus } from "@/lib/data/provider";

const CONFIG: Record<
  Exclude<ConnectionStatus, "local">,
  { label: string; dot: string; text: string }
> = {
  connecting: { label: "Connecting…", dot: "bg-ink-faint", text: "text-ink-faint" },
  connected: { label: "Live", dot: "bg-forest", text: "text-forest" },
  reconnecting: {
    label: "Reconnecting…",
    dot: "bg-brass animate-pulse",
    text: "text-brass-dark",
  },
  offline: { label: "Offline", dot: "bg-oxblood", text: "text-oxblood" },
};

/** Live connection indicator. Renders nothing in local (no-server) mode. */
export function ConnectionPill({ className }: { className?: string }) {
  const status = useConnectionStatus();
  if (status === "local") return null;
  const cfg = CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-parchment-400/60 bg-parchment-100 px-2.5 py-1 text-xs font-semibold",
        cfg.text,
        className,
      )}
      title={`Connection: ${cfg.label}`}
    >
      <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}
