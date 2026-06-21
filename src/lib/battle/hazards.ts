// Hazard / liquid zones painted onto a battle map as a layer over the terrain.
// Each cell stores a hazard id (parallel to `tiles`); "" means none. The look
// drives how it's drawn; damage/difficult are surfaced for the DM.

export interface HazardDef {
  id: string;
  name: string;
  /** Base translucent fill colour. */
  color: string;
  /** Optional warm/emissive edge (e.g. lava). */
  glow?: string;
  /** Difficult terrain (half speed). */
  difficult?: boolean;
  /** On-enter / per-turn damage note, e.g. "2d6 fire". */
  damage?: string;
  look: "liquid" | "gas" | "web" | "ice";
}

export const HAZARDS: HazardDef[] = [
  { id: "lava", name: "Lava", color: "#d2410e", glow: "#ffb24a", damage: "10d10 fire", look: "liquid" },
  { id: "acid", name: "Acid pool", color: "#7bd54a", difficult: true, damage: "2d6 acid", look: "liquid" },
  { id: "deepwater", name: "Deep water", color: "#2f5f8a", difficult: true, look: "liquid" },
  { id: "gas", name: "Poison gas", color: "#9bbf5a", damage: "1d6 poison", look: "gas" },
  { id: "web", name: "Webs", color: "#d8d8d0", difficult: true, look: "web" },
  { id: "ice", name: "Ice", color: "#bfe6f2", difficult: true, look: "ice" },
];

export const HAZARD_MAP = new Map(HAZARDS.map((h) => [h.id, h]));
