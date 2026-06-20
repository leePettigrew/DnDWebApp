import { nowISO } from "./ids";
import type {
  Consignment,
  EconomyState,
  FactionEconomy,
  Market,
  MarketGood,
  PriceSample,
  ResourceNode,
} from "./domain";
import { quoteCommodityGood } from "./economy-pricing";

const HISTORY_DAYS = 30;

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

function cloneStockpiles(economy: EconomyState): FactionEconomy[] {
  return (economy.stockpiles ?? []).map((fe) => ({
    ...fe,
    stockpile: fe.stockpile.map((s) => ({ ...s })),
  }));
}

function feFor(stockpiles: FactionEconomy[], factionId?: string): FactionEconomy | undefined {
  return factionId ? stockpiles.find((fe) => fe.factionId === factionId) : undefined;
}

/**
 * Move route volumes between markets (respecting embargoes) and settle the gold:
 * the destination faction pays the source per unit + a flat daily fee, throttled
 * by what the buyer's treasury can afford. Mutates `markets` and `stockpiles`.
 */
function runRoutes(
  economy: EconomyState,
  markets: Market[],
  stockpiles: FactionEconomy[],
): void {
  for (const r of economy.routes ?? []) {
    if (r.active === false || r.volume <= 0 || !r.commodityId) continue;
    const fi = markets.findIndex((m) => m.id === r.fromMarketId);
    const ti = markets.findIndex((m) => m.id === r.toMarketId);
    if (fi < 0 || ti < 0 || fi === ti) continue;
    if (isEmbargoed(economy, markets[fi].factionId, markets[ti].factionId)) continue;

    const seller = feFor(stockpiles, markets[fi].factionId); // ships goods, gets paid
    const buyer = feFor(stockpiles, markets[ti].factionId); // receives goods, pays

    const fromGood = markets[fi].goods.find((g) => g.ref === r.commodityId);
    let move = Math.min(r.volume, fromGood?.stock ?? 0);

    // The buyer can only pay for so many units.
    const perUnit = r.goldPerUnit ?? 0;
    if (perUnit > 0 && buyer) {
      move = Math.min(move, Math.floor((buyer.treasury ?? 0) / perUnit));
    }
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

    // Settle gold: buyer (destination) → seller (source).
    let pay = perUnit * move;
    if (r.goldPerDay && r.goldPerDay > 0) {
      pay += buyer ? Math.min(r.goldPerDay, (buyer.treasury ?? 0) - pay) : r.goldPerDay;
    }
    if (pay > 0) {
      if (buyer) buyer.treasury = Math.max(0, (buyer.treasury ?? 0) - pay);
      if (seller) seller.treasury = (seller.treasury ?? 0) + pay;
    }
  }
}

/** Factions skim market surplus into reserves and release them in shortage. */
function runStockpiles(
  economy: EconomyState,
  markets: Market[],
  stockpiles: FactionEconomy[],
): void {
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
}

/** Slow NPC offtake from player stalls: a unit may sell into escrow each day. */
function sellConsignmentsToNpcs(economy: EconomyState, rng: () => number): Consignment[] {
  return (economy.consignments ?? []).map((c) =>
    c.qty > 0 && rng() < 0.25
      ? { ...c, qty: c.qty - 1, escrow: (c.escrow ?? 0) + c.price }
      : c,
  );
}

/** Representative price per commodity: mean mid across markets that stock it. */
function samplePrices(economy: EconomyState): PriceSample {
  const prices: Record<string, number> = {};
  for (const c of economy.commodities ?? []) {
    let sum = 0;
    let n = 0;
    for (const m of economy.markets ?? []) {
      const g = m.goods.find((x) => x.ref === c.id);
      if (!g) continue;
      const q = quoteCommodityGood(economy, m, g, 0);
      if (q) {
        sum += q.mid;
        n += 1;
      }
    }
    prices[c.id] = n > 0 ? Math.round((sum / n) * 100) / 100 : c.baseValue;
  }
  return { day: economy.day ?? 1, prices };
}

export function tickEconomy(
  economy: EconomyState,
  opts: TickOptions = {},
): EconomyState {
  const rng = opts.rng ?? Math.random;
  const day = (economy.day ?? 1) + 1;
  const stockpiles = cloneStockpiles(economy);

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

  // 3. Caravans redistribute supply between markets and settle gold.
  runRoutes(economy, markets, stockpiles);

  // 4. Factions buffer their markets with strategic reserves.
  runStockpiles(economy, markets, stockpiles);

  // 5. Timed events expire.
  const events = (economy.events ?? []).filter(
    (e) => e.until == null || e.until > day,
  );

  const next: EconomyState = {
    ...economy,
    day,
    markets,
    stockpiles,
    events,
    consignments: sellConsignmentsToNpcs(economy, rng),
    updatedAt: nowISO(),
  };
  // 6. Record a daily price snapshot for the Exchange trend view.
  next.priceHistory = [...(economy.priceHistory ?? []), samplePrices(next)].slice(
    -HISTORY_DAYS,
  );
  return next;
}
