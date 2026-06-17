import { newId } from "@/lib/domain/ids";
import type { CreateInput } from "@/lib/data/provider";
import type { InventoryItem, Spell, StatBlock } from "@/lib/domain/types";
import type {
  CompendiumItem,
  CompendiumMonster,
  CompendiumSpell,
  CompendiumStatLine,
} from "./types";

export * from "./types";
export { COMPENDIUM_SPELLS } from "./spells";
export { COMPENDIUM_ITEMS } from "./items";
export { COMPENDIUM_MONSTERS } from "./monsters";

/** Compendium spell → a fresh character spell (unprepared, new id). */
export function spellToCharacterSpell(s: CompendiumSpell): Spell {
  return {
    id: newId(),
    name: s.name,
    level: s.level,
    school: s.school,
    prepared: false,
    castingTime: s.castingTime,
    range: s.range,
    components: s.components,
    duration: s.duration,
    description: s.description,
  };
}

/** Compendium item → a fresh inventory line (quantity 1, new id). */
export function itemToInventoryItem(i: CompendiumItem): InventoryItem {
  return {
    id: newId(),
    name: i.name,
    quantity: 1,
    weight: i.weight,
    value: i.value,
    category: i.category,
    rarity: i.rarity,
    properties: i.properties,
    damage: i.damage,
    description: i.description,
  };
}

/** Compendium monster → a CreateInput for a new bestiary stat block. */
export function monsterToStatBlockInput(
  m: CompendiumMonster,
  campaignId?: string,
): CreateInput<StatBlock> {
  const feature = (l: CompendiumStatLine) => ({
    id: newId(),
    name: l.name,
    description: l.description,
  });
  return {
    campaignId,
    kind: "monster",
    name: m.name,
    portraitUrl: "",
    size: m.size,
    type: m.type,
    alignment: m.alignment,
    armorClass: m.armorClass,
    armorNote: m.armorNote ?? "",
    maxHp: m.maxHp,
    hitDiceFormula: m.hitDiceFormula ?? "",
    speed: m.speed,
    abilityScores: m.abilityScores,
    savingThrows: m.savingThrows ?? "",
    skills: m.skills ?? "",
    senses: m.senses ?? "",
    languages: m.languages ?? "",
    challengeRating: m.challengeRating,
    damageResistances: m.damageResistances ?? "",
    damageImmunities: m.damageImmunities ?? "",
    damageVulnerabilities: "",
    conditionImmunities: m.conditionImmunities ?? "",
    traits: (m.traits ?? []).map(feature),
    actions: (m.actions ?? []).map(feature),
    reactions: [],
    legendaryActions: [],
    notes: "From the SRD compendium.",
  };
}
