"use client";

import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Portrait } from "@/components/ui/Portrait";
import { cn } from "@/components/ui/cn";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { useFactions, useQuests } from "@/lib/data/hooks";
import {
  FACTION_RELATIONS,
  FACTION_STANDINGS,
  FACTION_TYPES,
  type Faction,
  type FactionRelationKind,
} from "@/lib/domain/types";
import { STANDING_TONE } from "./FactionDetail";
import { FactionEconomySummary } from "./FactionEconomySummary";

const REL_TONE: Record<
  FactionRelationKind,
  "neutral" | "brass" | "oxblood" | "forest" | "arcane"
> = {
  allied: "forest",
  friendly: "brass",
  neutral: "neutral",
  rival: "arcane",
  war: "oxblood",
};

function Dots({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            i <= value ? "bg-brass" : "bg-parchment-300",
          )}
        />
      ))}
    </span>
  );
}

/** Read-only faction dossier shown to players — no edit controls, no DM-only
 *  sections (secrets, agendas). Hidden factions never reach players at all. */
export function FactionReadView({
  faction: f,
  onBack,
}: {
  faction: Faction;
  onBack: () => void;
}) {
  const { items: factions } = useFactions();
  const { items: quests } = useQuests();
  const ranks = [...(f.ranks ?? [])].sort((a, b) => a.minRep - b.minRep);
  const rewards = [...(f.rewards ?? [])].sort((a, b) => a.minRep - b.minRep);
  const rankFor = (v: number) => {
    let best = "";
    for (const r of ranks) if (v >= r.minRep) best = r.name;
    return best;
  };
  const nameOf = (id: string) =>
    factions.find((x) => x.id === id)?.name ?? "Unknown";
  const linkedQuests = quests.filter((q) => (f.questIds ?? []).includes(q.id));

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-oxblood"
      >
        <ChevronLeftIcon className="h-4 w-4" /> All factions
      </button>

      <div className={cn("surface-raised border-l-4 p-4", STANDING_TONE[f.standing])}>
        <div className="flex items-center gap-4">
          <Portrait src={f.symbolUrl} name={f.name} className="h-16 w-16 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold text-ink">{f.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
              {f.type && (
                <Badge tone="brass">
                  {FACTION_TYPES.find((t) => t.key === f.type)?.label}
                </Badge>
              )}
              <span className="capitalize">
                {FACTION_STANDINGS.find((s) => s.key === f.standing)?.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      <Panel title="About">
        {f.description && (
          <p className="whitespace-pre-line text-sm text-ink-soft">
            {f.description}
          </p>
        )}
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {f.hq && (
            <div>
              <dt className="inline font-semibold text-brass-dark">HQ: </dt>
              <dd className="inline text-ink-soft">{f.hq}</dd>
            </div>
          )}
          {f.goals && (
            <div>
              <dt className="inline font-semibold text-brass-dark">Goals: </dt>
              <dd className="inline text-ink-soft">{f.goals}</dd>
            </div>
          )}
          {f.power ? (
            <div className="flex items-center gap-2">
              <dt className="font-semibold text-brass-dark">Power</dt>
              <Dots value={f.power} />
            </div>
          ) : null}
          {f.wealth ? (
            <div className="flex items-center gap-2">
              <dt className="font-semibold text-brass-dark">Wealth</dt>
              <Dots value={f.wealth} />
            </div>
          ) : null}
        </dl>
      </Panel>

      {(f.reputation?.length ?? 0) > 0 && (
        <Panel title="Reputation">
          <ul className="space-y-2">
            {f.reputation!.map((r) => {
              const rank = rankFor(r.value);
              const unlocked = rewards.filter((rw) => r.value >= rw.minRep);
              return (
                <li
                  key={r.id}
                  className="rounded-card border border-parchment-400/50 bg-parchment-100/60 p-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-display font-semibold text-ink">
                      {r.name}
                    </span>
                    {rank && <Badge tone="brass">{rank}</Badge>}
                    <span
                      className={cn(
                        "numerals font-bold",
                        r.value < 0 ? "text-oxblood" : "text-forest",
                      )}
                    >
                      {r.value}
                    </span>
                  </div>
                  {unlocked.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {unlocked.map((rw) => (
                        <Badge key={rw.id} tone="forest">
                          {rw.title}
                        </Badge>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {(f.members?.length ?? 0) > 0 && (
        <Panel title="Members">
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {[...f.members!]
              .sort((a, b) => (b.leader ? 1 : 0) - (a.leader ? 1 : 0))
              .map((m) => (
                <li key={m.id} className="text-sm text-ink-soft">
                  {m.leader && <span className="text-brass-dark">★ </span>}
                  <span className="font-semibold text-ink">{m.name}</span>
                  {m.role && <span className="text-ink-faint"> — {m.role}</span>}
                </li>
              ))}
          </ul>
        </Panel>
      )}

      {(f.relationships?.length ?? 0) > 0 && (
        <Panel title="Relationships">
          <div className="flex flex-wrap gap-2">
            {f.relationships!.map((r) => (
              <Badge key={r.id} tone={REL_TONE[r.kind]}>
                {nameOf(r.otherFactionId)} ·{" "}
                {FACTION_RELATIONS.find((x) => x.key === r.kind)?.label}
              </Badge>
            ))}
          </div>
        </Panel>
      )}

      <FactionEconomySummary faction={f} />

      {linkedQuests.length > 0 && (
        <Panel title="Quests">
          <ul className="space-y-1.5">
            {linkedQuests.map((q) => (
              <li
                key={q.id}
                className="flex items-center gap-2 text-sm text-ink-soft"
              >
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
                {q.title}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {(f.history?.length ?? 0) > 0 && (
        <Panel title="History">
          <ul className="space-y-1.5">
            {f.history!.map((e) => (
              <li key={e.id} className="text-sm text-ink-soft">
                {e.date && (
                  <span className="numerals mr-2 text-xs font-semibold text-brass-dark">
                    {e.date}
                  </span>
                )}
                {e.text}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {f.notes && (
        <Panel title="Notes">
          <p className="whitespace-pre-line text-sm text-ink-soft">{f.notes}</p>
        </Panel>
      )}
    </div>
  );
}
