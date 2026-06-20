import { nowISO } from "./ids";
import type { Commodity, EconomyConfig, EconomyState } from "./domain";

/** Starter commodity catalog (metals, ores, materials, goods). */
export const SEED_COMMODITIES: Commodity[] = [
  { id: "iron-ore", name: "Iron ore", category: "ore", baseValue: 0.5, tier: 1, weight: 5, volatility: 0.4, unit: "load" },
  { id: "coal", name: "Coal", category: "ore", baseValue: 0.3, tier: 1, weight: 2, volatility: 0.3, unit: "sack" },
  { id: "iron-ingot", name: "Iron ingot", category: "metal", baseValue: 1, tier: 1, weight: 5, volatility: 0.4, unit: "ingot" },
  { id: "steel-ingot", name: "Steel ingot", category: "metal", baseValue: 5, tier: 2, weight: 5, volatility: 0.5, unit: "ingot" },
  { id: "copper-ingot", name: "Copper ingot", category: "metal", baseValue: 0.6, tier: 1, weight: 5, volatility: 0.4, unit: "ingot" },
  { id: "silver-ingot", name: "Silver ingot", category: "metal", baseValue: 12, tier: 2, weight: 5, volatility: 0.5, unit: "ingot" },
  { id: "mithril", name: "Mithril", category: "metal", baseValue: 500, tier: 5, weight: 2, volatility: 0.8, unit: "ingot" },
  { id: "adamantine", name: "Adamantine", category: "metal", baseValue: 1000, tier: 5, weight: 6, volatility: 0.8, unit: "ingot" },
  { id: "timber", name: "Timber", category: "wood", baseValue: 0.4, tier: 1, weight: 20, volatility: 0.3, unit: "load" },
  { id: "cloth-bolt", name: "Bolt of cloth", category: "cloth", baseValue: 1.5, tier: 1, weight: 4, volatility: 0.4, unit: "bolt" },
  { id: "grain", name: "Grain", category: "food", baseValue: 0.2, tier: 0, weight: 30, volatility: 0.6, unit: "bushel" },
  { id: "salted-meat", name: "Salted meat", category: "food", baseValue: 0.6, tier: 1, weight: 10, volatility: 0.5, unit: "barrel" },
  { id: "spices", name: "Spices", category: "good", baseValue: 8, tier: 3, weight: 1, volatility: 0.7, unit: "pouch" },
  { id: "gemstone", name: "Cut gemstone", category: "gem", baseValue: 50, tier: 4, weight: 0, volatility: 0.7, unit: "stone" },
  { id: "reagents", name: "Alchemical reagents", category: "reagent", baseValue: 3, tier: 2, weight: 1, volatility: 0.6, unit: "vial" },
];

export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  elasticity: 0.6,
  volatility: 1,
  priceClamp: 0.6,
  defaultBuyMul: 1,
  defaultSellMul: 0.5,
  repDiscount: 0.2,
  haggleMax: 0.25,
  restockRate: 0.1,
};

export function emptyEconomy(): EconomyState {
  return {
    id: "economy",
    enabled: false,
    sim: "paused",
    day: 1,
    tickSeconds: 60,
    config: { ...DEFAULT_ECONOMY_CONFIG },
    commodities: SEED_COMMODITIES.map((c) => ({ ...c })),
    markets: [],
    nodes: [],
    events: [],
    log: [],
    updatedAt: nowISO(),
  };
}
