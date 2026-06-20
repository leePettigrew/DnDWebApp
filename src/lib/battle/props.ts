/**
 * Procedurally-drawn battle-map props. Each `draw` renders the prop centred at
 * the origin, sized to roughly one cell (`s` = cell pixels), so the builder can
 * translate/rotate/scale the context and call it. No art assets needed.
 */

export type PropCategory = "furniture" | "dungeon" | "nature" | "town" | "arcane" | "hazard";

export interface PropDef {
  id: string;
  name: string;
  category: PropCategory;
  blocksMove?: boolean;
  blocksSight?: boolean;
  difficult?: boolean;
  /** If set, this prop emits light of this radius (in cells) on the map. */
  light?: number;
  lightColor?: string;
  draw: (ctx: CanvasRenderingContext2D, s: number) => void;
}

const C = {
  wood: "#6b4a2b",
  woodDark: "#4f3519",
  woodLight: "#8a6238",
  stone: "#8d8a82",
  stoneDark: "#65625b",
  stoneLight: "#aaa69d",
  metal: "#5b5b5b",
  gold: "#cda434",
  green: "#3e7a3a",
  greenDark: "#2b5728",
  greenLight: "#58a050",
  fire: "#ff7a1a",
  fireCore: "#ffd24a",
  purple: "#8a5cd6",
  purpleLight: "#b58cf0",
  bone: "#e6e0d0",
  water: "#3d6f9e",
  cloth: "#7a3b3b",
};

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.fill();
}

export const PROPS: PropDef[] = [
  {
    id: "chest", name: "Chest", category: "dungeon", blocksMove: true,
    draw: (ctx, s) => {
      const w = s * 0.62, h = s * 0.44;
      rrect(ctx, -w / 2, -h / 2, w, h, s * 0.06, C.wood);
      ctx.fillStyle = C.woodDark;
      ctx.fillRect(-w / 2, -h * 0.06, w, h * 0.12);
      ctx.fillStyle = C.gold;
      ctx.fillRect(-s * 0.05, -h * 0.04, s * 0.1, h * 0.2);
    },
  },
  {
    id: "barrel", name: "Barrel", category: "furniture", blocksMove: true,
    draw: (ctx, s) => {
      disc(ctx, 0, 0, s * 0.3, C.wood);
      ctx.strokeStyle = C.woodDark;
      ctx.lineWidth = s * 0.04;
      for (const r of [0.3, 0.2, 0.1]) {
        ctx.beginPath();
        ctx.arc(0, 0, s * r, 0, Math.PI * 2);
        ctx.stroke();
      }
      disc(ctx, 0, 0, s * 0.06, C.woodLight);
    },
  },
  {
    id: "crate", name: "Crate", category: "furniture", blocksMove: true,
    draw: (ctx, s) => {
      const w = s * 0.56;
      rrect(ctx, -w / 2, -w / 2, w, w, s * 0.04, C.wood);
      ctx.strokeStyle = C.woodDark;
      ctx.lineWidth = s * 0.04;
      ctx.beginPath();
      ctx.moveTo(-w / 2, -w / 2); ctx.lineTo(w / 2, w / 2);
      ctx.moveTo(w / 2, -w / 2); ctx.lineTo(-w / 2, w / 2);
      ctx.stroke();
    },
  },
  {
    id: "table-round", name: "Round table", category: "furniture", blocksMove: true,
    draw: (ctx, s) => { disc(ctx, 0, 0, s * 0.36, C.woodLight); ctx.strokeStyle = C.woodDark; ctx.lineWidth = s * 0.03; ctx.beginPath(); ctx.arc(0, 0, s * 0.36, 0, Math.PI * 2); ctx.stroke(); },
  },
  {
    id: "table-long", name: "Long table", category: "furniture", blocksMove: true,
    draw: (ctx, s) => { rrect(ctx, -s * 0.42, -s * 0.22, s * 0.84, s * 0.44, s * 0.05, C.woodLight); ctx.fillStyle = C.woodDark; ctx.fillRect(-s * 0.42, -s * 0.01, s * 0.84, s * 0.02); },
  },
  {
    id: "chair", name: "Chair", category: "furniture",
    draw: (ctx, s) => { rrect(ctx, -s * 0.16, -s * 0.16, s * 0.32, s * 0.32, s * 0.04, C.wood); ctx.fillStyle = C.woodDark; ctx.fillRect(-s * 0.16, -s * 0.2, s * 0.32, s * 0.06); },
  },
  {
    id: "bed", name: "Bed", category: "furniture", blocksMove: true,
    draw: (ctx, s) => { rrect(ctx, -s * 0.26, -s * 0.4, s * 0.52, s * 0.8, s * 0.06, C.cloth); ctx.fillStyle = "#e6dcc6"; rrect(ctx, -s * 0.22, -s * 0.36, s * 0.44, s * 0.22, s * 0.05, "#e6dcc6"); },
  },
  {
    id: "bookshelf", name: "Bookshelf", category: "dungeon", blocksMove: true, blocksSight: true,
    draw: (ctx, s) => {
      rrect(ctx, -s * 0.4, -s * 0.22, s * 0.8, s * 0.44, s * 0.03, C.woodDark);
      const cols = ["#7a3b3b", "#3b5a7a", "#3b7a4a", "#7a6a3b", "#5a3b7a"];
      for (let i = 0; i < 7; i++) { ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-s * 0.37 + i * s * 0.105, -s * 0.19, s * 0.08, s * 0.38); }
    },
  },
  {
    id: "brazier", name: "Brazier", category: "dungeon", light: 4, lightColor: "#ffb347",
    draw: (ctx, s) => { disc(ctx, 0, 0, s * 0.26, C.metal); disc(ctx, 0, 0, s * 0.18, "#3a2a1a"); disc(ctx, 0, 0, s * 0.12, C.fire); disc(ctx, 0, 0, s * 0.06, C.fireCore); },
  },
  {
    id: "column", name: "Column", category: "dungeon", blocksMove: true, blocksSight: true,
    draw: (ctx, s) => { disc(ctx, 0, 0, s * 0.28, C.stone); disc(ctx, 0, 0, s * 0.2, C.stoneLight); ctx.strokeStyle = C.stoneDark; ctx.lineWidth = s * 0.02; ctx.beginPath(); ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2); ctx.stroke(); },
  },
  {
    id: "statue", name: "Statue", category: "dungeon", blocksMove: true, blocksSight: true,
    draw: (ctx, s) => { disc(ctx, 0, 0, s * 0.3, C.stoneDark); disc(ctx, 0, 0, s * 0.24, C.stone); disc(ctx, 0, -s * 0.06, s * 0.1, C.stoneLight); rrect(ctx, -s * 0.08, -s * 0.02, s * 0.16, s * 0.2, s * 0.04, C.stoneLight); },
  },
  {
    id: "altar", name: "Altar", category: "dungeon", blocksMove: true,
    draw: (ctx, s) => { rrect(ctx, -s * 0.34, -s * 0.24, s * 0.68, s * 0.48, s * 0.04, C.stone); ctx.fillStyle = C.stoneLight; ctx.fillRect(-s * 0.34, -s * 0.24, s * 0.68, s * 0.07); ctx.fillStyle = "#7a1f1f"; ctx.fillRect(-s * 0.1, -s * 0.06, s * 0.2, s * 0.12); },
  },
  {
    id: "sarcophagus", name: "Sarcophagus", category: "dungeon", blocksMove: true,
    draw: (ctx, s) => { rrect(ctx, -s * 0.22, -s * 0.42, s * 0.44, s * 0.84, s * 0.2, C.stone); disc(ctx, 0, -s * 0.22, s * 0.13, C.stoneLight); rrect(ctx, -s * 0.1, -s * 0.06, s * 0.2, s * 0.34, s * 0.05, C.stoneLight); },
  },
  {
    id: "rug", name: "Rug", category: "town",
    draw: (ctx, s) => { rrect(ctx, -s * 0.42, -s * 0.3, s * 0.84, s * 0.6, s * 0.03, C.cloth); ctx.strokeStyle = C.gold; ctx.lineWidth = s * 0.03; ctx.strokeRect(-s * 0.34, -s * 0.22, s * 0.68, s * 0.44); },
  },
  {
    id: "well", name: "Well", category: "town", blocksMove: true,
    draw: (ctx, s) => { disc(ctx, 0, 0, s * 0.34, C.stoneDark); disc(ctx, 0, 0, s * 0.27, C.stone); disc(ctx, 0, 0, s * 0.16, "#1c2a33"); disc(ctx, 0, 0, s * 0.1, C.water); },
  },
  {
    id: "tree", name: "Tree", category: "nature", blocksMove: true, blocksSight: true,
    draw: (ctx, s) => { disc(ctx, 0, 0, s * 0.42, C.greenDark); disc(ctx, -s * 0.12, -s * 0.1, s * 0.22, C.green); disc(ctx, s * 0.14, s * 0.08, s * 0.2, C.greenLight); disc(ctx, 0, 0, s * 0.07, C.woodDark); },
  },
  {
    id: "rock", name: "Rock", category: "nature", blocksMove: true,
    draw: (ctx, s) => {
      ctx.fillStyle = C.stone;
      ctx.beginPath();
      const pts = [[-0.3, 0.1], [-0.2, -0.25], [0.1, -0.3], [0.32, -0.05], [0.25, 0.28], [-0.1, 0.3]];
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = C.stoneLight; disc(ctx, -s * 0.08, -s * 0.08, s * 0.08, C.stoneLight);
    },
  },
  {
    id: "bush", name: "Bush", category: "nature", difficult: true,
    draw: (ctx, s) => { disc(ctx, -s * 0.12, 0, s * 0.16, C.greenDark); disc(ctx, s * 0.1, s * 0.04, s * 0.17, C.green); disc(ctx, 0, -s * 0.1, s * 0.15, C.greenLight); },
  },
  {
    id: "stump", name: "Stump", category: "nature",
    draw: (ctx, s) => { disc(ctx, 0, 0, s * 0.22, C.woodDark); disc(ctx, 0, 0, s * 0.16, C.wood); ctx.strokeStyle = C.woodDark; ctx.lineWidth = s * 0.02; ctx.beginPath(); ctx.arc(0, 0, s * 0.1, 0, Math.PI * 2); ctx.stroke(); },
  },
  {
    id: "mushroom", name: "Mushrooms", category: "nature",
    draw: (ctx, s) => { disc(ctx, 0, -s * 0.04, s * 0.2, "#b23a3a"); disc(ctx, -s * 0.06, -s * 0.08, s * 0.04, "#f0e6d2"); disc(ctx, s * 0.07, 0, s * 0.035, "#f0e6d2"); ctx.fillStyle = "#e6dcc6"; ctx.fillRect(-s * 0.05, 0, s * 0.1, s * 0.16); },
  },
  {
    id: "campfire", name: "Campfire", category: "nature", light: 4.5, lightColor: "#ff9a3a",
    draw: (ctx, s) => { ctx.strokeStyle = C.woodDark; ctx.lineWidth = s * 0.07; ctx.beginPath(); ctx.moveTo(-s * 0.2, s * 0.12); ctx.lineTo(s * 0.2, -s * 0.12); ctx.moveTo(s * 0.2, s * 0.12); ctx.lineTo(-s * 0.2, -s * 0.12); ctx.stroke(); disc(ctx, 0, 0, s * 0.13, C.fire); disc(ctx, 0, -s * 0.02, s * 0.07, C.fireCore); },
  },
  {
    id: "crystal", name: "Crystals", category: "arcane", blocksMove: true,
    draw: (ctx, s) => {
      const dia = (x: number, y: number, r: number, col: string) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.6, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.6, y); ctx.closePath(); ctx.fill(); };
      dia(-s * 0.1, s * 0.05, s * 0.24, C.purple); dia(s * 0.12, 0, s * 0.3, C.purpleLight); dia(s * 0.02, -s * 0.06, s * 0.18, C.purple);
    },
  },
  {
    id: "rune", name: "Glowing rune", category: "arcane",
    draw: (ctx, s) => { ctx.strokeStyle = C.purpleLight; ctx.lineWidth = s * 0.04; ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.lineTo(s * 0.16, s * 0.1); ctx.lineTo(-s * 0.16, s * 0.1); ctx.closePath(); ctx.stroke(); },
  },
  {
    id: "cauldron", name: "Cauldron", category: "arcane", blocksMove: true,
    draw: (ctx, s) => { disc(ctx, 0, 0, s * 0.28, "#2a2a2a"); disc(ctx, 0, 0, s * 0.21, "#1a1a1a"); disc(ctx, 0, 0, s * 0.15, "#3aa05a"); disc(ctx, -s * 0.05, -s * 0.04, s * 0.05, "#7af0a0"); },
  },
  {
    id: "fountain", name: "Fountain", category: "town", blocksMove: true,
    draw: (ctx, s) => { disc(ctx, 0, 0, s * 0.4, C.stone); disc(ctx, 0, 0, s * 0.32, C.water); disc(ctx, 0, 0, s * 0.14, C.stoneLight); disc(ctx, 0, 0, s * 0.06, "#cfe6f5"); },
  },
  {
    id: "bones", name: "Bones", category: "hazard",
    draw: (ctx, s) => { ctx.strokeStyle = C.bone; ctx.lineWidth = s * 0.05; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.1); ctx.lineTo(s * 0.18, s * 0.12); ctx.stroke(); disc(ctx, -s * 0.16, s * 0.12, s * 0.08, C.bone); ctx.lineCap = "butt"; },
  },
  {
    id: "rubble", name: "Rubble", category: "hazard", difficult: true,
    draw: (ctx, s) => { for (const [x, y, r] of [[-0.18, -0.1, 0.12], [0.12, -0.14, 0.1], [0.04, 0.12, 0.13], [-0.12, 0.14, 0.08]] as const) disc(ctx, x * s, y * s, r * s, Math.random() > 0.5 ? C.stone : C.stoneDark); },
  },
  {
    id: "spikes", name: "Spike trap", category: "hazard",
    draw: (ctx, s) => { ctx.fillStyle = C.metal; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const x = i * s * 0.2, y = j * s * 0.2; ctx.beginPath(); ctx.moveTo(x, y - s * 0.1); ctx.lineTo(x + s * 0.07, y + s * 0.08); ctx.lineTo(x - s * 0.07, y + s * 0.08); ctx.closePath(); ctx.fill(); } },
  },
  {
    id: "stairs", name: "Stairs", category: "dungeon",
    draw: (ctx, s) => { ctx.fillStyle = C.stone; rrect(ctx, -s * 0.4, -s * 0.3, s * 0.8, s * 0.6, s * 0.02, C.stone); ctx.strokeStyle = C.stoneDark; ctx.lineWidth = s * 0.03; for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.3 + i * s * 0.12); ctx.lineTo(s * 0.4, -s * 0.3 + i * s * 0.12); ctx.stroke(); } },
  },
  {
    id: "door", name: "Door", category: "dungeon", blocksMove: true,
    draw: (ctx, s) => { rrect(ctx, -s * 0.4, -s * 0.14, s * 0.8, s * 0.28, s * 0.03, C.wood); ctx.strokeStyle = C.woodDark; ctx.lineWidth = s * 0.03; ctx.strokeRect(-s * 0.36, -s * 0.1, s * 0.72, s * 0.2); ctx.fillStyle = C.gold; disc(ctx, s * 0.28, 0, s * 0.04, C.gold); },
  },
];

export const PROP_MAP = new Map(PROPS.map((p) => [p.id, p]));
