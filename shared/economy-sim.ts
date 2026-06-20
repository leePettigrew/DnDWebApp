import { nowISO } from "./ids";
import type {
  EconomyState,
  Market,
  MarketGood,
  ResourceNode,
} from "./domain";

/**
 * The market simulation. `tickEconomy` advances the world one day: markets
 * restock toward their baseline, a little volatility-scaled drift keeps prices
 * breathing, resource nodes add production, and timed events expire. Pure so
 * the DM's client can step it (manually or on a "live" timer) and broadcast the
 * result through the normal economy singleton.
 */

export interface TickOptions {
  rng?: () => number;
}

function restockGood(
  economy: EconomyState,
  good: MarketGood,
  rng: () => number,
): MarketGood {
  const base = good.baseStock ?? good.stock;
  const rate = economy.config.restockRate;
  const commodity = economy.commodities.find((c) => c.id === good.ref);
  const vol = commodity?.volatility ?? 0.5;

  // Pull a fraction of the gap back toward baseline…
  let stock = good.stock + (base - good.stock) * rate;
  // …then a quiet random drift, scaled by volatility and the global knob.
  const drift =
    (rng() - 0.5) * 2 * vol * Math.max(1, base) * 0.05 * economy.config.volatility;
  stock = Math.max(0, Math.round(stock + drift));

  return stock === good.stock ? good : { ...good, stock };
}

function produce(markets: Market[], node: ResourceNode): Market[] {
  if (markets.length === 0) return markets;
  let idx = node.marketId
    ? markets.findIndex((m) => m.id === node.marketId)
    : markets.findIndex((m) => m.kind === "global");
  if (idx < 0) idx = node.marketId ? -1 : 0;
  if (idx < 0) return markets; // named a market that's gone

  const m = markets[idx];
  const gi = m.goods.findIndex((g) => g.ref === node.commodityId);
  const goods =
    gi >= 0
      ? m.goods.map((g, i) =>
          i === gi ? { ...g, stock: g.stock + node.rate } : g,
        )
      : [
          ...m.goods,
          {
            ref: node.commodityId,
            kind: "commodity" as const,
            stock: node.rate,
            baseStock: node.rate * 5,
          },
        ];
  return markets.map((mm, i) => (i === idx ? { ...mm, goods } : mm));
}

export function tickEconomy(
  economy: EconomyState,
  opts: TickOptions = {},
): EconomyState {
  const rng = opts.rng ?? Math.random;
  const day = (economy.day ?? 1) + 1;

  // 1. Markets restock toward baseline (+ drift).
  let markets = (economy.markets ?? []).map((m) => ({
    ...m,
    goods: m.goods.map((g) => restockGood(economy, g, rng)),
  }));

  // 2. Resource nodes add production to their target market.
  for (const node of economy.nodes ?? []) {
    if (node.active === false || !node.commodityId || node.rate <= 0) continue;
    markets = produce(markets, node);
  }

  // 3. Timed events expire.
  const events = (economy.events ?? []).filter(
    (e) => e.until == null || e.until > day,
  );

  return { ...economy, day, markets, events, updatedAt: nowISO() };
}
