"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { D20Icon, ChevronRightIcon } from "@/components/ui/icons";
import { cn } from "@/components/ui/cn";
import { useDataProvider, useRollHistory } from "@/lib/data/hooks";

/**
 * The shared roll log as a collapsible, height-capped dropdown. Lives in the
 * dice page's right rail so you can glance at recent rolls (and fold it away)
 * without scrolling the whole page.
 */
export function RollHistoryPanel() {
  const { items: history, remove: removeRoll } = useRollHistory();
  const { capabilities } = useDataProvider();
  const [open, setOpen] = useState(true);

  const sortedHistory = [...history]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);

  return (
    <Panel
      title={
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-1.5 text-left"
        >
          <ChevronRightIcon
            className={cn(
              "h-4 w-4 text-brass-dark transition-transform",
              open && "rotate-90",
            )}
          />
          Roll History
          {history.length > 0 && (
            <span className="numerals rounded-full bg-parchment-300/70 px-1.5 text-xs font-semibold text-ink-soft">
              {history.length}
            </span>
          )}
        </button>
      }
      eyebrow={capabilities.multiUser ? "Shared campaign log" : "The record"}
      className="lg:sticky lg:top-6"
      action={
        history.length > 0 && !capabilities.multiUser ? (
          <button
            type="button"
            onClick={() => history.forEach((h) => removeRoll(h.id))}
            className="text-xs font-semibold text-ink-faint hover:text-oxblood"
          >
            Clear
          </button>
        ) : undefined
      }
    >
      {!open ? (
        <p className="text-sm text-ink-faint">
          {history.length === 0
            ? "No rolls yet."
            : `${history.length} roll${history.length === 1 ? "" : "s"} chronicled — tap the title to expand.`}
        </p>
      ) : sortedHistory.length === 0 ? (
        <EmptyState
          icon={<D20Icon />}
          title="No rolls yet"
          description="Your rolls will be chronicled here."
        />
      ) : (
        <ul className="max-h-[32rem] space-y-1.5 overflow-y-auto pr-1">
          {sortedHistory.map((h) => (
            <li
              key={h.id}
              className="flex items-center justify-between gap-3 rounded-md border border-parchment-400/50 bg-parchment-100/60 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm text-ink">
                  {h.rolledByName && (
                    <span className="shrink-0 font-semibold text-brass-dark">
                      {h.rolledByName}
                    </span>
                  )}
                  <span className="truncate">{h.label ?? h.notation}</span>
                  {h.hidden && (
                    <span
                      title="Hidden roll — DM only"
                      className="shrink-0 rounded bg-leather/85 px-1 text-[0.55rem] font-bold uppercase tracking-wide text-parchment-100"
                    >
                      Hidden
                    </span>
                  )}
                  {h.physical && (
                    <span
                      title="Hand-thrown in the 3D dice arena"
                      className="shrink-0 rounded bg-brass/20 px-1 text-[0.55rem] font-bold uppercase tracking-wide text-brass-dark"
                    >
                      Thrown
                    </span>
                  )}
                </span>
                <span className="numerals block text-xs text-ink-faint">
                  {h.notation}
                </span>
              </span>
              <span
                className={cn(
                  "numerals shrink-0 font-display text-xl font-bold",
                  h.isCrit
                    ? "text-brass-dark"
                    : h.isFumble
                      ? "text-oxblood"
                      : "text-ink",
                )}
              >
                {h.total}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
