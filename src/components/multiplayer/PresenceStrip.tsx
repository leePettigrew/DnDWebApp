"use client";

import { usePresence } from "@/lib/data/hooks";
import { cn } from "@/components/ui/cn";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stacked avatars of who's online in the campaign. Empty/null in solo mode. */
export function PresenceStrip({ className }: { className?: string }) {
  const users = usePresence();
  const online = users.filter((u) => u.online);
  if (online.length === 0) return null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex -space-x-2">
        {online.slice(0, 6).map((u) => (
          <span
            key={u.userId}
            title={`${u.name}${u.role === "dm" ? " (DM)" : ""}${
              u.typing ? ` — ${u.typing}` : ""
            }`}
            className={cn(
              "relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-parchment-100 text-[0.6rem] font-bold",
              u.role === "dm"
                ? "bg-gradient-to-br from-oxblood-light to-oxblood text-parchment-50"
                : "bg-gradient-to-br from-brass-light to-brass text-leather",
            )}
          >
            {initials(u.name)}
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-parchment-100",
                u.typing ? "bg-brass animate-pulse" : "bg-forest",
              )}
            />
          </span>
        ))}
      </div>
      <span className="text-xs text-ink-faint">
        {online.length} online
      </span>
    </div>
  );
}
