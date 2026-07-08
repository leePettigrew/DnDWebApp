import type {
  Character,
  Combatant,
  InventoryItem,
  Spell,
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
  /** Ranged weapon distances in feet (normal/long), when the text says so. */
  range?: { normal: number; long: number };
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
        range: parseWeaponRange(i.properties) ?? undefined,
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
        range: parseWeaponRange(a.description) ?? undefined,
      };
    })
    .filter((a) => a.bonus !== undefined || a.damage);
}

/** "Ammunition (range 80/320)" / "range 20/60" → { normal, long } feet. */
export function parseWeaponRange(text: string | undefined): { normal: number; long: number } | null {
  if (!text) return null;
  const m = /(\d+)\s*\/\s*(\d+)/.exec(text);
  if (!m) return null;
  return { normal: parseInt(m[1], 10), long: parseInt(m[2], 10) };
}

/** What a spell's description yields for the table: dice, area, range, save. */
export interface SpellEffect {
  /** Rollable damage/healing formula, e.g. "8d6 fire". */
  damage?: string;
  /** AoE template if the text names one (cube ≈ circle of half its side). */
  shape?: "circle" | "cone" | "line";
  feet?: number;
  /** Human range: "60 ft", "Touch", "Self"… */
  rangeText?: string;
  /** Saving throw ability, e.g. "DEX". */
  save?: string;
}

const SPELL_AREA_RE = /(\d+)-foot(?:-radius)?(?:\s+(?:radius|long|tall|wide))*\s*(sphere|radius|circle|cylinder|cone|line|cube|square)/i;
const SPELL_RANGE_RE = /range[:\s]+(self|touch|sight|(\d+)\s*(?:feet|foot|ft))/i;
const SPELL_SAVE_RE = /(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+saving\s+throw/i;
const DICE_RE = /(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*([a-z]+)?/i;

/** Best-effort read of a spell description (free text) into table effects. */
export function parseSpellEffect(desc: string | undefined): SpellEffect {
  if (!desc) return {};
  const out: SpellEffect = {};
  const dice = DICE_RE.exec(desc);
  if (dice) {
    const type = dice[2] && /^[a-z]{3,}$/i.test(dice[2]) ? ` ${dice[2]}` : "";
    out.damage = dice[1].replace(/\s+/g, "") + type;
  }
  const area = SPELL_AREA_RE.exec(desc);
  if (area) {
    const feet = parseInt(area[1], 10);
    const kind = area[2].toLowerCase();
    if (kind === "cone") {
      out.shape = "cone";
      out.feet = feet;
    } else if (kind === "line") {
      out.shape = "line";
      out.feet = feet;
    } else if (kind === "cube" || kind === "square") {
      out.shape = "circle";
      out.feet = Math.max(5, Math.round(feet / 2));
    } else {
      out.shape = "circle";
      out.feet = feet;
    }
  }
  const range = SPELL_RANGE_RE.exec(desc);
  if (range) out.rangeText = range[2] ? `${range[2]} ft` : range[1][0].toUpperCase() + range[1].slice(1).toLowerCase();
  const save = SPELL_SAVE_RE.exec(desc);
  if (save) out.save = save[1].slice(0, 3).toUpperCase();
  return out;
}

/** Spells that do something rollable/placeable at the table. */
export function usableSpells(char: Character | null): { spell: Spell; fx: SpellEffect }[] {
  if (!char) return [];
  return (char.spells ?? [])
    .map((spell) => ({ spell, fx: parseSpellEffect(spell.description) }))
    .filter(({ fx }) => fx.damage || fx.shape || fx.save);
}

/** Non-weapon items with dice in their text (potions, wands, scrolls…). */
export function usableItems(char: Character | null): { item: InventoryItem; dice: string }[] {
  if (!char) return [];
  return (char.inventory ?? [])
    .filter((i) => i.category !== "weapon" && (i.quantity ?? 0) > 0)
    .map((i) => {
      const m = DICE_RE.exec(`${i.properties ?? ""} ${i.description ?? ""}`);
      return m ? { item: i, dice: m[1].replace(/\s+/g, "") } : null;
    })
    .filter((x): x is { item: InventoryItem; dice: string } => !!x);
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
