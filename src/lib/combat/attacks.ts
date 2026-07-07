import type {
  Character,
  Combatant,
  StatBlock,
  TokenSize,
} from "@/lib/domain/types";

/**
 * Bridges the War Table's target-&-roll flow to whatever attack data exists:
 * PC weapons carry structured attackBonus/damage; monster/NPC stat-block
 * actions are free text ("Melee: +4 to hit, 5 (1d6+2) slashing.") that we
 * parse best-effort. Everything lands in an editable AttackOption, so a
 * failed parse just means blank fields the DM fills in.
 */
export interface AttackOption {
  id: string;
  name: string;
  /** To-hit bonus, e.g. 5 for +5. */
  bonus?: number;
  /** Damage formula string, e.g. "1d8+3 slashing". */
  damage?: string;
  /** Where it came from, for the card's fine print. */
  source: "weapon" | "action" | "manual";
  note?: string;
}

/** "+4 to hit" / "+11 to hit" → 4 / 11 (also tolerates "-1 to hit"). */
const TO_HIT_RE = /([+-]\s*\d+)\s*to\s*hit/i;
/** "(1d6+2)" / "(2d8)" — the dice inside stat-block damage parentheses. */
const DMG_PAREN_RE = /\((\d*d\d+(?:\s*[+-]\s*\d+)?)\)\s*([a-z]+)?/i;
/** Bare "2d6+3 slashing" for descriptions without the average-first style. */
const DMG_BARE_RE = /(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*([a-z]+)?\s*damage/i;

/** Parse one stat-block action description into bonus + damage (best effort). */
export function parseActionAttack(desc: string | undefined): { bonus?: number; damage?: string } {
  if (!desc) return {};
  const out: { bonus?: number; damage?: string } = {};
  const hit = TO_HIT_RE.exec(desc);
  if (hit) out.bonus = parseInt(hit[1].replace(/\s+/g, ""), 10);
  const paren = DMG_PAREN_RE.exec(desc);
  if (paren) {
    out.damage = paren[1].replace(/\s+/g, "") + (paren[2] ? ` ${paren[2]}` : "");
  } else {
    const bare = DMG_BARE_RE.exec(desc);
    if (bare) out.damage = bare[1].replace(/\s+/g, "") + (bare[2] ? ` ${bare[2]}` : "");
  }
  return out;
}

/** All rollable attacks for a combatant, resolved through its source entity. */
export function attackOptionsFor(
  combatant: Combatant | undefined,
  characters: Character[],
  statBlocks: StatBlock[],
): AttackOption[] {
  if (!combatant?.sourceId) return [];
  if (combatant.isPC) {
    const ch = characters.find((c) => c.id === combatant.sourceId);
    if (!ch) return [];
    return (ch.inventory ?? [])
      .filter((i) => i.category === "weapon" && (i.attackBonus !== undefined || i.damage))
      .map((i) => ({
        id: i.id,
        name: i.name,
        bonus: i.attackBonus,
        damage: i.damage,
        source: "weapon" as const,
        note: i.properties,
      }));
  }
  const sb = statBlocks.find((s) => s.id === combatant.sourceId);
  if (!sb) return [];
  return (sb.actions ?? [])
    .map((a) => {
      const parsed = parseActionAttack(a.description);
      return {
        id: a.id,
        name: a.name,
        bonus: parsed.bonus,
        damage: parsed.damage,
        source: "action" as const,
        note: a.description,
      };
    })
    .filter((a) => a.bonus !== undefined || a.damage);
}

/** "Large" / "Huge (dragon)" → TokenSize; anything unknown → medium. */
export function parseTokenSize(size: string | undefined): TokenSize {
  const s = (size ?? "").toLowerCase();
  if (s.includes("gargantuan")) return "gargantuan";
  if (s.includes("huge")) return "huge";
  if (s.includes("large")) return "large";
  if (s.includes("tiny")) return "tiny";
  if (s.includes("small")) return "small";
  return "medium";
}

/** "30 ft., fly 60 ft." → 30. Undefined/garbage → 30. */
export function parseSpeedFeet(speed: string | number | undefined): number {
  if (typeof speed === "number" && speed > 0) return speed;
  if (typeof speed === "string") {
    const m = /(\d+)/.exec(speed);
    if (m) return parseInt(m[1], 10);
  }
  return 30;
}
