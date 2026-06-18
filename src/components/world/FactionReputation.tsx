"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import { useCharacters } from "@/lib/data/hooks";
import type {
  Faction,
  FactionRank,
  FactionRep,
  FactionReward,
} from "@/lib/domain/types";

function rankFor(value: number, ranks: FactionRank[]): FactionRank | null {
  let best: FactionRank | null = null;
  for (const r of ranks) if (value >= r.minRep) best = r;
  return best;
}

const numInput =
  "h-8 w-16 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-center text-sm font-bold text-ink focus:border-brass focus:outline-none";

export function FactionReputation({
  faction: f,
  onUpdate,
}: {
  faction: Faction;
  onUpdate: (patch: Partial<Faction>) => void;
}) {
  const { items: characters } = useCharacters();
  const reputation = f.reputation ?? [];
  const ranks = [...(f.ranks ?? [])].sort((a, b) => a.minRep - b.minRep);
  const rewards = [...(f.rewards ?? [])].sort((a, b) => a.minRep - b.minRep);
  const maxRank = ranks.length ? ranks[ranks.length - 1].minRep : 100;

  const [pick, setPick] = useState("");

  const available = characters.filter(
    (c) => !reputation.some((r) => r.characterId === c.id),
  );

  const setReps = (next: FactionRep[]) => onUpdate({ reputation: next });
  const setRanks = (next: FactionRank[]) => onUpdate({ ranks: next });
  const setRewards = (next: FactionReward[]) => onUpdate({ rewards: next });

  function addTrack() {
    if (pick === "custom") {
      const name = prompt("Name for this reputation track:");
      if (!name) return;
      setReps([...reputation, { id: newId(), name, value: 0 }]);
    } else if (pick) {
      const c = characters.find((x) => x.id === pick);
      setReps([
        ...reputation,
        { id: newId(), characterId: pick, name: c?.name ?? "PC", value: 0 },
      ]);
    }
    setPick("");
  }
  const bump = (id: string, delta: number) =>
    setReps(
      reputation.map((r) => (r.id === id ? { ...r, value: r.value + delta } : r)),
    );
  const setVal = (id: string, value: number) =>
    setReps(reputation.map((r) => (r.id === id ? { ...r, value } : r)));

  return (
    <Panel title="Reputation" eyebrow="Per-player standing">
      {/* Tracks */}
      {reputation.length === 0 ? (
        <p className="text-sm text-ink-faint">
          No reputation tracked yet. Add a hero (or a custom name) below.
        </p>
      ) : (
        <ul className="space-y-2">
          {reputation.map((r) => {
            const rank = rankFor(r.value, ranks);
            const pct = Math.max(
              0,
              Math.min(100, (r.value / Math.max(1, maxRank)) * 100),
            );
            return (
              <li
                key={r.id}
                className="rounded-card border border-parchment-400/50 bg-parchment-100/60 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-display font-semibold text-ink">
                    {r.name}
                  </span>
                  {rank && <Badge tone="brass">{rank.name}</Badge>}
                  <button
                    onClick={() => bump(r.id, -5)}
                    className="rounded-md border border-oxblood/40 px-2 py-0.5 text-xs font-bold text-oxblood hover:bg-oxblood hover:text-parchment-50"
                  >
                    −5
                  </button>
                  <input
                    type="number"
                    value={r.value}
                    onChange={(e) => setVal(r.id, Number(e.target.value) || 0)}
                    className={numInput}
                    aria-label={`${r.name} reputation`}
                  />
                  <button
                    onClick={() => bump(r.id, 5)}
                    className="rounded-md border border-forest/40 px-2 py-0.5 text-xs font-bold text-forest hover:bg-forest hover:text-parchment-50"
                  >
                    +5
                  </button>
                  <button
                    onClick={() => setReps(reputation.filter((x) => x.id !== r.id))}
                    aria-label="Remove track"
                    className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full border border-parchment-400/60 bg-parchment-300/60">
                  <div
                    className="h-full rounded-full bg-brass transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          aria-label="Add reputation track"
          className="h-9 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none"
        >
          <option value="">Add a track…</option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="custom">Custom name…</option>
        </select>
        <Button variant="secondary" size="sm" onClick={addTrack} disabled={!pick}>
          <PlusIcon className="h-4 w-4" /> Add
        </Button>
      </div>

      {/* Ranks ladder + Rewards */}
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <Ladder
          title="Rank ladder"
          rows={ranks.map((r) => ({ id: r.id, label: r.name, min: r.minRep }))}
          onAdd={() =>
            setRanks([...ranks, { id: newId(), name: "New rank", minRep: 0 }])
          }
          onEdit={(id, label, min) =>
            setRanks(
              ranks.map((r) =>
                r.id === id ? { ...r, name: label, minRep: min } : r,
              ),
            )
          }
          onRemove={(id) => setRanks(ranks.filter((r) => r.id !== id))}
          placeholder="Rank name"
        />
        <Ladder
          title="Rewards & benefits"
          rows={rewards.map((r) => ({ id: r.id, label: r.title, min: r.minRep }))}
          unlockedAt={Math.max(0, ...reputation.map((r) => r.value), 0)}
          onAdd={() =>
            setRewards([...rewards, { id: newId(), title: "New reward", minRep: 0 }])
          }
          onEdit={(id, label, min) =>
            setRewards(
              rewards.map((r) =>
                r.id === id ? { ...r, title: label, minRep: min } : r,
              ),
            )
          }
          onRemove={(id) => setRewards(rewards.filter((r) => r.id !== id))}
          placeholder="Reward / benefit"
        />
      </div>
    </Panel>
  );
}

function Ladder({
  title,
  rows,
  unlockedAt,
  onAdd,
  onEdit,
  onRemove,
  placeholder,
}: {
  title: string;
  rows: { id: string; label: string; min: number }[];
  unlockedAt?: number;
  onAdd: () => void;
  onEdit: (id: string, label: string, min: number) => void;
  onRemove: (id: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
          {title}
        </p>
        <Button variant="secondary" size="sm" onClick={onAdd}>
          <PlusIcon className="h-4 w-4" /> Add
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-faint">None yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => {
            const unlocked = unlockedAt !== undefined && unlockedAt >= row.min;
            return (
              <li
                key={row.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5",
                  unlocked
                    ? "border-forest/40 bg-forest/5"
                    : "border-parchment-400/50 bg-parchment-100/50",
                )}
              >
                <input
                  type="number"
                  defaultValue={row.min}
                  key={`min-${row.id}-${row.min}`}
                  onBlur={(e) =>
                    onEdit(row.id, row.label, Number(e.target.value) || 0)
                  }
                  className="h-8 w-16 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-center text-sm font-bold text-ink focus:border-brass focus:outline-none"
                  aria-label="Threshold"
                />
                <input
                  defaultValue={row.label}
                  key={`label-${row.id}`}
                  onBlur={(e) => onEdit(row.id, e.target.value, row.min)}
                  placeholder={placeholder}
                  className="min-w-0 flex-1 rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none"
                />
                {unlocked && <Badge tone="forest">✓</Badge>}
                <button
                  onClick={() => onRemove(row.id)}
                  aria-label="Remove"
                  className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
