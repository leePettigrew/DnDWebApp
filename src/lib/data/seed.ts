import { newId, nowISO } from "@/lib/domain/ids";
import type {
  BattleMap,
  Campaign,
  Character,
  Encounter,
  Faction,
  Note,
  Quest,
  RollPreset,
  SessionLog,
  StatBlock,
  TimelineEvent,
} from "@/lib/domain/types";

/**
 * Classic high-fantasy seed content. Everything here is clearly placeholder
 * lore you can edit or delete — it exists so the app is alive on first run and
 * so every feature has something to render. Art slots (portraits, maps) are
 * intentionally left empty and fall back to themed placeholders in the UI.
 */
export interface SeedData {
  campaigns: Campaign[];
  characters: Character[];
  statBlocks: StatBlock[];
  encounters: Encounter[];
  notes: Note[];
  sessionLogs: SessionLog[];
  maps: BattleMap[];
  rollPresets: RollPreset[];
  quests: Quest[];
  factions: Faction[];
  timeline: TimelineEvent[];
}

export function buildSeedData(): SeedData {
  const ts = nowISO();
  const base = { createdAt: ts, updatedAt: ts };

  // --- Campaign ----------------------------------------------------------
  const campaignId = newId();
  const campaigns: Campaign[] = [
    {
      ...base,
      id: campaignId,
      name: "The Sunken Crown of Eldermoor",
      setting: "High Fantasy",
      description:
        "A drowned kingdom stirs beneath the Gloomfen marshes. The old crown — said to command the tides — has surfaced, and every warband and cult for a hundred leagues is marching to claim it. The heroes of Oakhollow stand in their way.",
      bannerUrl: "",
    },
  ];

  // --- Player characters -------------------------------------------------
  const characters: Character[] = [
    {
      ...base,
      id: newId(),
      campaignId,
      name: "Kaelar the Bold",
      portraitUrl: "",
      race: "Human",
      className: "Fighter",
      subclass: "Champion",
      level: 5,
      background: "Soldier",
      alignment: "Lawful Good",
      abilityScores: { str: 17, dex: 13, con: 15, int: 10, wis: 12, cha: 11 },
      skillProficiencies: {
        athletics: "proficient",
        intimidation: "proficient",
        perception: "proficient",
        survival: "proficient",
      },
      savingThrowProficiencies: { str: true, con: true },
      maxHp: 44,
      currentHp: 44,
      tempHp: 0,
      hitDice: "5d10",
      armorClass: 18,
      speed: 30,
      initiativeBonus: 0,
      spells: [],
      inventory: [
        { id: newId(), name: "Longsword", quantity: 1, equipped: true, category: "weapon", weight: 3, value: 15, attackBonus: 5, damage: "1d8+3 slashing", properties: "Versatile (1d10)" },
        { id: newId(), name: "Handaxe", quantity: 2, category: "weapon", weight: 2, value: 5, attackBonus: 5, damage: "1d6+3 slashing", properties: "Light, Thrown (20/60)" },
        { id: newId(), name: "Shield", quantity: 1, equipped: true, category: "shield", weight: 6, value: 10, properties: "+2 AC" },
        { id: newId(), name: "Chain Mail", quantity: 1, equipped: true, category: "armor", weight: 55, value: 75, properties: "AC 16, Stealth disadvantage" },
        { id: newId(), name: "Potion of Healing", quantity: 3, category: "consumable", weight: 0.5, value: 50, rarity: "common", description: "Bonus action: regain 2d4+2 HP." },
      ],
      currency: { cp: 0, sp: 8, ep: 0, gp: 62, pp: 1 },
      features: [
        { id: newId(), name: "Second Wind", description: "Bonus action: regain 1d10+5 HP, once per rest." },
        { id: newId(), name: "Action Surge", description: "Take an extra action on your turn, once per rest." },
        { id: newId(), name: "Extra Attack", description: "Attack twice when you take the Attack action." },
        { id: newId(), name: "Improved Critical", description: "Your weapon attacks score a critical hit on a 19 or 20." },
      ],
      languages: "Common, Orc",
      notes: "Lost his company at the Battle of Ashford. Seeks redemption.",
    },
    {
      ...base,
      id: newId(),
      campaignId,
      name: "Sister Ravette",
      portraitUrl: "",
      race: "Half-Elf",
      className: "Cleric",
      subclass: "Life Domain",
      level: 5,
      background: "Acolyte",
      alignment: "Neutral Good",
      abilityScores: { str: 11, dex: 12, con: 14, int: 10, wis: 17, cha: 13 },
      skillProficiencies: {
        insight: "proficient",
        medicine: "proficient",
        persuasion: "proficient",
        religion: "proficient",
      },
      savingThrowProficiencies: { wis: true, cha: true },
      maxHp: 38,
      currentHp: 38,
      tempHp: 0,
      hitDice: "5d8",
      armorClass: 18,
      speed: 30,
      spellcastingAbility: "wis",
      spells: [
        { id: newId(), name: "Sacred Flame", level: 0, school: "Evocation", description: "Radiant damage, Dex save." },
        { id: newId(), name: "Guidance", level: 0, school: "Divination" },
        { id: newId(), name: "Cure Wounds", level: 1, school: "Evocation", prepared: true, description: "Heal 1d8 + spellcasting modifier." },
        { id: newId(), name: "Bless", level: 1, school: "Enchantment", prepared: true },
        { id: newId(), name: "Spiritual Weapon", level: 2, school: "Evocation", prepared: true },
        { id: newId(), name: "Revivify", level: 3, school: "Necromancy", prepared: true, description: "Return a creature dead < 1 minute to life with 1 HP." },
      ],
      inventory: [
        { id: newId(), name: "Mace", quantity: 1, equipped: true, category: "weapon", weight: 4, value: 5, attackBonus: 4, damage: "1d6 bludgeoning" },
        { id: newId(), name: "Chain Mail", quantity: 1, equipped: true, category: "armor", weight: 55, value: 75, properties: "AC 16, Stealth disadvantage" },
        { id: newId(), name: "Shield (Holy Symbol)", quantity: 1, equipped: true, category: "shield", weight: 6, value: 10, properties: "+2 AC; doubles as a holy symbol" },
        { id: newId(), name: "Healer's Kit", quantity: 1, category: "tool", weight: 3, value: 5, description: "10 uses; stabilize a dying creature without a check." },
      ],
      currency: { cp: 5, sp: 14, ep: 0, gp: 40, pp: 0 },
      features: [
        { id: newId(), name: "Disciple of Life", description: "Healing spells restore extra HP equal to 2 + the spell's level." },
        { id: newId(), name: "Channel Divinity: Preserve Life", description: "Restore a total of 25 HP among creatures within 30 ft." },
        { id: newId(), name: "Destroy Undead (CR 1/2)", description: "Turned undead of CR 1/2 or lower are destroyed." },
      ],
      languages: "Common, Elvish, Celestial",
      notes: "Tends the shrine at Oakhollow. Believes the crown must be unmade, not worn.",
    },
    {
      ...base,
      id: newId(),
      campaignId,
      name: "Pip Thistledown",
      portraitUrl: "",
      race: "Lightfoot Halfling",
      className: "Rogue",
      subclass: "Arcane Trickster",
      level: 5,
      background: "Charlatan",
      alignment: "Chaotic Good",
      abilityScores: { str: 9, dex: 17, con: 13, int: 14, wis: 12, cha: 14 },
      skillProficiencies: {
        acrobatics: "proficient",
        deception: "expertise",
        investigation: "proficient",
        perception: "proficient",
        sleightOfHand: "expertise",
        stealth: "expertise",
      },
      savingThrowProficiencies: { dex: true, int: true },
      maxHp: 33,
      currentHp: 33,
      tempHp: 0,
      hitDice: "5d8",
      armorClass: 15,
      speed: 25,
      initiativeBonus: 0,
      spellcastingAbility: "int",
      spells: [
        { id: newId(), name: "Mage Hand", level: 0, school: "Conjuration", description: "Spectral hand (invisible for Arcane Trickster)." },
        { id: newId(), name: "Minor Illusion", level: 0, school: "Illusion" },
        { id: newId(), name: "Disguise Self", level: 1, school: "Illusion", prepared: true },
        { id: newId(), name: "Silent Image", level: 1, school: "Illusion", prepared: true },
      ],
      inventory: [
        { id: newId(), name: "Rapier", quantity: 1, equipped: true, category: "weapon", weight: 2, value: 25, attackBonus: 6, damage: "1d8+3 piercing", properties: "Finesse" },
        { id: newId(), name: "Shortbow", quantity: 1, equipped: true, category: "weapon", weight: 2, value: 25, attackBonus: 6, damage: "1d6+3 piercing", properties: "Range 80/320, Two-handed" },
        { id: newId(), name: "Leather Armor", quantity: 1, equipped: true, category: "armor", weight: 10, value: 10, properties: "AC 11 + Dex" },
        { id: newId(), name: "Cloak of Elvenkind", quantity: 1, equipped: true, attuned: true, category: "magic", rarity: "uncommon", weight: 1, properties: "Advantage on Stealth; others have disadvantage to spot you", description: "A parting gift from the Gloomfen smugglers." },
        { id: newId(), name: "Thieves' Tools", quantity: 1, category: "tool", weight: 1, value: 25, description: "Proficiency adds expertise to lockpicking and trap work." },
        { id: newId(), name: "Smokebombs", quantity: 4, category: "consumable", weight: 0.5, value: 10 },
      ],
      currency: { cp: 12, sp: 0, ep: 3, gp: 88, pp: 0 },
      features: [
        { id: newId(), name: "Sneak Attack (3d6)", description: "Extra 3d6 damage once per turn with advantage or a flanking ally." },
        { id: newId(), name: "Cunning Action", description: "Dash, Disengage, or Hide as a bonus action." },
        { id: newId(), name: "Uncanny Dodge", description: "Halve the damage of one attack you can see." },
      ],
      languages: "Common, Halfling, Thieves' Cant",
      notes: "Owes a debt to the Gloomfen smugglers. Cheerful to a fault.",
    },
  ];

  // --- Monsters & NPCs (stat blocks) ------------------------------------
  const goblinId = newId();
  const direWolfId = newId();
  const banditCaptainId = newId();
  const skeletonId = newId();
  const caveBearId = newId();

  const statBlocks: StatBlock[] = [
    {
      ...base,
      id: goblinId,
      campaignId,
      kind: "monster",
      name: "Goblin",
      portraitUrl: "",
      size: "Small",
      type: "Humanoid (goblinoid)",
      alignment: "Neutral Evil",
      armorClass: 15,
      armorNote: "leather armor, shield",
      maxHp: 7,
      hitDiceFormula: "2d6",
      speed: "30 ft.",
      abilityScores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
      skills: "Stealth +6",
      senses: "Darkvision 60 ft., Passive Perception 9",
      languages: "Common, Goblin",
      challengeRating: "1/4",
      traits: [
        { id: newId(), name: "Nimble Escape", description: "Can take the Disengage or Hide action as a bonus action on each turn." },
      ],
      actions: [
        { id: newId(), name: "Scimitar", description: "Melee: +4 to hit, 5 (1d6+2) slashing." },
        { id: newId(), name: "Shortbow", description: "Ranged (80/320 ft.): +4 to hit, 5 (1d6+2) piercing." },
      ],
      reactions: [],
      legendaryActions: [],
      notes: "Cowardly in the open; deadly in ambush.",
    },
    {
      ...base,
      id: direWolfId,
      campaignId,
      kind: "monster",
      name: "Dire Wolf",
      portraitUrl: "",
      size: "Large",
      type: "Beast",
      alignment: "Unaligned",
      armorClass: 14,
      armorNote: "natural armor",
      maxHp: 37,
      hitDiceFormula: "5d10+10",
      speed: "50 ft.",
      abilityScores: { str: 17, dex: 15, con: 15, int: 3, wis: 12, cha: 7 },
      skills: "Perception +3, Stealth +4",
      senses: "Passive Perception 13",
      challengeRating: "1",
      traits: [
        { id: newId(), name: "Pack Tactics", description: "Advantage on attacks against a creature if an ally is within 5 ft. of it." },
      ],
      actions: [
        { id: newId(), name: "Bite", description: "Melee: +5 to hit, 10 (2d6+3) piercing. DC 13 Str save or knocked prone." },
      ],
      reactions: [],
      legendaryActions: [],
    },
    {
      ...base,
      id: banditCaptainId,
      campaignId,
      kind: "npc",
      name: "Garrok Ironmaw, Bandit Captain",
      portraitUrl: "",
      size: "Medium",
      type: "Humanoid (human)",
      alignment: "Chaotic Evil",
      armorClass: 15,
      armorNote: "studded leather",
      maxHp: 65,
      hitDiceFormula: "10d8+20",
      speed: "30 ft.",
      abilityScores: { str: 15, dex: 16, con: 14, int: 14, wis: 11, cha: 14 },
      savingThrows: "Str +4, Dex +5, Wis +2",
      skills: "Athletics +4, Deception +4",
      senses: "Passive Perception 10",
      languages: "Common, Goblin",
      challengeRating: "2",
      traits: [],
      actions: [
        { id: newId(), name: "Multiattack", description: "Makes three melee attacks: two with its scimitar and one with its dagger. Or two ranged attacks with its daggers." },
        { id: newId(), name: "Scimitar", description: "Melee: +5 to hit, 6 (1d6+3) slashing." },
        { id: newId(), name: "Dagger", description: "Melee or Ranged (20/60 ft.): +5 to hit, 5 (1d4+3) piercing." },
      ],
      reactions: [
        { id: newId(), name: "Parry", description: "Add 2 to AC against one melee attack that would hit. Must see the attacker and wield a melee weapon." },
      ],
      legendaryActions: [],
      notes: "Leads the Gloomfen raiders. Wants the crown to sell, not to wear.",
    },
    {
      ...base,
      id: skeletonId,
      campaignId,
      kind: "monster",
      name: "Skeleton",
      portraitUrl: "",
      size: "Medium",
      type: "Undead",
      alignment: "Lawful Evil",
      armorClass: 13,
      armorNote: "armor scraps",
      maxHp: 13,
      hitDiceFormula: "2d8+4",
      speed: "30 ft.",
      abilityScores: { str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5 },
      senses: "Darkvision 60 ft., Passive Perception 9",
      damageVulnerabilities: "bludgeoning",
      damageImmunities: "poison",
      conditionImmunities: "exhaustion, poisoned",
      languages: "understands its creator's languages but can't speak",
      challengeRating: "1/4",
      traits: [],
      actions: [
        { id: newId(), name: "Shortsword", description: "Melee: +4 to hit, 5 (1d6+2) piercing." },
        { id: newId(), name: "Shortbow", description: "Ranged (80/320 ft.): +4 to hit, 5 (1d6+2) piercing." },
      ],
      reactions: [],
      legendaryActions: [],
      notes: "Rises from the drowned barrows when the crown glows.",
    },
    {
      ...base,
      id: caveBearId,
      campaignId,
      kind: "monster",
      name: "Cave Bear",
      portraitUrl: "",
      size: "Large",
      type: "Beast",
      alignment: "Unaligned",
      armorClass: 12,
      armorNote: "natural armor",
      maxHp: 42,
      hitDiceFormula: "5d10+15",
      speed: "40 ft., climb 30 ft.",
      abilityScores: { str: 20, dex: 10, con: 16, int: 2, wis: 13, cha: 7 },
      skills: "Perception +3",
      senses: "Darkvision 60 ft., Passive Perception 13",
      challengeRating: "2",
      traits: [
        { id: newId(), name: "Keen Smell", description: "Advantage on Wisdom (Perception) checks that rely on smell." },
      ],
      actions: [
        { id: newId(), name: "Multiattack", description: "Makes two attacks: one bite and one claw." },
        { id: newId(), name: "Bite", description: "Melee: +7 to hit, 11 (2d6+5) piercing." },
        { id: newId(), name: "Claws", description: "Melee: +7 to hit, 13 (2d8+5) slashing." },
      ],
      reactions: [],
      legendaryActions: [],
    },
    {
      ...base,
      id: newId(),
      campaignId,
      kind: "npc",
      name: "Maeve Brightlantern, Innkeeper of Oakhollow",
      portraitUrl: "",
      size: "Medium",
      type: "Humanoid (human)",
      alignment: "Neutral Good",
      armorClass: 10,
      maxHp: 9,
      speed: "30 ft.",
      abilityScores: { str: 10, dex: 10, con: 11, int: 12, wis: 14, cha: 15 },
      skills: "Insight +4, Persuasion +4",
      senses: "Passive Perception 12",
      languages: "Common, Dwarvish",
      challengeRating: "0",
      traits: [
        { id: newId(), name: "Keeper of Rumors", description: "Knows every traveler's business for fifty miles. A friendly source of plot hooks." },
      ],
      actions: [],
      reactions: [],
      legendaryActions: [],
      notes: "Runs the Gilded Lantern. Lost her brother to the marsh; quietly funds the party.",
    },
  ];

  // --- Encounters --------------------------------------------------------
  const encounters: Encounter[] = [
    {
      ...base,
      id: newId(),
      campaignId,
      name: "Ambush at Gloomfen Bridge",
      description:
        "Garrok's raiders spring a trap as the party crosses the rope bridge. Goblins loose arrows from the reeds while a dire wolf cuts off the retreat.",
      entries: [
        { id: newId(), statBlockId: goblinId, label: "Goblin", count: 4 },
        { id: newId(), statBlockId: direWolfId, label: "Dire Wolf", count: 1 },
        { id: newId(), statBlockId: banditCaptainId, label: "Garrok Ironmaw, Bandit Captain", count: 1 },
      ],
    },
    {
      ...base,
      id: newId(),
      campaignId,
      name: "The Drowned Barrows",
      description:
        "Beneath the fen, the crown's glow wakes the dead. Skeletons claw up from flooded graves in endless, patient waves.",
      entries: [
        { id: newId(), statBlockId: skeletonId, label: "Skeleton", count: 6 },
      ],
    },
  ];

  // --- Notes -------------------------------------------------------------
  const notes: Note[] = [
    {
      ...base,
      id: newId(),
      campaignId,
      title: "The Crown's Legend",
      pinned: true,
      tags: ["lore", "macguffin"],
      body:
        "# The Sunken Crown\n\nForged by the **Tide-Kings of Eldermoor** to still the storms, the crown was lost when the sea swallowed the kingdom in a single night.\n\n## What it does\n- Commands tides and rain within a day's march\n- Whispers to its wearer in the voice of the drowned\n\n> *\"A crown is only a circle of want.\"* — Sister Ravette\n\nThree factions seek it: the **Gloomfen raiders**, the **Cult of the Pale Wave**, and the crown itself.",
    },
    {
      ...base,
      id: newId(),
      campaignId,
      title: "Oakhollow — Starting Village",
      pinned: false,
      tags: ["location", "npcs"],
      body:
        "## Oakhollow\nA waystation village on the edge of the Gloomfen.\n\n### People\n- *Maeve Brightlantern* — innkeeper, the Gilded Lantern\n- *Castellan Voss* — retired knight, gives the opening quest\n\n### Hooks\n1. Travelers vanish on the marsh road\n2. The shrine bell rings on its own at midnight\n3. A raider was caught with a *waterlogged map*",
    },
  ];

  // --- Session logs ------------------------------------------------------
  const sessionLogs: SessionLog[] = [
    {
      ...base,
      id: newId(),
      campaignId,
      title: "Session 1 — The Bell at Midnight",
      date: "2026-05-30",
      body:
        "The party met at the Gilded Lantern as the shrine bell tolled untouched. Castellan Voss offered 200 gp to investigate the marsh road. Kaelar accepted before Pip could haggle.\n\n- Tracked missing merchants to **Gloomfen Bridge**\n- Pip spotted goblin sign in the reeds\n- Ended on a cliffhanger: a horn sounds across the water.",
    },
    {
      ...base,
      id: newId(),
      campaignId,
      title: "Session 2 — Blood on the Bridge",
      date: "2026-06-06",
      body:
        "Ambush sprung! Garrok's raiders nearly dropped Pip (down to 4 HP) before Sister Ravette's *Spiritual Weapon* turned the tide.\n\n- Garrok fled south with a **waterlogged map**\n- Recovered 3 *Potions of Healing* from the goblins\n- The map points beneath the fen — to the Drowned Barrows.",
    },
  ];

  // --- Battle maps (image slots) ----------------------------------------
  const maps: BattleMap[] = [
    {
      ...base,
      id: newId(),
      campaignId,
      name: "Gloomfen Bridge",
      imageUrl: "",
      notes: "20×15 grid. Rope bridge center; reeds (difficult terrain) on both banks. Drop your map image here.",
    },
    {
      ...base,
      id: newId(),
      campaignId,
      name: "The Drowned Barrows",
      imageUrl: "",
      notes: "Flooded crypt. Knee-deep water everywhere (difficult terrain). Add your battle map.",
    },
  ];

  // --- Saved roll presets ------------------------------------------------
  const rollPresets: RollPreset[] = [
    { ...base, id: newId(), name: "Longsword Attack", spec: { groups: [{ count: 1, sides: 20 }], modifier: 5, mode: "normal" } },
    { ...base, id: newId(), name: "Longsword Damage", spec: { groups: [{ count: 1, sides: 8 }], modifier: 3, mode: "normal" } },
    { ...base, id: newId(), name: "Sneak Attack", spec: { groups: [{ count: 3, sides: 6 }], modifier: 0, mode: "normal" } },
    { ...base, id: newId(), name: "Fireball", spec: { groups: [{ count: 8, sides: 6 }], modifier: 0, mode: "normal" } },
    { ...base, id: newId(), name: "Cure Wounds", spec: { groups: [{ count: 1, sides: 8 }], modifier: 3, mode: "normal" } },
    { ...base, id: newId(), name: "Stealth (Advantage)", spec: { groups: [{ count: 1, sides: 20 }], modifier: 7, mode: "advantage" } },
  ];

  // --- Quests ------------------------------------------------------------
  const quests: Quest[] = [
    {
      ...base,
      id: newId(),
      campaignId,
      title: "Recover the Sunken Crown",
      description:
        "The drowned crown has surfaced in the Gloomfen barrows. Reach it before the raiders — or the cult — claim its power over the tides.",
      status: "active",
      objectives: [
        { id: newId(), text: "Find a guide through the Gloomfen", done: true },
        { id: newId(), text: "Reach the drowned barrows", done: false },
        { id: newId(), text: "Claim the crown", done: false },
      ],
      reward: "The gratitude of Oakhollow — and the crown itself.",
      pinned: true,
    },
    {
      ...base,
      id: newId(),
      campaignId,
      title: "The Lantern's Debt",
      description:
        "Mirella of the Gilded Lantern quietly funds the party. She'd like a smuggler's cache in the marsh recovered before the raiders find it.",
      status: "active",
      objectives: [
        { id: newId(), text: "Locate the cache", done: false },
        { id: newId(), text: "Return it to Mirella", done: false },
      ],
      reward: "Free lodging and a friend in low places.",
    },
  ];

  // --- Factions ----------------------------------------------------------
  const factions: Faction[] = [
    {
      ...base,
      id: newId(),
      campaignId,
      name: "Oakhollow Village",
      description: "The marsh-edge village the heroes call home.",
      standing: "ally",
      goals: "Survive the coming of the raiders and keep the crown from evil hands.",
      notes: "",
    },
    {
      ...base,
      id: newId(),
      campaignId,
      name: "The Gloomfen Raiders",
      description: "Smugglers and reavers who want the crown to sell, not to wear.",
      standing: "hostile",
      goals: "Seize the crown and auction it to the highest bidder.",
      notes: "Led by a cunning captain who avoids open battle.",
    },
  ];

  // --- Timeline ----------------------------------------------------------
  const timeline: TimelineEvent[] = [
    {
      ...base,
      id: newId(),
      campaignId,
      date: "Long ago",
      title: "The Crown Drowns",
      description: "Eldermoor sinks beneath the rising marsh, its crown lost to the tides.",
      order: 1,
    },
    {
      ...base,
      id: newId(),
      campaignId,
      date: "Last Mirtul",
      title: "The Crown Surfaces",
      description: "The receding floodwaters reveal the barrows — and the crown's glow.",
      order: 2,
    },
    {
      ...base,
      id: newId(),
      campaignId,
      date: "Now",
      title: "The Heroes Gather",
      description: "Warbands and cults march on the Gloomfen. Oakhollow stands in their way.",
      order: 3,
    },
  ];

  return {
    campaigns,
    characters,
    statBlocks,
    encounters,
    notes,
    sessionLogs,
    maps,
    rollPresets,
    quests,
    factions,
    timeline,
  };
}
