"use client";

import { cn } from "@/components/ui/cn";
import { usePresence } from "@/lib/data/hooks";

/**
 * DM-only control deciding who can see an entity. "Everyone" = visible to all;
 * "Hidden" = DM-only, with optional per-player reveal chips. The server enforces
 * it — players never receive entities they aren't allowed to see.
 */
export function VisibilityControl({
  hidden,
  visibleTo,
  onChange,
}: {
  hidden?: boolean;
  visibleTo?: string[];
  onChange: (patch: { hidden: boolean; visibleTo: string[] }) => void;
}) {
  const players = usePresence().filter((p) => p.role !== "dm");
  const reveal = visibleTo ?? [];
  const isHidden = !!hidden;

  const seg = "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors";
  const chip =
    "rounded-full border px-3 py-1 text-sm font-semibold transition-colors";

  function toggle(id: string) {
    const next = reveal.includes(id)
      ? reveal.filter((x) => x !== id)
      : [...reveal, id];
    onChange({ hidden: true, visibleTo: next });
  }

  return (
    <div className="rounded-card border border-leather/40 bg-leather/5 p-3">
      <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
        Player visibility
      </p>
      <div className="inline-flex gap-1 rounded-card border border-parchment-400/70 bg-parchment-100 p-1">
        <button
          onClick={() => onChange({ hidden: false, visibleTo: [] })}
          className={cn(
            seg,
            !isHidden
              ? "bg-forest text-parchment-50 shadow-card"
              : "text-ink-soft hover:bg-parchment-300/60",
          )}
        >
          Everyone
        </button>
        <button
          onClick={() => onChange({ hidden: true, visibleTo: reveal })}
          className={cn(
            seg,
            isHidden
              ? "bg-oxblood text-parchment-50 shadow-card"
              : "text-ink-soft hover:bg-parchment-300/60",
          )}
        >
          Hidden
        </button>
      </div>

      {isHidden && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs text-ink-faint">
            Reveal to specific players:
          </p>
          {players.length === 0 ? (
            <p className="text-xs text-ink-faint">
              No players in this campaign yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {players.map((p) => {
                const on = reveal.includes(p.userId);
                return (
                  <button
                    key={p.userId}
                    onClick={() => toggle(p.userId)}
                    className={cn(
                      chip,
                      on
                        ? "border-arcane bg-arcane/15 text-arcane ring-1 ring-arcane"
                        : "border-parchment-400 bg-parchment-100 text-ink-soft hover:border-arcane/50",
                    )}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p className="mt-2 text-xs text-ink-faint">
        {!isHidden
          ? "Visible to everyone at the table."
          : reveal.length
            ? `Hidden — revealed to ${reveal.length} player${reveal.length === 1 ? "" : "s"}.`
            : "Hidden from all players (DM only)."}
      </p>
    </div>
  );
}
