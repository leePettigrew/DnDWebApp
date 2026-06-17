import { COMPENDIUM_ITEMS } from "@/lib/compendium";
import type { CompendiumItem } from "@/lib/compendium";

/** Treasure & loot generation — rough 5e-flavored tables, client-side only. */

function d(n: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) total += 1 + Math.floor(Math.random() * sides);
  return total;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function chance(p: number): boolean {
  return Math.random() < p;
}

export const LOOT_TIERS = [
  { key: "1-4", label: "CR 1–4" },
  { key: "5-10", label: "CR 5–10" },
  { key: "11-16", label: "CR 11–16" },
  { key: "17-20", label: "CR 17–20" },
] as const;
export type LootTier = (typeof LOOT_TIERS)[number]["key"];

export interface Coins {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface LootResult {
  coins: Coins;
  valuables: string[];
  magicItems: CompendiumItem[];
}

const GEMS = [
  "Azurite (10 gp)",
  "Banded agate (10 gp)",
  "Bloodstone (50 gp)",
  "Citrine (50 gp)",
  "Amber (100 gp)",
  "Garnet (100 gp)",
  "Pearl (100 gp)",
  "Topaz (500 gp)",
  "Black opal (1,000 gp)",
  "Diamond (5,000 gp)",
];
const ART = [
  "Silver ewer (25 gp)",
  "Carved bone statuette (25 gp)",
  "Gold bracelet (250 gp)",
  "Silver chalice set with moonstones (250 gp)",
  "Gold circlet set with bloodstones (750 gp)",
  "Jeweled gold crown (7,500 gp)",
];

const MAGIC_POOL = COMPENDIUM_ITEMS.filter(
  (i) => i.category === "magic" || i.name.toLowerCase().includes("potion"),
);
const COMMON_MAGIC = MAGIC_POOL.filter(
  (i) => !i.rarity || i.rarity === "common",
);

function coinsFor(tier: LootTier): Coins {
  switch (tier) {
    case "1-4":
      return { cp: d(5, 6), sp: d(4, 6), ep: 0, gp: d(3, 6), pp: 0 };
    case "5-10":
      return { cp: 0, sp: d(6, 6) * 10, ep: 0, gp: d(2, 6) * 10, pp: d(1, 6) };
    case "11-16":
      return { cp: 0, sp: 0, ep: 0, gp: d(4, 6) * 100, pp: d(1, 6) * 10 };
    case "17-20":
      return { cp: 0, sp: 0, ep: 0, gp: d(2, 6) * 1000, pp: d(2, 6) * 100 };
  }
}

export function generateLoot(tier: LootTier): LootResult {
  const coins = coinsFor(tier);

  const valuables: string[] = [];
  const valuableOdds: Record<LootTier, { p: number; n: number }> = {
    "1-4": { p: 0.25, n: 1 },
    "5-10": { p: 0.5, n: 2 },
    "11-16": { p: 0.75, n: 3 },
    "17-20": { p: 0.9, n: 4 },
  };
  const vo = valuableOdds[tier];
  if (chance(vo.p)) {
    const count = 1 + Math.floor(Math.random() * vo.n);
    for (let i = 0; i < count; i++) {
      valuables.push(chance(0.5) ? pick(GEMS) : pick(ART));
    }
  }

  const magicItems: CompendiumItem[] = [];
  const magicOdds: Record<LootTier, { p: number; n: number; rare: boolean }> = {
    "1-4": { p: 0.3, n: 1, rare: false },
    "5-10": { p: 0.5, n: 1, rare: true },
    "11-16": { p: 0.7, n: 2, rare: true },
    "17-20": { p: 0.9, n: 2, rare: true },
  };
  const mo = magicOdds[tier];
  if (chance(mo.p)) {
    const pool = mo.rare ? MAGIC_POOL : COMMON_MAGIC;
    const count = 1 + Math.floor(Math.random() * mo.n);
    for (let i = 0; i < count; i++) magicItems.push(pick(pool));
  }

  return { coins, valuables, magicItems };
}

export function coinsToString(c: Coins): string {
  const parts: string[] = [];
  if (c.pp) parts.push(`${c.pp.toLocaleString()} pp`);
  if (c.gp) parts.push(`${c.gp.toLocaleString()} gp`);
  if (c.ep) parts.push(`${c.ep.toLocaleString()} ep`);
  if (c.sp) parts.push(`${c.sp.toLocaleString()} sp`);
  if (c.cp) parts.push(`${c.cp.toLocaleString()} cp`);
  return parts.length ? parts.join(", ") : "no coins";
}
