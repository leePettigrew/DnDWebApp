import { nowISO } from "./ids";
import type {
  EconomyState,
  FactionEconomy,
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

/** Is trade between two factions blocked by an active embargo (either way)? */
function isEmbargoed(
  economy: EconomyState,
  fa: string | undefined,
  fb: string | undefined,
): boolean {
  if (!fa || !fb) return false;
  return (economy.policies ?? []).some(
    (p) =>
      p.kind === "embargo" &&
      p.active !== false &&
      ((p.factionId === fa && p.targetFactionId === fb) ||
        (p.factionId === fb && p.targetFactionId === fa)),
  );
}

function stockOf(stockpile: { commodityId: string; qty: number }[], ref: string): number {
  return stockpile.find((s) => s.commodityId === ref)?.qty ?? 0;
}
function addToStock(
  stockpile: { commodityId: string; qty: number }[],
  ref: string,
  delta: number,
): void {
  const line = stockpile.find((s) => s.commodityId === ref);
  if (line) line.qty = Math.max(0, line.qty + delta);
  else if (delta > 0) stockpile.push({ commodityId: ref, qty: delta });
}

/** Move route volumes between markets (respecting embargoes). Mutates `markets`. */
function runRoutes(economy: EconomyState, markets: Market[]): void {
  for (const r of economy.routes ?? []) {
    if (r.active === false || r.volume <= 0 || !r.commodityId) continue;
    const fi = markets.findIndex((m) => m.id === r.fromMarketId);
    const ti = markets.findIndex((m) => m.id === r.toMarketId);
    if (fi < 0 || ti < 0 || fi === ti) continue;
    if (isEmbargoed(economy, markets[fi].factionId, markets[ti].factionId)) continue;

    const fromGood = markets[fi].goods.find((g) => g.ref === r.commodityId);
    const move = Math.min(r.volume, fromGood?.stock ?? 0);
    if (move <= 0) continue;

    markets[fi] = {
      ...markets[fi],
      goods: markets[fi].goods.map((g) =>
        g.ref === r.commodityId ? { ...g, stock: g.stock - move } : g,
      ),
    };
    const toGood = markets[ti].goods.find((g) => g.ref === r.commodityId);
    markets[ti] = {
      ...markets[ti],
      goods: toGood
        ? markets[ti].goods.map((g) =>
            g.ref === r.commodityId ? { ...g, stock: g.stock + move } : g,
          )
        : [
            ...markets[ti].goods,
            { ref: r.commodityId, kind: "commodity" as const, stock: move, baseStock: move * 5 },
          ],
    };
  }
}

/** Factions skim market surplus into reserves and release them in shortage. */
function runStockpiles(
  economy: EconomyState,
  markets: Market[],
): FactionEconomy[] {
  const stockpiles = (economy.stockpiles ?? []).map((fe) => ({
    ...fe,
    stockpile: fe.stockpile.map((s) => ({ ...s })),
  }));
  for (const fe of stockpiles) {
    const rate = fe.bufferRate ?? 0.25;
    if (rate <= 0) continue;
    for (let i = 0; i < markets.length; i++) {
      if (markets[i].factionId !== fe.factionId) continue;
      const goods = markets[i].goods.map((g) => {
        const base = g.baseStock ?? g.stock;
        const move = Math.round((g.stock - base) * rate);
        if (move > 0) {
          addToStock(fe.stockpile, g.ref, move);
          return { ...g, stock: g.stock - move };
        }
        if (move < 0) {
          const give = Math.min(-move, stockOf(fe.stockpile, g.ref));
          if (give <= 0) return g;
          addToStock(fe.stockpile, g.ref, -give);
          return { ...g, stock: g.stock + give };
        }
        return g;
      });
      markets[i] = { ...markets[i], goods };
    }
  }
  return stockpiles;
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

  // 3. Caravans redistribute supply between markets.
  runRoutes(economy, markets);

  // 4. Factions buffer their markets with strategic reserves.
  const stockpiles = runStockpiles(economy, markets);

  // 5. Timed events expire.
  const events = (economy.events ?? []).filter(
    (e) => e.until == null || e.until > day,
  );

  return { ...economy, day, markets, stockpiles, events, updatedAt: nowISO() };
}
