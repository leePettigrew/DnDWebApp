import type {
  AbilityScores,
  ItemCategory,
  ItemRarity,
} from "@/lib/domain/types";

/**
 * Static SRD reference content shipped with the app (System Reference Document
 * 5.1, CC-BY-4.0). These are plain data — browsed in the Compendium and dropped
 * into characters, encounters, and the bestiary. Ids/timestamps are assigned by
 * the data layer at drop time, so the entries carry none.
 */

export interface CompendiumSpell {
  name: string;
  /** 0 = cantrip … 9. */
  level: number;
  school: string;
  /** Class lists this spell appears on (for filtering). */
  classes: string[];
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  /** True if it requires concentration. */
  concentration?: boolean;
  description: string;
}

export interface CompendiumItem {
  name: string;
  category: ItemCategory;
  rarity?: ItemRarity;
  /** Weight in pounds. */
  weight?: number;
  /** Value in gold pieces. */
  value?: number;
  properties?: string;
  damage?: string;
  description?: string;
}

export interface CompendiumStatLine {
  name: string;
  description: string;
}

export interface CompendiumMonster {
  name: string;
  size: string;
  type: string;
  alignment: string;
  armorClass: number;
  armorNote?: string;
  maxHp: number;
  hitDiceFormula?: string;
  speed: string;
  abilityScores: AbilityScores;
  savingThrows?: string;
  skills?: string;
  senses?: string;
  languages?: string;
  challengeRating: string;
  damageResistances?: string;
  damageImmunities?: string;
  conditionImmunities?: string;
  traits?: CompendiumStatLine[];
  actions?: CompendiumStatLine[];
}
