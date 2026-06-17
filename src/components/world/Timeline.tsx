"use client";

import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import { PlusIcon, TrashIcon, ChevronRightIcon } from "@/components/ui/icons";
import { useCampaigns, useTimeline } from "@/lib/data/hooks";
import { newTimelineEventInput } from "@/lib/domain/factories";

const inputClass =
  "w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40";

export function Timeline() {
  const { items: campaigns } = useCampaigns();
  const { items: events, create, update, remove } = useTimeline();
  const sorted = [...events].sort((a, b) => a.order - b.order);

  function swap(i: number, j: number) {
    const a = sorted[i];
    const b = sorted[j];
    if (!a || !b) return;
    void update(a.id, { order: b.order });
    void update(b.id, { order: a.order });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">
          In-World Timeline
        </h2>
        <Button
          size="sm"
          onClick={() => void create(newTimelineEventInput(campaigns[0]?.id))}
        >
          <PlusIcon className="h-4 w-4" /> New event
        </Button>
      </div>

      {sorted.length === 0 ? (
        <Panel tone="flat">
          <EmptyState
            icon={<ChevronRightIcon />}
            title="No events yet"
            description="Chronicle the history and unfolding events of your world."
          />
        </Panel>
      ) : (
        <ol className="relative space-y-3 border-l-2 border-parchment-400/60 pl-6">
          {sorted.map((ev, i) => (
            <li key={ev.id} className="relative">
              <span className="absolute -left-[1.85rem] top-1.5 h-3 w-3 rounded-full border-2 border-brass bg-parchment-50" />
              <div className="surface-parchment p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    defaultValue={ev.date}
                    onBlur={(e) =>
                      e.target.value !== ev.date &&
                      update(ev.id, { date: e.target.value })
                    }
                    placeholder="In-world date"
                    className="w-40 rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-xs font-semibold text-brass-dark focus:border-brass focus:outline-none"
                    aria-label="Event date"
                  />
                  <input
                    defaultValue={ev.title}
                    onBlur={(e) =>
                      e.target.value !== ev.title &&
                      update(ev.id, { title: e.target.value })
                    }
                    className="min-w-48 flex-1 border-b border-transparent bg-transparent font-display text-base font-bold text-ink hover:border-parchment-400 focus:border-brass focus:outline-none"
                    aria-label="Event title"
                  />
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => swap(i, i - 1)}
                      disabled={i === 0}
                      aria-label="Move earlier"
                      className="rounded p-1 text-ink-faint hover:text-ink disabled:opacity-30"
                    >
                      <ChevronRightIcon className="h-4 w-4 -rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={() => swap(i, i + 1)}
                      disabled={i === sorted.length - 1}
                      aria-label="Move later"
                      className="rounded p-1 text-ink-faint hover:text-ink disabled:opacity-30"
                    >
                      <ChevronRightIcon className="h-4 w-4 rotate-90" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(ev.id)}
                      aria-label="Delete event"
                      className="rounded p-1 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <textarea
                  defaultValue={ev.description}
                  onBlur={(e) =>
                    e.target.value !== (ev.description ?? "") &&
                    update(ev.id, { description: e.target.value })
                  }
                  rows={2}
                  placeholder="What happened?"
                  className={cn(inputClass, "mt-2 resize-y")}
                  aria-label="Event description"
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
