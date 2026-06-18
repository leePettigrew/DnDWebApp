"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useFactions } from "@/lib/data/hooks";
import {
  FACTION_RELATIONS,
  type FactionRelationKind,
} from "@/lib/domain/types";

const CELL: Record<FactionRelationKind, string> = {
  allied: "bg-forest",
  friendly: "bg-brass",
  neutral: "bg-parchment-400",
  rival: "bg-arcane",
  war: "bg-oxblood",
};

function abbr(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function FactionRelationMap() {
  const { items: factions } = useFactions();
  const [open, setOpen] = useState(false);

  if (factions.length < 2) return null;

  return (
    <Panel
      title="Relationship Map"
      eyebrow="The web at a glance"
      action={
        <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show"}
        </Button>
      }
    >
      {!open ? (
        <p className="text-sm text-ink-faint">
          A grid of how every faction relates to every other. Click Show.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto pb-1">
            <table className="border-separate border-spacing-1">
              <thead>
                <tr>
                  <th />
                  {factions.map((c) => (
                    <th
                      key={c.id}
                      title={c.name}
                      className="px-1 pb-1 text-[0.6rem] font-bold text-ink-faint"
                    >
                      {abbr(c.name)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {factions.map((rowF) => (
                  <tr key={rowF.id}>
                    <td className="max-w-32 truncate pr-2 text-right text-xs font-semibold text-ink">
                      {rowF.name}
                    </td>
                    {factions.map((colF) => {
                      if (rowF.id === colF.id) {
                        return (
                          <td key={colF.id}>
                            <div className="h-6 w-6 rounded bg-ink/15" />
                          </td>
                        );
                      }
                      const rel = (rowF.relationships ?? []).find(
                        (r) => r.otherFactionId === colF.id,
                      );
                      const label = rel
                        ? FACTION_RELATIONS.find((x) => x.key === rel.kind)?.label
                        : "—";
                      return (
                        <td key={colF.id}>
                          <div
                            title={`${rowF.name} ↔ ${colF.name}: ${label}`}
                            className={cn(
                              "h-6 w-6 rounded border border-parchment-400/40",
                              rel ? CELL[rel.kind] : "bg-parchment-200/60",
                            )}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {FACTION_RELATIONS.map((r) => (
              <span
                key={r.key}
                className="flex items-center gap-1.5 text-xs text-ink-soft"
              >
                <span className={cn("h-3 w-3 rounded", CELL[r.key])} />
                {r.label}
              </span>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}
