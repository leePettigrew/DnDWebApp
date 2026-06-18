export interface Biome {
  id: number;
  name: string;
  /** Base terrain color (hex). */
  color: string;
}

/** Terrain biomes (index === id). Ocean is implied below sea level. */
export const BIOMES: Biome[] = [
  { id: 0, name: "Ocean", color: "#27506e" },
  { id: 1, name: "Beach", color: "#dccfa0" },
  { id: 2, name: "Grass", color: "#6f9450" },
  { id: 3, name: "Forest", color: "#3f6b3a" },
  { id: 4, name: "Hills", color: "#86864e" },
  { id: 5, name: "Mountain", color: "#8c857a" },
  { id: 6, name: "Snow", color: "#e9eef2" },
  { id: 7, name: "Desert", color: "#d8be7e" },
  { id: 8, name: "Swamp", color: "#4b5a3b" },
  { id: 9, name: "Tundra", color: "#a9b6a8" },
];

export const BIOME_BY_ID = new Map(BIOMES.map((b) => [b.id, b]));

/** Paintable biomes (exclude Ocean — it's derived from sea level). */
export const PAINT_BIOMES = BIOMES.filter((b) => b.id !== 0);

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const BIOME_RGB: Record<number, [number, number, number]> = Object.fromEntries(
  BIOMES.map((b) => [b.id, hexToRgb(b.color)]),
);
