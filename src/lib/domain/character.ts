import type {
  AbilityKey,
  AbilityScores,
  Character,
  Currency,
  DeathSaves,
  InventoryItem,
  ProficiencyLevel,
  SkillDef,
} from "./types";
import { SKILLS } from "./types";

/**
 * 5e character math. Pure helpers used by the sheet UI and the combat tracker.
 */

/** Ability modifier: floor((score − 10) / 2). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Render a modifier with an explicit sign, e.g. +3 / −1. */
export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
}

/** Proficiency bonus by character level (5e table). */
export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);
}

export function abilityMod(scores: AbilityScores, key: AbilityKey): number {
  return abilityModifier(scores[key]);
}

function profMultiplier(level: ProficiencyLevel): number {
  return level === "expertise" ? 2 : level === "proficient" ? 1 : 0;
}

/** Total bonus for a skill check, including proficiency/expertise. */
export function skillBonus(character: Character, skill: SkillDef): number {
  const base = abilityMod(character.abilityScores, skill.ability);
  const prof = character.skillProficiencies[skill.key] ?? "none";
  return base + profMultiplier(prof) * proficiencyBonus(character.level);
}

/** Saving throw bonus for an ability, including proficiency if trained. */
export function savingThrowBonus(
  character: Character,
  ability: AbilityKey,
): number {
  const base = abilityMod(character.abilityScores, ability);
  const proficient = character.savingThrowProficiencies[ability] ?? false;
  return base + (proficient ? proficiencyBonus(character.level) : 0);
}

/** Initiative = dex mod + any misc bonus. */
export function initiativeBonus(character: Character): number {
  return (
    abilityMod(character.abilityScores, "dex") + (character.initiativeBonus ?? 0)
  );
}

/** Passive Perception = 10 + Perception skill bonus. */
export function passivePerception(character: Character): number {
  const perception = SKILLS.find((s) => s.key === "perception")!;
  return 10 + skillBonus(character, perception);
}

export function spellSaveDC(character: Character): number | null {
  if (!character.spellcastingAbility) return null;
  return (
    8 +
    proficiencyBonus(character.level) +
    abilityMod(character.abilityScores, character.spellcastingAbility)
  );
}

export function spellAttackBonus(character: Character): number | null {
  if (!character.spellcastingAbility) return null;
  return (
    proficiencyBonus(character.level) +
    abilityMod(character.abilityScores, character.spellcastingAbility)
  );
}

/** A blank but valid character, used when creating a new sheet. */
export function emptyAbilityScores(): AbilityScores {
  return { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
}

// --- Inventory, encumbrance & wealth ---------------------------------------

/** 5e: 50 coins weigh 1 lb. */
const COIN_WEIGHT = 1 / 50;
export const ATTUNEMENT_LIMIT = 3;

export function emptyCurrency(): Currency {
  return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
}

function coinCount(c?: Currency): number {
  if (!c) return 0;
  return (c.cp ?? 0) + (c.sp ?? 0) + (c.ep ?? 0) + (c.gp ?? 0) + (c.pp ?? 0);
}

export function coinWeight(c?: Currency): number {
  return coinCount(c) * COIN_WEIGHT;
}

export function itemWeight(item: InventoryItem): number {
  return (item.weight ?? 0) * (item.quantity ?? 1);
}

/** Total carried weight in lb (items + coins), rounded to 0.01. */
export function totalCarriedWeight(character: Character): number {
  const items = character.inventory.reduce((sum, i) => sum + itemWeight(i), 0);
  return Math.round((items + coinWeight(character.currency)) * 100) / 100;
}

/** Carrying capacity in lb: STR × 15. */
export function carryingCapacity(character: Character): number {
  return character.abilityScores.str * 15;
}

export type EncumbranceLevel =
  | "unencumbered"
  | "encumbered"
  | "heavily"
  | "overloaded";

const ENCUMBRANCE_LABELS: Record<EncumbranceLevel, string> = {
  unencumbered: "Unencumbered",
  encumbered: "Encumbered",
  heavily: "Heavily Encumbered",
  overloaded: "Over Capacity",
};

export function encumbrance(character: Character): {
  weight: number;
  capacity: number;
  level: EncumbranceLevel;
  label: string;
} {
  const str = character.abilityScores.str;
  const weight = totalCarriedWeight(character);
  const capacity = str * 15;
  let level: EncumbranceLevel = "unencumbered";
  if (weight > capacity) level = "overloaded";
  else if (weight > str * 10) level = "heavily";
  else if (weight > str * 5) level = "encumbered";
  return { weight, capacity, level, label: ENCUMBRANCE_LABELS[level] };
}

/** Summed item value (gp) across the inventory. */
export function totalItemValue(character: Character): number {
  return character.inventory.reduce(
    (sum, i) => sum + (i.value ?? 0) * (i.quantity ?? 1),
    0,
  );
}

/** Total wealth in gp: coins (converted) + item values. */
export function totalWealthGp(character: Character): number {
  const c = character.currency;
  const coins = c
    ? c.pp * 10 + c.gp + c.ep * 0.5 + c.sp * 0.1 + c.cp * 0.01
    : 0;
  return Math.round((coins + totalItemValue(character)) * 100) / 100;
}

export function attunedCount(character: Character): number {
  return character.inventory.filter((i) => i.attuned).length;
}

// --- Rest, hit dice, exhaustion & death saves ------------------------------

export const MAX_EXHAUSTION = 6;

/** Class hit-die size (e.g. 8 → d8). Defaults to d8. */
export function hitDieSize(character: Character): number {
  return character.hitDieSize ?? 8;
}

/** Hit dice still available to spend on a short rest. */
export function hitDiceRemaining(character: Character): number {
  return Math.max(0, character.level - (character.hitDiceUsed ?? 0));
}

/** Fresh, all-zero death saves. */
export function emptyDeathSaves(): DeathSaves {
  return { successes: 0, failures: 0 };
}

/**
 * The patch a long rest applies: full HP, all spell slots restored, half the
 * spent hit dice regained (min 1), exhaustion reduced by one, and temp HP,
 * concentration & death saves cleared. Empty string (not undefined) clears
 * `concentratingOn` so the change survives JSON to the server.
 */
export function longRestPatch(character: Character): Partial<Character> {
  const regain = Math.max(1, Math.floor(character.level / 2));
  const hitDiceUsed = Math.max(0, (character.hitDiceUsed ?? 0) - regain);
  const spellSlots = (character.spellSlots ?? []).map((s) => ({
    ...s,
    used: 0,
  }));
  return {
    currentHp: character.maxHp,
    tempHp: 0,
    hitDiceUsed,
    spellSlots,
    exhaustion: Math.max(0, (character.exhaustion ?? 0) - 1),
    concentratingOn: "",
    deathSaves: emptyDeathSaves(),
  };
}
