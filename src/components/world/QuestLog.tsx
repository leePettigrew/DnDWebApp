"use client";

import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import { PlusIcon, TrashIcon, ScrollIcon } from "@/components/ui/icons";
import { useCampaigns, useQuests } from "@/lib/data/hooks";
import { newQuestInput } from "@/lib/domain/factories";
import { newId } from "@/lib/domain/ids";
import type { Quest, QuestObjective, QuestStatus } from "@/lib/domain/types";

const STATUSES: { key: QuestStatus; label: string; tone: "brass" | "oxblood" | "default" }[] = [
  { key: "active", label: "Active", tone: "brass" },
  { key: "completed", label: "Completed", tone: "default" },
  { key: "failed", label: "Failed", tone: "oxblood" },
];

const inputClass =
  "w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40";

export function QuestLog() {
  const { items: campaigns } = useCampaigns();
  const { items: quests, create, update, remove } = useQuests();

  const sorted = [...quests].sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return a.createdAt.localeCompare(b.createdAt);
  });

  function setObjectives(q: Quest, objectives: QuestObjective[]) {
    void update(q.id, { objectives });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-soft">
          {quests.filter((q) => q.status === "active").length} active ·{" "}
          {quests.length} total
        </p>
        <Button
          size="sm"
          onClick={() => void create(newQuestInput(campaigns[0]?.id))}
        >
          <PlusIcon className="h-4 w-4" /> New quest
        </Button>
      </div>

      {sorted.length === 0 ? (
        <Panel tone="flat">
          <EmptyState
            icon={<ScrollIcon />}
            title="No quests yet"
            description="Track objectives, rewards, and progress for every thread your party pulls."
          />
        </Panel>
      ) : (
        sorted.map((q) => {
          const done = q.objectives.filter((o) => o.done).length;
          return (
            <Panel key={q.id} tone={q.status === "active" ? "raised" : "flat"}>
              <div className="flex flex-wrap items-start gap-2">
                <input
                  defaultValue={q.title}
                  onBlur={(e) =>
                    e.target.value !== q.title &&
                    update(q.id, { title: e.target.value })
                  }
                  className="min-w-48 flex-1 border-b border-transparent bg-transparent font-display text-lg font-bold text-ink hover:border-parchment-400 focus:border-brass focus:outline-none"
                  aria-label="Quest title"
                />
                <select
                  aria-label="Quest status"
                  value={q.status}
                  onChange={(e) =>
                    update(q.id, { status: e.target.value as QuestStatus })
                  }
                  className="rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-xs font-semibold text-ink focus:border-brass focus:outline-none"
                >
                  {STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => update(q.id, { pinned: !q.pinned })}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-semibold",
                    q.pinned
                      ? "bg-brass/20 text-brass-dark"
                      : "text-ink-faint hover:bg-parchment-300/60",
                  )}
                  title={q.pinned ? "Unpin" : "Pin to top"}
                >
                  {q.pinned ? "Pinned" : "Pin"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(q.id)}
                  aria-label="Delete quest"
                  className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>

              <textarea
                defaultValue={q.description}
                onBlur={(e) =>
                  e.target.value !== (q.description ?? "") &&
                  update(q.id, { description: e.target.value })
                }
                rows={2}
                placeholder="Describe the quest…"
                className={cn(inputClass, "mt-3 resize-y")}
                aria-label="Quest description"
              />

              {/* Objectives */}
              <div className="mt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
                    Objectives
                  </span>
                  {q.objectives.length > 0 && (
                    <Badge>
                      {done}/{q.objectives.length}
                    </Badge>
                  )}
                </div>
                <ul className="space-y-1">
                  {q.objectives.map((o) => (
                    <li key={o.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={o.done}
                        onChange={(e) =>
                          setObjectives(
                            q,
                            q.objectives.map((x) =>
                              x.id === o.id
                                ? { ...x, done: e.target.checked }
                                : x,
                            ),
                          )
                        }
                        className="h-4 w-4 shrink-0 accent-forest"
                        aria-label="Objective complete"
                      />
                      <input
                        defaultValue={o.text}
                        onBlur={(e) =>
                          e.target.value !== o.text &&
                          setObjectives(
                            q,
                            q.objectives.map((x) =>
                              x.id === o.id
                                ? { ...x, text: e.target.value }
                                : x,
                            ),
                          )
                        }
                        className={cn(
                          "flex-1 border-b border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-parchment-400 focus:border-brass focus:outline-none",
                          o.done && "text-ink-faint line-through",
                        )}
                        aria-label="Objective text"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setObjectives(
                            q,
                            q.objectives.filter((x) => x.id !== o.id),
                          )
                        }
                        aria-label="Remove objective"
                        className="rounded p-1 text-ink-faint hover:text-oxblood"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() =>
                    setObjectives(q, [
                      ...q.objectives,
                      { id: newId(), text: "New objective", done: false },
                    ])
                  }
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-brass-dark hover:underline"
                >
                  <PlusIcon className="h-3.5 w-3.5" /> Add objective
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <span className="shrink-0 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
                  Reward
                </span>
                <input
                  defaultValue={q.reward}
                  onBlur={(e) =>
                    e.target.value !== (q.reward ?? "") &&
                    update(q.id, { reward: e.target.value })
                  }
                  placeholder="—"
                  className={inputClass}
                  aria-label="Quest reward"
                />
              </div>
            </Panel>
          );
        })
      )}
    </div>
  );
}
