/** Static rules references for the DM screen (paraphrased SRD 5.1). */

export interface RuleLine {
  name: string;
  effect: string;
}

export const CONDITION_RULES: RuleLine[] = [
  { name: "Blinded", effect: "Can't see, auto-fails sight checks. Attacks against have advantage; its attacks have disadvantage." },
  { name: "Charmed", effect: "Can't attack the charmer or target them with harmful effects. Charmer has advantage on social checks with it." },
  { name: "Deafened", effect: "Can't hear and auto-fails hearing checks." },
  { name: "Frightened", effect: "Disadvantage on checks and attacks while the source is in sight; can't willingly move closer to it." },
  { name: "Grappled", effect: "Speed 0, no bonus to speed. Ends if the grappler is incapacitated or removed from reach." },
  { name: "Incapacitated", effect: "Can't take actions or reactions." },
  { name: "Invisible", effect: "Impossible to see without special senses. Attacks against have disadvantage; its attacks have advantage." },
  { name: "Paralyzed", effect: "Incapacitated, can't move or speak. Auto-fails Str/Dex saves. Attacks have advantage; melee hits within 5 ft. are crits." },
  { name: "Petrified", effect: "Turned to stone: incapacitated, weight ×10, resistance to all damage, immune to poison/disease." },
  { name: "Poisoned", effect: "Disadvantage on attack rolls and ability checks." },
  { name: "Prone", effect: "Can only crawl. Disadvantage on attacks. Attacks within 5 ft. have advantage; ranged have disadvantage." },
  { name: "Restrained", effect: "Speed 0. Attacks against have advantage; its attacks have disadvantage. Disadvantage on Dex saves." },
  { name: "Stunned", effect: "Incapacitated, can't move, speaks falteringly. Auto-fails Str/Dex saves. Attacks have advantage." },
  { name: "Unconscious", effect: "Incapacitated, drops everything, falls prone. Auto-fails Str/Dex saves. Attacks have advantage; melee hits within 5 ft. are crits." },
  { name: "Exhaustion", effect: "1: disadv. checks · 2: speed halved · 3: disadv. attacks & saves · 4: HP max halved · 5: speed 0 · 6: death." },
];

export const COMBAT_ACTIONS: RuleLine[] = [
  { name: "Attack", effect: "Make one melee or ranged attack (more with Extra Attack)." },
  { name: "Cast a Spell", effect: "Cast a spell with a casting time of 1 action." },
  { name: "Dash", effect: "Gain extra movement equal to your speed this turn." },
  { name: "Disengage", effect: "Your movement doesn't provoke opportunity attacks." },
  { name: "Dodge", effect: "Attacks against you have disadvantage; you have advantage on Dex saves." },
  { name: "Help", effect: "Give an ally advantage on a check, or on their next attack vs. a creature within 5 ft." },
  { name: "Hide", effect: "Make a Stealth check to become hidden." },
  { name: "Ready", effect: "Prepare an action to trigger on a chosen condition (uses your reaction)." },
  { name: "Search", effect: "Devote your attention to finding something (Perception or Investigation)." },
  { name: "Use an Object", effect: "Interact with a second object or use a special object action." },
];

export const SKILL_DCS: { label: string; dc: number }[] = [
  { label: "Very easy", dc: 5 },
  { label: "Easy", dc: 10 },
  { label: "Medium", dc: 15 },
  { label: "Hard", dc: 20 },
  { label: "Very hard", dc: 25 },
  { label: "Nearly impossible", dc: 30 },
];

export const COVER_RULES: RuleLine[] = [
  { name: "Half cover", effect: "+2 to AC and Dexterity saving throws (low wall, furniture, another creature)." },
  { name: "Three-quarters cover", effect: "+5 to AC and Dexterity saving throws (portcullis, arrow slit, tree trunk)." },
  { name: "Total cover", effect: "Can't be targeted directly by an attack or spell." },
];

export const TRAVEL_PACE: RuleLine[] = [
  { name: "Fast", effect: "400 ft./min · 4 miles/hour · 30 miles/day. −5 passive Perception." },
  { name: "Normal", effect: "300 ft./min · 3 miles/hour · 24 miles/day." },
  { name: "Slow", effect: "200 ft./min · 2 miles/hour · 18 miles/day. Can use stealth." },
];

export const LIGHT_RULES: RuleLine[] = [
  { name: "Bright light", effect: "Most creatures see normally." },
  { name: "Dim light (lightly obscured)", effect: "Disadvantage on Perception checks relying on sight." },
  { name: "Darkness (heavily obscured)", effect: "Effectively blinded when looking into it." },
];
