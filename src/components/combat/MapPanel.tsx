"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MapIcon, ChevronRightIcon } from "@/components/ui/icons";
import { cn } from "@/components/ui/cn";
import { MapBoard } from "./MapBoard";
import {
  useActiveCampaign,
  useCharacters,
  useCombat,
  useCurrentUser,
  useMaps,
} from "@/lib/data/hooks";
import { newId } from "@/lib/domain/ids";
import type { Combatant, MapToken } from "@/lib/domain/types";

const PC_COLOR = "#86b58a";
const NPC_COLOR = "#d6794a";

export function MapPanel() {
  const { value: combat, update: updateCombat } = useCombat();
  const { items: maps, update: updateMap } = useMaps();
  const { items: characters } = useCharacters();
  const { role } = useActiveCampaign();
  const user = useCurrentUser();
  const isDM = role !== "player";
  const [open, setOpen] = useState(true);

  const activeMap = maps.find((m) => m.id === combat?.activeMapId) ?? null;

  function selectMap(id: string) {
    const map = maps.find((m) => m.id === id);
    if (!map) return;
    // Give a fresh map sensible defaults the first time it's opened.
    if (map.gridSize === undefined) {
      void updateMap(id, {
        gridSize: 70,
        feetPerCell: 5,
        showGrid: true,
        fogEnabled: false,
      });
    }
    void updateCombat({ activeMapId: id });
  }

  function placeCombatants() {
    if (!activeMap || !combat) return;
    const cell = activeMap.gridSize ?? 70;
    const ownerOf = new Map(characters.map((c) => [c.id, c.ownerId]));
    const existing = activeMap.tokens ?? [];
    const byCombatant = new Map(
      existing.filter((t) => t.combatantId).map((t) => [t.combatantId, t]),
    );
    let spawn = 0;
    const next: MapToken[] = [];
    const make = (c: Combatant): MapToken => {
      const perRow = 8;
      const x = cell * 1.5 + (spawn % perRow) * cell * 1.2;
      const y = cell * 1.5 + Math.floor(spawn / perRow) * cell * 1.2;
      spawn++;
      return {
        id: newId(),
        combatantId: c.id,
        label: c.name,
        x,
        y,
        radius: cell * 0.42,
        color: c.isPC ? PC_COLOR : NPC_COLOR,
        isPC: c.isPC,
        ownerId: c.isPC && c.sourceId ? ownerOf.get(c.sourceId) : undefined,
        visionRadius: c.isPC ? cell * 12 : 0,
      };
    };
    for (const c of combat.combatants) {
      const ex = byCombatant.get(c.id);
      next.push(ex ? { ...ex, label: c.name, isPC: c.isPC } : make(c));
    }
    // Keep any manually-added tokens (no combatant link).
    existing.filter((t) => !t.combatantId).forEach((t) => next.push(t));
    void updateMap(activeMap.id, { tokens: next });
  }

  // Players with no map set just see a gentle note (collapsed away otherwise).
  if (!isDM && !activeMap) return null;

  return (
    <Panel
      title="Battle Map"
      eyebrow="The War Table"
      action={
        <div className="flex items-center gap-2">
          {isDM && maps.length > 0 && (
            <select
              value={activeMap?.id ?? ""}
              onChange={(e) => selectMap(e.target.value)}
              aria-label="Active map"
              className="rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none"
            >
              <option value="">Choose a map…</option>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-md p-1 text-ink-faint hover:bg-parchment-300/60 hover:text-ink"
            aria-label={open ? "Collapse map" : "Expand map"}
          >
            <ChevronRightIcon
              className={cn("h-5 w-5 transition-transform", open && "rotate-90")}
            />
          </button>
        </div>
      }
    >
      {!open ? (
        <p className="text-sm text-ink-faint">
          {activeMap ? activeMap.name : "No map selected"} — expand to view.
        </p>
      ) : !activeMap ? (
        isDM ? (
          <EmptyState
            icon={<MapIcon />}
            title={maps.length ? "Pick a battle map" : "No maps yet"}
            description={
              maps.length
                ? "Choose a map above to bring it to the War Table."
                : "Create a battle map in the Codex (add an image), then select it here."
            }
            action={
              maps.length === 0 ? (
                <Link href="/codex">
                  <Button variant="secondary" size="sm">
                    Go to Codex → Maps
                  </Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <p className="text-sm text-ink-faint">
            The DM hasn&apos;t set a battle map yet.
          </p>
        )
      ) : (
        <div className="space-y-3">
          {isDM && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-parchment-400/50 bg-parchment-100/50 px-3 py-2 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={activeMap.showGrid ?? false}
                  onChange={(e) =>
                    updateMap(activeMap.id, { showGrid: e.target.checked })
                  }
                  className="h-4 w-4 accent-brass"
                />
                Grid
              </label>
              <label className="flex items-center gap-1.5">
                px/cell
                <input
                  type="number"
                  value={activeMap.gridSize ?? 70}
                  onChange={(e) =>
                    updateMap(activeMap.id, {
                      gridSize: Math.max(8, Number(e.target.value) || 0),
                    })
                  }
                  className="numerals h-7 w-16 rounded border border-parchment-400 bg-parchment-50 px-1 text-center"
                />
              </label>
              <label className="flex items-center gap-1.5">
                ft/cell
                <input
                  type="number"
                  value={activeMap.feetPerCell ?? 5}
                  onChange={(e) =>
                    updateMap(activeMap.id, {
                      feetPerCell: Math.max(1, Number(e.target.value) || 5),
                    })
                  }
                  className="numerals h-7 w-14 rounded border border-parchment-400 bg-parchment-50 px-1 text-center"
                />
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={activeMap.fogEnabled ?? false}
                  onChange={(e) =>
                    updateMap(activeMap.id, { fogEnabled: e.target.checked })
                  }
                  className="h-4 w-4 accent-oxblood"
                />
                Fog of war
              </label>
              <div className="ml-auto flex flex-wrap gap-1.5">
                <Button variant="secondary" size="sm" onClick={placeCombatants}>
                  Place combatants
                </Button>
                <button
                  onClick={() => updateMap(activeMap.id, { tokens: [] })}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-ink-faint hover:text-oxblood"
                >
                  Clear tokens
                </button>
                <button
                  onClick={() => updateMap(activeMap.id, { walls: [], drawings: [] })}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-ink-faint hover:text-oxblood"
                >
                  Clear walls/ink
                </button>
              </div>
            </div>
          )}

          <MapBoard
            map={activeMap}
            combat={combat}
            isDM={isDM}
            userId={user?.id ?? null}
          />

          <p className="text-xs text-ink-faint">
            Scroll to zoom · drag empty space to pan · drag a token to move it
            {isDM ? " · use the tools to draw walls (fog blockers), sketch, measure, or ping." : " · use Ruler to measure and Ping to point."}
          </p>
        </div>
      )}
    </Panel>
  );
}
