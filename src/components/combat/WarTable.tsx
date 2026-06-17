"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TextField } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import {
  BookIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SwordsIcon,
  TrashIcon,
} from "@/components/ui/icons";
import { CombatantRow } from "./CombatantRow";
import {
  useCharacters,
  useCombat,
  usePermissions,
  useStatBlocks,
} from "@/lib/data/hooks";
import type { Combatant } from "@/lib/domain/types";
import {
  combatantFromCharacter,
  combatantFromStatBlock,
  manualCombatant,
} from "@/lib/combat/factory";
import * as Combat from "@/lib/combat/state";

/** Shared panel to add a PC, a monster, or a manual combatant. */
function AddCombatants({ onAdd }: { onAdd: (c: Combatant) => void }) {
  const { items: characters } = useCharacters();
  const { items: statBlocks } = useStatBlocks();
  const [tab, setTab] = useState<"pc" | "monster" | "manual">("pc");
  const [selBlock, setSelBlock] = useState("");
  const [manualName, setManualName] = useState("");

  const tabs = [
    { key: "pc" as const, label: "Heroes" },
    { key: "monster" as const, label: "Bestiary" },
    { key: "manual" as const, label: "Manual" },
  ];

  return (
    <div>
      <div className="mb-3 inline-flex gap-1 rounded-card border border-parchment-400/70 bg-parchment-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-semibold transition-colors",
              tab === t.key
                ? "bg-oxblood text-parchment-50"
                : "text-ink-soft hover:bg-parchment-300/60",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pc" && (
        <div className="flex flex-wrap gap-2">
          {characters.length === 0 ? (
            <p className="text-sm text-ink-faint">
              No heroes yet — create some in Heroes.
            </p>
          ) : (
            characters.map((c) => (
              <button
                key={c.id}
                onClick={() => onAdd(combatantFromCharacter(c))}
                className="rounded-card border border-parchment-400/70 bg-parchment-100 px-3 py-1.5 text-sm font-semibold text-ink hover:border-brass hover:shadow-gilt"
              >
                + {c.name}
              </button>
            ))
          )}
        </div>
      )}

      {tab === "monster" && (
        <div className="flex gap-2">
          <select
            value={selBlock}
            onChange={(e) => setSelBlock(e.target.value)}
            aria-label="Choose a creature"
            className="flex-1 rounded-md border border-parchment-400 bg-parchment-50 px-3 py-2 text-ink focus:border-brass focus:outline-none"
          >
            <option value="">
              {statBlocks.length ? "Choose a creature…" : "No stat blocks yet"}
            </option>
            {statBlocks.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (CR {s.challengeRating ?? "—"})
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={() => {
              const block = statBlocks.find((s) => s.id === selBlock);
              if (block) onAdd(combatantFromStatBlock(block));
            }}
            disabled={!selBlock}
          >
            <PlusIcon className="h-4 w-4" /> Add
          </Button>
        </div>
      )}

      {tab === "manual" && (
        <div className="flex items-end gap-2">
          <TextField
            label="Name"
            className="flex-1"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualName.trim()) {
                onAdd(manualCombatant(manualName.trim()));
                setManualName("");
              }
            }}
          />
          <Button
            variant="secondary"
            onClick={() => {
              if (manualName.trim()) {
                onAdd(manualCombatant(manualName.trim()));
                setManualName("");
              }
            }}
          >
            <PlusIcon className="h-4 w-4" /> Add
          </Button>
        </div>
      )}
    </div>
  );
}

export function WarTable() {
  const { value: combat, loading, set } = useCombat();
  const canEdit = usePermissions().canEditCombat;
  const [roster, setRoster] = useState<Combatant[]>([]);
  const [confirmEnd, setConfirmEnd] = useState(false);

  if (loading && !combat) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-64 animate-pulse rounded bg-parchment-300/70" />
        <div className="h-40 animate-pulse rounded-card bg-parchment-200/70" />
      </div>
    );
  }

  // -------- Setup (no active combat) --------
  if (!combat?.active) {
    if (!canEdit) {
      return (
        <Panel title="The War Table" eyebrow="Initiative">
          <EmptyState
            icon={<SwordsIcon />}
            title="No battle underway"
            description="The DM hasn't started combat yet. When they do, the initiative order appears here."
          />
        </Panel>
      );
    }
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Muster the Combatants" eyebrow="Step 1">
          <AddCombatants onAdd={(c) => setRoster((r) => [...r, c])} />
        </Panel>

        <Panel
          title="Initiative Order"
          eyebrow="Step 2 · auto-rolled, editable"
          action={
            roster.length > 0 ? (
              <button
                onClick={() => setRoster([])}
                className="text-xs font-semibold text-ink-faint hover:text-oxblood"
              >
                Clear
              </button>
            ) : undefined
          }
        >
          {roster.length === 0 ? (
            <EmptyState
              icon={<SwordsIcon />}
              title="No combatants staged"
              description="Add heroes and monsters, or send an encounter from the Encounters page."
              action={
                <Link href="/encounters">
                  <Button variant="secondary" size="sm">
                    Go to Encounters
                  </Button>
                </Link>
              }
            />
          ) : (
            <>
              <ul className="space-y-2">
                {[...roster]
                  .sort((a, b) => b.initiative - a.initiative)
                  .map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 rounded-card border border-parchment-400/60 bg-parchment-100/70 p-2"
                    >
                      <input
                        type="number"
                        value={c.initiative}
                        onChange={(e) =>
                          setRoster((r) =>
                            r.map((x) =>
                              x.id === c.id
                                ? { ...x, initiative: Number(e.target.value) || 0 }
                                : x,
                            ),
                          )
                        }
                        aria-label={`Initiative for ${c.name}`}
                        className="numerals h-9 w-14 rounded-md border border-parchment-400 bg-parchment-50 text-center font-bold"
                      />
                      <span className="flex-1 font-display font-semibold text-ink">
                        {c.name}
                      </span>
                      <Badge tone={c.isPC ? "arcane" : "oxblood"}>
                        {c.isPC ? "PC" : "NPC"}
                      </Badge>
                      <button
                        onClick={() =>
                          setRoster((r) => r.filter((x) => x.id !== c.id))
                        }
                        aria-label={`Remove ${c.name}`}
                        className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
              </ul>
              <Button
                size="lg"
                className="mt-4 w-full"
                onClick={() => set(Combat.startCombat(roster))}
              >
                <SwordsIcon className="h-5 w-5" /> Begin Combat
              </Button>
            </>
          )}
        </Panel>
      </div>
    );
  }

  // -------- Active combat --------
  const turnOf = combat.combatants.length
    ? combat.turnIndex + 1
    : 0;

  return (
    <div className="space-y-5">
      {/* Command bar */}
      <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-card border border-brass/50 bg-parchment-50/95 p-3 shadow-gilt backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 flex-col items-center justify-center rounded-card border-2 border-oxblood bg-oxblood/10">
            <span className="text-[0.55rem] uppercase tracking-wide text-oxblood">
              Round
            </span>
            <span className="numerals font-display text-2xl font-bold text-oxblood">
              {combat.round}
            </span>
          </div>
          <div>
            <p className="font-display text-lg font-bold text-ink">
              {combat.encounterName || "Skirmish"}
            </p>
            <p className="numerals text-xs text-ink-faint">
              Turn {turnOf} of {combat.combatants.length}
            </p>
          </div>
        </div>

        {canEdit && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => set(Combat.prevTurn(combat))}
              disabled={combat.combatants.length === 0}
            >
              <ChevronLeftIcon className="h-4 w-4" /> Prev
            </Button>
            <Button
              onClick={() => set(Combat.nextTurn(combat))}
              disabled={combat.combatants.length === 0}
            >
              Next Turn <ChevronRightIcon className="h-4 w-4" />
            </Button>
            <Button variant="danger" onClick={() => setConfirmEnd(true)}>
              End
            </Button>
          </div>
        )}
      </div>

      {/* Initiative list */}
      {combat.combatants.length === 0 ? (
        <EmptyState
          icon={<BookIcon />}
          title="No combatants"
          description="Add some below to get the battle underway."
        />
      ) : (
        <ul className="space-y-2">
          {combat.combatants.map((c, i) => (
            <CombatantRow
              key={c.id}
              combatant={c}
              isActive={i === combat.turnIndex}
              readOnly={!canEdit}
              onDamage={(amt) => set(Combat.applyDamage(combat, c.id, amt))}
              onHeal={(amt) => set(Combat.applyHeal(combat, c.id, amt))}
              onSetTemp={(amt) => set(Combat.setTempHp(combat, c.id, amt))}
              onToggleCondition={(cond) =>
                set(Combat.toggleCondition(combat, c.id, cond))
              }
              onPatch={(patch) => set(Combat.patchCombatant(combat, c.id, patch))}
              onRemove={() => set(Combat.removeCombatant(combat, c.id))}
            />
          ))}
        </ul>
      )}

      {canEdit && (
        <Panel title="Reinforcements" eyebrow="Add mid-fight">
          <AddCombatants onAdd={(c) => set(Combat.addCombatant(combat, c))} />
        </Panel>
      )}

      <ConfirmDialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        onConfirm={() => {
          set(Combat.endCombat());
          setRoster([]);
        }}
        title="End combat?"
        message="This clears the initiative order and round counter. Your heroes, monsters, and encounters are untouched."
        confirmLabel="End combat"
      />
    </div>
  );
}
