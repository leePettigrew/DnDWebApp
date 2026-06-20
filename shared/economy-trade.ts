import { newId, nowISO } from "./ids";
import type {
  Character,
  Commission,
  Consignment,
  Currency,
  DeliveryJob,
  EconomyState,
  EconomyTransaction,
  InventoryItem,
  Market,
  MarketGood,
} from "./domain";
import { haggleDiscount, quoteCommodityGood, quoteService, roundPrice } from "./economy-pricing";

const ZERO_CURRENCY: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

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

export function isTradeError<T>(o: T | { error: string }): o is { error: string } {
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

export interface ServiceRequest {
  marketId: string;
  serviceId: string;
}

/** Hire a service: validate access, price it, and log the spend (no stock). */
export function applyServicePurchase(
  economy: EconomyState,
  req: ServiceRequest,
  ctx: TradeContext,
): TradeApplied | { error: string } {
  if (!economy.enabled) return { error: "The economy is closed." };
  const market = (economy.markets ?? []).find((m) => m.id === req.marketId);
  if (!market) return { error: "Market not found." };
  if (!canAccessMarket(market, ctx)) return { error: "You can't trade here." };
  const service = (economy.services ?? []).find(
    (s) => s.id === req.serviceId && s.marketId === req.marketId,
  );
  if (!service) return { error: "That service isn't offered here." };
  if (service.hidden && !ctx.isDM) return { error: "That service isn't available." };
  if (service.minRep && ctx.rep < service.minRep) {
    return { error: "Your standing isn't high enough for that." };
  }

  const total = quoteService(economy, market, service, ctx.rep);
  const transaction: EconomyTransaction = {
    id: newId(),
    at: nowISO(),
    actorId: ctx.actorId,
    actorName: ctx.actorName,
    marketId: market.id,
    marketName: market.name,
    action: "buy",
    goodName: service.name,
    qty: 1,
    unitPrice: total,
    total,
    note: "service",
  };
  const nextEconomy: EconomyState = {
    ...economy,
    log: [transaction, ...(economy.log ?? [])].slice(0, MAX_LOG),
    updatedAt: nowISO(),
  };
  return { economy: nextEconomy, transaction, unitPrice: total, total };
}

export interface CommissionRequest {
  commissionId: string;
  qty: number;
}

export interface CommissionApplied {
  economy: EconomyState;
  character: Character;
  transaction: EconomyTransaction;
  total: number;
  completed: boolean;
  factionId?: string;
}

/**
 * Fulfil a faction commission. A "buy" order has the player SELL the commodity
 * (gains gp, loses items); a "sell" order has the player BUY it. Mutates both
 * the economy (filled + log) and the acting character (inventory + gold).
 */
export function applyCommission(
  economy: EconomyState,
  character: Character,
  req: CommissionRequest,
  ctx: TradeContext,
): CommissionApplied | { error: string } {
  if (!economy.enabled) return { error: "The economy is closed." };
  const commissions = economy.commissions ?? [];
  const idx = commissions.findIndex((c) => c.id === req.commissionId);
  if (idx < 0) return { error: "No such commission." };
  const com = commissions[idx];
  if (com.active === false) return { error: "That commission is closed." };
  if (com.hidden && !ctx.isDM) return { error: "That commission isn't available." };
  if (com.minRep && ctx.rep < com.minRep) {
    return { error: "Your standing isn't high enough for that." };
  }
  if (com.marketId) {
    const market = (economy.markets ?? []).find((m) => m.id === com.marketId);
    if (market && !canAccessMarket(market, ctx)) return { error: "You can't trade here." };
  }

  const remaining = com.qty - (com.filled ?? 0);
  if (remaining <= 0) return { error: "That commission is already filled." };
  const actual = Math.min(Math.max(1, Math.floor(req.qty || 0)), remaining);

  const commodity = (economy.commodities ?? []).find((c) => c.id === com.commodityId);
  const name = commodity?.name ?? com.commodityId;
  const total = roundPrice(com.unitPrice * actual);

  let inv = character.inventory ?? [];
  let gp = character.currency?.gp ?? 0;

  if (com.kind === "buy") {
    const owned = inv.filter((i) => i.name === name).reduce((n, i) => n + i.quantity, 0);
    if (owned < actual) return { error: `You only have ${owned} ${name}.` };
    let take = actual;
    inv = inv
      .map((i) => {
        if (i.name !== name || take <= 0) return i;
        const t = Math.min(i.quantity, take);
        take -= t;
        return { ...i, quantity: i.quantity - t };
      })
      .filter((i) => i.quantity > 0);
    gp += total;
  } else {
    if (gp < total) return { error: `Not enough gold (need ${total}gp).` };
    const existing = inv.find((i) => i.name === name);
    inv = existing
      ? inv.map((i) => (i === existing ? { ...i, quantity: i.quantity + actual } : i))
      : [...inv, { id: newId(), name, quantity: actual, value: commodity?.baseValue, weight: commodity?.weight }];
    gp -= total;
  }

  const nextCom: Commission = { ...com, filled: (com.filled ?? 0) + actual };
  const completed = (nextCom.filled ?? 0) >= nextCom.qty;
  const marketName = com.marketId
    ? (economy.markets ?? []).find((m) => m.id === com.marketId)?.name
    : undefined;

  const transaction: EconomyTransaction = {
    id: newId(),
    at: nowISO(),
    actorId: ctx.actorId,
    actorName: ctx.actorName,
    marketId: com.marketId,
    marketName,
    // The player's side of the deal is the opposite of the faction's.
    action: com.kind === "buy" ? "sell" : "buy",
    goodName: name,
    qty: actual,
    unitPrice: com.unitPrice,
    total,
    note: "commission",
  };

  const nextEconomy: EconomyState = {
    ...economy,
    commissions: commissions.map((c, i) => (i === idx ? nextCom : c)),
    log: [transaction, ...(economy.log ?? [])].slice(0, MAX_LOG),
    updatedAt: nowISO(),
  };
  const nextChar: Character = {
    ...character,
    inventory: inv,
    currency: { ...ZERO_CURRENCY, ...character.currency, gp },
  };

  return { economy: nextEconomy, character: nextChar, transaction, total, completed, factionId: com.factionId };
}

// --- caravan delivery jobs -------------------------------------------------

function addInventory(
  inv: InventoryItem[],
  name: string,
  qty: number,
  meta?: { value?: number; weight?: number },
): InventoryItem[] {
  const existing = inv.find((i) => i.name === name);
  return existing
    ? inv.map((i) => (i === existing ? { ...i, quantity: i.quantity + qty } : i))
    : [...inv, { id: newId(), name, quantity: qty, value: meta?.value, weight: meta?.weight }];
}
function removeInventory(inv: InventoryItem[], name: string, qty: number): InventoryItem[] | null {
  const owned = inv.filter((i) => i.name === name).reduce((n, i) => n + i.quantity, 0);
  if (owned < qty) return null;
  let take = qty;
  return inv
    .map((i) => {
      if (i.name !== name || take <= 0) return i;
      const t = Math.min(i.quantity, take);
      take -= t;
      return { ...i, quantity: i.quantity - t };
    })
    .filter((i) => i.quantity > 0);
}
function adjustMarketStock(markets: Market[], marketId: string, ref: string, delta: number): Market[] {
  return markets.map((m) => {
    if (m.id !== marketId) return m;
    const g = m.goods.find((x) => x.ref === ref);
    if (g) {
      return { ...m, goods: m.goods.map((x) => (x.ref === ref ? { ...x, stock: Math.max(0, x.stock + delta) } : x)) };
    }
    return delta > 0
      ? { ...m, goods: [...m.goods, { ref, kind: "commodity" as const, stock: delta, baseStock: delta * 5 }] }
      : m;
  });
}

export interface JobApplied {
  economy: EconomyState;
  character: Character;
  transaction?: EconomyTransaction;
  total: number;
}

/** Accept (load cargo) or deliver (drop + get paid) a haulage job. */
export function applyJobAction(
  economy: EconomyState,
  character: Character,
  req: { jobId: string; action: "accept" | "deliver" },
  ctx: TradeContext,
): JobApplied | { error: string } {
  if (!economy.enabled) return { error: "The economy is closed." };
  const jobs = economy.jobs ?? [];
  const idx = jobs.findIndex((j) => j.id === req.jobId);
  if (idx < 0) return { error: "No such job." };
  const job = jobs[idx];
  if (job.active === false) return { error: "That job is closed." };
  if (job.hidden && !ctx.isDM) return { error: "That job isn't available." };
  if (job.minRep && ctx.rep < job.minRep) return { error: "Your standing isn't high enough." };

  const commodity = (economy.commodities ?? []).find((c) => c.id === job.commodityId);
  const name = commodity?.name ?? job.commodityId;
  const status = job.status ?? "open";

  if (req.action === "accept") {
    if (status !== "open") return { error: "That job is already taken." };
    const from = (economy.markets ?? []).find((m) => m.id === job.fromMarketId);
    const stock = from?.goods.find((g) => g.ref === job.commodityId)?.stock ?? 0;
    if (stock < job.qty) return { error: `${from?.name ?? "The source"} only has ${stock} ${name}.` };

    const markets = adjustMarketStock(economy.markets ?? [], job.fromMarketId, job.commodityId, -job.qty);
    const nextJob: DeliveryJob = {
      ...job,
      status: "taken",
      takenBy: character.id,
      takenByName: ctx.actorName,
    };
    return {
      economy: { ...economy, markets, jobs: jobs.map((j, i) => (i === idx ? nextJob : j)), updatedAt: nowISO() },
      character: { ...character, inventory: addInventory(character.inventory ?? [], name, job.qty, { value: commodity?.baseValue, weight: commodity?.weight }) },
      total: 0,
    };
  }

  // deliver
  if (status !== "taken" || job.takenBy !== character.id) {
    return { error: "This isn't your active haul." };
  }
  const inv = removeInventory(character.inventory ?? [], name, job.qty);
  if (!inv) return { error: `You're missing the ${name} cargo.` };

  const markets = adjustMarketStock(economy.markets ?? [], job.toMarketId, job.commodityId, job.qty);
  const reward = roundPrice(job.reward);
  const transaction: EconomyTransaction = {
    id: newId(),
    at: nowISO(),
    actorId: ctx.actorId,
    actorName: ctx.actorName,
    marketId: job.toMarketId,
    marketName: (economy.markets ?? []).find((m) => m.id === job.toMarketId)?.name,
    action: "sell",
    goodName: `${name} (delivery)`,
    qty: job.qty,
    unitPrice: job.qty > 0 ? roundPrice(reward / job.qty) : reward,
    total: reward,
    note: "delivery",
  };
  const nextJob: DeliveryJob = { ...job, status: "done" };
  return {
    economy: {
      ...economy,
      markets,
      jobs: jobs.map((j, i) => (i === idx ? nextJob : j)),
      log: [transaction, ...(economy.log ?? [])].slice(0, MAX_LOG),
      updatedAt: nowISO(),
    },
    character: {
      ...character,
      inventory: inv,
      currency: { ...ZERO_CURRENCY, ...character.currency, gp: (character.currency?.gp ?? 0) + reward },
    },
    transaction,
    total: reward,
  };
}

// --- player consignment stalls ---------------------------------------------

export interface ConsignApplied {
  economy: EconomyState;
  character: Character;
  transaction?: EconomyTransaction;
  total: number;
}

/** List `qty` of an inventory item for sale at a market (escrows the items). */
export function applyConsignList(
  economy: EconomyState,
  character: Character,
  req: { marketId: string; itemId: string; qty: number; price: number },
  ctx: TradeContext,
): ConsignApplied | { error: string } {
  if (!economy.enabled) return { error: "The economy is closed." };
  const market = (economy.markets ?? []).find((m) => m.id === req.marketId);
  if (!market) return { error: "Market not found." };
  if (!canAccessMarket(market, ctx)) return { error: "You can't trade here." };
  const item = (character.inventory ?? []).find((i) => i.id === req.itemId);
  if (!item) return { error: "You don't have that item." };
  const qty = Math.max(1, Math.floor(req.qty || 0));
  if (item.quantity < qty) return { error: `You only have ${item.quantity}.` };
  const price = Math.max(0, req.price || 0);

  const inv = (character.inventory ?? [])
    .map((i) => (i.id === req.itemId ? { ...i, quantity: i.quantity - qty } : i))
    .filter((i) => i.quantity > 0);

  const listing: Consignment = {
    id: newId(),
    marketId: req.marketId,
    sellerId: character.id,
    sellerName: ctx.actorName ?? character.name,
    itemName: item.name,
    qty,
    price,
    escrow: 0,
    value: item.value,
    weight: item.weight,
    rarity: item.rarity,
    category: item.category,
    createdDay: economy.day,
  };
  return {
    economy: { ...economy, consignments: [listing, ...(economy.consignments ?? [])], updatedAt: nowISO() },
    character: { ...character, inventory: inv },
    total: 0,
  };
}

/** Buy `qty` units from a stall: the buyer pays into the seller's escrow. */
export function applyConsignBuy(
  economy: EconomyState,
  buyer: Character,
  req: { consignmentId: string; qty: number },
  ctx: TradeContext,
): ConsignApplied | { error: string } {
  if (!economy.enabled) return { error: "The economy is closed." };
  const list = economy.consignments ?? [];
  const idx = list.findIndex((c) => c.id === req.consignmentId);
  if (idx < 0) return { error: "That stall is gone." };
  const con = list[idx];
  if (con.sellerId === buyer.id) return { error: "That's your own stall." };
  const qty = Math.min(Math.max(1, Math.floor(req.qty || 0)), con.qty);
  if (qty <= 0) return { error: "Nothing left to buy." };
  const total = roundPrice(con.price * qty);
  if ((buyer.currency?.gp ?? 0) < total) return { error: `Not enough gold (need ${total}gp).` };

  const inv = addInventory(buyer.inventory ?? [], con.itemName, qty, { value: con.value, weight: con.weight });
  const nextChar: Character = {
    ...buyer,
    inventory: inv,
    currency: { ...ZERO_CURRENCY, ...buyer.currency, gp: (buyer.currency?.gp ?? 0) - total },
  };
  // Keep a sold-out listing (qty 0) so the seller can still collect escrow.
  const nextCon: Consignment = { ...con, qty: con.qty - qty, escrow: (con.escrow ?? 0) + total };
  const consignments = list.map((c, i) => (i === idx ? nextCon : c));

  const transaction: EconomyTransaction = {
    id: newId(),
    at: nowISO(),
    actorId: ctx.actorId,
    actorName: ctx.actorName,
    marketName: (economy.markets ?? []).find((m) => m.id === con.marketId)?.name,
    action: "buy",
    goodName: `${con.itemName} (from ${con.sellerName})`,
    qty,
    unitPrice: con.price,
    total,
    note: "consignment",
  };
  return {
    economy: {
      ...economy,
      consignments,
      log: [transaction, ...(economy.log ?? [])].slice(0, MAX_LOG),
      updatedAt: nowISO(),
    },
    character: nextChar,
    transaction,
    total,
  };
}

/** Collect escrowed earnings (and, if cancelling, reclaim remaining stock). */
export function applyConsignManage(
  economy: EconomyState,
  character: Character,
  req: { consignmentId: string; action: "collect" | "cancel" },
  ctx: TradeContext,
): ConsignApplied | { error: string } {
  const list = economy.consignments ?? [];
  const idx = list.findIndex((c) => c.id === req.consignmentId);
  if (idx < 0) return { error: "That stall is gone." };
  const con = list[idx];
  if (con.sellerId !== character.id && !ctx.isDM) return { error: "That isn't your stall." };

  const escrow = con.escrow ?? 0;
  let inv = character.inventory ?? [];
  if (req.action === "cancel" && con.qty > 0) {
    inv = addInventory(inv, con.itemName, con.qty, { value: con.value, weight: con.weight });
  }
  const nextChar: Character = {
    ...character,
    inventory: inv,
    currency: { ...ZERO_CURRENCY, ...character.currency, gp: (character.currency?.gp ?? 0) + escrow },
  };

  let consignments: Consignment[];
  if (req.action === "cancel") {
    consignments = list.filter((_, i) => i !== idx);
  } else {
    const cleared: Consignment = { ...con, escrow: 0 };
    // A collected, sold-out stall is done.
    consignments = cleared.qty <= 0 ? list.filter((_, i) => i !== idx) : list.map((c, i) => (i === idx ? cleared : c));
  }
  return {
    economy: { ...economy, consignments, updatedAt: nowISO() },
    character: nextChar,
    total: escrow,
  };
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
