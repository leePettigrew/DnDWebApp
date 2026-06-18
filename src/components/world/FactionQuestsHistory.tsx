"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import { newTimelineEventInput } from "@/lib/domain/factories";
import { useCampaigns, useQuests, useTimeline } from "@/lib/data/hooks";
import type { Faction, FactionLogEntry } from "@/lib/domain/types";

export function FactionQuestsHistory({
  faction: f,
  onUpdate,
}: {
  faction: Faction;
  onUpdate: (patch: Partial<Faction>) => void;
}) {
  const { items: campaigns } = useCampaigns();
  const { items: quests } = useQuests();
  const { create: createTimeline } = useTimeline();

  const questIds = f.questIds ?? [];
  const linked = quests.filter((q) => questIds.includes(q.id));
  const available = quests.filter((q) => !questIds.includes(q.id));
  const history = f.history ?? [];

  const [pickQuest, setPickQuest] = useState("");
  const [logDate, setLogDate] = useState("");
  const [logText, setLogText] = useState("");

  const setHistory = (next: FactionLogEntry[]) => onUpdate({ history: next });

  function addLog() {
    if (!logText.trim()) return;
    setHistory([
      { id: newId(), date: logDate.trim() || undefined, text: logText.trim() },
      ...history,
    ]);
    setLogDate("");
    setLogText("");
  }
  function postToTimeline(e: FactionLogEntry) {
    void createTimeline({
      ...newTimelineEventInput(campaigns[0]?.id),
      date: e.date ?? "",
      title: `${f.name}: ${e.text}`.slice(0, 120),
      order: Date.now(),
    });
  }

  return (
    <div className="space-y-6">
      {/* Quests */}
      <Panel title="Quests" eyebrow="Hooks from this faction">
        {linked.length === 0 ? (
          <p className="text-sm text-ink-faint">No quests linked yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {linked.map((q) => (
              <li
                key={q.id}
                className="flex items-center gap-2 rounded-md border border-parchment-400/50 bg-parchment-100/60 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate font-display font-semibold text-ink">
                  {q.title}
                </span>
                <Badge
                  tone={
                    q.status === "completed"
                      ? "forest"
                      : q.status === "failed"
                        ? "oxblood"
                        : "brass"
                  }
                >
                  {q.status}
                </Badge>
                <button
                  onClick={() =>
                    onUpdate({ questIds: questIds.filter((id) => id !== q.id) })
                  }
                  aria-label="Unlink quest"
                  className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {available.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={pickQuest}
              onChange={(e) => setPickQuest(e.target.value)}
              aria-label="Link a quest"
              className="h-9 min-w-48 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none"
            >
              <option value="">Link a quest…</option>
              {available.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              size="sm"
              disabled={!pickQuest}
              onClick={() => {
                onUpdate({ questIds: [...questIds, pickQuest] });
                setPickQuest("");
              }}
            >
              <PlusIcon className="h-4 w-4" /> Link
            </Button>
          </div>
        )}
      </Panel>

      {/* History */}
      <Panel title="History" eyebrow="Deeds &amp; turning points">
        <div className="flex flex-wrap items-end gap-2">
          <input
            value={logDate}
            onChange={(e) => setLogDate(e.target.value)}
            placeholder="when (optional)"
            className="h-9 w-40 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none"
          />
          <input
            value={logText}
            onChange={(e) => setLogText(e.target.value)}
            placeholder="what happened…"
            className="h-9 min-w-48 flex-1 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none"
            onKeyDown={(e) => e.key === "Enter" && addLog()}
          />
          <Button size="sm" onClick={addLog} disabled={!logText.trim()}>
            <PlusIcon className="h-4 w-4" /> Log
          </Button>
        </div>

        {history.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {history.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-2 rounded-md border border-parchment-400/50 bg-parchment-100/60 px-3 py-2 text-sm"
              >
                {e.date && (
                  <span className="numerals shrink-0 text-xs font-semibold text-brass-dark">
                    {e.date}
                  </span>
                )}
                <span className="min-w-0 flex-1 text-ink-soft">{e.text}</span>
                <button
                  onClick={() => postToTimeline(e)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-brass-dark hover:bg-parchment-300/60"
                  title="Add to the campaign timeline"
                >
                  → timeline
                </button>
                <button
                  onClick={() => setHistory(history.filter((x) => x.id !== e.id))}
                  aria-label="Remove log"
                  className="shrink-0 rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
