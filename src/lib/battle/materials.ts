import { nowISO } from "@/lib/domain/ids";
import type { BattleBuild } from "@/lib/domain/types";

/** A paintable terrain material with its look + tactical hints. */
export interface Material {
  id: string;
  name: string;
  /** Base fill colour. */
  color: string;
  /** Secondary colour for procedural grain/variation. */
  grain: string;
  blocksMove?: boolean;
  difficult?: boolean;
  /** Rendering style hint. */
  look?: "floor" | "rough" | "liquid" | "smooth";
}

export const MATERIALS: Material[] = [
  { id: "stone", name: "Stone floor", color: "#8d8a82", grain: "#74716a", look: "floor" },
  { id: "flagstone", name: "Flagstone", color: "#9a9389", grain: "#7e776d", look: "floor" },
  { id: "cobble", name: "Cobblestone", color: "#6f6a63", grain: "#56524b", look: "rough" },
  { id: "wood", name: "Wood plank", color: "#9c7245", grain: "#7c5a33", look: "floor" },
  { id: "carpet", name: "Carpet", color: "#7a3b3b", grain: "#642f2f", look: "smooth" },
  { id: "dirt", name: "Dirt", color: "#7c6243", grain: "#675036", look: "rough" },
  { id: "grass", name: "Grass", color: "#5f8a4a", grain: "#4c7239", look: "rough" },
  { id: "sand", name: "Sand", color: "#d9c48a", grain: "#c6af72", look: "smooth" },
  { id: "snow", name: "Snow", color: "#e9eef3", grain: "#d2dde6", look: "smooth" },
  { id: "ice", name: "Ice", color: "#bcd6e6", grain: "#9fc2d8", look: "smooth" },
  { id: "mud", name: "Mud", color: "#5c4a32", grain: "#493a26", difficult: true, look: "rough" },
  { id: "rubble", name: "Rubble", color: "#857f76", grain: "#655f57", difficult: true, look: "rough" },
  { id: "water", name: "Water (shallow)", color: "#4a7fb0", grain: "#5e93c2", difficult: true, look: "liquid" },
  { id: "deep", name: "Water (deep)", color: "#2c4f74", grain: "#3a608a", blocksMove: true, look: "liquid" },
  { id: "lava", name: "Lava", color: "#b8401f", grain: "#e8761f", blocksMove: true, look: "liquid" },
];

export const MATERIAL_MAP = new Map(MATERIALS.map((m) => [m.id, m]));

/** A theme: a default base fill + the materials surfaced in the palette. */
export interface BattleTheme {
  id: string;
  name: string;
  base: string;
  palette: string[];
}

export const THEMES: BattleTheme[] = [
  { id: "dungeon", name: "Dungeon", base: "stone", palette: ["stone", "flagstone", "cobble", "rubble", "carpet", "wood", "water", "lava"] },
  { id: "cave", name: "Cavern", base: "dirt", palette: ["dirt", "rubble", "stone", "mud", "water", "deep", "lava"] },
  { id: "tavern", name: "Tavern", base: "wood", palette: ["wood", "stone", "carpet", "cobble", "dirt"] },
  { id: "forest", name: "Forest", base: "grass", palette: ["grass", "dirt", "mud", "water", "stone", "sand"] },
  { id: "town", name: "Town", base: "cobble", palette: ["cobble", "stone", "dirt", "grass", "wood", "water"] },
  { id: "frozen", name: "Frozen", base: "snow", palette: ["snow", "ice", "stone", "water", "deep", "dirt"] },
  { id: "desert", name: "Desert", base: "sand", palette: ["sand", "stone", "rubble", "cobble", "water"] },
];

export const THEME_MAP = new Map(THEMES.map((t) => [t.id, t]));

export function emptyBattleBuild(
  opts?: Partial<Pick<BattleBuild, "grid" | "cols" | "rows" | "theme">>,
): BattleBuild {
  const cols = opts?.cols ?? 30;
  const rows = opts?.rows ?? 22;
  return {
    grid: opts?.grid ?? "square",
    cols,
    rows,
    cellPx: 64,
    theme: opts?.theme ?? "dungeon",
    tiles: new Array(cols * rows).fill(""),
    props: [],
    updatedAt: nowISO(),
  };
}
