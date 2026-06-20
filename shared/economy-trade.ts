import { newId, nowISO } from "./ids";
import type {
  EconomyState,
  EconomyTransaction,
  Market,
  MarketGood,
} from "./domain";
import { haggleDiscount, quoteCommodityGood, roundPrice } from "./economy-pricing";

/**
 * The trade engine. Applies a buy/sell to an economy and returns the next
 * state + the logged transaction — or an error string. Shared so the server
 * (authoritative, multiplayer) and the local provider (solo) execute trades
 * with identical rules. Reputation is resolved by the caller (from the owning
 * faction's standing) and passed in, keeping this pure over the economy doc.
 */

export interface TradeRequest {
  marketId: string;
  goodRef: string;
  action: "buy" | "sell";
  qty: number;
  /** d20 total from a haggle skill check (discounts a buy). */
  haggleRoll?: number;
}

export interface TradeContext {
  /** 0..5 standing with the market's owner. */
  rep: number;
  actorId?: string;
  actorName?: string;
  isDM?: boolean;
  userId?: string;
}

export interface TradeApplied {
  economy: EconomyState;
  transaction: EconomyTransaction;
  unitPrice: number;
  total: number;
}

export type TradeOutcome = TradeApplied | { error: string };

export function isTradeError(o: TradeOutcome): o is { error: string } {
  return typeof (o as { error?: unknown }).error === "string";
}

const MAX_LOG = 200;

/** Can this actor see/use the market at all? (hidden + min-rep gates.) */
export function canAccessMarket(market: Market, ctx: TradeContext): boolean {
  if (ctx.isDM) return true;
  if (
    market.hidden &&
    !(ctx.userId && market.visibleTo?.includes(ctx.userId))
  ) {
    return false;
  }
  if (market.minRep && ctx.rep < market.minRep) return false;
  return true;
}

export function applyTrade(
  economy: EconomyState,
  req: TradeRequest,
  ctx: TradeContext,
): TradeOutcome {
  if (!economy.enabled) return { error: "The economy is closed." };
  const qty = Math.max(1, Math.floor(req.qty || 0));

  const markets = economy.markets ?? [];
  const mIdx = markets.findIndex((m) => m.id === req.marketId);
  if (mIdx < 0) return { error: "Market not found." };
  const market = markets[mIdx];
  if (!canAccessMarket(market, ctx)) return { error: "You can't trade here." };

  const gIdx = market.goods.findIndex((g) => g.ref === req.goodRef);
  if (gIdx < 0) return { error: "That isn't traded here." };
  const good = market.goods[gIdx];
  if (good.minRep && ctx.rep < good.minRep) {
    return { error: "Your standing isn't high enough for that." };
  }

  const quote = quoteCommodityGood(economy, market, good, ctx.rep);
  if (!quote) return { error: "No price for that good." };
  const commodity = economy.commodities.find((c) => c.id === good.ref);
  const goodName = commodity?.name ?? good.ref;

  let unitPrice: number;
  if (req.action === "buy") {
    if (good.stock < qty) return { error: `Only ${good.stock} in stock.` };
    const disc = haggleDiscount(
      req.haggleRoll ?? 0,
      ctx.rep,
      economy.config.haggleMax,
    );
    unitPrice = roundPrice(quote.buy * (1 - disc));
  } else {
    unitPrice = quote.sell;
  }
  const total = roundPrice(unitPrice * qty);

  const nextGood: MarketGood = {
    ...good,
    stock: req.action === "buy" ? good.stock - qty : good.stock + qty,
  };
  const nextMarket: Market = {
    ...market,
    goods: market.goods.map((g, i) => (i === gIdx ? nextGood : g)),
  };
  const nextMarkets = markets.map((m, i) => (i === mIdx ? nextMarket : m));

  const transaction: EconomyTransaction = {
    id: newId(),
    at: nowISO(),
    actorId: ctx.actorId,
    actorName: ctx.actorName,
    marketId: market.id,
    marketName: market.name,
    action: req.action,
    goodRef: good.ref,
    goodName,
    qty,
    unitPrice,
    total,
  };

  const nextEconomy: EconomyState = {
    ...economy,
    markets: nextMarkets,
    log: [transaction, ...(economy.log ?? [])].slice(0, MAX_LOG),
    updatedAt: nowISO(),
  };
  return { economy: nextEconomy, transaction, unitPrice, total };
}

/** Undo a logged buy/sell: restore stock, flag it, and log a revert entry. */
export function revertTransaction(
  economy: EconomyState,
  txId: string,
  by?: { actorName?: string },
): EconomyState | { error: string } {
  const tx = (economy.log ?? []).find((t) => t.id === txId);
  if (!tx) return { error: "No such transaction." };
  if (tx.reverted) return { error: "Already reverted." };
  if (tx.action !== "buy" && tx.action !== "sell") {
    return { error: "That entry can't be reverted." };
  }

  let nextMarkets = economy.markets ?? [];
  if (tx.marketId && tx.goodRef && tx.qty) {
    nextMarkets = nextMarkets.map((m) =>
      m.id !== tx.marketId
        ? m
        : {
            ...m,
            goods: m.goods.map((g) =>
              g.ref === tx.goodRef
                ? {
                    ...g,
                    stock:
                      tx.action === "buy"
                        ? g.stock + tx.qty!
                        : g.stock - tx.qty!,
                  }
                : g,
            ),
          },
    );
  }

  const revertEntry: EconomyTransaction = {
    id: newId(),
    at: nowISO(),
    action: "revert",
    actorName: by?.actorName,
    marketId: tx.marketId,
    marketName: tx.marketName,
    goodRef: tx.goodRef,
    goodName: tx.goodName,
    qty: tx.qty,
    unitPrice: tx.unitPrice,
    total: tx.total,
    note: `Reverted ${tx.action} of ${tx.qty ?? ""} ${tx.goodName ?? ""}${
      tx.actorName ? ` by ${tx.actorName}` : ""
    }`.trim(),
  };

  const log = (economy.log ?? []).map((t) =>
    t.id === txId ? { ...t, reverted: true } : t,
  );

  return {
    ...economy,
    markets: nextMarkets,
    log: [revertEntry, ...log].slice(0, MAX_LOG),
    updatedAt: nowISO(),
  };
}
