"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Portrait } from "@/components/ui/Portrait";
import { cn } from "@/components/ui/cn";
import { PlusIcon, HelmIcon } from "@/components/ui/icons";
import { useCampaigns, useFactions, useStatBlocks } from "@/lib/data/hooks";
import { newFactionInput } from "@/lib/domain/factories";
import { FACTION_STANDINGS, FACTION_TYPES } from "@/lib/domain/types";
import { FactionDetail, STANDING_TONE } from "./FactionDetail";

export function FactionRoster() {
  const { items: campaigns } = useCampaigns();
  const { items: factions, create, update, remove } = useFactions();
  const { items: statBlocks } = useStatBlocks();
  const npcs = statBlocks.filter((s) => s.kind === "npc");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = factions.find((f) => f.id === selectedId) ?? null;

  async function add() {
    const created = await create(newFactionInput(campaigns[0]?.id));
    setSelectedId(created.id);
  }

  if (selected) {
    return (
      <FactionDetail
        faction={selected}
        onUpdate={(p) => update(selected.id, p)}
        onDelete={() => {
          remove(selected.id);
          setSelectedId(null);
        }}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">Factions</h2>
        <Button size="sm" onClick={add}>
          <PlusIcon className="h-4 w-4" /> New faction
        </Button>
      </div>

      {factions.length === 0 ? (
        <Panel tone="flat">
          <EmptyState
            icon={<HelmIcon />}
            title="No factions yet"
            description="Track the powers, guilds, and cults your party deals with — their reputation, rivals, members, and schemes."
          />
        </Panel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {factions.map((f) => (
            <button
              key={f.id}
              onClick={() => setSelectedId(f.id)}
              className={cn(
                "surface-raised border-l-4 p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-raised",
                STANDING_TONE[f.standing],
              )}
            >
              <div className="flex items-center gap-3">
                <Portrait
                  src={f.symbolUrl}
                  name={f.name}
                  className="h-11 w-11 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-base font-bold text-ink">
                      {f.name}
                    </span>
                    {f.hidden && <Badge tone="oxblood">Hidden</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
                    {f.type && (
                      <Badge tone="brass">
                        {FACTION_TYPES.find((t) => t.key === f.type)?.label ??
                          f.type}
                      </Badge>
                    )}
                    <span className="capitalize">
                      {FACTION_STANDINGS.find((s) => s.key === f.standing)
                        ?.label ?? f.standing}
                    </span>
                    {f.power ? (
                      <span className="numerals">· Power {f.power}/5</span>
                    ) : null}
                    {f.agendas?.length ? (
                      <span>· {f.agendas.length} agenda</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* NPCs live in the bestiary; surface them here for the roster. */}
      <Panel
        title="NPCs"
        eyebrow="From the bestiary"
        action={
          <Link
            href="/bestiary"
            className="text-xs font-semibold text-brass-dark hover:underline"
          >
            Manage in Bestiary →
          </Link>
        }
      >
        {npcs.length === 0 ? (
          <p className="text-sm text-ink-faint">
            No NPCs yet. Forge one in DM Tools or add one in the Bestiary.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {npcs.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/bestiary/${n.id}`}
                  className="flex items-center gap-3 rounded-card border border-parchment-400/50 bg-parchment-100/60 p-2 hover:border-brass/60"
                >
                  <Portrait src={n.portraitUrl} name={n.name} className="h-10 w-10" />
                  <span className="min-w-0">
                    <span className="block truncate font-display text-sm font-semibold text-ink">
                      {n.name}
                    </span>
                    <span className="block truncate text-xs text-ink-faint">
                      {n.type}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
