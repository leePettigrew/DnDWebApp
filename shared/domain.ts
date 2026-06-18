import type { ID, ISODateString } from "./ids";

/**
 * Domain model for Dragon's Ledger — the SHARED single source of truth.
 *
 * Imported by the client via `@shared/domain` (re-exported from
 * `src/lib/domain/types.ts` so all existing `@/lib/domain/types` imports keep
 * working) and by the server via a relative import. Persistence-agnostic.
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

export type ItemCategory =
  | "weapon"
  | "armor"
  | "shield"
  | "ammunition"
  | "gear"
  | "consumable"
  | "tool"
  | "treasure"
  | "magic"
  | "other";

export const ITEM_CATEGORIES: { key: ItemCategory; label: string }[] = [
  { key: "weapon", label: "Weapon" },
  { key: "armor", label: "Armor" },
  { key: "shield", label: "Shield" },
  { key: "ammunition", label: "Ammunition" },
  { key: "gear", label: "Adventuring Gear" },
  { key: "consumable", label: "Consumable" },
  { key: "tool", label: "Tool" },
  { key: "treasure", label: "Treasure" },
  { key: "magic", label: "Magic Item" },
  { key: "other", label: "Other" },
];

export type ItemRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "very-rare"
  | "legendary"
  | "artifact";

export const ITEM_RARITIES: { key: ItemRarity; label: string }[] = [
  { key: "common", label: "Common" },
  { key: "uncommon", label: "Uncommon" },
  { key: "rare", label: "Rare" },
  { key: "very-rare", label: "Very Rare" },
  { key: "legendary", label: "Legendary" },
  { key: "artifact", label: "Artifact" },
];

export interface InventoryItem {
  id: ID;
  name: string;
  quantity: number;
  /** Weight in pounds, per single unit. */
  weight?: number;
  /** Value in gold pieces, per single unit. */
  value?: number;
  category?: ItemCategory;
  rarity?: ItemRarity;
  equipped?: boolean;
  /** Requires attunement (counts toward the limit of 3). */
  attuned?: boolean;
  /** Weapon/armor blurb, e.g. "Versatile (1d10), Finesse" or "AC 16, Stealth disadv." */
  properties?: string;
  /** Weapon attack bonus (to hit). When set, the sheet shows a rollable attack. */
  attackBonus?: number;
  /** Weapon damage, e.g. "1d8+3 slashing". Rollable on the sheet. */
  damage?: string;
  description?: string;
}

/** 5e coinage. 50 coins of any kind weigh 1 lb. */
export interface Currency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
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

/** Expendable spell slots for one spell level (casters only). */
export interface SpellSlotLevel {
  level: number; // 1..9
  max: number;
  used: number;
}

/** Death saving throws, tracked while a creature is at 0 HP. */
export interface DeathSaves {
  successes: number; // 0..3
  failures: number; // 0..3
}

/** The 5e exhaustion ladder; index = exhaustion level (0 = none, 6 = death). */
export const EXHAUSTION_EFFECTS: string[] = [
  "No exhaustion",
  "Disadvantage on ability checks",
  "Speed halved",
  "Disadvantage on attack rolls & saving throws",
  "Hit point maximum halved",
  "Speed reduced to 0",
  "Death",
];

export interface Feature {
  id: ID;
  name: string;
  description?: string;
}

/** A player character — the full 5e sheet. */
export interface Character extends Entity {
  campaignId?: ID;
  /** Owner user id (Phase 2). Set server-side; the owner + DM may edit. */
  ownerId?: ID;
  /** DM visibility — hidden from players unless revealed (see visibleTo). */
  hidden?: boolean;
  /** Player user ids allowed to see this while hidden. */
  visibleTo?: ID[];
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
  /** Size of the class hit die (e.g. 8 for d8). Defaults to 8 when absent. */
  hitDieSize?: number;
  /** Hit dice already spent on short rests (regained on a long rest). */
  hitDiceUsed?: number;
  /** Death saving throws — used when currentHp hits 0. */
  deathSaves?: DeathSaves;
  /** Exhaustion level 0..6 (see EXHAUSTION_EFFECTS). */
  exhaustion?: number;

  armorClass: number;
  speed: number;
  /** Misc bonus added to the dex-based initiative roll. */
  initiativeBonus?: number;

  spellcastingAbility?: AbilityKey;
  spells: Spell[];
  /** Expendable spell slots by level (casters only). */
  spellSlots?: SpellSlotLevel[];
  /** The spell currently being concentrated on, if any. */
  concentratingOn?: string;

  inventory: InventoryItem[];
  /** Coin purse. Optional for back-compat; treated as all-zero when absent. */
  currency?: Currency;
  features: Feature[];

  languages?: string;
  notes?: string;
}

/** A stat block, used for both monsters and NPCs (kind distinguishes them). */
export interface StatBlock extends Entity {
  campaignId?: ID;
  kind: "monster" | "npc";
  /** DM visibility — hidden from players unless revealed (see visibleTo). */
  hidden?: boolean;
  /** Player user ids allowed to see this while hidden. */
  visibleTo?: ID[];
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
  /** Death saving throws, tracked while the combatant is at 0 HP. */
  deathSaves?: DeathSaves;
  /** Optional link back to the source Character or StatBlock. */
  sourceId?: ID;
  notes?: string;
}

/**
 * The live combat tracker. In Phase 1 it's a single global document; in Phase 2
 * there is one per campaign (the server keys it by campaign). The shape is
 * identical so the UI is unchanged.
 */
export interface CombatState {
  id: "combat"; // singleton key
  active: boolean;
  round: number;
  /** Index into the initiative-sorted combatants array whose turn it is. */
  turnIndex: number;
  combatants: Combatant[];
  encounterName?: string;
  /** The battle map shown on the War Table (id of a BattleMap). */
  activeMapId?: ID;
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

// --- Campaign & world ------------------------------------------------------

export interface QuestObjective {
  id: ID;
  text: string;
  done: boolean;
}
export type QuestStatus = "active" | "completed" | "failed";

export interface Quest extends Entity {
  campaignId?: ID;
  title: string;
  description?: string;
  status: QuestStatus;
  objectives: QuestObjective[];
  reward?: string;
  pinned?: boolean;
}

export type FactionStanding =
  | "ally"
  | "friendly"
  | "neutral"
  | "suspicious"
  | "hostile";

export const FACTION_STANDINGS: { key: FactionStanding; label: string }[] = [
  { key: "ally", label: "Ally" },
  { key: "friendly", label: "Friendly" },
  { key: "neutral", label: "Neutral" },
  { key: "suspicious", label: "Suspicious" },
  { key: "hostile", label: "Hostile" },
];

export type FactionType =
  | "guild"
  | "cult"
  | "noble"
  | "military"
  | "criminal"
  | "religious"
  | "mercantile"
  | "arcane"
  | "other";

export const FACTION_TYPES: { key: FactionType; label: string }[] = [
  { key: "guild", label: "Guild" },
  { key: "cult", label: "Cult" },
  { key: "noble", label: "Noble House" },
  { key: "military", label: "Military" },
  { key: "criminal", label: "Criminal" },
  { key: "religious", label: "Religious Order" },
  { key: "mercantile", label: "Merchant Company" },
  { key: "arcane", label: "Arcane Order" },
  { key: "other", label: "Other" },
];

/** How one faction relates to another. */
export type FactionRelationKind =
  | "allied"
  | "friendly"
  | "neutral"
  | "rival"
  | "war";

export const FACTION_RELATIONS: { key: FactionRelationKind; label: string }[] = [
  { key: "allied", label: "Allied" },
  { key: "friendly", label: "Friendly" },
  { key: "neutral", label: "Neutral" },
  { key: "rival", label: "Rivals" },
  { key: "war", label: "At War" },
];

/** One character's (or player's) standing with a faction. */
export interface FactionRep {
  id: ID;
  /** Linked PC, if any. */
  characterId?: ID;
  /** Display label (PC/player name) when not linked. */
  name?: string;
  value: number;
}

/** A reputation rank earned at a threshold. */
export interface FactionRank {
  id: ID;
  name: string;
  minRep: number;
}

/** A benefit unlocked at a reputation threshold. */
export interface FactionReward {
  id: ID;
  minRep: number;
  title: string;
}

/** A relationship to another faction. */
export interface FactionRelationship {
  id: ID;
  otherFactionId: ID;
  kind: FactionRelationKind;
  note?: string;
}

/** A member of the faction — a linked NPC/PC or a plain name. */
export interface FactionMember {
  id: ID;
  name: string;
  statBlockId?: ID;
  characterId?: ID;
  role?: string;
  leader?: boolean;
}

/** A faction agenda tracked as a progress clock. */
export interface FactionAgenda {
  id: ID;
  title: string;
  segments: number;
  filled: number;
  note?: string;
  done?: boolean;
}

/** A dated entry in a faction's history log. */
export interface FactionLogEntry {
  id: ID;
  date?: string;
  text: string;
}

export interface Faction extends Entity {
  campaignId?: ID;
  name: string;
  description?: string;
  standing: FactionStanding;
  goals?: string;
  notes?: string;

  // --- rich profile ---
  type?: FactionType;
  /** Symbol/banner image (URL or data URL). */
  symbolUrl?: string;
  /** Accent color (hex). */
  color?: string;
  /** Headquarters location (free text). */
  hq?: string;
  /** Optional atlas pin for the HQ. */
  hqMapId?: ID;
  hqX?: number;
  hqY?: number;
  /** Power & wealth tiers, 0..5. */
  power?: number;
  wealth?: number;

  // --- systems ---
  /** Per-player/PC reputation tracks. */
  reputation?: FactionRep[];
  /** Reputation rank thresholds. */
  ranks?: FactionRank[];
  /** Benefits unlocked by reputation. */
  rewards?: FactionReward[];
  /** Relationships to other factions. */
  relationships?: FactionRelationship[];
  /** Linked members (NPCs/PCs). */
  members?: FactionMember[];
  /** Agendas as progress clocks. */
  agendas?: FactionAgenda[];
  /** Linked quest ids. */
  questIds?: ID[];
  /** Dated history log. */
  history?: FactionLogEntry[];

  // --- DM-only / visibility ---
  /** DM-only secret intel. */
  secrets?: string;
  hidden?: boolean;
  visibleTo?: ID[];
}

/** A dated event on the campaign's in-world timeline. */
export interface TimelineEvent extends Entity {
  campaignId?: ID;
  /** Free-form in-world date label, e.g. "15th of Mirtul, 1492 DR". */
  date: string;
  title: string;
  description?: string;
  /** Sort key (lower = earlier) so events order without parsing dates. */
  order: number;
}

/**
 * Tactical map layers (Phase 3). All coordinates are in MAP IMAGE PIXELS, so
 * they're resolution-independent of the viewer's pan/zoom.
 */
export interface Wall {
  id: ID;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MapDrawing {
  id: ID;
  color: string;
  width: number;
  /** Flattened polyline: [x1, y1, x2, y2, …]. */
  points: number[];
}

export interface MapToken {
  id: ID;
  /** Links to a Combatant so HP/labels can track the War Table. */
  combatantId?: ID;
  label: string;
  x: number;
  y: number;
  /** Token radius in map pixels (≈ half a grid cell). */
  radius: number;
  color: string;
  isPC: boolean;
  /** User allowed to move this token (their character's token). */
  ownerId?: ID;
  /** Vision radius in map pixels. 0/undefined → no light (relies on others). */
  visionRadius?: number;
  /** DM-hidden token — never shown to players. */
  hidden?: boolean;
  portraitUrl?: string;
}

/** A labelled point of interest on an overworld map (percent coordinates). */
export interface MapLocation {
  id: ID;
  name: string;
  description?: string;
  /** Position as a percentage (0..100) of the map image's width/height. */
  x: number;
  y: number;
}

export interface BattleMap extends Entity {
  campaignId?: ID;
  name: string;
  /** Image slot: a URL or data: URL to the battle map art. */
  imageUrl: string;
  notes?: string;
  /** Overworld points of interest (opaque to the tactical layer). */
  locations?: MapLocation[];

  // --- tactical layer (optional; absent on plain Codex maps) ---
  /** Natural image size in px (for fog/vision bounds). */
  width?: number;
  height?: number;
  /** Grid cell size in image px. 0/undefined → no grid. */
  gridSize?: number;
  gridOffsetX?: number;
  gridOffsetY?: number;
  /** Feet represented by one cell (default 5). */
  feetPerCell?: number;
  showGrid?: boolean;
  /** Whether players' view is fogged by line of sight. */
  fogEnabled?: boolean;
  walls?: Wall[];
  drawings?: MapDrawing[];
  tokens?: MapToken[];
}

// ---------------------------------------------------------------------------
// Homebrew / custom content — admin-global or per-campaign.
// ---------------------------------------------------------------------------

export interface CustomSpell {
  id: ID;
  name: string;
  level: number; // 0 = cantrip … 9
  school?: string;
  classes: string[];
  castingTime?: string;
  range?: string;
  components?: string;
  duration?: string;
  concentration?: boolean;
  description?: string;
  /** DM visibility (campaign scope) — hidden from players unless revealed. */
  hidden?: boolean;
  visibleTo?: ID[];
}

export interface CustomItem {
  id: ID;
  name: string;
  category: ItemCategory;
  rarity?: ItemRarity;
  weight?: number;
  value?: number;
  properties?: string;
  damage?: string;
  description?: string;
  /** DM visibility (campaign scope) — hidden from players unless revealed. */
  hidden?: boolean;
  visibleTo?: ID[];
}

export type CoinDenomination = keyof Currency; // cp | sp | ep | gp | pp

/** A dice-based coin reward, e.g. 2d6 × 10 gp. */
export interface LootCoinSpec {
  count: number;
  sides: number;
  multiplier: number;
  denomination: CoinDenomination;
}

/** One weighted outcome on a loot table. A blank name means "nothing". */
export interface LootTableEntry {
  id: ID;
  weight: number;
  name: string;
  category?: ItemCategory;
  rarity?: ItemRarity;
  value?: number;
  /** Item weight in lb. */
  itemWeight?: number;
  properties?: string;
  damage?: string;
  description?: string;
}

export interface LootTable {
  id: ID;
  name: string;
  description?: string;
  coins?: LootCoinSpec;
  /** Number of weighted picks per roll. */
  picks: number;
  entries: LootTableEntry[];
  /** DM visibility (campaign scope) — hidden from players unless revealed. */
  hidden?: boolean;
  visibleTo?: ID[];
}

export type SrdOverrideTargetKind = "spell" | "item" | "monster";

/** An edit/hide of a built-in SRD entry, keyed by its (stable) name. */
export interface SrdOverride {
  id: ID;
  targetKind: SrdOverrideTargetKind;
  targetName: string;
  /** Hide the SRD entry from the compendium (for this scope). */
  hidden?: boolean;
  /** Field values merged over the SRD entry. */
  data?: Record<string, unknown>;
}

export type CustomContentKind = "spell" | "item" | "loot" | "override";
export type CustomContentScope = "global" | "campaign";

/** A stored homebrew record wrapping one of the content payloads. */
export interface CustomContentRecord extends Entity {
  scope: CustomContentScope;
  campaignId?: ID;
  kind: CustomContentKind;
  data: CustomSpell | CustomItem | LootTable;
}

/** Dice — see ./dice for the engine. */
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
 * the same roll fields, plus optional multiplayer attribution.
 *
 * Phase 1 leaves the attribution fields undefined — nothing changes.
 */
export interface RollHistoryEntry extends Entity, Omit<RollResult, "id"> {
  campaignId?: ID;
  /** Who rolled it (Phase 2). */
  rolledByUserId?: ID;
  rolledByName?: string;
  /** A DM "hidden" roll — server only delivers it to the DM. */
  hidden?: boolean;
  /** A hand-thrown roll from the 3D dice arena (trust-based). */
  physical?: boolean;
}
