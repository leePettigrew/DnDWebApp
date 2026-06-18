import { COMPENDIUM_ITEMS } from "@/lib/compendium";
import type { CompendiumItem } from "@/lib/compendium";
import type { LootCoinSpec, LootTable } from "@/lib/domain/types";

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

/** Editable per-tier loot parameters (overridable global + per-campaign). */
export interface LootTierConfig {
  coins: LootCoinSpec;
  /** Chance (percent 0..100) of any gems/art. */
  valuableChance: number;
  /** Max gems/art when they drop. */
  valuableCount: number;
  /** Chance (percent 0..100) of any magic items. */
  magicChance: number;
  magicCount: number;
  /** Whether rare+ magic items are eligible (else common only). */
  magicRare: boolean;
}
export interface LootConfig {
  tiers: Record<LootTier, LootTierConfig>;
  gems: string[];
  art: string[];
}

/** The built-in loot config (used when nothing's been customised). */
export function defaultLootConfig(): LootConfig {
  const c = (
    count: number,
    sides: number,
    multiplier: number,
  ): LootCoinSpec => ({ count, sides, multiplier, denomination: "gp" });
  return {
    tiers: {
      "1-4": { coins: c(3, 6, 1), valuableChance: 25, valuableCount: 1, magicChance: 30, magicCount: 1, magicRare: false },
      "5-10": { coins: c(2, 6, 10), valuableChance: 50, valuableCount: 2, magicChance: 50, magicCount: 1, magicRare: true },
      "11-16": { coins: c(4, 6, 100), valuableChance: 75, valuableCount: 3, magicChance: 70, magicCount: 2, magicRare: true },
      "17-20": { coins: c(2, 6, 1000), valuableChance: 90, valuableCount: 4, magicChance: 90, magicCount: 2, magicRare: true },
    },
    gems: [...GEMS],
    art: [...ART],
  };
}

/** Merge stored overrides (global, then campaign) over the defaults. */
export function effectiveLootConfig(
  records: { scope: string; data: unknown }[],
): LootConfig {
  const base = defaultLootConfig();
  const apply = (raw: unknown) => {
    const d2 = raw as Partial<LootConfig> | undefined;
    if (!d2) return;
    if (d2.gems?.length) base.gems = d2.gems;
    if (d2.art?.length) base.art = d2.art;
    if (d2.tiers) {
      for (const k of Object.keys(base.tiers) as LootTier[]) {
        if (d2.tiers[k]) base.tiers[k] = { ...base.tiers[k], ...d2.tiers[k] };
      }
    }
  };
  for (const r of records.filter((r) => r.scope === "global")) apply(r.data);
  for (const r of records.filter((r) => r.scope === "campaign")) apply(r.data);
  return base;
}

export function generateLoot(tier: LootTier, config?: LootConfig): LootResult {
  const cfg = config ?? defaultLootConfig();
  const t = cfg.tiers[tier] ?? defaultLootConfig().tiers[tier];

  const coins: Coins = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  if (t.coins.count > 0) {
    coins[t.coins.denomination] +=
      d(t.coins.count, Math.max(2, t.coins.sides)) * (t.coins.multiplier || 1);
  }

  const gems = cfg.gems?.length ? cfg.gems : GEMS;
  const art = cfg.art?.length ? cfg.art : ART;
  const valuables: string[] = [];
  if (chance(t.valuableChance / 100)) {
    const count = 1 + Math.floor(Math.random() * Math.max(1, t.valuableCount));
    for (let i = 0; i < count; i++) {
      valuables.push(chance(0.5) ? pick(gems) : pick(art));
    }
  }

  const magicItems: CompendiumItem[] = [];
  if (chance(t.magicChance / 100)) {
    const pool = t.magicRare ? MAGIC_POOL : COMMON_MAGIC;
    const count = 1 + Math.floor(Math.random() * Math.max(1, t.magicCount));
    for (let i = 0; i < count && pool.length; i++) magicItems.push(pick(pool));
  }

  return { coins, valuables, magicItems };
}

/** Roll a homebrew weighted loot table into the same result shape. */
export function rollCustomTable(table: LootTable): LootResult {
  const coins: Coins = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  if (table.coins && table.coins.count > 0) {
    const amt =
      d(table.coins.count, Math.max(2, table.coins.sides)) *
      (table.coins.multiplier || 1);
    coins[table.coins.denomination] += amt;
  }

  const magicItems: CompendiumItem[] = [];
  const totalWeight = table.entries.reduce(
    (n, e) => n + Math.max(0, e.weight || 0),
    0,
  );
  const picks = Math.max(0, table.picks || 0);
  for (let p = 0; p < picks && totalWeight > 0; p++) {
    let roll = Math.random() * totalWeight;
    let chosen = table.entries[0];
    for (const e of table.entries) {
      roll -= Math.max(0, e.weight || 0);
      if (roll <= 0) {
        chosen = e;
        break;
      }
    }
    if (chosen && chosen.name.trim()) {
      magicItems.push({
        name: chosen.name,
        category: chosen.category ?? "treasure",
        rarity: chosen.rarity,
        weight: chosen.itemWeight,
        value: chosen.value,
        properties: chosen.properties,
        damage: chosen.damage,
        description: chosen.description,
      });
    }
  }
  return { coins, valuables: [], magicItems };
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
