import type {
  AbilityKey,
  AbilityScores,
  Character,
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
