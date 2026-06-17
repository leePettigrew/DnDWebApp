import type {
  Campaign,
  Character,
  Encounter,
  Faction,
  Note,
  Quest,
  SessionLog,
  StatBlock,
  TimelineEvent,
  BattleMap,
} from "./types";
import { emptyAbilityScores, emptyCurrency } from "./character";
import type { CreateInput } from "@/lib/data/provider";

/**
 * Factories for new entities. They return `CreateInput<T>` (no id/timestamps) —
 * exactly what `repository.create()` expects — with sensible 5e defaults so a
 * freshly-created record is already valid and editable.
 */

export function newCharacterInput(
  campaignId?: string,
): CreateInput<Character> {
  return {
    campaignId,
    name: "New Hero",
    portraitUrl: "",
    race: "",
    className: "",
    subclass: "",
    level: 1,
    background: "",
    alignment: "",
    abilityScores: emptyAbilityScores(),
    skillProficiencies: {},
    savingThrowProficiencies: {},
    maxHp: 8,
    currentHp: 8,
    tempHp: 0,
    hitDice: "1d8",
    armorClass: 10,
    speed: 30,
    initiativeBonus: 0,
    spells: [],
    inventory: [],
    currency: emptyCurrency(),
    features: [],
    languages: "Common",
    notes: "",
  };
}

export function newStatBlockInput(
  kind: StatBlock["kind"],
  campaignId?: string,
): CreateInput<StatBlock> {
  return {
    campaignId,
    kind,
    name: kind === "npc" ? "New NPC" : "New Monster",
    portraitUrl: "",
    size: "Medium",
    type: kind === "npc" ? "Humanoid" : "Beast",
    alignment: "Unaligned",
    armorClass: 12,
    armorNote: "",
    maxHp: 10,
    hitDiceFormula: "",
    speed: "30 ft.",
    abilityScores: emptyAbilityScores(),
    savingThrows: "",
    skills: "",
    senses: "Passive Perception 10",
    languages: "",
    challengeRating: "1",
    damageResistances: "",
    damageImmunities: "",
    damageVulnerabilities: "",
    conditionImmunities: "",
    traits: [],
    actions: [],
    reactions: [],
    legendaryActions: [],
    notes: "",
  };
}

export function newEncounterInput(campaignId?: string): CreateInput<Encounter> {
  return {
    campaignId,
    name: "New Encounter",
    description: "",
    entries: [],
  };
}

export function newCampaignInput(): CreateInput<Campaign> {
  return {
    name: "New Campaign",
    setting: "High Fantasy",
    description: "",
    bannerUrl: "",
  };
}

export function newNoteInput(campaignId?: string): CreateInput<Note> {
  return {
    campaignId,
    title: "Untitled Note",
    body: "",
    tags: [],
    pinned: false,
  };
}

export function newQuestInput(campaignId?: string): CreateInput<Quest> {
  return {
    campaignId,
    title: "New Quest",
    description: "",
    status: "active",
    objectives: [],
    reward: "",
    pinned: false,
  };
}

export function newFactionInput(campaignId?: string): CreateInput<Faction> {
  return {
    campaignId,
    name: "New Faction",
    description: "",
    standing: "neutral",
    goals: "",
    notes: "",
  };
}

export function newTimelineEventInput(
  campaignId?: string,
): CreateInput<TimelineEvent> {
  return {
    campaignId,
    date: "",
    title: "New Event",
    description: "",
    order: Date.now(),
  };
}

export function newSessionLogInput(
  campaignId?: string,
): CreateInput<SessionLog> {
  return {
    campaignId,
    title: "New Session",
    date: new Date().toISOString().slice(0, 10),
    body: "",
  };
}

export function newMapInput(campaignId?: string): CreateInput<BattleMap> {
  return {
    campaignId,
    name: "New Map",
    imageUrl: "",
    notes: "",
  };
}
