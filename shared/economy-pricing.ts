import type {
  Commodity,
  EconomyEvent,
  EconomyState,
  FactionStanding,
  Market,
  MarketGood,
} from "./domain";

/** Map a faction standing to a 0..5 reputation used by the pricing model. */
export function standingToRep(standing: FactionStanding | undefined): number {
  switch (standing) {
    case "ally":
      return 5;
    case "friendly":
      return 4;
    case "neutral":
      return 2;
    case "suspicious":
      return 1;
    case "hostile":
      return 0;
    default:
      return 2;
  }
}

/**
 * The pricing engine. Turns a market's stock, the global knobs, active events,
 * and a buyer's reputation into concrete buy/sell prices. Pure + shared so the
 * DM console, the player Market page, and the server's trade validation all
 * agree on the number.
 */

export interface PriceQuote {
  /** Base gp value of one unit (commodity.baseValue / item value). */
  base: number;
  /** Supply/demand × events × per-good multiplier (before buy/sell margins). */
  mid: number;
  /** What a player pays to buy one unit (rounded). */
  buy: number;
  /** What a player gets selling one unit (rounded). */
  sell: number;
  /** Supply/demand multiplier (for display: <1 = glut, >1 = scarce). */
  supplyMul: number;
  /** Combined active-event multiplier. */
  eventMul: number;
  inStock: boolean;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** gp prices: 2 decimals under 10gp, whole numbers above. */
export function roundPrice(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 10 ? Math.round(n) : Math.round(n * 100) / 100;
}

export function commodityById(
  economy: EconomyState,
  ref: string,
): Commodity | undefined {
  return economy.commodities.find((c) => c.id === ref);
}

/**
 * Fraction knocked off a buy price by a haggle. Driven by the skill-check roll
 * (a d20 total: 10 = no luck, 25 = masterful) and standing with the seller, and
 * capped by `haggleMax` from the economy config.
 */
export function haggleDiscount(
  roll: number,
  rep: number,
  haggleMax: number,
): number {
  if (!roll || roll <= 10) return 0;
  const quality = clamp((roll - 10) / 15, 0, 1);
  const repFactor = clamp(rep, 0, 5) / 5;
  return clamp(haggleMax * quality * (0.5 + 0.5 * repFactor), 0, haggleMax);
}

/** Does an event apply to this good? scope: undefined/"all" | category | id. */
export function eventApplies(
  ev: EconomyEvent,
  ref: string,
  category?: string,
): boolean {
  const scope = ev.scope?.trim();
  if (!scope || scope === "all") return true;
  if (scope === ref) return true;
  if (category && scope === category) return true;
  return false;
}

export function eventMultiplier(
  economy: EconomyState,
  ref: string,
  category?: string,
): number {
  let mul = 1;
  for (const ev of economy.events) {
    if (eventApplies(ev, ref, category)) mul *= ev.priceMul || 1;
  }
  return mul;
}

/**
 * Price effect of faction policies (pacts/tariffs/embargoes) at a market — the
 * product of every active policy whose faction owns this market and whose scope
 * covers the good. Non-faction markets are unaffected.
 */
export function factionPolicyMultiplier(
  economy: EconomyState,
  market: Market,
  ref: string,
  category?: string,
): number {
  if (!market.factionId) return 1;
  let mul = 1;
  for (const p of economy.policies ?? []) {
    if (p.active === false || !p.priceMul) continue;
    if (p.factionId !== market.factionId) continue;
    if (eventApplies({ scope: p.scope } as EconomyEvent, ref, category)) {
      mul *= p.priceMul;
    }
  }
  return mul;
}

/**
 * Quote a good's price from explicit inputs (so item-backed goods work without
 * a commodity record). `rep` is 0..5 standing with the market's owner.
 */
export function quotePrice(opts: {
  economy: EconomyState;
  market: Market;
  good: MarketGood;
  base: number;
  volatility: number;
  category?: string;
  rep?: number;
}): PriceQuote {
  const { economy, market, good, base } = opts;
  const cfg = economy.config;
  const rep = clamp(opts.rep ?? 0, 0, 5);

  const ratio =
    good.baseStock && good.baseStock > 0 ? good.stock / good.baseStock : 1;
  const dev = clamp(
    cfg.elasticity * opts.volatility * cfg.volatility * (1 - ratio),
    -cfg.priceClamp,
    cfg.priceClamp,
  );
  const supplyMul = 1 + dev;
  const eventMul = eventMultiplier(economy, good.ref, opts.category);
  const policyMul = factionPolicyMultiplier(economy, market, good.ref, opts.category);

  const mid = base * supplyMul * eventMul * policyMul * (good.priceMul ?? 1);

  // Reputation: a discount when buying, a small bonus when selling.
  const repBuy = 1 - cfg.repDiscount * (rep / 5);
  const repSell = 1 + cfg.repDiscount * 0.5 * (rep / 5);

  return {
    base,
    mid,
    buy: roundPrice(mid * market.buyMul * repBuy),
    sell: roundPrice(mid * market.sellMul * repSell),
    supplyMul,
    eventMul,
    inStock: good.stock > 0,
  };
}

/** Convenience: quote a commodity-backed good, resolving its base + volatility. */
export function quoteCommodityGood(
  economy: EconomyState,
  market: Market,
  good: MarketGood,
  rep = 0,
): PriceQuote | null {
  const commodity = commodityById(economy, good.ref);
  if (!commodity) return null;
  return quotePrice({
    economy,
    market,
    good,
    base: commodity.baseValue,
    volatility: commodity.volatility ?? 0.5,
    category: commodity.category,
    rep,
  });
}
