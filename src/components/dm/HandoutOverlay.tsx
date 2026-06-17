"use client";

import { CloseIcon, ScrollIcon } from "@/components/ui/icons";
import { useHandout } from "@/lib/data/hooks";

/**
 * A global overlay that pops up whenever the DM pushes a handout to the table.
 * Mounted once in the app shell so it appears on every page.
 */
export function HandoutOverlay() {
  const { handout, dismiss } = useHandout();
  if (!handout) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Handout from the Dungeon Master"
      onClick={dismiss}
    >
      <div
        className="surface-raised max-h-[90vh] w-full max-w-lg overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-parchment-400/60 bg-parchment-200/50 px-5 py-3">
          <span className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.15em] text-brass-dark">
            <ScrollIcon className="h-4 w-4" />
            Handout{handout.fromName ? ` — ${handout.fromName}` : ""}
          </span>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss handout"
            className="rounded-md p-1 text-ink-faint hover:bg-parchment-300/60 hover:text-ink"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-3 p-5">
          {handout.title && (
            <h2 className="font-display text-2xl font-bold text-ink">
              {handout.title}
            </h2>
          )}
          {handout.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={handout.imageUrl}
              alt={handout.title ?? "Handout image"}
              className="w-full rounded-card border border-parchment-400/70"
            />
          )}
          {handout.body && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">
              {handout.body}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
