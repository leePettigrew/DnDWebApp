import type { WorldMap } from "@/lib/domain/types";
import { encodeBytes } from "./codec";

/** Value-noise + fBm world generation. Heightmaps + biomes from a seed. */

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695040) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, seed: number, octaves: number): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

export function pickBiome(h: number, moisture: number, sea: number): number {
  if (h < sea) return 0; // ocean
  if (h < sea + 0.025) return 1; // beach
  if (h > 0.84) return 6; // snow
  if (h > 0.7) return 5; // mountain
  if (h > 0.56) return 4; // hills
  // lowlands by moisture
  if (moisture < 0.3) return 7; // desert
  if (moisture > 0.72) return h < sea + 0.1 ? 8 : 3; // swamp / forest
  return moisture > 0.5 ? 3 : 2; // forest / grass
}

export interface GenOptions {
  size?: number;
  seed?: number;
  seaLevel?: number;
  /** Continent shape: 0 = open (more land to edges), 1 = island. */
  island?: number;
  scale?: number;
}

export function generateWorld(opts: GenOptions = {}): WorldMap {
  const size = opts.size ?? 128;
  const seed = opts.seed ?? Math.floor(Math.random() * 100000);
  const seaLevel = opts.seaLevel ?? 0.42;
  const island = opts.island ?? 0.7;
  const scale = opts.scale ?? 4;

  const height = new Uint8Array(size * size);
  const biome = new Uint8Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      let h = fbm(nx * scale, ny * scale, seed, 6);
      // Continent falloff toward the edges.
      const dx = nx - 0.5;
      const dy = ny - 0.5;
      const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 1.7);
      h = h - Math.pow(d, 2.2) * 0.62 * island;
      h = Math.max(0, Math.min(1, h * 1.12));
      const m = fbm(nx * scale * 0.8 + 120, ny * scale * 0.8 + 90, seed + 9999, 4);
      const i = y * size + x;
      height[i] = Math.round(h * 255);
      biome[i] = pickBiome(h, m, seaLevel);
    }
  }

  return {
    size,
    height: encodeBytes(height),
    biome: encodeBytes(biome),
    seaLevel,
    milesAcross: 600,
    timeOfDay: 0.5,
    weather: "clear",
    pois: [],
    paths: [],
    regions: [],
    lights: [],
  };
}

/** A blank, flat lowland world (for hand-building). */
export function blankWorld(size = 128): WorldMap {
  const height = new Uint8Array(size * size).fill(120);
  const biome = new Uint8Array(size * size).fill(2); // grass
  return {
    size,
    height: encodeBytes(height),
    biome: encodeBytes(biome),
    seaLevel: 0.42,
    milesAcross: 600,
    timeOfDay: 0.5,
    weather: "clear",
    pois: [],
    paths: [],
    regions: [],
    lights: [],
  };
}
