import { newId } from "@/lib/domain/ids";
import { abilityMod } from "@/lib/domain/character";
import { rollDie } from "@/lib/domain/dice";
import type {
  Character,
  Combatant,
  Encounter,
  StatBlock,
} from "@/lib/domain/types";

/**
 * Helpers that turn campaign entities into live combatants for the War Table.
 * Initiative is auto-rolled (d20 + Dex mod) but always editable afterwards.
 */

export function rollInitiative(dexScore: number, bonus = 0): number {
  return rollDie(20) + abilityMod({ str: 10, dex: dexScore, con: 10, int: 10, wis: 10, cha: 10 }, "dex") + bonus;
}

export function combatantFromStatBlock(
  s: StatBlock,
  label?: string,
): Combatant {
  return {
    id: newId(),
    name: label ?? s.name,
    initiative: rollInitiative(s.abilityScores.dex),
    maxHp: s.maxHp,
    currentHp: s.maxHp,
    tempHp: 0,
    armorClass: s.armorClass,
    conditions: [],
    isPC: false,
    sourceId: s.id,
  };
}

export function combatantFromCharacter(c: Character): Combatant {
  return {
    id: newId(),
    name: c.name,
    initiative:
      rollDie(20) + abilityMod(c.abilityScores, "dex") + (c.initiativeBonus ?? 0),
    maxHp: c.maxHp,
    currentHp: c.currentHp,
    tempHp: c.tempHp,
    armorClass: c.armorClass,
    conditions: [],
    isPC: true,
    sourceId: c.id,
  };
}

export function manualCombatant(name = "Combatant"): Combatant {
  return {
    id: newId(),
    name,
    initiative: 10,
    maxHp: 10,
    currentHp: 10,
    tempHp: 0,
    armorClass: 10,
    conditions: [],
    isPC: false,
  };
}

/**
 * Expand an encounter's entries into individual combatants, numbering
 * duplicates (Goblin 1, Goblin 2, …). Stat blocks are looked up by id.
 */
export function combatantsFromEncounter(
  encounter: Encounter,
  statBlocks: StatBlock[],
): Combatant[] {
  const byId = new Map(statBlocks.map((s) => [s.id, s]));
  const combatants: Combatant[] = [];
  for (const entry of encounter.entries) {
    const block = byId.get(entry.statBlockId);
    if (!block) continue;
    for (let i = 0; i < entry.count; i++) {
      const label = entry.count > 1 ? `${block.name} ${i + 1}` : block.name;
      combatants.push(combatantFromStatBlock(block, label));
    }
  }
  return combatants;
}

/** Sort combatants by initiative, highest first. */
export function sortByInitiative(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => b.initiative - a.initiative);
}
