"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import { useFactions } from "@/lib/data/hooks";
import {
  FACTION_RELATIONS,
  type Faction,
  type FactionRelationKind,
} from "@/lib/domain/types";

const RELATION_TONE: Record<
  FactionRelationKind,
  "neutral" | "brass" | "oxblood" | "forest" | "arcane"
> = {
  allied: "forest",
  friendly: "brass",
  neutral: "neutral",
  rival: "arcane",
  war: "oxblood",
};

export function FactionRelationships({ faction: f }: { faction: Faction }) {
  const { items: factions, update } = useFactions();
  const rels = f.relationships ?? [];
  const nameOf = (id: string) =>
    factions.find((x) => x.id === id)?.name ?? "Unknown";
  const available = factions.filter(
    (o) => o.id !== f.id && !rels.some((r) => r.otherFactionId === o.id),
  );

  const [otherId, setOtherId] = useState("");
  const [kind, setKind] = useState<FactionRelationKind>("neutral");

  // Keep both sides of a relationship in sync.
  function add() {
    if (!otherId) return;
    update(f.id, {
      relationships: [...rels, { id: newId(), otherFactionId: otherId, kind }],
    });
    const other = factions.find((x) => x.id === otherId);
    if (other && !(other.relationships ?? []).some((r) => r.otherFactionId === f.id)) {
      update(other.id, {
        relationships: [
          ...(other.relationships ?? []),
          { id: newId(), otherFactionId: f.id, kind },
        ],
      });
    }
    setOtherId("");
    setKind("neutral");
  }
  function changeKind(relId: string, oId: string, k: FactionRelationKind) {
    update(f.id, {
      relationships: rels.map((r) => (r.id === relId ? { ...r, kind: k } : r)),
    });
    const other = factions.find((x) => x.id === oId);
    if (other) {
      update(other.id, {
        relationships: (other.relationships ?? []).map((r) =>
          r.otherFactionId === f.id ? { ...r, kind: k } : r,
        ),
      });
    }
  }
  function changeNote(relId: string, note: string) {
    update(f.id, {
      relationships: rels.map((r) => (r.id === relId ? { ...r, note } : r)),
    });
  }
  function remove(relId: string, oId: string) {
    update(f.id, { relationships: rels.filter((r) => r.id !== relId) });
    const other = factions.find((x) => x.id === oId);
    if (other) {
      update(other.id, {
        relationships: (other.relationships ?? []).filter(
          (r) => r.otherFactionId !== f.id,
        ),
      });
    }
  }

  return (
    <Panel title="Relationships" eyebrow="Who they deal with">
      {rels.length === 0 ? (
        <p className="text-sm text-ink-faint">
          No relationships yet. Link this faction to others below — both sides
          stay in sync.
        </p>
      ) : (
        <ul className="space-y-2">
          {rels.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-card border border-parchment-400/50 bg-parchment-100/60 p-2"
            >
              <span className="min-w-32 flex-1 truncate font-display font-semibold text-ink">
                {nameOf(r.otherFactionId)}
              </span>
              <Badge tone={RELATION_TONE[r.kind]}>
                {FACTION_RELATIONS.find((x) => x.key === r.kind)?.label ?? r.kind}
              </Badge>
              <select
                value={r.kind}
                onChange={(e) =>
                  changeKind(r.id, r.otherFactionId, e.target.value as FactionRelationKind)
                }
                aria-label="Relationship"
                className="h-8 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-xs font-semibold text-ink focus:border-brass focus:outline-none"
              >
                {FACTION_RELATIONS.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label}
                  </option>
                ))}
              </select>
              <input
                defaultValue={r.note ?? ""}
                key={`note-${r.id}`}
                onBlur={(e) => changeNote(r.id, e.target.value)}
                placeholder="note (e.g. uneasy truce)"
                className="min-w-32 flex-1 rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none"
              />
              <button
                onClick={() => remove(r.id, r.otherFactionId)}
                aria-label="Remove relationship"
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
            value={otherId}
            onChange={(e) => setOtherId(e.target.value)}
            aria-label="Other faction"
            className="h-9 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none"
          >
            <option value="">Link a faction…</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as FactionRelationKind)}
            aria-label="Relationship kind"
            className="h-9 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm font-semibold text-ink focus:border-brass focus:outline-none"
          >
            {FACTION_RELATIONS.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
          <Button variant="secondary" size="sm" onClick={add} disabled={!otherId}>
            <PlusIcon className="h-4 w-4" /> Link
          </Button>
        </div>
      )}
    </Panel>
  );
}
