// Prefab furniture sets — a click stamps the whole group of props (positions
// are in cell units relative to the click point). Every `kind` must exist in
// the PROPS library.

export interface VignetteProp {
  kind: string;
  dx: number;
  dy: number;
  rot?: number;
  scale?: number;
}

export interface Vignette {
  id: string;
  name: string;
  props: VignetteProp[];
}

export const VIGNETTES: Vignette[] = [
  {
    id: "tavern",
    name: "Tavern corner",
    props: [
      { kind: "table-round", dx: 0, dy: 0 },
      { kind: "chair", dx: -1, dy: 0 },
      { kind: "chair", dx: 1, dy: 0 },
      { kind: "chair", dx: 0, dy: 1 },
      { kind: "barrel", dx: 2, dy: -1 },
      { kind: "barrel", dx: 2.8, dy: -0.8 },
      { kind: "lantern", dx: 0, dy: -2 },
    ],
  },
  {
    id: "prison",
    name: "Prison cells",
    props: [
      { kind: "bed", dx: -1.5, dy: 0 },
      { kind: "bones", dx: 1.2, dy: 1 },
      { kind: "bones", dx: -1.4, dy: 1.2, scale: 0.8 },
      { kind: "sconce", dx: 0, dy: -2 },
    ],
  },
  {
    id: "throne",
    name: "Throne dais",
    props: [
      { kind: "chair", dx: 0, dy: 0, scale: 1.4 },
      { kind: "statue", dx: -2, dy: 0 },
      { kind: "statue", dx: 2, dy: 0 },
      { kind: "brazier", dx: -2, dy: 2 },
      { kind: "brazier", dx: 2, dy: 2 },
      { kind: "rug", dx: 0, dy: 2 },
    ],
  },
  {
    id: "library",
    name: "Library nook",
    props: [
      { kind: "bookshelf", dx: -1, dy: -1.4 },
      { kind: "bookshelf", dx: 0, dy: -1.4 },
      { kind: "bookshelf", dx: 1, dy: -1.4 },
      { kind: "table-long", dx: 0, dy: 1 },
      { kind: "chair", dx: -1, dy: 1 },
      { kind: "chair", dx: 1, dy: 1 },
      { kind: "candelabra", dx: 0, dy: 0 },
    ],
  },
  {
    id: "campsite",
    name: "Campsite",
    props: [
      { kind: "campfire", dx: 0, dy: 0 },
      { kind: "stump", dx: -1.6, dy: 0.2 },
      { kind: "stump", dx: 1.6, dy: 0.2 },
      { kind: "crate", dx: 1, dy: -1.6 },
    ],
  },
  {
    id: "shrine",
    name: "Altar shrine",
    props: [
      { kind: "altar", dx: 0, dy: 0 },
      { kind: "brazier", dx: -1.6, dy: 0 },
      { kind: "brazier", dx: 1.6, dy: 0 },
      { kind: "rune", dx: 0, dy: 1.6 },
      { kind: "column", dx: -2.2, dy: -1.6 },
      { kind: "column", dx: 2.2, dy: -1.6 },
    ],
  },
];
