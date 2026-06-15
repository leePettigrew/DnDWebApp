import type { ID, ISODateString } from "./ids";

/**
 * Domain model for Dragon's Ledger.
 *
 * These types are deliberately persistence-agnostic — they describe the shapes
 * the UI and features work with, and say nothing about *how* they are stored.
 * The data layer (src/lib/data) is the only place that knows about storage.
 */

/** Every stored record carries an id and audit timestamps. */
export interface Entity {
  id: ID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** The six 5e ability scores. */
export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export const ABILITY_KEYS: AbilityKey[] = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
];

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export type AbilityScores = Record<AbilityKey, number>;

/** The 18 standard 5e skills and which ability governs each. */
export type SkillKey =
  | "acrobatics"
  | "animalHandling"
  | "arcana"
  | "athletics"
  | "deception"
  | "history"
  | "insight"
  | "intimidation"
  | "investigation"
  | "medicine"
  | "nature"
  | "perception"
  | "performance"
  | "persuasion"
  | "religion"
  | "sleightOfHand"
  | "stealth"
  | "survival";

export interface SkillDef {
  key: SkillKey;
  label: string;
  ability: AbilityKey;
}

export const SKILLS: SkillDef[] = [
  { key: "acrobatics", label: "Acrobatics", ability: "dex" },
  { key: "animalHandling", label: "Animal Handling", ability: "wis" },
  { key: "arcana", label: "Arcana", ability: "int" },
  { key: "athletics", label: "Athletics", ability: "str" },
  { key: "deception", label: "Deception", ability: "cha" },
  { key: "history", label: "History", ability: "int" },
  { key: "insight", label: "Insight", ability: "wis" },
  { key: "intimidation", label: "Intimidation", ability: "cha" },
  { key: "investigation", label: "Investigation", ability: "int" },
  { key: "medicine", label: "Medicine", ability: "wis" },
  { key: "nature", label: "Nature", ability: "int" },
  { key: "perception", label: "Perception", ability: "wis" },
  { key: "performance", label: "Performance", ability: "cha" },
  { key: "persuasion", label: "Persuasion", ability: "cha" },
  { key: "religion", label: "Religion", ability: "int" },
  { key: "sleightOfHand", label: "Sleight of Hand", ability: "dex" },
  { key: "stealth", label: "Stealth", ability: "dex" },
  { key: "survival", label: "Survival", ability: "wis" },
];

/** none = not proficient, proficient = +PB, expertise = +2·PB. */
export type ProficiencyLevel = "none" | "proficient" | "expertise";

export interface InventoryItem {
  id: ID;
  name: string;
  quantity: number;
  weight?: number;
  description?: string;
  equipped?: boolean;
}

export interface Spell {
  id: ID;
  name: string;
  level: number; // 0 = cantrip ... 9
  school?: string;
  prepared?: boolean;
  castingTime?: string;
  range?: string;
  components?: string;
  duration?: string;
  description?: string;
}

export interface Feature {
  id: ID;
  name: string;
  description?: string;
}

/** A player character — the full 5e sheet. */
export interface Character extends Entity {
  campaignId?: ID;
  name: string;
  /** Art slot: a portrait URL or data: URL. Empty → themed placeholder. */
  portraitUrl?: string;

  race: string;
  className: string;
  subclass?: string;
  level: number;
  background?: string;
  alignment?: string;

  abilityScores: AbilityScores;
  /** Skills the character is proficient/expert in (default: none). */
  skillProficiencies: Partial<Record<SkillKey, ProficiencyLevel>>;
  savingThrowProficiencies: Partial<Record<AbilityKey, boolean>>;

  maxHp: number;
  currentHp: number;
  tempHp: number;
  hitDice?: string;

  armorClass: number;
  speed: number;
  /** Misc bonus added to the dex-based initiative roll. */
  initiativeBonus?: number;

  spellcastingAbility?: AbilityKey;
  spells: Spell[];

  inventory: InventoryItem[];
  features: Feature[];

  languages?: string;
  notes?: string;
}

/** A stat block, used for both monsters and NPCs (kind distinguishes them). */
export interface StatBlock extends Entity {
  campaignId?: ID;
  kind: "monster" | "npc";
  name: string;
  /** Art slot: monster/NPC art URL or data: URL. Empty → themed placeholder. */
  portraitUrl?: string;

  size?: string;
  type?: string; // e.g. "Humanoid (goblinoid)"
  alignment?: string;

  armorClass: number;
  armorNote?: string;
  maxHp: number;
  hitDiceFormula?: string; // e.g. "2d6+2"
  speed?: string;

  abilityScores: AbilityScores;

  savingThrows?: string;
  skills?: string;
  senses?: string;
  languages?: string;
  challengeRating?: string; // "1/4", "5", etc.

  damageResistances?: string;
  damageImmunities?: string;
  damageVulnerabilities?: string;
  conditionImmunities?: string;

  traits: Feature[];
  actions: Feature[];
  reactions: Feature[];
  legendaryActions: Feature[];

  notes?: string;
}

/** A named, reusable group of combatants assembled from stat blocks. */
export interface EncounterEntry {
  id: ID;
  statBlockId: ID;
  /** Snapshot name so the entry still reads if the stat block is deleted. */
  label: string;
  count: number;
}

export interface Encounter extends Entity {
  campaignId?: ID;
  name: string;
  description?: string;
  entries: EncounterEntry[];
}

/** The 5e conditions tracked in combat. */
export type ConditionKey =
  | "blinded"
  | "charmed"
  | "deafened"
  | "frightened"
  | "grappled"
  | "incapacitated"
  | "invisible"
  | "paralyzed"
  | "petrified"
  | "poisoned"
  | "prone"
  | "restrained"
  | "stunned"
  | "unconscious"
  | "concentration"
  | "exhaustion";

export const CONDITIONS: { key: ConditionKey; label: string }[] = [
  { key: "blinded", label: "Blinded" },
  { key: "charmed", label: "Charmed" },
  { key: "concentration", label: "Concentration" },
  { key: "deafened", label: "Deafened" },
  { key: "exhaustion", label: "Exhaustion" },
  { key: "frightened", label: "Frightened" },
  { key: "grappled", label: "Grappled" },
  { key: "incapacitated", label: "Incapacitated" },
  { key: "invisible", label: "Invisible" },
  { key: "paralyzed", label: "Paralyzed" },
  { key: "petrified", label: "Petrified" },
  { key: "poisoned", label: "Poisoned" },
  { key: "prone", label: "Prone" },
  { key: "restrained", label: "Restrained" },
  { key: "stunned", label: "Stunned" },
  { key: "unconscious", label: "Unconscious" },
];

export interface Combatant {
  id: ID;
  name: string;
  initiative: number;
  maxHp: number;
  currentHp: number;
  tempHp: number;
  armorClass: number;
  conditions: ConditionKey[];
  isPC: boolean;
  /** Optional link back to the source Character or StatBlock. */
  sourceId?: ID;
  notes?: string;
}

/**
 * The live combat tracker is a single document (one encounter in progress at a
 * time for Phase 1). Stored as a singleton so the tracker can subscribe to it.
 */
export interface CombatState {
  id: "combat"; // singleton key
  active: boolean;
  round: number;
  /** Index into the initiative-sorted combatants array whose turn it is. */
  turnIndex: number;
  combatants: Combatant[];
  encounterName?: string;
  updatedAt: ISODateString;
}

export interface Campaign extends Entity {
  name: string;
  description?: string;
  setting?: string;
  /** Art slot for a campaign banner. */
  bannerUrl?: string;
}

export interface Note extends Entity {
  campaignId?: ID;
  title: string;
  /** Lightweight markdown (headings, bold/italic, lists, quotes). */
  body: string;
  tags: string[];
  pinned: boolean;
}

export interface SessionLog extends Entity {
  campaignId?: ID;
  title: string;
  /** The in-world / real date of the session (YYYY-MM-DD). */
  date: string;
  body: string;
}

export interface BattleMap extends Entity {
  campaignId?: ID;
  name: string;
  /** Image slot: a URL or data: URL to the battle map art. */
  imageUrl: string;
  notes?: string;
}

/** Dice — see src/lib/domain/dice.ts for the engine. */
export type RollMode = "normal" | "advantage" | "disadvantage";

export interface DiceGroup {
  count: number;
  sides: number;
}

export interface RollSpec {
  label?: string;
  groups: DiceGroup[];
  modifier: number;
  mode: RollMode;
}

export interface RollPreset extends Entity {
  name: string;
  spec: RollSpec;
}

export interface DieRoll {
  sides: number;
  value: number;
  /** For advantage/disadvantage on a d20: both values + which was kept. */
  pair?: [number, number];
  dropped?: boolean;
}

export interface RollResult {
  id: ID;
  timestamp: ISODateString;
  label?: string;
  mode: RollMode;
  rolls: DieRoll[];
  modifier: number;
  total: number;
  /** Natural 20 on a d20 in this roll. */
  isCrit: boolean;
  /** Natural 1 on a d20 in this roll. */
  isFumble: boolean;
  /** Compact human-readable summary, e.g. "1d20+5". */
  notation: string;
}

/**
 * A persisted roll. `RollResult` is the pure engine output; the stored history
 * entry is an Entity (id + timestamps managed by the data layer) carrying all
 * the same roll fields. Save with: `const { id, ...rest } = result; create(rest)`.
 */
export interface RollHistoryEntry extends Entity, Omit<RollResult, "id"> {}
