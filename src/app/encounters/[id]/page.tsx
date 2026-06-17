"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextField, TextArea } from "@/components/ui/Field";
import { nowISO } from "@/lib/domain/ids";
import {
  ChevronLeftIcon,
  MinusIcon,
  PlusIcon,
  SwordsIcon,
  TrashIcon,
} from "@/components/ui/icons";
import {
  useCombat,
  useEncounters,
  usePermissions,
  useStatBlocks,
} from "@/lib/data/hooks";
import {
  combatantsFromEncounter,
  sortByInitiative,
} from "@/lib/combat/factory";
import type { EncounterEntry } from "@/lib/domain/types";
import { newId } from "@/lib/domain/ids";

export default function EncounterDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const { items, loading, update } = useEncounters();
  const { items: statBlocks } = useStatBlocks();
  const { set: setCombat } = useCombat();
  const canManage = usePermissions().canEdit("encounters");
  const encounter = items.find((e) => e.id === id);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [entries, setEntries] = useState<EncounterEntry[]>([]);
  const [selectedBlock, setSelectedBlock] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (encounter && !ready) {
      setName(encounter.name);
      setDescription(encounter.description ?? "");
      setEntries(encounter.entries);
      setReady(true);
    }
  }, [encounter, ready]);

  if (loading && !encounter) {
    return (
      <div className="animate-fade-in space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-parchment-300/70" />
        <div className="h-40 animate-pulse rounded-card bg-parchment-200/70" />
      </div>
    );
  }

  if (!encounter) {
    return (
      <EmptyState
        icon={<SwordsIcon />}
        title="Encounter not found"
        action={
          <Link href="/encounters">
            <Button variant="secondary">Back to Encounters</Button>
          </Link>
        }
      />
    );
  }

  function persist(nextEntries = entries) {
    void update(encounter!.id, {
      name: name.trim() || "Untitled Encounter",
      description,
      entries: nextEntries,
    });
  }

  function addEntry() {
    const block = statBlocks.find((s) => s.id === selectedBlock) ?? statBlocks[0];
    if (!block) return;
    const existing = entries.find((e) => e.statBlockId === block.id);
    let next: EncounterEntry[];
    if (existing) {
      next = entries.map((e) =>
        e.id === existing.id ? { ...e, count: e.count + 1 } : e,
      );
    } else {
      next = [
        ...entries,
        { id: newId(), statBlockId: block.id, label: block.name, count: 1 },
      ];
    }
    setEntries(next);
    persist(next);
  }

  function setCount(entryId: string, delta: number) {
    const next = entries
      .map((e) =>
        e.id === entryId ? { ...e, count: Math.max(0, e.count + delta) } : e,
      )
      .filter((e) => e.count > 0);
    setEntries(next);
    persist(next);
  }

  function removeEntry(entryId: string) {
    const next = entries.filter((e) => e.id !== entryId);
    setEntries(next);
    persist(next);
  }

  function sendToWarTable() {
    persist();
    const combatants = sortByInitiative(
      combatantsFromEncounter({ ...encounter!, entries }, statBlocks),
    );
    void setCombat({
      id: "combat",
      active: true,
      round: 1,
      turnIndex: 0,
      combatants,
      encounterName: name,
      updatedAt: nowISO(),
    });
    router.push("/combat");
  }

  const total = entries.reduce((n, e) => n + e.count, 0);

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href="/encounters"
          className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-oxblood"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Encounters
        </Link>
        {canManage && (
          <Button onClick={sendToWarTable} disabled={total === 0}>
            <SwordsIcon className="h-4 w-4" /> Send to War Table
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Encounter Details">
          <div className="space-y-4">
            <TextField
              label="Name"
              value={name}
              disabled={!canManage}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => persist()}
            />
            <TextArea
              label="Description"
              rows={5}
              value={description}
              disabled={!canManage}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => persist()}
            />
          </div>
        </Panel>

        <Panel
          title="Combatants"
          eyebrow={`${total} total`}
          action={<Badge tone="oxblood">{entries.length} kinds</Badge>}
        >
          {canManage && (
            <div className="mb-4 flex gap-2">
              <select
                value={selectedBlock}
                onChange={(e) => setSelectedBlock(e.target.value)}
                aria-label="Choose a stat block"
                className="flex-1 rounded-md border border-parchment-400 bg-parchment-50 px-3 py-2 text-ink focus:border-brass focus:outline-none"
              >
                <option value="">
                  {statBlocks.length ? "Choose a creature…" : "No stat blocks — add some in the Bestiary"}
                </option>
                {statBlocks.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (CR {s.challengeRating ?? "—"})
                  </option>
                ))}
              </select>
              <Button variant="secondary" onClick={addEntry} disabled={statBlocks.length === 0}>
                <PlusIcon className="h-4 w-4" /> Add
              </Button>
            </div>
          )}

          {entries.length === 0 ? (
            <p className="text-sm text-ink-faint">
              No combatants yet. Add creatures from your bestiary.
            </p>
          ) : (
            <ul className="space-y-2">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 rounded-card border border-parchment-400/60 bg-parchment-100/70 p-2"
                >
                  <span className="flex-1 font-display text-sm font-semibold text-ink">
                    {entry.label}
                  </span>
                  {canManage ? (
                    <>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setCount(entry.id, -1)}
                          aria-label="Decrease count"
                          className="rounded-md border border-parchment-400 p-1 hover:border-oxblood hover:text-oxblood"
                        >
                          <MinusIcon className="h-3.5 w-3.5" />
                        </button>
                        <span className="numerals w-7 text-center font-display font-bold text-ink">
                          {entry.count}
                        </span>
                        <button
                          onClick={() => setCount(entry.id, 1)}
                          aria-label="Increase count"
                          className="rounded-md border border-parchment-400 p-1 hover:border-brass hover:text-brass-dark"
                        >
                          <PlusIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        onClick={() => removeEntry(entry.id)}
                        aria-label={`Remove ${entry.label}`}
                        className="ml-1 rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <span className="numerals font-display font-bold text-ink">
                      ×{entry.count}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
