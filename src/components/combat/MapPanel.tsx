"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MapIcon, ChevronRightIcon } from "@/components/ui/icons";
import { cn } from "@/components/ui/cn";
import { MapBoard, snapTokenPos, tokenCells } from "./MapBoard";
import { WarTableView } from "./WarTableView";
import {
  useActiveCampaign,
  useCharacters,
  useCombat,
  useCurrentUser,
  useMaps,
  useStatBlocks,
} from "@/lib/data/hooks";
import { newId } from "@/lib/domain/ids";
import { parseSpeedFeet, parseTokenSize } from "@/lib/combat/attacks";
import { TOKEN_SIZE_CELLS } from "@/lib/domain/types";
import type { Combatant, MapToken } from "@/lib/domain/types";

const PC_COLOR = "#86b58a";
const NPC_COLOR = "#d6794a";

/** One-click atmosphere: each sets the map's ambient light level + color tint. */
const LIGHT_PRESETS = [
  { id: "day", label: "Daylight", level: "bright", tint: "", hint: "Bright, no tint" },
  { id: "dusk", label: "Dusk", level: "dim", tint: "#2a3358", hint: "Dim, cool blue" },
  { id: "torch", label: "Torchlit", level: "dim", tint: "#6b3d12", hint: "Dim, warm amber — torches matter" },
  { id: "pitch", label: "Pitch black", level: "dark", tint: "#0a0a14", hint: "Dark — sight needs light or darkvision" },
] as const;

export function MapPanel() {
  const { value: combat, update: updateCombat } = useCombat();
  const { items: maps, update: updateMap } = useMaps();
  const { items: characters } = useCharacters();
  const { items: statBlocks } = useStatBlocks();
  const { role } = useActiveCampaign();
  const user = useCurrentUser();
  const isDM = role !== "player";
  const [open, setOpen] = useState(true);
  const [immersive, setImmersive] = useState(false);

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
    const ox = activeMap.gridOffsetX ?? 0;
    const oy = activeMap.gridOffsetY ?? 0;
    const ownerOf = new Map(characters.map((c) => [c.id, c.ownerId]));
    const existing = activeMap.tokens ?? [];
    const byCombatant = new Map(
      existing.filter((t) => t.combatantId).map((t) => [t.combatantId, t]),
    );
    // Deploy onto whole cells: mediums sit dead-center, Large/Gargantuan on
    // the intersection their 2×2/4×4 footprint centers on. Each token
    // occupies its own cells; rows advance by the tallest creature placed.
    const PER_ROW_CELLS = 10;
    let col = 1;
    let row = 1;
    let rowSpan = 1;
    const next: MapToken[] = [];
    const make = (c: Combatant): MapToken => {
      // Pull identity from the source entity: PCs bring their sheet's
      // portrait + speed; monsters bring stat-block art, size and speed.
      const ch = c.isPC ? characters.find((x) => x.id === c.sourceId) : undefined;
      const sb = !c.isPC ? statBlocks.find((x) => x.id === c.sourceId) : undefined;
      const size = sb ? parseTokenSize(sb.size) : "medium";
      const cells = TOKEN_SIZE_CELLS[size] ?? 1;
      const span = Math.max(1, Math.ceil(cells));
      if (col + span > 1 + PER_ROW_CELLS) {
        col = 1;
        row += rowSpan;
        rowSpan = 1;
      }
      const x = ox + (col + span / 2) * cell;
      const y = oy + (row + span / 2) * cell;
      col += span;
      rowSpan = Math.max(rowSpan, span);
      return {
        id: newId(),
        combatantId: c.id,
        label: c.name,
        x: Math.round(x),
        y: Math.round(y),
        radius: cell * 0.42 * Math.max(1, cells),
        color: c.isPC ? PC_COLOR : NPC_COLOR,
        isPC: c.isPC,
        ownerId: c.isPC && c.sourceId ? ownerOf.get(c.sourceId) : undefined,
        visionRadius: c.isPC ? cell * 12 : 0,
        size,
        speed: ch ? parseSpeedFeet(ch.speed) : parseSpeedFeet(sb?.speed),
        portraitUrl: ch?.portraitUrl || sb?.portraitUrl || undefined,
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

  if (immersive) return <WarTableView onClose={() => setImmersive(false)} />;

  return (
    <Panel
      title="Battle Map"
      eyebrow="The War Table"
      action={
        <div className="flex items-center gap-2">
          {activeMap && (
            <Button size="sm" onClick={() => setImmersive(true)} title="Open the fullscreen War Table">
              ⚔ Enter War Table
            </Button>
          )}
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
              <label className="flex items-center gap-1.5" title="Shift the grid to line the tiles up with the map art">
                offset
                <input
                  type="number"
                  value={activeMap.gridOffsetX ?? 0}
                  onChange={(e) =>
                    updateMap(activeMap.id, { gridOffsetX: Number(e.target.value) || 0 })
                  }
                  aria-label="Grid offset X"
                  className="numerals h-7 w-14 rounded border border-parchment-400 bg-parchment-50 px-1 text-center"
                />
                <input
                  type="number"
                  value={activeMap.gridOffsetY ?? 0}
                  onChange={(e) =>
                    updateMap(activeMap.id, { gridOffsetY: Number(e.target.value) || 0 })
                  }
                  aria-label="Grid offset Y"
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
              <label className="flex items-center gap-1.5" title="Count difficult terrain double when measuring a token's move">
                <input
                  type="checkbox"
                  checked={activeMap.autoTerrainCost ?? false}
                  onChange={(e) =>
                    updateMap(activeMap.id, { autoTerrainCost: e.target.checked })
                  }
                  className="h-4 w-4 accent-brass"
                />
                Auto terrain cost
              </label>
              <label className="flex items-center gap-1.5" title="Tokens can't be dragged through solid walls or closed doors">
                <input
                  type="checkbox"
                  checked={activeMap.enforceWalls ?? false}
                  onChange={(e) =>
                    updateMap(activeMap.id, { enforceWalls: e.target.checked })
                  }
                  className="h-4 w-4 accent-brass"
                />
                Walls block
              </label>
              <label className="flex items-center gap-1.5" title="Per-turn speed budget: warn shows red, block refuses the move">
                Speed
                <select
                  value={activeMap.enforceSpeed ?? "off"}
                  onChange={(e) =>
                    updateMap(activeMap.id, {
                      enforceSpeed: e.target.value as "off" | "warn" | "block",
                    })
                  }
                  className="h-7 rounded border border-parchment-400 bg-parchment-50 px-1 text-sm"
                >
                  <option value="off">Free</option>
                  <option value="warn">Warn</option>
                  <option value="block">Enforce</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                Light
                <select
                  value={activeMap.lightLevel ?? "bright"}
                  onChange={(e) =>
                    updateMap(activeMap.id, {
                      lightLevel: e.target.value as "bright" | "dim" | "dark",
                    })
                  }
                  className="h-7 rounded border border-parchment-400 bg-parchment-50 px-1 text-sm"
                >
                  <option value="bright">Bright</option>
                  <option value="dim">Dim</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
              <div className="flex items-center gap-1">
                <span className="text-[0.7rem] uppercase tracking-wide text-ink-faint">Scene</span>
                {LIGHT_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      updateMap(activeMap.id, { lightLevel: p.level, lightTint: p.tint })
                    }
                    title={p.hint}
                    className="rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-xs font-semibold text-ink-soft hover:bg-parchment-300/60 hover:text-ink"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex flex-wrap gap-1.5">
                <Button variant="secondary" size="sm" onClick={placeCombatants}>
                  Place combatants
                </Button>
                <button
                  onClick={() => {
                    const g = activeMap.gridSize ?? 0;
                    if (!g) return;
                    void updateMap(activeMap.id, {
                      tokens: (activeMap.tokens ?? []).map((t) => {
                        const s = snapTokenPos(
                          { x: t.x, y: t.y },
                          g,
                          tokenCells(t),
                          activeMap.gridOffsetX ?? 0,
                          activeMap.gridOffsetY ?? 0,
                        );
                        return { ...t, x: Math.round(s.x), y: Math.round(s.y) };
                      }),
                    });
                  }}
                  title="Re-center every token onto the current grid"
                  className="rounded-md px-2 py-1 text-xs font-semibold text-ink-faint hover:text-ink"
                >
                  ⌗ Snap tokens
                </button>
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
                <button
                  onClick={() => updateMap(activeMap.id, { lights: [] })}
                  className="rounded-md px-2 py-1 text-xs font-semibold text-ink-faint hover:text-oxblood"
                >
                  Clear lights
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
            {isDM ? " · draw walls (sight blockers), click a door with Move to open/close it, set the Light level to dim/dark and drop torches with the Light tool, lay AoE spell templates, sketch, measure, or ping." : " · use Ruler to measure and Ping to point."}
          </p>
        </div>
      )}
    </Panel>
  );
}
