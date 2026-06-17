"use client";

import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Portrait } from "@/components/ui/Portrait";
import { cn } from "@/components/ui/cn";
import { PlusIcon, TrashIcon, HelmIcon } from "@/components/ui/icons";
import { useCampaigns, useFactions, useStatBlocks } from "@/lib/data/hooks";
import { newFactionInput } from "@/lib/domain/factories";
import {
  FACTION_STANDINGS,
  type FactionStanding,
} from "@/lib/domain/types";

const STANDING_STYLE: Record<FactionStanding, string> = {
  ally: "border-l-forest",
  friendly: "border-l-brass",
  neutral: "border-l-parchment-400",
  suspicious: "border-l-leather",
  hostile: "border-l-oxblood",
};

const inputClass =
  "w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40";

export function FactionRoster() {
  const { items: campaigns } = useCampaigns();
  const { items: factions, create, update, remove } = useFactions();
  const { items: statBlocks } = useStatBlocks();
  const npcs = statBlocks.filter((s) => s.kind === "npc");

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">Factions</h2>
          <Button
            size="sm"
            onClick={() => void create(newFactionInput(campaigns[0]?.id))}
          >
            <PlusIcon className="h-4 w-4" /> New faction
          </Button>
        </div>

        {factions.length === 0 ? (
          <Panel tone="flat">
            <EmptyState
              icon={<HelmIcon />}
              title="No factions yet"
              description="Track the powers, guilds, and cults your party deals with — and where they stand."
            />
          </Panel>
        ) : (
          factions.map((f) => (
            <div
              key={f.id}
              className={cn(
                "surface-raised border-l-4 p-4",
                STANDING_STYLE[f.standing],
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  defaultValue={f.name}
                  onBlur={(e) =>
                    e.target.value !== f.name &&
                    update(f.id, { name: e.target.value })
                  }
                  className="min-w-48 flex-1 border-b border-transparent bg-transparent font-display text-lg font-bold text-ink hover:border-parchment-400 focus:border-brass focus:outline-none"
                  aria-label="Faction name"
                />
                <select
                  aria-label="Standing"
                  value={f.standing}
                  onChange={(e) =>
                    update(f.id, {
                      standing: e.target.value as FactionStanding,
                    })
                  }
                  className="rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-xs font-semibold text-ink focus:border-brass focus:outline-none"
                >
                  {FACTION_STANDINGS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => remove(f.id)}
                  aria-label="Delete faction"
                  className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>

              <textarea
                defaultValue={f.description}
                onBlur={(e) =>
                  e.target.value !== (f.description ?? "") &&
                  update(f.id, { description: e.target.value })
                }
                rows={2}
                placeholder="Who are they?"
                className={cn(inputClass, "mt-3 resize-y")}
                aria-label="Faction description"
              />
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-xs">
                  <span className="mb-0.5 block font-semibold uppercase tracking-wide text-ink-faint">
                    Goals
                  </span>
                  <input
                    defaultValue={f.goals}
                    onBlur={(e) =>
                      e.target.value !== (f.goals ?? "") &&
                      update(f.id, { goals: e.target.value })
                    }
                    className={inputClass}
                  />
                </label>
                <label className="text-xs">
                  <span className="mb-0.5 block font-semibold uppercase tracking-wide text-ink-faint">
                    Notes
                  </span>
                  <input
                    defaultValue={f.notes}
                    onBlur={(e) =>
                      e.target.value !== (f.notes ?? "") &&
                      update(f.id, { notes: e.target.value })
                    }
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
          ))
        )}
      </div>

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
