import { newId } from "@/lib/domain/ids";
import type { CreateInput } from "@/lib/data/provider";
import type { StatBlock } from "@/lib/domain/types";

/** Random NPC generation — names + flavor, plus a stat-block export. */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const ANCESTRIES = [
  "Human",
  "Elf",
  "Dwarf",
  "Halfling",
  "Half-Orc",
  "Tiefling",
  "Gnome",
] as const;
export type Ancestry = (typeof ANCESTRIES)[number];

const FIRST_NAMES: Record<Ancestry, string[]> = {
  Human: ["Alden", "Mira", "Joss", "Edda", "Cael", "Rosalind", "Tomas", "Wren"],
  Elf: ["Aelar", "Sylvaire", "Thalion", "Naivara", "Erevan", "Lúthien"],
  Dwarf: ["Bardin", "Helja", "Thorin", "Gruna", "Dain", "Vistra"],
  Halfling: ["Pip", "Lidda", "Cade", "Nedda", "Roscoe", "Verna"],
  "Half-Orc": ["Grosh", "Yevelda", "Karg", "Shautha", "Drog", "Emen"],
  Tiefling: ["Mordai", "Rieta", "Skamos", "Akta", "Damaia", "Therai"],
  Gnome: ["Fonkin", "Bimpnottin", "Wrenn", "Ellyjobell", "Boddynock", "Nyx"],
};
const SURNAMES = [
  "Brightwood",
  "Stormcrag",
  "Ashdown",
  "Holloway",
  "Greycastle",
  "Fenwick",
  "Thornbury",
  "Vane",
  "Hollowbrook",
  "Marsh",
];
const OCCUPATIONS = [
  "innkeeper",
  "blacksmith",
  "hedge wizard",
  "town guard",
  "merchant",
  "fence",
  "priest",
  "sailor",
  "farmer",
  "scribe",
  "alchemist",
  "minstrel",
  "gravedigger",
  "spy",
];
const APPEARANCES = [
  "a jagged scar across one cheek",
  "kind eyes and ink-stained fingers",
  "a missing front tooth and a ready grin",
  "an immaculate, fraying coat",
  "soot-blackened hands",
  "a nervous, darting gaze",
  "elaborate braids threaded with charms",
  "a limp and a sturdy cane",
];
const TRAITS = [
  "speaks in proverbs",
  "never makes eye contact",
  "laughs at the worst moments",
  "counts coins obsessively",
  "fiercely loyal once trust is earned",
  "deeply superstitious",
  "quick to anger, quicker to forgive",
  "endlessly curious",
];
const BONDS = [
  "would do anything to protect their younger sibling",
  "owes a life-debt to a local crime boss",
  "guards a family heirloom of no apparent value",
  "is secretly in love with a rival",
  "swore an oath to a now-dead mentor",
  "dreams of leaving this town forever",
];
const SECRETS = [
  "is an informant for the city watch",
  "killed someone long ago and buried the truth",
  "is not who they claim to be",
  "knows where a smuggler's cache is hidden",
  "carries a curse they don't understand",
  "has been skimming from their employer for years",
];
const VOICES = [
  "gravelly and slow",
  "bright and rapid-fire",
  "a conspiratorial whisper",
  "overly formal",
  "sing-song, with odd emphasis",
  "weary and flat",
];

export interface GeneratedNpc {
  name: string;
  ancestry: Ancestry;
  occupation: string;
  appearance: string;
  trait: string;
  bond: string;
  secret: string;
  voice: string;
}

export function generateNpc(ancestry?: Ancestry): GeneratedNpc {
  const anc = ancestry ?? pick([...ANCESTRIES]);
  return {
    name: `${pick(FIRST_NAMES[anc])} ${pick(SURNAMES)}`,
    ancestry: anc,
    occupation: pick(OCCUPATIONS),
    appearance: pick(APPEARANCES),
    trait: pick(TRAITS),
    bond: pick(BONDS),
    secret: pick(SECRETS),
    voice: pick(VOICES),
  };
}

/** Turn a generated NPC into a commoner stat block for the bestiary. */
export function npcToStatBlockInput(
  npc: GeneratedNpc,
  campaignId?: string,
): CreateInput<StatBlock> {
  return {
    campaignId,
    kind: "npc",
    name: npc.name,
    portraitUrl: "",
    size: "Medium",
    type: `Humanoid (${npc.ancestry})`,
    alignment: "Neutral",
    armorClass: 10,
    armorNote: "",
    maxHp: 4,
    hitDiceFormula: "1d8",
    speed: "30 ft.",
    abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    savingThrows: "",
    skills: "",
    senses: "Passive Perception 10",
    languages: "Common",
    challengeRating: "0",
    damageResistances: "",
    damageImmunities: "",
    damageVulnerabilities: "",
    conditionImmunities: "",
    traits: [
      { id: newId(), name: "Personality", description: `${npc.trait}; voice ${npc.voice}.` },
      { id: newId(), name: "Bond", description: `This NPC ${npc.bond}.` },
    ],
    actions: [
      {
        id: newId(),
        name: "Club",
        description: "Melee Weapon Attack: +2 to hit, reach 5 ft. Hit: 2 (1d4) bludgeoning damage.",
      },
    ],
    reactions: [],
    legendaryActions: [],
    notes: `${npc.occupation}, with ${npc.appearance}. Secret (DM only): ${npc.secret}.`,
  };
}
