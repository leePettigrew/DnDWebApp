import { newId, nowISO } from "./ids";
import type { ID, ISODateString } from "./ids";
import type { Character, Currency } from "./domain";

/**
 * Player ↔ player trading. A live, two-party negotiation: each side stakes gold
 * and inventory items, both must confirm, then the swap is applied atomically.
 * The session lives in server memory (per room, like presence) — never trusted
 * from the client. The swap itself is this pure module so the server and the
 * solo provider apply identical rules.
 */

export interface TradeItemRef {
  /** InventoryItem.id on the offering character. */
  itemId: ID;
  name: string;
  quantity: number;
}

export interface TradeStake {
  gold: number;
  items: TradeItemRef[];
}

export interface TradeParty {
  userId: ID;
  characterId: ID;
  characterName: string;
  stake: TradeStake;
  confirmed: boolean;
}

export type TradeStatus = "open" | "completed" | "cancelled";

export interface TradeSession {
  id: ID;
  status: TradeStatus;
  /** The proposer. */
  from: TradeParty;
  /** The recipient. */
  to: TradeParty;
  /** Set when a confirm failed validation, so both clients can show why. */
  error?: string;
  updatedAt: ISODateString;
}

const ZERO: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

export function emptyStake(): TradeStake {
  return { gold: 0, items: [] };
}

export function makeParty(
  userId: ID,
  character: Pick<Character, "id" | "name">,
): TradeParty {
  return {
    userId,
    characterId: character.id,
    characterName: character.name,
    stake: emptyStake(),
    confirmed: false,
  };
}

/** Whether a character can actually back its stake right now. */
export function stakeError(
  character: Character,
  stake: TradeStake,
): string | null {
  const gp = character.currency?.gp ?? 0;
  if (stake.gold < 0) return "Gold can't be negative.";
  if (stake.gold > gp) return `${character.name} doesn't have ${stake.gold}gp.`;
  for (const ref of stake.items) {
    const item = (character.inventory ?? []).find((i) => i.id === ref.itemId);
    if (!item) return `${character.name} no longer has ${ref.name}.`;
    if (ref.quantity < 1 || ref.quantity > item.quantity) {
      return `${character.name} doesn't have ${ref.quantity}× ${ref.name}.`;
    }
  }
  return null;
}

function removeStake(character: Character, stake: TradeStake): Character {
  let inv = character.inventory ?? [];
  for (const ref of stake.items) {
    inv = inv
      .map((i) =>
        i.id === ref.itemId ? { ...i, quantity: i.quantity - ref.quantity } : i,
      )
      .filter((i) => i.quantity > 0);
  }
  return {
    ...character,
    inventory: inv,
    currency: {
      ...ZERO,
      ...character.currency,
      gp: (character.currency?.gp ?? 0) - stake.gold,
    },
  };
}

function receive(
  character: Character,
  items: TradeItemRef[],
  gold: number,
  source: Character,
): Character {
  let inv = [...(character.inventory ?? [])];
  for (const ref of items) {
    const src = (source.inventory ?? []).find((i) => i.id === ref.itemId);
    const existing = inv.find((i) => i.name === ref.name);
    if (existing) {
      inv = inv.map((i) =>
        i === existing ? { ...i, quantity: i.quantity + ref.quantity } : i,
      );
    } else {
      inv = [
        ...inv,
        {
          id: newId(),
          name: ref.name,
          quantity: ref.quantity,
          weight: src?.weight,
          value: src?.value,
          category: src?.category,
          rarity: src?.rarity,
          properties: src?.properties,
        },
      ];
    }
  }
  return {
    ...character,
    inventory: inv,
    currency: {
      ...ZERO,
      ...character.currency,
      gp: (character.currency?.gp ?? 0) + gold,
    },
  };
}

/**
 * Apply a confirmed trade. `a` is `session.from`'s character, `b` is
 * `session.to`'s. Returns the two updated characters or an error if either side
 * can no longer back its stake.
 */
export function applyP2PTrade(
  a: Character,
  b: Character,
  session: TradeSession,
): { a: Character; b: Character } | { error: string } {
  const errA = stakeError(a, session.from.stake);
  if (errA) return { error: errA };
  const errB = stakeError(b, session.to.stake);
  if (errB) return { error: errB };

  let nextA = removeStake(a, session.from.stake);
  let nextB = removeStake(b, session.to.stake);
  // Each receives the OTHER's stake; item metadata read from the originals.
  nextA = receive(nextA, session.to.stake.items, session.to.stake.gold, b);
  nextB = receive(nextB, session.from.stake.items, session.from.stake.gold, a);

  return { a: nextA, b: nextB };
}

export function touchSession(
  session: Omit<TradeSession, "updatedAt">,
): TradeSession {
  return { ...session, updatedAt: nowISO() };
}
