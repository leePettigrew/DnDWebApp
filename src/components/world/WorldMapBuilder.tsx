"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { Button } from "@/components/ui/Button";
import { CloseIcon, TrashIcon } from "@/components/ui/icons";
import {
  useCharacters,
  useEconomy,
  useFactions,
  useMaps,
  useQuests,
  useStatBlocks,
} from "@/lib/data/hooks";
import { newId } from "@/lib/domain/ids";
import type {
  BattleMap,
  PoiLink,
  PoiLinkKind,
  WorldMap,
  WorldPath,
  WorldPoi,
  WorldWeather,
} from "@/lib/domain/types";
import { BIOME_RGB, PAINT_BIOMES } from "@/lib/world/biomes";
import { decodeBytes, encodeBytes } from "@/lib/world/codec";
import { generateWorld } from "@/lib/world/generate";

const W = 36; // world span (units)
const HEIGHT = 6; // max elevation (units)

/** Selectable world resolutions (cells per side). */
const SIZES: { label: string; size: number }[] = [
  { label: "Small", size: 128 },
  { label: "Medium", size: 192 },
  { label: "Large", size: 256 },
  { label: "Huge", size: 384 },
];

/** Point-of-interest kinds (glyph + label). */
export const POI_KINDS: { id: string; glyph: string; label: string }[] = [
  { id: "city", glyph: "🏰", label: "City" },
  { id: "town", glyph: "🏘️", label: "Town" },
  { id: "village", glyph: "🏠", label: "Village" },
  { id: "port", glyph: "⚓", label: "Port" },
  { id: "castle", glyph: "🛡️", label: "Castle" },
  { id: "temple", glyph: "⛪", label: "Temple" },
  { id: "ruin", glyph: "🏛️", label: "Ruin" },
  { id: "dungeon", glyph: "💀", label: "Dungeon" },
  { id: "cave", glyph: "🕳️", label: "Cave" },
  { id: "camp", glyph: "⛺", label: "Camp" },
  { id: "peak", glyph: "⛰️", label: "Peak" },
  { id: "landmark", glyph: "✦", label: "Landmark" },
];
export const POI_GLYPH = new Map(POI_KINDS.map((k) => [k.id, k.glyph]));

type Tool =
  | "look"
  | "raise"
  | "lower"
  | "smooth"
  | "paint"
  | "lake"
  | "reveal"
  | "shroud"
  | "region"
  | "trees";

interface Engine {
  setView(v: "3d" | "top"): void;
  setSea(v: number): void;
  setTime(t: number): void;
  setWeather(w: WorldWeather): void;
  load(world: WorldMap): void;
  exportWorld(): WorldMap;
  /** Rebuild in-scene POI marker sprites from the given list. */
  syncPois(list: WorldPoi[]): void;
  /** Rebuild in-scene path tubes (rivers/roads/routes/borders). */
  syncPaths(): void;
  /** Begin drawing a path of the given kind (terrain clicks add points). */
  startDraw(kind: WorldPath["kind"]): void;
  /** Finish the in-progress path; returns its points (>=2) or null. */
  finishDraw(): number[] | null;
  /** Discard the in-progress path. */
  cancelDraw(): void;
  /** Place/clear the party banner at a normalized point. */
  setParty(p: { x: number; y: number } | null): void;
  /** Clear the measure ruler. */
  clearMeasure(): void;
  /** Toggle fog-of-exploration masking. */
  setFog(on: boolean): void;
  /** Reveal (1) or shroud (0) the entire map, then persist. */
  revealAll(v: 0 | 1): void;
  /** Clear all cells owned by a region index, then persist. */
  clearRegion(idx: number): void;
  /** Rebuild the instanced trees (after a density change). */
  rebuildTrees(): void;
  /** Rebuild the region name labels (after a territory/name change). */
  syncRegionLabels(): void;
  /** Re-shade (e.g. after toggling DM "view as player" or region colours). */
  reshade(): void;
  /** Camera azimuth (radians) for the compass. */
  azimuth(): number;
  dispose(): void;
}

export function WorldMapBuilder({
  map,
  world,
  onUpdate,
  canEdit,
}: {
  map: BattleMap;
  world: WorldMap;
  onUpdate: (patch: Partial<BattleMap>) => void;
  canEdit: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const saveTimer = useRef<number | null>(null);

  const [tool, setTool] = useState<Tool>("look");
  const [brushSize, setBrushSize] = useState(8);
  const [brushStrength, setBrushStrength] = useState(0.4);
  const [paintBiome, setPaintBiome] = useState(2);
  const [view, setView] = useState<"3d" | "top">("3d");
  const [sea, setSea] = useState(world.seaLevel);
  const [time, setTime] = useState(world.timeOfDay ?? 0.5);
  const [weather, setWeather] = useState<WorldWeather>(world.weather ?? "clear");
  const [genSize, setGenSize] = useState(world.size);

  // Live refs the pointer handlers / exporter read.
  const toolRef = useRef(tool);
  toolRef.current = canEdit ? tool : "look";
  const sizeRef = useRef(brushSize);
  sizeRef.current = brushSize;
  const strengthRef = useRef(brushStrength);
  strengthRef.current = brushStrength;
  const biomeRef = useRef(paintBiome);
  biomeRef.current = paintBiome;
  const timeRef = useRef(time);
  timeRef.current = time;
  const weatherRef = useRef(weather);
  weatherRef.current = weather;

  // --- linked collections (integration) ---
  const { items: factions } = useFactions();
  const { items: quests } = useQuests();
  const { items: statBlocks } = useStatBlocks();
  const { items: characters } = useCharacters();
  const { items: allMaps } = useMaps();
  const { value: economy, update: updateEconomy } = useEconomy();
  const economyRef = useRef(economy);
  economyRef.current = economy;
  const battleMaps = allMaps.filter((m) => !m.world && m.id !== map.id);

  // --- POIs ---
  const pois = world.pois ?? [];
  const [placing, setPlacing] = useState(false);
  const [selectedPoi, setSelectedPoi] = useState<string | null>(null);
  const selPoi = pois.find((p) => p.id === selectedPoi) ?? null;
  const poisRef = useRef(pois);
  poisRef.current = pois;

  // POIs with marker colour resolved from a linked faction (when unset).
  const factionColor = (id?: string) =>
    id ? factions.find((f) => f.id === id)?.color : undefined;
  const resolvedPois = useMemo(
    () =>
      pois.map((p) => {
        if (p.color) return p;
        const facRef =
          p.factionId ?? p.links?.find((l) => l.kind === "faction")?.ref;
        return facRef ? { ...p, color: factionColor(facRef) ?? p.color } : p;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pois, factions],
  );
  const resolvedPoisRef = useRef(resolvedPois);
  resolvedPoisRef.current = resolvedPois;
  const visibleResolved = useMemo(
    () => (canEdit ? resolvedPois : resolvedPois.filter((p) => !p.hidden)),
    [resolvedPois, canEdit],
  );
  const worldRef = useRef(world);
  worldRef.current = world;
  const compassRef = useRef<HTMLDivElement | null>(null);
  const frameCbRef = useRef<(() => void) | null>(null);
  const onPlaceRef = useRef<((nx: number, ny: number) => void) | null>(null);
  const onSelectRef = useRef<((id: string) => void) | null>(null);
  onSelectRef.current = (id) => setSelectedPoi(id);

  // --- paths (rivers/roads/routes/borders) ---
  const paths = world.paths ?? [];
  const [drawKind, setDrawKind] = useState<WorldPath["kind"]>("river");
  const [drawing, setDrawing] = useState(false);
  // Width (world units) for the next river/road drawn; null = kind default.
  const PATH_W_DEFAULT: Record<WorldPath["kind"], number> = {
    river: 0.5,
    road: 0.38,
    cobble: 0.38,
    route: 0.4,
    border: 0.34,
  };
  const [drawWidth, setDrawWidth] = useState(0.5);
  const drawKindRef = useRef<WorldPath["kind"] | null>(null);
  drawKindRef.current = canEdit && drawing ? drawKind : null;
  const savePaths = (next: WorldPath[]) => saveWorld({ paths: next });

  // --- travel (measure + party) ---
  const [measuring, setMeasuring] = useState(false);
  const [placingParty, setPlacingParty] = useState(false);
  const [speed, setSpeed] = useState(world.travelSpeed ?? 24);
  const measureRef = useRef(false);
  measureRef.current = canEdit && measuring;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const onPartyRef = useRef<((p: { x: number; y: number }) => void) | null>(null);
  onPartyRef.current =
    canEdit && placingParty
      ? (p) => {
          saveWorld({ party: p });
          engineRef.current?.setParty(p);
          setPlacingParty(false);
        }
      : null;

  // --- fog of exploration ---
  const [fog, setFog] = useState(!!world.fog);
  const [previewPlayer, setPreviewPlayer] = useState(false);
  const previewPlayerRef = useRef(previewPlayer);
  previewPlayerRef.current = previewPlayer;

  // --- political regions (territory paint) ---
  const regions = world.regions ?? [];
  const [activeRegion, setActiveRegion] = useState(regions[0]?.num ?? 1);
  const activeRegionRef = useRef(activeRegion);
  activeRegionRef.current = activeRegion;
  const regColor = (rg: (typeof regions)[number]) =>
    (rg.factionId ? factionColor(rg.factionId) ?? rg.color : rg.color) ?? "#8a4b2d";
  const hexToRgb01 = (hex?: string): [number, number, number] => {
    const h = (hex ?? "#8a4b2d").replace("#", "");
    const n = parseInt(h.length === 3 ? h.replace(/(.)/g, "$1$1") : h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  // region paint index (num) → resolved rgb (faction colour wins)
  const regionColors = useMemo(() => {
    const arr: (([number, number, number]) | undefined)[] = [];
    for (const rg of regions) if (rg.num) arr[rg.num] = hexToRgb01(regColor(rg));
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions, factions]);
  const regionColorsRef = useRef(regionColors);
  regionColorsRef.current = regionColors;
  const [regionMode, setRegionMode] = useState<"paint" | "erase">("paint");
  const regionModeRef = useRef(regionMode);
  regionModeRef.current = regionMode;

  const saveRegions = (next: typeof regions) => saveWorld({ regions: next });
  const updateRegion = (id: string, patch: Partial<(typeof regions)[number]>) =>
    saveRegions(regions.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRegion = () => {
    const num = regions.reduce((m, r) => Math.max(m, r.num ?? 0), 0) + 1;
    saveRegions([
      ...regions,
      { id: newId(), num, name: `Region ${regions.length + 1}`, color: "#8a4b2d" },
    ]);
    setActiveRegion(num);
    setTool("region");
  };

  // --- trees ---
  const [treeMode, setTreeMode] = useState<"plant" | "clear">("plant");
  const treeModeRef = useRef(treeMode);
  treeModeRef.current = treeMode;
  const [treeDensity, setTreeDensity] = useState(world.treeDensity ?? 0.5);
  const treeDensityRef = useRef(treeDensity);
  treeDensityRef.current = treeDensity;

  // --- region visibility (all users) ---
  const [showRegions, setShowRegions] = useState(false);
  const showRegionsRef = useRef(showRegions);
  showRegionsRef.current = showRegions;
  const [showRoutes, setShowRoutes] = useState(true);
  const showRoutesRef = useRef(showRoutes);
  showRoutesRef.current = showRoutes;

  /** Persist world fields, preserving in-memory terrain edits. */
  const saveWorld = (patch: Partial<WorldMap>) => {
    const base = engineRef.current ? engineRef.current.exportWorld() : world;
    onUpdate({ world: { ...base, ...patch } });
  };
  const savePois = (next: WorldPoi[]) => saveWorld({ pois: next });
  const updatePoi = (id: string, patch: Partial<WorldPoi>) =>
    savePois(poisRef.current.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removePoi = (id: string) => {
    savePois(poisRef.current.filter((p) => p.id !== id));
    setSelectedPoi((s) => (s === id ? null : s));
  };

  // --- POI links (multiple per POI) ---
  const LINK_KINDS: { kind: PoiLinkKind; label: string }[] = [
    { kind: "faction", label: "Faction" },
    { kind: "quest", label: "Quest" },
    { kind: "npc", label: "NPC" },
    { kind: "hero", label: "Hero" },
    { kind: "map", label: "Battle map" },
  ];
  const [addLinkKind, setAddLinkKind] = useState<PoiLinkKind>("faction");
  const linkOptions = (kind: PoiLinkKind): { id: string; label: string }[] => {
    if (kind === "faction") return factions.map((f) => ({ id: f.id, label: f.name }));
    if (kind === "quest") return quests.map((q) => ({ id: q.id, label: q.title }));
    if (kind === "npc") return statBlocks.map((s) => ({ id: s.id, label: s.name }));
    if (kind === "hero") return characters.map((c) => ({ id: c.id, label: c.name }));
    return battleMaps.map((m) => ({ id: m.id, label: m.name }));
  };
  const linkName = (l: PoiLink): string =>
    linkOptions(l.kind).find((o) => o.id === l.ref)?.label ?? "—";
  const linkHref = (l: PoiLink): string | null =>
    l.kind === "npc"
      ? `/bestiary/${l.ref}`
      : l.kind === "hero"
        ? `/characters/${l.ref}`
        : l.kind === "map"
          ? "/combat"
          : null;
  // Normalize legacy single fields → a link array (for display + editing).
  const normalizedLinks = (p: WorldPoi): PoiLink[] => {
    if (p.links?.length) return p.links;
    const out: PoiLink[] = [];
    if (p.factionId) out.push({ id: "old-faction", kind: "faction", ref: p.factionId });
    if (p.questId) out.push({ id: "old-quest", kind: "quest", ref: p.questId });
    if (p.statBlockId) out.push({ id: "old-npc", kind: "npc", ref: p.statBlockId });
    if (p.characterId) out.push({ id: "old-hero", kind: "hero", ref: p.characterId });
    if (p.battleMapId) out.push({ id: "old-map", kind: "map", ref: p.battleMapId });
    return out;
  };
  const setLinks = (p: WorldPoi, links: PoiLink[]) =>
    updatePoi(p.id, {
      links,
      factionId: undefined,
      questId: undefined,
      statBlockId: undefined,
      characterId: undefined,
      battleMapId: undefined,
    });
  const addLink = (p: WorldPoi, kind: PoiLinkKind, ref: string) =>
    setLinks(p, [...normalizedLinks(p), { id: newId(), kind, ref }]);
  const removeLink = (p: WorldPoi, id: string) =>
    setLinks(p, normalizedLinks(p).filter((l) => l.id !== id));
  onPlaceRef.current =
    canEdit && placing
      ? (nx, ny) => {
          const poi: WorldPoi = {
            id: newId(),
            name: "New place",
            kind: "town",
            x: nx,
            y: ny,
          };
          savePois([...poisRef.current, poi]);
          setSelectedPoi(poi.id);
          setPlacing(false);
        }
      : null;

  const scheduleSave = () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      if (engineRef.current) onUpdate({ world: engineRef.current.exportWorld() });
    }, 700);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import(
        "three/examples/jsm/controls/OrbitControls.js"
      );
      if (disposed || !container) return;

      const size = world.size;
      const N = size - 1;
      let heightArr: Float32Array = new Float32Array(size * size);
      let biomeArr: Uint8Array = new Uint8Array(size * size);
      let exploredArr: Uint8Array = new Uint8Array(size * size);
      let regionArr: Uint8Array = new Uint8Array(size * size);
      let treeArr: Uint8Array = new Uint8Array(size * size);
      let lakeArr: Uint8Array = new Uint8Array(size * size);
      // Terrain modifiers derived from paths (rivers carve, roads flatten).
      const carveArr = new Float32Array(size * size);
      const roadTarget = new Float32Array(size * size);
      const roadW = new Float32Array(size * size);
      const dispArr = new Float32Array(size * size); // displayed height = base + mods
      // Paths painted into the surface (so they mesh with the terrain).
      const pathR = new Float32Array(size * size);
      const pathG = new Float32Array(size * size);
      const pathB = new Float32Array(size * size);
      const pathWt = new Float32Array(size * size);
      const cullArr = new Uint8Array(size * size); // 1 = clear trees (under paths)
      const cobbleArr = new Uint8Array(size * size); // 1 = cobblestone (extra texture)
      const poiClearArr = new Uint8Array(size * size); // 1 = clear trees (around POIs)
      // Cache the base64-encoded grids so metadata saves (region colours, names,
      // POI links…) don't re-encode the whole terrain every time.
      let gridDirty = true;
      let gridCache: {
        height: string;
        biome: string;
        explored: string;
        regionMask: string;
        treeMask: string;
        lakeMask: string;
      } | null = null;
      let seaLevel = world.seaLevel;
      let fogOn = !!world.fog;

      const fitGrid = (a: Uint8Array) => {
        if (a.length === size * size) return a;
        const out = new Uint8Array(size * size);
        out.set(a.subarray(0, size * size));
        return out;
      };
      function loadArrays(wm: WorldMap) {
        const h = decodeBytes(wm.height, size * size);
        biomeArr = fitGrid(decodeBytes(wm.biome, size * size));
        heightArr = new Float32Array(size * size);
        for (let i = 0; i < heightArr.length; i++) heightArr[i] = (h[i] ?? 0) / 255;
        exploredArr = fitGrid(
          wm.explored ? decodeBytes(wm.explored, size * size) : new Uint8Array(0),
        );
        regionArr = fitGrid(
          wm.regionMask ? decodeBytes(wm.regionMask, size * size) : new Uint8Array(0),
        );
        if (wm.treeMask) {
          treeArr = fitGrid(decodeBytes(wm.treeMask, size * size));
        } else {
          // Auto-fill: forests dense, swamps light.
          treeArr = new Uint8Array(size * size);
          for (let i = 0; i < treeArr.length; i++) {
            treeArr[i] = biomeArr[i] === 3 ? 210 : biomeArr[i] === 8 ? 110 : 0;
          }
        }
        lakeArr = fitGrid(
          wm.lakeMask ? decodeBytes(wm.lakeMask, size * size) : new Uint8Array(0),
        );
        seaLevel = wm.seaLevel;
        gridDirty = true; // fresh grids → re-encode on next export
      }
      loadArrays(world);

      const width = container.clientWidth || 640;
      const heightPx = container.clientHeight || 420;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, heightPx);
      renderer.domElement.style.cssText =
        "position:absolute;inset:0;width:100%;height:100%;touch-action:none;";
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / heightPx, 0.1, 600);
      camera.position.set(0, 30, 44);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.target.set(0, 0, 0);
      controls.maxDistance = 200;
      controls.minDistance = 2;
      controls.zoomSpeed = 1.1;

      // RTS keyboard movement (WASD pan, Q/E height) — active while hovered.
      const keys = new Set<string>();
      let hovered = false;
      const worldUp = new THREE.Vector3(0, 1, 0);
      const fwd = new THREE.Vector3();
      const rightV = new THREE.Vector3();
      const onKeyDown = (e: KeyboardEvent) => {
        const el = document.activeElement;
        if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
        const k = e.key.toLowerCase();
        if (k === "shift") {
          if (hovered) keys.add("shift");
          return;
        }
        if ("wasdqe".includes(k) && hovered) {
          keys.add(k);
          e.preventDefault();
        }
      };
      const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
      const onEnter = () => (hovered = true);
      const onLeave = () => {
        hovered = false;
        keys.clear();
        brushRing.visible = false;
      };
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      renderer.domElement.addEventListener("pointerenter", onEnter);
      renderer.domElement.addEventListener("pointerleave", onLeave);
      function moveKeys(dt: number) {
        if (keys.size === 0) return;
        const fast = keys.has("shift") ? 2.4 : 1;
        const dist = camera.position.distanceTo(controls.target);
        const sp = Math.max(2, dist * 0.55) * fast * dt;
        camera.getWorldDirection(fwd);
        fwd.y = 0;
        fwd.normalize();
        rightV.crossVectors(fwd, worldUp).normalize();
        const move = new THREE.Vector3();
        if (keys.has("w")) move.add(fwd);
        if (keys.has("s")) move.sub(fwd);
        if (keys.has("d")) move.add(rightV);
        if (keys.has("a")) move.sub(rightV);
        if (keys.has("e")) move.add(worldUp);
        if (keys.has("q")) move.sub(worldUp);
        if (move.lengthSq() === 0) return;
        move.normalize().multiplyScalar(sp);
        camera.position.add(move);
        controls.target.add(move);
      }

      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambient);
      const sun = new THREE.DirectionalLight(0xffffff, 1.4);
      scene.add(sun);
      const hemi = new THREE.HemisphereLight(0xbfd5ff, 0x3a2f22, 0.4);
      scene.add(hemi);

      // Terrain.
      const geo = new THREE.PlaneGeometry(W, W, N, N);
      const colorAttr = new THREE.Float32BufferAttribute(
        new Float32Array(size * size * 3),
        3,
      );
      geo.setAttribute("color", colorAttr);
      const terrainMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0,
      });
      const terrain = new THREE.Mesh(geo, terrainMat);
      terrain.rotation.x = -Math.PI / 2;
      scene.add(terrain);

      // Water — its own translucent surface; terrain colour stays land-toned.
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x2b6a93,
        transparent: true,
        opacity: 0.62,
        roughness: 0.15,
        metalness: 0.25,
        depthWrite: false,
      });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, W * 2), waterMat);
      water.rotation.x = -Math.PI / 2;
      water.renderOrder = 1;
      scene.add(water);

      // Brush preview ring (shows the brush footprint on the terrain).
      const BRUSH_TOOLS = new Set([
        "raise",
        "lower",
        "smooth",
        "paint",
        "lake",
        "reveal",
        "shroud",
        "region",
        "trees",
      ]);
      const brushRing = new THREE.Mesh(
        new THREE.RingGeometry(0.86, 1, 48),
        new THREE.MeshBasicMaterial({
          color: 0xf2e8d0,
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide,
          depthTest: false,
        }),
      );
      brushRing.rotation.x = -Math.PI / 2;
      brushRing.renderOrder = 20;
      brushRing.visible = false;
      scene.add(brushRing);

      const pos = geo.getAttribute("position") as InstanceType<
        typeof THREE.Float32BufferAttribute
      >;

      // --- POI 3D models + hover/zoom labels ---
      function heightAtNorm(nx: number, ny: number) {
        const col = Math.max(0, Math.min(size - 1, Math.round(nx * N)));
        const row = Math.max(0, Math.min(size - 1, Math.round(ny * N)));
        return dispArr[row * size + col];
      }
      // Pre-carve (bank) height — used to fill river channels with water.
      function baseHeightAtNorm(nx: number, ny: number) {
        const col = Math.max(0, Math.min(size - 1, Math.round(nx * N)));
        const row = Math.max(0, Math.min(size - 1, Math.round(ny * N)));
        return heightArr[row * size + col];
      }
      function roundRect(
        c: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        r: number,
      ) {
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + w, y, x + w, y + h, r);
        c.arcTo(x + w, y + h, x, y + h, r);
        c.arcTo(x, y + h, x, y, r);
        c.arcTo(x, y, x + w, y, r);
        c.closePath();
      }
      function makeLabel(p: WorldPoi) {
        const name = p.name || "Place";
        const SC = 2; // supersample for crisp text when small
        const font = `600 ${24 * SC}px Georgia, serif`;
        const meas = document.createElement("canvas").getContext("2d")!;
        meas.font = font;
        const tw = Math.ceil(meas.measureText(name).width);
        const dot = 11 * SC;
        const padL = 11 * SC;
        const padR = 14 * SC;
        const gap = 7 * SC;
        const h = 36 * SC;
        const w = padL + dot + gap + tw + padR;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d")!;
        ctx.font = font;
        ctx.fillStyle = "rgba(247,240,224,0.95)";
        roundRect(ctx, SC, SC, w - 2 * SC, h - 2 * SC, (h - 2 * SC) / 2);
        ctx.fill();
        ctx.lineWidth = 1.5 * SC;
        ctx.strokeStyle = p.hidden ? "rgba(122,45,45,0.85)" : "rgba(60,50,40,0.4)";
        ctx.stroke();
        ctx.fillStyle = p.color || "#7a2d2d";
        ctx.beginPath();
        ctx.arc(padL + dot / 2, h / 2, dot / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2b2218";
        ctx.textBaseline = "middle";
        ctx.fillText(name, padL + dot + gap, h / 2 + SC);
        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = 8;
        tex.needsUpdate = true;
        return { tex, aspect: w / h };
      }
      // shared low-poly materials
      const MAT = {
        stone: new THREE.MeshStandardMaterial({ color: 0x9a9182, roughness: 0.9 }),
        darkStone: new THREE.MeshStandardMaterial({ color: 0x5f584d, roughness: 0.95 }),
        wood: new THREE.MeshStandardMaterial({ color: 0x6e4a30, roughness: 0.85 }),
        roof: new THREE.MeshStandardMaterial({ color: 0x7a4226, roughness: 0.8 }),
        tent: new THREE.MeshStandardMaterial({ color: 0xb9a06a, roughness: 0.85 }),
        gold: new THREE.MeshStandardMaterial({ color: 0xcaa53a, roughness: 0.45, metalness: 0.35 }),
        rock: new THREE.MeshStandardMaterial({ color: 0x867d70, roughness: 1, flatShading: true }),
        snow: new THREE.MeshStandardMaterial({ color: 0xeef2f5, roughness: 1 }),
        dark: new THREE.MeshStandardMaterial({ color: 0x35312a, roughness: 0.9 }),
      };
      const POI_SCALE = 0.17;
      type Mat = InstanceType<typeof THREE.MeshStandardMaterial>;
      const pBox = (w: number, h: number, d: number, m: Mat, x = 0, y = 0, z = 0) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        mesh.position.set(x, y + h / 2, z);
        return mesh;
      };
      const pCyl = (r: number, h: number, m: Mat, x = 0, y = 0, z = 0, seg = 8) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
        mesh.position.set(x, y + h / 2, z);
        return mesh;
      };
      const pCone = (r: number, h: number, m: Mat, x = 0, y = 0, z = 0, seg = 4) => {
        const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
        mesh.position.set(x, y + h / 2, z);
        return mesh;
      };
      function pHouse(w: number, h: number, d: number, x: number, z: number) {
        const g = new THREE.Group();
        g.add(pBox(w, h, d, MAT.wood));
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(Math.max(w, d) * 0.82, h * 0.8, 4),
          MAT.roof,
        );
        roof.rotation.y = Math.PI / 4;
        roof.position.y = h + h * 0.4;
        g.add(roof);
        g.position.set(x, 0, z);
        return g;
      }
      function pFlag(accent: Mat, x = 0, y = 0, z = 0) {
        const g = new THREE.Group();
        g.add(pCyl(0.03, 0.7, MAT.dark, 0, y, 0, 5));
        g.add(pBox(0.32, 0.2, 0.02, accent, 0.18, y + 0.5, 0));
        g.position.set(x, 0, z);
        return g;
      }
      function buildPoiModel(kind: string, accentHex?: string) {
        const accent = new THREE.MeshStandardMaterial({
          color: new THREE.Color(accentHex || "#7a2d2d"),
          roughness: 0.7,
        });
        const g = new THREE.Group();
        switch (kind) {
          case "city":
          case "castle": {
            g.add(pCyl(0.5, 1.3, MAT.stone, 0, 0, 0, 8));
            for (let a = 0; a < 8; a++) {
              const an = (a / 8) * Math.PI * 2;
              g.add(pBox(0.14, 0.22, 0.14, MAT.stone, Math.cos(an) * 0.46, 1.3, Math.sin(an) * 0.46));
            }
            g.add(pFlag(accent, 0, 1.55, 0));
            if (kind === "city") {
              g.add(pHouse(0.42, 0.3, 0.42, 0.8, 0.3));
              g.add(pHouse(0.36, 0.28, 0.36, -0.7, -0.4));
            }
            break;
          }
          case "town":
            g.add(pHouse(0.5, 0.4, 0.5, 0, 0));
            g.add(pHouse(0.4, 0.32, 0.4, 0.62, 0.32));
            g.add(pHouse(0.4, 0.3, 0.4, -0.55, 0.4));
            break;
          case "village":
            g.add(pHouse(0.55, 0.42, 0.55, 0, 0));
            break;
          case "port": {
            g.add(pBox(1.0, 0.1, 0.5, MAT.wood, 0, 0, 0));
            g.add(pCyl(0.08, 0.7, MAT.wood, -0.35, 0.1, 0, 6));
            const anchor = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 6, 12), MAT.gold);
            anchor.position.set(0.35, 0.5, 0);
            g.add(anchor);
            g.add(pFlag(accent, -0.35, 0.8, 0));
            break;
          }
          case "temple": {
            g.add(pBox(1.1, 0.16, 0.8, MAT.stone));
            for (const x of [-0.4, -0.13, 0.13, 0.4]) {
              g.add(pCyl(0.07, 0.7, MAT.stone, x, 0.16, 0.28, 8));
              g.add(pCyl(0.07, 0.7, MAT.stone, x, 0.16, -0.28, 8));
            }
            g.add(pCone(0.78, 0.42, accent, 0, 0.86, 0, 4));
            break;
          }
          case "ruin":
            g.add(pCyl(0.09, 0.9, MAT.stone, -0.3, 0, 0.1, 8));
            g.add(pCyl(0.09, 0.55, MAT.stone, 0.2, 0, -0.2, 8));
            g.add(pCyl(0.09, 0.72, MAT.stone, 0.26, 0, 0.26, 8));
            g.add(pBox(0.3, 0.12, 0.3, MAT.stone, -0.1, 0, -0.32));
            break;
          case "dungeon": {
            g.add(pBox(0.18, 1.0, 0.18, MAT.darkStone, -0.35, 0, 0));
            g.add(pBox(0.18, 1.0, 0.18, MAT.darkStone, 0.35, 0, 0));
            g.add(pBox(0.95, 0.2, 0.22, MAT.darkStone, 0, 1.0, 0));
            g.add(pBox(0.18, 0.18, 0.05, accent, 0, 0.55, 0.12));
            break;
          }
          case "cave": {
            const mound = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), MAT.rock);
            mound.position.y = 0.45;
            mound.scale.set(1, 0.7, 1);
            g.add(mound);
            g.add(pBox(0.4, 0.45, 0.2, MAT.dark, 0, 0, 0.5));
            break;
          }
          case "camp": {
            const tent = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.8, 4), MAT.tent);
            tent.position.y = 0.4;
            tent.rotation.y = Math.PI / 4;
            g.add(tent);
            g.add(pCone(0.12, 0.2, accent, 0.6, 0, 0.3, 5));
            break;
          }
          case "peak":
            g.add(pCone(0.8, 1.5, MAT.rock, 0, 0, 0, 5));
            g.add(pCone(0.34, 0.5, MAT.snow, 0, 1.0, 0, 5));
            break;
          case "landmark":
          default: {
            const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.22, 1.5, 4), MAT.stone);
            ob.position.y = 0.75;
            g.add(ob);
            g.add(pCone(0.12, 0.25, accent, 0, 1.5, 0, 4));
            break;
          }
        }
        g.scale.setScalar(POI_SCALE);
        return g;
      }

      const poiMap = new Map<
        string,
        {
          group: InstanceType<typeof THREE.Group>;
          label: InstanceType<typeof THREE.Sprite>;
          aspect: number;
          sig: string;
          x: number;
          y: number;
        }
      >();
      const poiPick: InstanceType<typeof THREE.Object3D>[] = [];
      let hoveredPoiId: string | null = null;
      function disposeGroup(group: InstanceType<typeof THREE.Group>) {
        scene.remove(group);
        group.traverse((o) => {
          const m = o as InstanceType<typeof THREE.Mesh>;
          if (m.geometry) m.geometry.dispose();
        });
      }
      function syncPois(list: WorldPoi[]) {
        const ids = new Set(list.map((p) => p.id));
        for (const [id, rec] of poiMap) {
          if (!ids.has(id)) {
            disposeGroup(rec.group);
            scene.remove(rec.label);
            (rec.label.material.map as InstanceType<typeof THREE.CanvasTexture>)?.dispose();
            rec.label.material.dispose();
            poiMap.delete(id);
          }
        }
        for (const p of list) {
          const sig = `${p.name}|${p.kind}|${p.color ?? ""}|${p.hidden ? 1 : 0}`;
          const ex = poiMap.get(p.id);
          if (ex && ex.sig === sig) {
            ex.x = p.x;
            ex.y = p.y;
            ex.group.position.set(
              (p.x - 0.5) * W,
              heightAtNorm(p.x, p.y) * HEIGHT,
              (p.y - 0.5) * W,
            );
            continue;
          }
          if (ex) {
            disposeGroup(ex.group);
            scene.remove(ex.label);
            (ex.label.material.map as InstanceType<typeof THREE.CanvasTexture>)?.dispose();
            ex.label.material.dispose();
            poiMap.delete(p.id);
          }
          const group = buildPoiModel(p.kind, p.color);
          group.position.set((p.x - 0.5) * W, heightAtNorm(p.x, p.y) * HEIGHT, (p.y - 0.5) * W);
          group.traverse((o) => (o.userData.id = p.id));
          scene.add(group);
          const { tex, aspect } = makeLabel(p);
          const label = new THREE.Sprite(
            new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
          );
          label.renderOrder = 11;
          label.visible = false;
          scene.add(label);
          poiMap.set(p.id, { group, label, aspect, sig, x: p.x, y: p.y });
        }
        poiPick.length = 0;
        for (const rec of poiMap.values()) poiPick.push(rec.group);
        syncLights(list);
        buildLanterns();
        buildTrees(); // re-clear trees around the (possibly moved/added) POIs
      }
      function updatePoiLabels() {
        for (const [id, rec] of poiMap) {
          const d = camera.position.distanceTo(rec.group.position);
          const show = d < 34 || id === hoveredPoiId;
          rec.label.visible = show;
          if (show) {
            // quadratic in distance → on-screen size shrinks as you zoom in
            const s = Math.min(1.4, Math.max(0.1, d * d * 0.0007));
            rec.label.position.set(
              rec.group.position.x,
              rec.group.position.y + 0.35 + s * 0.45,
              rec.group.position.z,
            );
            rec.label.scale.set(s * rec.aspect, s, 1);
          }
        }
      }
      function repositionPois() {
        for (const rec of poiMap.values()) {
          rec.group.position.y = heightAtNorm(rec.x, rec.y) * HEIGHT;
        }
      }

      // --- path tubes (rivers / roads / routes / borders) ---
      // Paint colours per path kind (rgb 0..1, blend weight). Paths are painted
      // into the terrain surface, not built as floating meshes.
      const PATH_PAINT: Record<
        WorldPath["kind"],
        { rgb: [number, number, number]; w: number }
      > = {
        river: { rgb: [0.17, 0.41, 0.58], w: 0.85 },
        road: { rgb: [0.42, 0.3, 0.21], w: 0.88 },
        cobble: { rgb: [0.22, 0.16, 0.14], w: 0.92 },
        route: { rgb: [0.46, 0.32, 0.12], w: 0.82 },
        border: { rgb: [0.28, 0.22, 0.16], w: 0.8 },
      };
      const hex01 = (hex: string): [number, number, number] => {
        const n = parseInt(hex.replace("#", ""), 16);
        return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
      };
      function disposePathMesh(mesh: InstanceType<typeof THREE.Mesh>) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        const m = mesh.material as InstanceType<typeof THREE.MeshStandardMaterial>;
        m.map?.dispose();
        m.dispose();
      }
      const PATH_WIDTH: Record<WorldPath["kind"], number> = {
        river: 0.5,
        road: 0.38,
        cobble: 0.38,
        route: 0.4,
        border: 0.34,
      };
      // A thin draped tube — used only as a live guide while drawing a path.
      function buildPreviewTube(points: number[], kind: WorldPath["kind"]) {
        const v: InstanceType<typeof THREE.Vector3>[] = [];
        for (let i = 0; i + 1 < points.length; i += 2) {
          const nx = points[i];
          const ny = points[i + 1];
          v.push(
            new THREE.Vector3(
              (nx - 0.5) * W,
              heightAtNorm(nx, ny) * HEIGHT + 0.14,
              (ny - 0.5) * W,
            ),
          );
        }
        if (v.length < 2) return null;
        const curve = new THREE.CatmullRomCurve3(v, false, "catmullrom", 0.5);
        const geo = new THREE.TubeGeometry(curve, Math.max(8, v.length * 8), 0.06, 6, false);
        const c = PATH_PAINT[kind]?.rgb ?? [0.8, 0.6, 0.3];
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(c[0], c[1], c[2]),
          emissive: new THREE.Color(c[0] * 0.4, c[1] * 0.4, c[2] * 0.4),
          roughness: 0.6,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 3;
        return mesh;
      }

      // --- river water surface (fills the carved channel) ---
      function makeWaterTexture() {
        const s = 128;
        const c = document.createElement("canvas");
        c.width = c.height = s;
        const ctx = c.getContext("2d")!;
        const g = ctx.createLinearGradient(0, 0, s, 0);
        g.addColorStop(0, "#2b6390");
        g.addColorStop(0.5, "#3f8fc0");
        g.addColorStop(1, "#2b6390");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s, s);
        ctx.lineWidth = 1.6;
        for (let yy = -4; yy < s; yy += 6) {
          ctx.strokeStyle = `rgba(212,235,250,${0.1 + Math.random() * 0.12})`;
          ctx.beginPath();
          for (let x = 0; x <= s; x += 4) {
            const y = yy + Math.sin(x * 0.13 + yy) * 2.2;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        // soft alpha at the across-width edges so banks blend in
        const f = document.createElement("canvas");
        f.width = f.height = s;
        const fc = f.getContext("2d")!;
        const fg = fc.createLinearGradient(0, 0, s, 0);
        fg.addColorStop(0, "rgba(0,0,0,0.15)");
        fg.addColorStop(0.22, "rgba(0,0,0,0.85)");
        fg.addColorStop(0.78, "rgba(0,0,0,0.85)");
        fg.addColorStop(1, "rgba(0,0,0,0.15)");
        fc.fillStyle = fg;
        fc.fillRect(0, 0, s, s);
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(f, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 8;
        return tex;
      }
      const waterTex = makeWaterTexture();
      const riverWaterMat = new THREE.MeshStandardMaterial({
        map: waterTex,
        transparent: true,
        opacity: 0.82,
        roughness: 0.12,
        metalness: 0.25,
        side: THREE.DoubleSide,
      });
      const riverMeshes: InstanceType<typeof THREE.Mesh>[] = [];
      function buildRivers() {
        for (const m of riverMeshes) {
          scene.remove(m);
          m.geometry.dispose();
        }
        riverMeshes.length = 0;
        for (const p of worldRef.current.paths ?? []) {
          if (p.kind !== "river") continue;
          const ctrl: InstanceType<typeof THREE.Vector3>[] = [];
          for (let i = 0; i + 1 < p.points.length; i += 2) {
            ctrl.push(new THREE.Vector3((p.points[i] - 0.5) * W, 0, (p.points[i + 1] - 0.5) * W));
          }
          if (ctrl.length < 2) continue;
          const curve = new THREE.CatmullRomCurve3(ctrl, false, "catmullrom", 0.5);
          const segs = Math.max(20, ctrl.length * 16);
          const sample = curve.getSpacedPoints(segs);
          const half = ((p.width ?? PATH_WIDTH.river) / 2) * 0.92;
          const pos: number[] = [];
          const uv: number[] = [];
          const idx: number[] = [];
          let len = 0;
          for (let i = 0; i <= segs; i++) {
            const pt = sample[i];
            const prev = sample[Math.max(0, i - 1)];
            const next = sample[Math.min(segs, i + 1)];
            const tx = next.x - prev.x;
            const tz = next.z - prev.z;
            const tl = Math.hypot(tx, tz) || 1;
            const px = -tz / tl;
            const pz = tx / tl;
            if (i > 0) len += pt.distanceTo(sample[i - 1]);
            const v = len / 2.4;
            const lx = pt.x + px * half;
            const lz = pt.z + pz * half;
            const rx = pt.x - px * half;
            const rz = pt.z - pz * half;
            // water surface sits near bank level (fills the carved channel)
            const ly = baseHeightAtNorm(lx / W + 0.5, lz / W + 0.5) * HEIGHT - 0.04;
            const ry = baseHeightAtNorm(rx / W + 0.5, rz / W + 0.5) * HEIGHT - 0.04;
            pos.push(lx, ly, lz, rx, ry, rz);
            uv.push(0, v, 1, v);
            if (i < segs) {
              const b = i * 2;
              idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
            }
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
          geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
          geo.setIndex(idx);
          geo.computeVertexNormals();
          const mesh = new THREE.Mesh(geo, riverWaterMat);
          mesh.renderOrder = 1;
          scene.add(mesh);
          riverMeshes.push(mesh);
        }
      }

      // --- lakes: still water filling a dug basin to its rim ---
      const lakeTex = makeWaterTexture();
      const lakeWaterMat = new THREE.MeshStandardMaterial({
        map: lakeTex,
        color: 0x2f74b0, // bluer tint
        transparent: true,
        opacity: 0.9,
        roughness: 0.1,
        metalness: 0.25,
        side: THREE.DoubleSide,
      });
      let lakeMesh: InstanceType<typeof THREE.Mesh> | null = null;
      function buildLakes() {
        if (lakeMesh) {
          scene.remove(lakeMesh);
          lakeMesh.geometry.dispose();
          lakeMesh = null;
        }
        const total = size * size;
        // A thin water layer sits at bank level over each lake cell (like a
        // river's water in its channel) — no rim/flood-fill needed.
        const pos: number[] = [];
        const uv: number[] = [];
        const idx: number[] = [];
        let vc = 0;
        for (let i = 0; i < total; i++) {
          if (!lakeArr[i]) continue;
          const x = i % size;
          const y = (i / size) | 0;
          if (x >= size - 1 || y >= size - 1) continue;
          const wl = heightArr[i] * HEIGHT - 0.02; // just below the bank
          const wx0 = (x / N - 0.5) * W;
          const wx1 = ((x + 1) / N - 0.5) * W;
          const wz0 = (y / N - 0.5) * W;
          const wz1 = ((y + 1) / N - 0.5) * W;
          pos.push(wx0, wl, wz0, wx1, wl, wz0, wx0, wl, wz1, wx1, wl, wz1);
          uv.push(wx0 / 2, wz0 / 2, wx1 / 2, wz0 / 2, wx0 / 2, wz1 / 2, wx1 / 2, wz1 / 2);
          idx.push(vc, vc + 1, vc + 2, vc + 1, vc + 3, vc + 2);
          vc += 4;
        }
        if (vc === 0) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
        geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        lakeMesh = new THREE.Mesh(geo, lakeWaterMat);
        lakeMesh.renderOrder = 1;
        scene.add(lakeMesh);
      }

      // --- cobblestone: a real dark-brick surface on the flattened road ---
      function makeBrickTexture() {
        const s = 128;
        const c = document.createElement("canvas");
        c.width = c.height = s;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#1c1310"; // dark mortar
        ctx.fillRect(0, 0, s, s);
        const bw = 22;
        const bh = 11;
        const gap = 2;
        for (let row = 0; row * bh < s + bh; row++) {
          const yy = row * bh;
          const off = row % 2 ? bw / 2 : 0;
          for (let col = -1; col * bw < s + bw; col++) {
            const xx = col * bw + off;
            const v = (Math.random() - 0.5) * 0.1;
            const r = Math.round(Math.max(0, Math.min(1, 0.3 + v)) * 255);
            const g = Math.round(Math.max(0, Math.min(1, 0.2 + v)) * 255);
            const b = Math.round(Math.max(0, Math.min(1, 0.17 + v)) * 255);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(xx + gap, yy + gap, bw - gap * 2, bh - gap * 2);
          }
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 8;
        return tex;
      }
      const brickTex = makeBrickTexture();
      const cobbleMat = new THREE.MeshStandardMaterial({
        map: brickTex,
        roughness: 0.95,
        side: THREE.DoubleSide,
      });
      const cobbleMeshes: InstanceType<typeof THREE.Mesh>[] = [];
      function buildCobbles() {
        for (const m of cobbleMeshes) {
          scene.remove(m);
          m.geometry.dispose();
        }
        cobbleMeshes.length = 0;
        const tile = 0.6; // world units per brick-texture tile
        for (const p of worldRef.current.paths ?? []) {
          if (p.kind !== "cobble") continue;
          const ctrl: InstanceType<typeof THREE.Vector3>[] = [];
          for (let i = 0; i + 1 < p.points.length; i += 2) {
            ctrl.push(new THREE.Vector3((p.points[i] - 0.5) * W, 0, (p.points[i + 1] - 0.5) * W));
          }
          if (ctrl.length < 2) continue;
          const curve = new THREE.CatmullRomCurve3(ctrl, false, "catmullrom", 0.5);
          const segs = Math.max(16, ctrl.length * 16);
          const sample = curve.getSpacedPoints(segs);
          const half = ((p.width ?? PATH_WIDTH.cobble) / 2) * 0.95;
          const uAcross = (half * 2) / tile;
          const pos: number[] = [];
          const uv: number[] = [];
          const idx: number[] = [];
          let len = 0;
          for (let i = 0; i <= segs; i++) {
            const pt = sample[i];
            const prev = sample[Math.max(0, i - 1)];
            const next = sample[Math.min(segs, i + 1)];
            const tx = next.x - prev.x;
            const tz = next.z - prev.z;
            const tl = Math.hypot(tx, tz) || 1;
            const px = -tz / tl;
            const pz = tx / tl;
            if (i > 0) len += pt.distanceTo(sample[i - 1]);
            const v = len / tile;
            const lx = pt.x + px * half;
            const lz = pt.z + pz * half;
            const rx = pt.x - px * half;
            const rz = pt.z - pz * half;
            const ly = heightAtNorm(lx / W + 0.5, lz / W + 0.5) * HEIGHT + 0.03;
            const ry = heightAtNorm(rx / W + 0.5, rz / W + 0.5) * HEIGHT + 0.03;
            pos.push(lx, ly, lz, rx, ry, rz);
            uv.push(0, v, uAcross, v);
            if (i < segs) {
              const b = i * 2;
              idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
            }
          }
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
          geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
          geo.setIndex(idx);
          geo.computeVertexNormals();
          const mesh = new THREE.Mesh(geo, cobbleMat);
          mesh.renderOrder = 2;
          scene.add(mesh);
          cobbleMeshes.push(mesh);
        }
      }

      // --- bridges where a road crosses/meets a river ---
      const BRIDGE_WOOD = new THREE.MeshStandardMaterial({ color: 0x5e3f26, roughness: 0.9 });
      function makeBridgeTexture() {
        const s = 64;
        const c = document.createElement("canvas");
        c.width = c.height = s;
        const ctx = c.getContext("2d")!;
        ctx.fillStyle = "#6e4a2e";
        ctx.fillRect(0, 0, s, s);
        // plank seams running across the deck (vertical lines)
        ctx.strokeStyle = "rgba(40,26,14,0.55)";
        ctx.lineWidth = 2;
        for (let x = 6; x < s; x += 9) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, s);
          ctx.stroke();
        }
        // grain speckles
        for (let i = 0; i < 60; i++) {
          ctx.fillStyle = `rgba(${Math.random() > 0.5 ? "120,90,58" : "60,40,24"},${0.2 + Math.random() * 0.3})`;
          ctx.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.anisotropy = 8;
        return tex;
      }
      const bridgeTex = makeBridgeTexture();
      const BRIDGE_DECK = new THREE.MeshStandardMaterial({
        map: bridgeTex,
        roughness: 0.9,
        side: THREE.DoubleSide,
      });
      const bridgeMeshes: InstanceType<typeof THREE.Group>[] = [];
      function samplePath(points: number[]) {
        const v: { x: number; y: number }[] = [];
        for (let i = 0; i + 1 < points.length; i += 2) v.push({ x: points[i], y: points[i + 1] });
        if (v.length < 2) return v;
        const out: { x: number; y: number }[] = [];
        for (let i = 0; i < v.length - 1; i++) {
          const a = v[i];
          const b = v[i + 1];
          const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.01));
          for (let s = 0; s < steps; s++) {
            const f = s / steps;
            out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
          }
        }
        out.push(v[v.length - 1]);
        return out;
      }
      function makeBridge(
        nx: number,
        ny: number,
        ang: number,
        roadW: number,
        spanLen: number,
      ) {
        const g = new THREE.Group();
        const L = Math.max(0.8, spanLen + 0.3); // bank-to-bank crossing span
        const halfL = L / 2;
        const wHalf = Math.max(0.13, roadW / 2);
        const arch = Math.min(0.09, L * 0.05); // low profile
        const segs = 12;
        const archAt = (tx: number) => arch * (1 - (tx / halfL) ** 2);
        // arched deck
        const dPos: number[] = [];
        const dUv: number[] = [];
        const dIdx: number[] = [];
        for (let s = 0; s <= segs; s++) {
          const tx = -halfL + (s / segs) * L;
          const yy = archAt(tx);
          dPos.push(tx, yy, -wHalf, tx, yy, wHalf);
          const u = (s / segs) * (L / 0.45);
          dUv.push(u, 0, u, 1);
          if (s < segs) {
            const b = s * 2;
            dIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
          }
        }
        const deckGeo = new THREE.BufferGeometry();
        deckGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(dPos), 3));
        deckGeo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(dUv), 2));
        deckGeo.setIndex(dIdx);
        deckGeo.computeVertexNormals();
        g.add(new THREE.Mesh(deckGeo, BRIDGE_DECK));
        // arched rails on each side
        for (const zs of [-wHalf, wHalf]) {
          const rPos: number[] = [];
          const rIdx: number[] = [];
          for (let s = 0; s <= segs; s++) {
            const tx = -halfL + (s / segs) * L;
            const yy = archAt(tx);
            rPos.push(tx, yy + 0.01, zs, tx, yy + 0.11, zs);
            if (s < segs) {
              const b = s * 2;
              rIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
            }
          }
          const rg = new THREE.BufferGeometry();
          rg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(rPos), 3));
          rg.setIndex(rIdx);
          rg.computeVertexNormals();
          const rail = new THREE.Mesh(rg, BRIDGE_WOOD);
          (rail.material as InstanceType<typeof THREE.MeshStandardMaterial>).side =
            THREE.DoubleSide;
          g.add(rail);
        }
        // short support posts at the ends
        for (const tx of [-halfL * 0.85, halfL * 0.85]) {
          for (const zs of [-wHalf * 0.8, wHalf * 0.8]) {
            const post = new THREE.Mesh(
              new THREE.CylinderGeometry(0.035, 0.045, 0.4, 5),
              BRIDGE_WOOD,
            );
            post.position.set(tx, -0.18, zs);
            g.add(post);
          }
        }
        g.position.set((nx - 0.5) * W, baseHeightAtNorm(nx, ny) * HEIGHT + 0.05, (ny - 0.5) * W);
        g.rotation.y = -ang;
        return g;
      }
      function buildBridges() {
        for (const m of bridgeMeshes) {
          scene.remove(m);
          m.traverse((o) => {
            const me = o as InstanceType<typeof THREE.Mesh>;
            if (me.geometry) me.geometry.dispose();
          });
        }
        bridgeMeshes.length = 0;
        const paths = worldRef.current.paths ?? [];
        const rivers = paths
          .filter((p) => p.kind === "river")
          .map((p) => ({ pts: samplePath(p.points), w: p.width ?? PATH_WIDTH.river }));
        const roads = paths.filter((p) => p.kind === "road" || p.kind === "cobble");
        if (!rivers.length || !roads.length) return;
        const placed: { x: number; y: number }[] = [];
        for (const road of roads) {
          const roadW = road.width ?? PATH_WIDTH[road.kind];
          const rs = samplePath(road.points);
          // Find contiguous spans where the road is over a river, then place ONE
          // bridge per span — snapped to the river centre, sized to the river.
          let spanStart = -1;
          let spanRiverW = PATH_WIDTH.river;
          const finishSpan = (endIdx: number) => {
            const midIdx = (spanStart + endIdx) >> 1;
            const mp = rs[midIdx];
            // snap the bridge to the nearest river centreline point
            let cx = mp.x;
            let cy = mp.y;
            let bc = Infinity;
            for (const rv of rivers) {
              for (const rp of rv.pts) {
                const d = (rp.x - mp.x) ** 2 + (rp.y - mp.y) ** 2;
                if (d < bc) {
                  bc = d;
                  cx = rp.x;
                  cy = rp.y;
                }
              }
            }
            if (placed.some((p) => (p.x - cx) ** 2 + (p.y - cy) ** 2 < 0.04 * 0.04)) return;
            placed.push({ x: cx, y: cy });
            const prev = rs[Math.max(0, midIdx - 2)];
            const next = rs[Math.min(rs.length - 1, midIdx + 2)];
            const ang = Math.atan2(next.y - prev.y, next.x - prev.x);
            const br = makeBridge(cx, cy, ang, roadW, spanRiverW);
            scene.add(br);
            bridgeMeshes.push(br);
          };
          for (let i = 0; i < rs.length; i++) {
            const a = rs[i];
            let best = Infinity;
            let riverW = PATH_WIDTH.river;
            for (const rv of rivers) {
              for (const rp of rv.pts) {
                const d = (rp.x - a.x) ** 2 + (rp.y - a.y) ** 2;
                if (d < best) {
                  best = d;
                  riverW = rv.w;
                }
              }
            }
            const edge = (riverW / W) * 0.95; // over the river channel
            const over = best < edge * edge;
            if (over && spanStart < 0) {
              spanStart = i;
              spanRiverW = riverW;
            } else if (!over && spanStart >= 0) {
              finishSpan(i - 1);
              spanStart = -1;
            }
          }
          if (spanStart >= 0) finishSpan(rs.length - 1);
        }
      }
      // Paths are painted into the terrain by computeMods; this just reflows the
      // surface + objects when the path list changes.
      function syncPaths() {
        computeMods();
        refreshPositions();
        refreshColors();
        buildRivers();
        buildLakes();
        buildCobbles();
        buildBridges();
        buildTrees();
        buildLanterns();
        repositionPois();
        setParty(worldRef.current.party ?? null);
      }

      // In-progress path being drawn.
      let draftPoints: number[] = [];
      let draftKind: WorldPath["kind"] = "river";
      let previewMesh: InstanceType<typeof THREE.Mesh> | null = null;
      function rebuildPreview() {
        if (previewMesh) {
          disposePathMesh(previewMesh);
          previewMesh = null;
        }
        const m = buildPreviewTube(draftPoints, draftKind);
        if (m) {
          previewMesh = m;
          scene.add(m);
        }
      }
      function pushDraft(nx: number, ny: number) {
        draftPoints.push(nx, ny);
        rebuildPreview();
      }

      // --- instanced trees ---
      const TREE_TRUNK = new THREE.MeshStandardMaterial({ color: 0x5a3d28, roughness: 0.9 });
      const TREE_LEAF = new THREE.MeshStandardMaterial({
        color: 0x335f33,
        roughness: 0.85,
        flatShading: true,
      });
      let treeTrunks: InstanceType<typeof THREE.InstancedMesh> | null = null;
      let treeLeaves: InstanceType<typeof THREE.InstancedMesh> | null = null;
      function thash(i: number, k: number) {
        let h = Math.imul((i * 2654435761) ^ (k * 40503), 2246822519);
        h ^= h >>> 13;
        return ((h >>> 0) / 4294967295);
      }
      function buildTrees() {
        if (treeTrunks) {
          scene.remove(treeTrunks);
          treeTrunks.geometry.dispose();
          treeTrunks = null;
        }
        if (treeLeaves) {
          scene.remove(treeLeaves);
          treeLeaves.geometry.dispose();
          treeLeaves = null;
        }
        // Clear a small radius around every POI so trees don't swallow them.
        poiClearArr.fill(0);
        const clearRad = Math.max(2, Math.round(0.7 / (W / size)));
        for (const p of worldRef.current.pois ?? []) {
          const cx = Math.round(p.x * N);
          const cy = Math.round(p.y * N);
          for (let dy = -clearRad; dy <= clearRad; dy++) {
            for (let dx = -clearRad; dx <= clearRad; dx++) {
              if (dx * dx + dy * dy > clearRad * clearRad) continue;
              const x = cx + dx;
              const y = cy + dy;
              if (x < 0 || y < 0 || x >= size || y >= size) continue;
              poiClearArr[y * size + x] = 1;
            }
          }
        }
        const MAX = 24000;
        const cells: { i: number; k: number }[] = [];
        for (let i = 0; i < treeArr.length; i++) {
          const d = treeArr[i];
          if (d < 8 || heightArr[i] < seaLevel) continue;
          // cull trees under paths (rivers/roads/cobble/routes) and around POIs
          if (cullArr[i] || poiClearArr[i]) continue;
          // per-cell density: expected count from the painted value, with a
          // fractional remainder placed probabilistically (so it stays sparse)
          const f = (d / 255) * 2.6;
          let cnt = Math.floor(f);
          if (thash(i, 77) < f - cnt) cnt++;
          for (let k = 0; k < cnt; k++) cells.push({ i, k });
        }
        if (cells.length === 0) return;
        // Cap by a stable per-tree hash threshold (NOT a stride) so editing one
        // patch doesn't reshuffle every other tree on the map.
        const keepFrac = cells.length > MAX ? MAX / cells.length : 1;
        const kept =
          keepFrac >= 1
            ? cells
            : cells.filter((c) => thash(c.i, c.k * 7 + 3) < keepFrac);
        const n = kept.length;
        if (n === 0) return;
        const trunkGeo = new THREE.CylinderGeometry(0.05, 0.08, 0.55, 5);
        trunkGeo.translate(0, 0.27, 0);
        const leafGeo = new THREE.ConeGeometry(0.46, 1.2, 6);
        leafGeo.translate(0, 1.1, 0);
        treeTrunks = new THREE.InstancedMesh(trunkGeo, TREE_TRUNK, n);
        treeLeaves = new THREE.InstancedMesh(leafGeo, TREE_LEAF, n);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const yAxis = new THREE.Vector3(0, 1, 0);
        const pv = new THREE.Vector3();
        const sv = new THREE.Vector3();
        for (let j = 0; j < n; j++) {
          const { i, k } = kept[j];
          const x = i % size;
          const y = (i / size) | 0;
          const jx = (thash(i, k * 3 + 1) - 0.5) * 0.85;
          const jy = (thash(i, k * 3 + 2) - 0.5) * 0.85;
          const nx = (x + 0.5 + jx) / size;
          const ny = (y + 0.5 + jy) / size;
          const s = (0.7 + thash(i, k * 3 + 3) * 0.7) * 0.1;
          pv.set((nx - 0.5) * W, heightAtNorm(nx, ny) * HEIGHT, (ny - 0.5) * W);
          q.setFromAxisAngle(yAxis, thash(i, k) * Math.PI * 2);
          sv.set(s, s * (0.9 + thash(i, k + 9) * 0.45), s);
          m.compose(pv, q, sv);
          treeTrunks.setMatrixAt(j, m);
          treeLeaves.setMatrixAt(j, m);
        }
        treeTrunks.instanceMatrix.needsUpdate = true;
        treeLeaves.instanceMatrix.needsUpdate = true;
        scene.add(treeTrunks);
        scene.add(treeLeaves);
      }

      // --- party banner + measure ruler ---
      function makeTextLabel(text: string, accent: string) {
        const font = "600 28px Georgia, serif";
        const meas = document.createElement("canvas").getContext("2d")!;
        meas.font = font;
        const tw = Math.ceil(meas.measureText(text).width);
        const pad = 16;
        const dot = 22;
        const w = pad * 2 + dot + 10 + tw;
        const h = 50;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d")!;
        ctx.font = font;
        ctx.fillStyle = "rgba(244,236,216,0.97)";
        roundRect(ctx, 2, 2, w - 4, h - 4, (h - 4) / 2);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = accent;
        ctx.stroke();
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(pad + dot / 2, h / 2, dot / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2b2218";
        ctx.textBaseline = "middle";
        ctx.fillText(text, pad + dot + 10, h / 2 + 2);
        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        return { tex, aspect: w / h };
      }
      function makeTextSprite(text: string, accent: string, scale: number) {
        const { tex, aspect } = makeTextLabel(text, accent);
        const sp = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
        );
        sp.scale.set(scale * aspect, scale, 1);
        return sp;
      }
      function disposeSprite(sp: InstanceType<typeof THREE.Sprite>) {
        scene.remove(sp);
        (sp.material.map as InstanceType<typeof THREE.CanvasTexture>)?.dispose();
        sp.material.dispose();
      }

      let partySprite: InstanceType<typeof THREE.Sprite> | null = null;
      function setParty(p: { x: number; y: number } | null) {
        if (partySprite) {
          disposeSprite(partySprite);
          partySprite = null;
        }
        if (!p) return;
        partySprite = makeTextSprite("⚑ The Party", "#8a1c1c", 1.7);
        partySprite.renderOrder = 12;
        partySprite.position.set(
          (p.x - 0.5) * W,
          heightAtNorm(p.x, p.y) * HEIGHT + 1.5,
          (p.y - 0.5) * W,
        );
        scene.add(partySprite);
      }

      let measureA: { x: number; y: number } | null = null;
      let measureLine: InstanceType<typeof THREE.Mesh> | null = null;
      let measureLabel: InstanceType<typeof THREE.Sprite> | null = null;
      function clearMeasureObjs() {
        if (measureLine) {
          disposePathMesh(measureLine);
          measureLine = null;
        }
        if (measureLabel) {
          disposeSprite(measureLabel);
          measureLabel = null;
        }
      }
      function clearMeasure() {
        measureA = null;
        clearMeasureObjs();
      }
      function addMeasurePoint(nx: number, ny: number) {
        if (!measureA) {
          measureA = { x: nx, y: ny };
          clearMeasureObjs();
          return;
        }
        const b = { x: nx, y: ny };
        clearMeasureObjs();
        measureLine = buildPreviewTube([measureA.x, measureA.y, b.x, b.y], "route");
        if (measureLine) scene.add(measureLine);
        const dnx = b.x - measureA.x;
        const dny = b.y - measureA.y;
        const miles = Math.sqrt(dnx * dnx + dny * dny) * (worldRef.current.milesAcross ?? 600);
        const days = miles / Math.max(1, speedRef.current);
        measureLabel = makeTextSprite(
          `${Math.round(miles)} mi · ${days.toFixed(1)} d`,
          "#b8860b",
          1.5,
        );
        measureLabel.renderOrder = 13;
        const mx = (measureA.x + b.x) / 2;
        const my = (measureA.y + b.y) / 2;
        measureLabel.position.set(
          (mx - 0.5) * W,
          heightAtNorm(mx, my) * HEIGHT + 1.3,
          (my - 0.5) * W,
        );
        scene.add(measureLabel);
        measureA = null;
      }

      const LAKE_DEPTH = 0.06; // shallow lake basin (display only)
      function recomputeDispCell(i: number) {
        let d = heightArr[i] + carveArr[i];
        if (lakeArr[i]) d -= LAKE_DEPTH; // carve a shallow lake bed
        const w = roadW[i];
        if (w > 0) d = d * (1 - w) + roadTarget[i] * w;
        dispArr[i] = d < 0 ? 0 : d > 1 ? 1 : d;
      }
      function recomputeDispAll() {
        for (let i = 0; i < dispArr.length; i++) recomputeDispCell(i);
      }
      // Carve rivers / flatten roads into the surface from the path list.
      function computeMods() {
        carveArr.fill(0);
        roadTarget.fill(0);
        roadW.fill(0);
        pathR.fill(0);
        pathG.fill(0);
        pathB.fill(0);
        pathWt.fill(0);
        cullArr.fill(0);
        cobbleArr.fill(0);
        const cell = W / size;
        for (const p of worldRef.current.paths ?? []) {
          const isRiver = p.kind === "river";
          const isCobble = p.kind === "cobble";
          const isRoad = p.kind === "road" || p.kind === "cobble";
          const culls = isRiver || isRoad || p.kind === "route";
          const dashed = p.kind === "border" || p.kind === "route";
          const paint = PATH_PAINT[p.kind] ?? PATH_PAINT.route;
          const rgb = p.color ? hex01(p.color) : paint.rgb;
          const rad = Math.max(
            1,
            Math.round((p.width ?? PATH_WIDTH[p.kind] ?? 0.5) / 2 / cell),
          );
          const depth = 0.05;
          const pts = p.points;
          let dashCounter = 0;
          for (let s = 0; s + 3 < pts.length; s += 2) {
            const ax = pts[s];
            const ay = pts[s + 1];
            const bx = pts[s + 2];
            const by = pts[s + 3];
            const steps = Math.max(1, Math.ceil(Math.hypot((bx - ax) * size, (by - ay) * size) / 0.6));
            for (let t = 0; t <= steps; t++) {
              const f = t / steps;
              const sc = Math.round((ax + (bx - ax) * f) * N);
              const sr = Math.round((ay + (by - ay) * f) * N);
              const baseH = heightArr[Math.max(0, Math.min(size * size - 1, sr * size + sc))];
              const dashOn = !dashed || Math.floor(dashCounter / 3) % 2 === 0;
              dashCounter++;
              for (let dy = -rad; dy <= rad; dy++) {
                for (let dx = -rad; dx <= rad; dx++) {
                  const x = sc + dx;
                  const y = sr + dy;
                  if (x < 0 || y < 0 || x >= size || y >= size) continue;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  if (dist > rad) continue;
                  const fall = 1 - dist / rad;
                  const i = y * size + x;
                  if (isRiver) {
                    const c = -depth * fall;
                    if (c < carveArr[i]) carveArr[i] = c;
                  } else if (isRoad) {
                    const w = fall * 0.92;
                    if (w > roadW[i]) {
                      roadW[i] = w;
                      roadTarget[i] = baseH;
                    }
                  }
                  if (culls) cullArr[i] = 1;
                  if (dashOn) {
                    const w = paint.w * (0.4 + fall * 0.6);
                    if (w > pathWt[i]) {
                      pathWt[i] = w;
                      pathR[i] = rgb[0];
                      pathG[i] = rgb[1];
                      pathB[i] = rgb[2];
                      cobbleArr[i] = isCobble ? 1 : 0;
                    }
                  }
                }
              }
            }
          }
        }
        recomputeDispAll();
      }
      function refreshPositions() {
        for (let i = 0; i < dispArr.length; i++) {
          pos.setZ(i, dispArr[i] * HEIGHT);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
      }

      // --- height/slope-blended procedural terrain shading ---
      const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
      const sstep = (e0: number, e1: number, x: number) => {
        const t = clamp01((x - e0) / (e1 - e0));
        return t * t * (3 - 2 * t);
      };
      const vnoise = (i: number) => {
        let h = Math.imul(i ^ 0x9e3779b9, 2246822519);
        h ^= h >>> 15;
        h = Math.imul(h, 3266489917);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
      };
      function slopeAt(i: number) {
        const x = i % size;
        const y = (i / size) | 0;
        const hl = x > 0 ? dispArr[i - 1] : dispArr[i];
        const hr = x < size - 1 ? dispArr[i + 1] : dispArr[i];
        const hu = y > 0 ? dispArr[i - size] : dispArr[i];
        const hd = y < size - 1 ? dispArr[i + size] : dispArr[i];
        const dx = hr - hl;
        const dy = hd - hu;
        return clamp01(Math.sqrt(dx * dx + dy * dy) * ((HEIGHT * size) / W) * 0.45);
      }
      // Elevation material stops (0..1 rgb).
      const SAND = [0.82, 0.74, 0.54];
      const GRASS = [0.41, 0.53, 0.27];
      const FOREST = [0.22, 0.35, 0.18];
      const ROCK = [0.45, 0.43, 0.39];
      const SNOW = [0.95, 0.96, 0.98];
      const BED = [0.3, 0.32, 0.3];
      function setColorAt(i: number) {
        const h = dispArr[i];
        const landH = clamp01((h - seaLevel) / Math.max(0.001, 1 - seaLevel));
        const slope = slopeAt(i);
        let r = SAND[0];
        let g = SAND[1];
        let b = SAND[2];
        let t = sstep(0.015, 0.16, landH); // beach → grass
        r += (GRASS[0] - r) * t;
        g += (GRASS[1] - g) * t;
        b += (GRASS[2] - b) * t;
        t = sstep(0.16, 0.44, landH); // grass → forest
        r += (FOREST[0] - r) * t;
        g += (FOREST[1] - g) * t;
        b += (FOREST[2] - b) * t;
        t = sstep(0.56, 0.82, landH); // forest → rock
        r += (ROCK[0] - r) * t;
        g += (ROCK[1] - g) * t;
        b += (ROCK[2] - b) * t;
        t = sstep(0.3, 0.65, slope); // steep → rock
        r += (ROCK[0] - r) * t;
        g += (ROCK[1] - g) * t;
        b += (ROCK[2] - b) * t;
        const snow = sstep(0.72, 0.93, landH) * (1 - sstep(0.4, 0.78, slope));
        r += (SNOW[0] - r) * snow;
        g += (SNOW[1] - g) * snow;
        b += (SNOW[2] - b) * snow;
        // tint by painted biome so regional identity (desert/swamp/…) shows
        const bw = 0.42;
        const br = BIOME_RGB[biomeArr[i]] ?? [110, 140, 80];
        r = r * (1 - bw) + (br[0] / 255) * bw;
        g = g * (1 - bw) + (br[1] / 255) * bw;
        b = b * (1 - bw) + (br[2] / 255) * bw;
        // procedural texture variance
        const n = (vnoise(i) - 0.5) * 0.1;
        r *= 1 + n;
        g *= 1 + n;
        b *= 1 + n;
        // underwater: darken to a riverbed tone (the water plane supplies the blue)
        if (h < seaLevel) {
          const d = sstep(0, seaLevel, seaLevel - h);
          const f = 0.5 * d;
          r = r * (1 - f) + BED[0] * f;
          g = g * (1 - f) + BED[1] * f;
          b = b * (1 - f) + BED[2] * f;
          const dk = 1 - 0.3 * d;
          r *= dk;
          g *= dk;
          b *= dk;
        }
        // lakebed: darken painted lake cells (the still water sits above)
        if (lakeArr[i]) {
          r = r * 0.55 + BED[0] * 0.4;
          g = g * 0.55 + BED[1] * 0.4;
          b = b * 0.55 + BED[2] * 0.4;
        }
        // territory tint (political overlay) + auto borders
        const reg = regionArr[i];
        if (reg > 0) {
          const rc = regionColorsRef.current[reg];
          if (rc) {
            const strong = showRegionsRef.current;
            const f = h < seaLevel ? 0.16 : strong ? 0.62 : 0.32;
            r = r * (1 - f) + rc[0] * f;
            g = g * (1 - f) + rc[1] * f;
            b = b * (1 - f) + rc[2] * f;
          }
        }
        // auto-drawn region borders (cells bordering a different region)
        {
          const x = i % size;
          const y = (i / size) | 0;
          const me = regionArr[i];
          const edge =
            (x > 0 && regionArr[i - 1] !== me) ||
            (x < size - 1 && regionArr[i + 1] !== me) ||
            (y > 0 && regionArr[i - size] !== me) ||
            (y < size - 1 && regionArr[i + size] !== me);
          if (edge && (me > 0 || showRegionsRef.current)) {
            // darken toward an ink outline; bolder when regions are highlighted
            const onlyNone = me === 0; // boundary seen from the unowned side
            const bf = (showRegionsRef.current ? 0.6 : 0.32) * (onlyNone ? 0.6 : 1);
            r = r * (1 - bf) + 0.12 * bf;
            g = g * (1 - bf) + 0.1 * bf;
            b = b * (1 - bf) + 0.09 * bf;
          }
        }
        // paths painted into the surface (rivers/roads/routes/borders)
        const pw = pathWt[i];
        if (pw > 0) {
          let pr2 = pathR[i];
          let pg2 = pathG[i];
          let pb2 = pathB[i];
          // dark brick: per-brick light/dark variation around a dark base
          if (cobbleArr[i]) {
            const cob = (vnoise(i * 3 + 7) - 0.5) * 0.16;
            pr2 = clamp01(pr2 + cob * 1.1);
            pg2 = clamp01(pg2 + cob);
            pb2 = clamp01(pb2 + cob * 0.9);
          }
          r = r * (1 - pw) + pr2 * pw;
          g = g * (1 - pw) + pg2 * pw;
          b = b * (1 - pw) + pb2 * pw;
        }
        // fog of exploration: shroud unrevealed cells
        if (fogOn && exploredArr[i] === 0) {
          const asPlayer = !canEdit || previewPlayerRef.current;
          const f = asPlayer ? 0.94 : 0.5; // players: near-black; DM: a haze
          r = r * (1 - f) + 0.05 * f;
          g = g * (1 - f) + 0.055 * f;
          b = b * (1 - f) + 0.07 * f;
        }
        colorAttr.setXYZ(i, clamp01(r), clamp01(g), clamp01(b));
      }
      function refreshColors() {
        for (let i = 0; i < heightArr.length; i++) setColorAt(i);
        colorAttr.needsUpdate = true;
      }
      function setWater() {
        water.position.y = seaLevel * HEIGHT + 0.02;
      }

      computeMods();
      refreshPositions();
      refreshColors();
      setWater();

      // Day/night.
      // --- glowing settlement lights + weather ---
      const WEATHER_DIM: Record<WorldWeather, number> = {
        clear: 1,
        rain: 0.72,
        snow: 0.85,
        fog: 0.7,
        storm: 0.5,
      };
      let weatherKind: WorldWeather = world.weather ?? "clear";
      let nightFactor = 0;
      let curTime = world.timeOfDay ?? 0.5;
      let baseAmbient = 0.5;
      let lanternBase = 0.5;
      let flash = 0;
      let boltTimer = 3;
      let weatherPoints: InstanceType<typeof THREE.Points> | null = null;

      const SETTLEMENT = new Set([
        "city",
        "town",
        "village",
        "castle",
        "port",
        "temple",
      ]);
      const lightMap = new Map<string, InstanceType<typeof THREE.PointLight>>();
      function lightLevel() {
        // very soft glow
        return nightFactor * 1.8 + (1 - WEATHER_DIM[weatherKind]) * 0.5;
      }
      function syncLights(list: WorldPoi[]) {
        const settlements = list.filter((p) => SETTLEMENT.has(p.kind)).slice(0, 12);
        const keep = new Set(settlements.map((p) => p.id));
        for (const [id, l] of lightMap) {
          if (!keep.has(id)) {
            scene.remove(l);
            lightMap.delete(id);
          }
        }
        for (const p of settlements) {
          let l = lightMap.get(p.id);
          if (!l) {
            l = new THREE.PointLight(0xffb060, 0, 13, 2);
            scene.add(l);
            lightMap.set(p.id, l);
          }
          l.position.set(
            (p.x - 0.5) * W,
            heightAtNorm(p.x, p.y) * HEIGHT + 0.6,
            (p.y - 0.5) * W,
          );
          l.intensity = lightLevel();
        }
      }

      // --- lanterns (towns + along roads) ---
      const lanternPostMat = new THREE.MeshStandardMaterial({ color: 0x6b5234, roughness: 0.75 });
      const lanternHeadMat = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.6, metalness: 0.4 });
      const lanternGlowMat = new THREE.MeshStandardMaterial({
        color: 0xffdf9e,
        emissive: 0xff9b30,
        emissiveIntensity: 0.5,
        roughness: 0.35,
      });
      let lanternPosts: InstanceType<typeof THREE.InstancedMesh> | null = null;
      let lanternHeads: InstanceType<typeof THREE.InstancedMesh> | null = null;
      let lanternGlows: InstanceType<typeof THREE.InstancedMesh> | null = null;
      const roadLights: InstanceType<typeof THREE.PointLight>[] = []; // a few real lights along roads
      function lanternPositions() {
        const out: { x: number; y: number; road: boolean }[] = [];
        const pois = canEdit
          ? worldRef.current.pois ?? []
          : (worldRef.current.pois ?? []).filter((p) => !p.hidden);
        for (const p of pois) {
          if (!SETTLEMENT.has(p.kind)) continue;
          const n = p.kind === "city" ? 5 : p.kind === "town" ? 4 : 3;
          const rad = 0.007;
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2;
            out.push({ x: p.x + Math.cos(a) * rad, y: p.y + Math.sin(a) * rad, road: false });
          }
        }
        let side = 0;
        for (const path of worldRef.current.paths ?? []) {
          if (path.kind !== "road" && path.kind !== "cobble") continue;
          const pts = path.points;
          const spacing = 0.028;
          const off = 0.008; // lanterns line the road edges
          for (let s = 0; s + 3 < pts.length; s += 2) {
            const ax = pts[s];
            const ay = pts[s + 1];
            const bx = pts[s + 2];
            const by = pts[s + 3];
            const segLen = Math.hypot(bx - ax, by - ay) || 1;
            const px = -(by - ay) / segLen; // perpendicular
            const py = (bx - ax) / segLen;
            for (let t = 0; t < segLen; t += spacing) {
              const f = t / segLen;
              const sgn = side++ % 2 === 0 ? 1 : -1;
              out.push({
                x: ax + (bx - ax) * f + px * off * sgn,
                y: ay + (by - ay) * f + py * off * sgn,
                road: true,
              });
            }
          }
        }
        return out.slice(0, 500);
      }
      function disposeLanterns() {
        for (const im of [lanternPosts, lanternHeads, lanternGlows]) {
          if (im) {
            scene.remove(im);
            im.geometry.dispose();
          }
        }
        lanternPosts = lanternHeads = lanternGlows = null;
        for (const l of roadLights) scene.remove(l);
        roadLights.length = 0;
      }
      function buildLanterns() {
        disposeLanterns();
        const ps = lanternPositions();
        const n = ps.length;
        if (n === 0) return;
        const postGeo = new THREE.CylinderGeometry(0.05, 0.07, 1.0, 6);
        postGeo.translate(0, 0.5, 0);
        const headGeo = new THREE.BoxGeometry(0.22, 0.26, 0.22);
        headGeo.translate(0, 1.07, 0);
        const glowGeo = new THREE.SphereGeometry(0.13, 8, 8);
        glowGeo.translate(0, 1.07, 0);
        lanternPosts = new THREE.InstancedMesh(postGeo, lanternPostMat, n);
        lanternHeads = new THREE.InstancedMesh(headGeo, lanternHeadMat, n);
        lanternGlows = new THREE.InstancedMesh(glowGeo, lanternGlowMat, n);
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion();
        const sv = new THREE.Vector3(0.18, 0.18, 0.18);
        const pv = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
          const { x, y } = ps[i];
          pv.set((x - 0.5) * W, heightAtNorm(x, y) * HEIGHT, (y - 0.5) * W);
          m.compose(pv, q, sv);
          lanternPosts.setMatrixAt(i, m);
          lanternHeads.setMatrixAt(i, m);
          lanternGlows.setMatrixAt(i, m);
        }
        lanternPosts.instanceMatrix.needsUpdate = true;
        lanternHeads.instanceMatrix.needsUpdate = true;
        lanternGlows.instanceMatrix.needsUpdate = true;
        lanternGlows.renderOrder = 3;
        scene.add(lanternPosts);
        scene.add(lanternHeads);
        scene.add(lanternGlows);
        // A capped pool of real point-lights along roads so they cast light too.
        const roadPs = ps.filter((p) => p.road);
        const CAP = 10;
        const stride = roadPs.length > CAP ? roadPs.length / CAP : 1;
        for (let j = 0; j < Math.min(CAP, roadPs.length); j++) {
          const { x, y } = roadPs[Math.floor(j * stride)];
          const l = new THREE.PointLight(0xffb060, lightLevel() * 0.45, 7, 2);
          l.position.set((x - 0.5) * W, heightAtNorm(x, y) * HEIGHT + 0.35, (y - 0.5) * W);
          scene.add(l);
          roadLights.push(l);
        }
      }

      // --- region name labels: text laid flat across the land (HOI style) ---
      function makeRegionText(name: string) {
        const text = (name || "Region").toUpperCase();
        const fs = 64;
        const ls = fs * 0.32; // letter spacing
        const meas = document.createElement("canvas").getContext("2d")!;
        meas.font = `600 ${fs}px Georgia, serif`;
        const widths = [...text].map((ch) => meas.measureText(ch).width);
        let total = 0;
        for (const w of widths) total += w + ls;
        total -= ls;
        const padX = fs;
        const padY = fs * 0.6;
        const cw = Math.ceil(total + padX * 2);
        const chh = Math.ceil(fs + padY * 2);
        const c = document.createElement("canvas");
        c.width = cw;
        c.height = chh;
        const ctx = c.getContext("2d")!;
        ctx.font = `600 ${fs}px Georgia, serif`;
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        let x = padX;
        const y = chh / 2;
        for (let i = 0; i < text.length; i++) {
          ctx.lineWidth = fs * 0.16;
          ctx.strokeStyle = "rgba(245,238,222,0.9)";
          ctx.strokeText(text[i], x, y);
          ctx.fillStyle = "rgba(38,30,22,0.92)";
          ctx.fillText(text[i], x, y);
          x += widths[i] + ls;
        }
        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = 8;
        tex.needsUpdate = true;
        return { tex, aspect: cw / chh };
      }
      const regionLabelMap = new Map<
        number,
        { mesh: InstanceType<typeof THREE.Mesh>; aspect: number }
      >();
      function disposeRegionLabel(rec: { mesh: InstanceType<typeof THREE.Mesh> }) {
        scene.remove(rec.mesh);
        rec.mesh.geometry.dispose();
        const m = rec.mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>;
        m.map?.dispose();
        m.dispose();
      }
      const qFlat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        -Math.PI / 2,
      );
      function syncRegionLabels() {
        if (!(worldRef.current.regions ?? []).length) {
          for (const rec of regionLabelMap.values()) disposeRegionLabel(rec);
          regionLabelMap.clear();
          return;
        }
        // centroid + covariance per region (for orientation + span)
        const sxv = new Map<number, number>();
        const syv = new Map<number, number>();
        const sxx = new Map<number, number>();
        const syy = new Map<number, number>();
        const sxy = new Map<number, number>();
        const cn = new Map<number, number>();
        for (let i = 0; i < regionArr.length; i++) {
          const num = regionArr[i];
          if (num === 0) continue;
          const x = (i % size) / N;
          const y = ((i / size) | 0) / N;
          sxv.set(num, (sxv.get(num) ?? 0) + x);
          syv.set(num, (syv.get(num) ?? 0) + y);
          sxx.set(num, (sxx.get(num) ?? 0) + x * x);
          syy.set(num, (syy.get(num) ?? 0) + y * y);
          sxy.set(num, (sxy.get(num) ?? 0) + x * y);
          cn.set(num, (cn.get(num) ?? 0) + 1);
        }
        const present = new Set<number>();
        for (const rg of worldRef.current.regions ?? []) {
          const num = rg.num ?? 0;
          const c = cn.get(num);
          if (!num || !c) continue;
          present.add(num);
          const cx = sxv.get(num)! / c;
          const cy = syv.get(num)! / c;
          const vxx = sxx.get(num)! / c - cx * cx;
          const vyy = syy.get(num)! / c - cy * cy;
          const vxy = sxy.get(num)! / c - cx * cy;
          const theta = 0.5 * Math.atan2(2 * vxy, vxx - vyy);
          const tr = vxx + vyy;
          const dd = Math.sqrt(Math.max(0, ((vxx - vyy) / 2) ** 2 + vxy * vxy));
          const l1 = tr / 2 + dd; // major eigenvalue
          const name = rg.name || "Region";
          let rec = regionLabelMap.get(num);
          if (!rec || rec.mesh.userData.sig !== name) {
            if (rec) disposeRegionLabel(rec);
            const { tex, aspect } = makeRegionText(name);
            const mat = new THREE.MeshBasicMaterial({
              map: tex,
              transparent: true,
              depthTest: false,
              depthWrite: false,
              side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
            mesh.renderOrder = 14;
            mesh.userData.sig = name;
            mesh.userData.aspect = aspect;
            scene.add(mesh);
            rec = { mesh, aspect };
            regionLabelMap.set(num, rec);
          }
          // span the name along the region's major axis
          const spanWorld = Math.min(W * 0.9, Math.max(2.5, Math.sqrt(l1) * 4 * W * 0.85));
          const wWorld = spanWorld;
          const hWorld = wWorld / rec.aspect;
          rec.mesh.scale.set(wWorld, hWorld, 1);
          rec.mesh.quaternion.copy(
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -theta),
          ).multiply(qFlat);
          rec.mesh.position.set(
            (cx - 0.5) * W,
            heightAtNorm(cx, cy) * HEIGHT + 0.5,
            (cy - 0.5) * W,
          );
          rec.mesh.visible = showRegionsRef.current;
        }
        for (const [num, rec] of regionLabelMap) {
          if (!present.has(num)) {
            disposeRegionLabel(rec);
            regionLabelMap.delete(num);
          }
        }
      }

      function makeWeather(kind: WorldWeather) {
        const count = kind === "snow" ? 1400 : kind === "rain" || kind === "storm" ? 2200 : 0;
        if (count === 0) return null;
        const g = new THREE.BufferGeometry();
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          arr[i * 3] = (Math.random() - 0.5) * W * 1.5;
          arr[i * 3 + 1] = Math.random() * 24;
          arr[i * 3 + 2] = (Math.random() - 0.5) * W * 1.5;
        }
        g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
        const m = new THREE.PointsMaterial({
          color: kind === "snow" ? 0xffffff : 0xaecbe6,
          size: kind === "snow" ? 0.22 : 0.14,
          transparent: true,
          opacity: kind === "snow" ? 0.9 : 0.55,
          depthWrite: false,
        });
        return new THREE.Points(g, m);
      }
      function applyWeather(kind: WorldWeather) {
        weatherKind = kind;
        if (weatherPoints) {
          scene.remove(weatherPoints);
          weatherPoints.geometry.dispose();
          (weatherPoints.material as InstanceType<typeof THREE.PointsMaterial>).dispose();
          weatherPoints = null;
        }
        weatherPoints = makeWeather(kind);
        if (weatherPoints) {
          weatherPoints.renderOrder = 5;
          scene.add(weatherPoints);
        }
        scene.fog =
          kind === "fog"
            ? new THREE.Fog(0xbcc4cc, 24, 120)
            : kind === "storm"
              ? new THREE.Fog(0x9aa2ab, 44, 160)
              : null;
        applyTime(curTime);
      }

      function applyTime(t: number) {
        curTime = t;
        const ang = (t - 0.25) * Math.PI * 2;
        const elev = Math.sin(ang);
        sun.position.set(Math.cos(ang) * 30, elev * 40, 18);
        const day = Math.max(0, elev);
        nightFactor = 1 - day;
        const dim = WEATHER_DIM[weatherKind];
        sun.intensity = (0.25 + day * 1.5) * dim;
        sun.color.setRGB(1, 0.85 + day * 0.15, 0.6 + day * 0.4);
        baseAmbient = (0.28 + day * 0.45) * dim;
        ambient.intensity = baseAmbient + flash;
        // sky: night → day, then desaturate toward grey under cloud/fog/storm
        const nightC = [0.05, 0.07, 0.13];
        const dayC = [0.53, 0.7, 0.92];
        const grey = [0.6, 0.63, 0.66];
        const g = (1 - dim) * 0.7;
        const r0 = nightC[0] + (dayC[0] - nightC[0]) * day;
        const g0 = nightC[1] + (dayC[1] - nightC[1]) * day;
        const b0 = nightC[2] + (dayC[2] - nightC[2]) * day;
        scene.background = new THREE.Color(
          r0 + (grey[0] - r0) * g,
          g0 + (grey[1] - g0) * g,
          b0 + (grey[2] - b0) * g,
        );
        if (scene.fog) (scene.fog as InstanceType<typeof THREE.Fog>).color.copy(scene.background as InstanceType<typeof THREE.Color>);
        ambient.color.setRGB(0.6 + day * 0.4, 0.65 + day * 0.35, 0.8);
        const lv = lightLevel();
        for (const l of lightMap.values()) l.intensity = lv;
        for (const l of roadLights) l.intensity = lv * 0.45; // softer than towns
        lanternBase = 0.1 + nightFactor * 1.0 + (1 - dim) * 0.3;
        lanternGlowMat.emissiveIntensity = lanternBase;
      }
      applyWeather(weatherKind);
      syncPois(
        canEdit
          ? resolvedPoisRef.current
          : resolvedPoisRef.current.filter((p) => !p.hidden),
      );
      // Paints/carves paths into terrain, then reseats trees/POIs/party.
      syncPaths();
      syncRegionLabels();

      // --- brushing ---
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const lastNdc = new THREE.Vector2();
      let painting = false;
      let edited = false;

      function cellFromEvent(
        e: PointerEvent,
      ): { i: number; nx: number; ny: number } | null {
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObject(terrain, false)[0];
        if (!hit || !hit.uv) return null;
        const nx = hit.uv.x;
        const ny = 1 - hit.uv.y;
        const col = Math.round(nx * N);
        const row = Math.round(ny * N);
        return { i: Math.max(0, Math.min(size * size - 1, row * size + col)), nx, ny };
      }
      function applyBrush(center: number) {
        const t = toolRef.current;
        const radius = sizeRef.current;
        const strength = strengthRef.current;
        const cx = center % size;
        const cy = Math.floor(center / size);
        let touchedHeight = false;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const x = cx + dx;
            const y = cy + dy;
            if (x < 0 || y < 0 || x >= size || y >= size) continue;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > radius) continue;
            const fall = 1 - dist / radius;
            const i = y * size + x;
            if (t === "paint") {
              biomeArr[i] = biomeRef.current;
            } else if (t === "raise") {
              heightArr[i] = Math.min(1, heightArr[i] + strength * fall * 0.04);
              touchedHeight = true;
            } else if (t === "lower") {
              heightArr[i] = Math.max(0, heightArr[i] - strength * fall * 0.04);
              touchedHeight = true;
            } else if (t === "smooth") {
              const l = x > 0 ? heightArr[i - 1] : heightArr[i];
              const r = x < size - 1 ? heightArr[i + 1] : heightArr[i];
              const u = y > 0 ? heightArr[i - size] : heightArr[i];
              const d = y < size - 1 ? heightArr[i + size] : heightArr[i];
              const avg = (l + r + u + d) / 4;
              heightArr[i] += (avg - heightArr[i]) * strength * fall;
              touchedHeight = true;
            } else if (t === "lake") {
              // mark a lake — a shallow basin is carved in the display layer,
              // and a thin water layer is laid at bank level (like rivers)
              lakeArr[i] = 1;
              touchedHeight = true; // dispArr changes via the lake carve
            } else if (t === "reveal") {
              exploredArr[i] = 1;
            } else if (t === "shroud") {
              exploredArr[i] = 0;
            } else if (t === "region") {
              regionArr[i] = regionModeRef.current === "erase" ? 0 : activeRegionRef.current;
            } else if (t === "trees") {
              treeArr[i] =
                treeModeRef.current === "clear"
                  ? 0
                  : Math.round(treeDensityRef.current * 255);
            }
          }
        }
        // Update only the touched region (+1 cell border for slope/normals).
        const x0 = Math.max(0, cx - radius - 1);
        const x1 = Math.min(size - 1, cx + radius + 1);
        const y0 = Math.max(0, cy - radius - 1);
        const y1 = Math.min(size - 1, cy + radius + 1);
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const i = y * size + x;
            if (touchedHeight) {
              recomputeDispCell(i);
              pos.setZ(i, dispArr[i] * HEIGHT);
            }
            setColorAt(i);
          }
        }
        if (touchedHeight) {
          pos.needsUpdate = true;
          if (size <= 160) geo.computeVertexNormals(); // big maps defer to release
        }
        colorAttr.needsUpdate = true;
        edited = true;
        gridDirty = true; // a grid changed → re-encode on next export
      }

      const dom = renderer.domElement;
      let downX = 0;
      let downY = 0;
      function findPoiId(o: InstanceType<typeof THREE.Object3D> | null): string | null {
        let cur = o;
        while (cur) {
          if (cur.userData?.id) return cur.userData.id as string;
          cur = cur.parent;
        }
        return null;
      }
      function pickPoi(e: PointerEvent): string | null {
        const rect = dom.getBoundingClientRect();
        ndc.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(poiPick, true)[0];
        return hit ? findPoiId(hit.object) : null;
      }
      function onDown(e: PointerEvent) {
        downX = e.clientX;
        downY = e.clientY;
        // Right / middle button → let OrbitControls navigate even with a tool on.
        if (e.button !== 0) return;
        if (drawKindRef.current) {
          const c = cellFromEvent(e);
          if (c) pushDraft(c.nx, c.ny);
          return;
        }
        if (onPartyRef.current) {
          const c = cellFromEvent(e);
          if (c) onPartyRef.current({ x: c.nx, y: c.ny });
          return;
        }
        if (measureRef.current) {
          const c = cellFromEvent(e);
          if (c) addMeasurePoint(c.nx, c.ny);
          return;
        }
        if (onPlaceRef.current) {
          const c = cellFromEvent(e);
          if (c) onPlaceRef.current(c.nx, c.ny);
          return;
        }
        if (toolRef.current === "look") return;
        const c = cellFromEvent(e);
        if (c === null) return;
        painting = true;
        dom.setPointerCapture(e.pointerId);
        applyBrush(c.i);
      }
      function onMove(e: PointerEvent) {
        const rect = dom.getBoundingClientRect();
        ndc.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        lastNdc.copy(ndc);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObject(terrain, false)[0];
        // brush footprint ring
        const showRing =
          BRUSH_TOOLS.has(toolRef.current) &&
          !onPlaceRef.current &&
          !drawKindRef.current &&
          !onPartyRef.current &&
          !measureRef.current;
        if (hit && showRing) {
          brushRing.visible = true;
          brushRing.position.copy(hit.point);
          brushRing.position.y += 0.06;
          const rWorld = sizeRef.current * (W / size);
          brushRing.scale.set(rWorld, rWorld, 1);
        } else {
          brushRing.visible = false;
        }
        if (!painting || !hit || !hit.uv) return;
        const col = Math.round(hit.uv.x * N);
        const row = Math.round((1 - hit.uv.y) * N);
        applyBrush(Math.max(0, Math.min(size * size - 1, row * size + col)));
      }
      function onUp(e: PointerEvent) {
        if (painting && edited) {
          if (toolRef.current === "trees") {
            buildTrees();
          } else {
            geo.computeVertexNormals(); // accurate lighting after the stroke
            refreshColors();
            const tt = toolRef.current;
            if (tt === "raise" || tt === "lower" || tt === "smooth" || tt === "lake") {
              repositionPois();
              buildTrees(); // drop trees that fell below the new water
            }
            if (tt === "lake") buildLakes();
            if (tt === "region") syncRegionLabels();
          }
          scheduleSave();
        } else if (
          e.button === 0 &&
          !painting &&
          !onPlaceRef.current &&
          Math.abs(e.clientX - downX) < 5 &&
          Math.abs(e.clientY - downY) < 5
        ) {
          // A left click (not a drag): select a marker under the cursor.
          const id = pickPoi(e);
          if (id) onSelectRef.current?.(id);
        }
        painting = false;
        edited = false;
      }
      dom.addEventListener("pointerdown", onDown);
      dom.addEventListener("pointermove", onMove);
      dom.addEventListener("pointerup", onUp);
      dom.addEventListener("pointercancel", onUp);

      // --- trade-route caravans -------------------------------------------
      const routeGroup = new THREE.Group();
      scene.add(routeGroup);
      const routeLineMat = new THREE.LineDashedMaterial({
        color: 0x6b4a2b,
        dashSize: 0.34,
        gapSize: 0.22,
        transparent: true,
        opacity: 0.75,
      });
      const wagonWood = new THREE.MeshStandardMaterial({ color: 0x6b4327, roughness: 0.85 });
      const wagonCanvas = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.95 });
      const wagonWheel = new THREE.MeshStandardMaterial({ color: 0x2c1e14, roughness: 0.7 });
      const bedGeo = new THREE.BoxGeometry(0.32, 0.12, 0.5);
      const canopyGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.46, 12);
      const wheelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.04, 10);
      function makeWagon() {
        const g = new THREE.Group();
        const bed = new THREE.Mesh(bedGeo, wagonWood);
        bed.position.y = 0.17;
        g.add(bed);
        const canopy = new THREE.Mesh(canopyGeo, wagonCanvas);
        canopy.rotation.x = Math.PI / 2; // tube runs along the wagon (Z)
        canopy.position.y = 0.3;
        canopy.scale.y = 0.92;
        g.add(canopy);
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const w = new THREE.Mesh(wheelGeo, wagonWheel);
            w.rotation.z = Math.PI / 2; // axle along X so it rolls forward
            w.position.set(sx * 0.17, 0.1, sz * 0.18);
            g.add(w);
          }
        }
        g.scale.setScalar(1.5);
        return g;
      }

      interface Wagon {
        mesh: InstanceType<typeof THREE.Group>;
        pts: InstanceType<typeof THREE.Vector3>[];
        cum: number[];
        len: number;
        phase: number;
        speed: number;
        bob: number;
      }
      let routeWagons: Wagon[] = [];
      let routeSig = "";
      const SEG = 28;

      function clearRoutes() {
        for (const c of routeGroup.children.slice()) {
          routeGroup.remove(c);
          c.traverse((o) => {
            const m = o as InstanceType<typeof THREE.Mesh>;
            if (m.geometry && m.geometry !== bedGeo && m.geometry !== canopyGeo && m.geometry !== wheelGeo) {
              m.geometry.dispose();
            }
          });
        }
        routeWagons = [];
      }

      function poiById(id: string | undefined) {
        if (!id) return undefined;
        return (worldRef.current.pois ?? []).find((p) => p.id === id);
      }

      function buildRoutes() {
        clearRoutes();
        const e = economyRef.current;
        if (!e?.enabled) return;
        const marketPoi = new Map((e.markets ?? []).map((m) => [m.id, m.poiId]));
        for (const r of e.routes ?? []) {
          if (r.active === false) continue;
          const fromP = poiById(marketPoi.get(r.fromMarketId));
          const toP = poiById(marketPoi.get(r.toMarketId));
          if (!fromP || !toP) continue;

          const pts: InstanceType<typeof THREE.Vector3>[] = [];
          for (let i = 0; i <= SEG; i++) {
            const f = i / SEG;
            const nx = fromP.x + (toP.x - fromP.x) * f;
            const ny = fromP.y + (toP.y - fromP.y) * f;
            pts.push(
              new THREE.Vector3((nx - 0.5) * W, heightAtNorm(nx, ny) * HEIGHT + 0.06, (ny - 0.5) * W),
            );
          }
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), routeLineMat);
          line.computeLineDistances();
          routeGroup.add(line);

          const cum = [0];
          let len = 0;
          for (let i = 1; i < pts.length; i++) {
            len += pts[i].distanceTo(pts[i - 1]);
            cum.push(len);
          }
          const wagon = makeWagon();
          routeGroup.add(wagon);
          routeWagons.push({
            mesh: wagon,
            pts,
            cum,
            len,
            phase: Math.random() * 2,
            speed: 0.1 + Math.min(0.3, (r.volume ?? 5) * 0.008),
            bob: Math.random() * 6,
          });
        }
      }

      function wagonAt(wg: Wagon, t: number) {
        const d = Math.max(0, Math.min(1, t)) * wg.len;
        let i = 0;
        while (i < wg.cum.length - 2 && wg.cum[i + 1] < d) i++;
        const seg = wg.cum[i + 1] - wg.cum[i] || 1;
        const f = Math.max(0, Math.min(1, (d - wg.cum[i]) / seg));
        return wg.pts[i].clone().lerp(wg.pts[i + 1], f);
      }

      function routeSignature() {
        const e = economyRef.current;
        if (!e?.enabled) return "off";
        const pois = worldRef.current.pois ?? [];
        const pmap = new Map(pois.map((p) => [p.id, `${p.x.toFixed(3)},${p.y.toFixed(3)}`]));
        const mkt = new Map((e.markets ?? []).map((m) => [m.id, m.poiId]));
        let s = "";
        for (const r of e.routes ?? []) {
          if (r.active === false) continue;
          const a = pmap.get(mkt.get(r.fromMarketId) ?? "");
          const b = pmap.get(mkt.get(r.toMarketId) ?? "");
          if (a && b) s += `${r.id}:${a}>${b}:${r.volume};`;
        }
        return s;
      }

      let raf = 0;
      let lastT = performance.now();
      const tick = () => {
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastT) / 1000);
        lastT = now;
        // Best of both worlds: left does the active tool, right always navigates.
        const interacting =
          toolRef.current !== "look" ||
          !!onPlaceRef.current ||
          !!drawKindRef.current ||
          !!onPartyRef.current ||
          !!measureRef.current;
        controls.enabled = true;
        controls.mouseButtons.LEFT = interacting ? undefined : THREE.MOUSE.ROTATE;
        controls.mouseButtons.RIGHT = interacting ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
        moveKeys(dt);
        controls.update();

        // POI hover + label scaling.
        if (hovered) {
          ray.setFromCamera(lastNdc, camera);
          const hit = ray.intersectObjects(poiPick, true)[0];
          hoveredPoiId = hit ? findPoiId(hit.object) : null;
        } else {
          hoveredPoiId = null;
        }
        updatePoiLabels();
        for (const rec of regionLabelMap.values()) {
          rec.mesh.visible = showRegionsRef.current;
        }

        // River flow.
        if (riverMeshes.length) waterTex.offset.y -= dt * 0.1;

        // Lantern flame flicker.
        if (lanternBase > 0.3) {
          lanternGlowMat.emissiveIntensity = lanternBase * (0.9 + 0.1 * Math.sin(now * 0.012));
        }

        // Weather animation.
        if (weatherPoints) {
          const snow = weatherKind === "snow";
          const p = weatherPoints.geometry.getAttribute(
            "position",
          ) as InstanceType<typeof THREE.BufferAttribute>;
          const fall = (snow ? 2.5 : 26) * dt;
          for (let i = 0; i < p.count; i++) {
            let y = p.getY(i) - fall;
            if (y < 0) y += 24;
            p.setY(i, y);
            if (snow) p.setX(i, p.getX(i) + Math.sin((y + i) * 0.6) * 0.01);
          }
          p.needsUpdate = true;
        }
        // Storm lightning.
        if (weatherKind === "storm") {
          boltTimer -= dt;
          if (boltTimer <= 0) {
            flash = 1.6;
            boltTimer = 2 + Math.random() * 5;
          }
        }
        if (flash > 0) {
          flash = Math.max(0, flash - dt * 6);
          ambient.intensity = baseAmbient + flash;
        }

        // Trade-route caravans: rebuild on change, then trundle the wagons.
        const rsig = routeSignature();
        if (rsig !== routeSig) {
          routeSig = rsig;
          buildRoutes();
        }
        const eco = economyRef.current;
        const routesVisible =
          showRoutesRef.current && !!eco?.enabled && (canEdit || !eco?.hidden);
        routeGroup.visible = routesVisible;
        if (routesVisible) {
          for (const wg of routeWagons) {
            if (wg.len <= 0) continue;
            wg.phase += wg.speed * dt;
            const cyc = wg.phase % 2;
            const asc = cyc < 1;
            const t = asc ? cyc : 2 - cyc;
            const pos = wagonAt(wg, t);
            const ahead = wagonAt(wg, asc ? Math.min(1, t + 0.03) : Math.max(0, t - 0.03));
            const nx = pos.x / W + 0.5;
            const ny = pos.z / W + 0.5;
            const gy = heightAtNorm(nx, ny) * HEIGHT;
            wg.mesh.position.set(
              pos.x,
              gy + 0.04 + Math.sin(now * 0.004 + wg.bob) * 0.012,
              pos.z,
            );
            const dx = ahead.x - pos.x;
            const dz = ahead.z - pos.z;
            if (dx || dz) wg.mesh.rotation.y = Math.atan2(dx, dz);
          }
        }

        renderer.render(scene, camera);
        frameCbRef.current?.();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      const ro = new ResizeObserver(() => {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w && h) {
          renderer.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
      });
      ro.observe(container);

      engineRef.current = {
        setView(v) {
          if (v === "top") {
            controls.minPolarAngle = 0;
            controls.maxPolarAngle = 0.0001;
            camera.position.set(0, 64, 0.01);
          } else {
            controls.minPolarAngle = 0;
            controls.maxPolarAngle = 1.35;
            if (camera.position.y > 56) camera.position.set(0, 30, 44);
          }
          controls.update();
        },
        setSea(v) {
          seaLevel = v;
          setWater();
          refreshColors();
          scheduleSave();
        },
        setTime: applyTime,
        setWeather: applyWeather,
        load(wm) {
          if (wm.size !== size) return; // size changes rebuild via the effect
          loadArrays(wm);
          setWater();
          // Recomputes terrain mods, repaints, and reseats trees/POIs.
          syncPaths();
        },
        exportWorld(): WorldMap {
          if (gridDirty || !gridCache) {
            const h = new Uint8Array(size * size);
            for (let i = 0; i < h.length; i++) h[i] = Math.round(heightArr[i] * 255);
            gridCache = {
              height: encodeBytes(h),
              biome: encodeBytes(biomeArr),
              explored: encodeBytes(exploredArr),
              regionMask: encodeBytes(regionArr),
              treeMask: encodeBytes(treeArr),
              lakeMask: encodeBytes(lakeArr),
            };
            gridDirty = false;
          }
          return {
            ...worldRef.current,
            size,
            ...gridCache,
            seaLevel,
            timeOfDay: timeRef.current,
            weather: weatherRef.current,
            fog: fogOn,
            treeDensity: treeDensityRef.current,
          };
        },
        syncPois,
        syncPaths,
        startDraw(kind) {
          draftKind = kind;
          draftPoints = [];
          rebuildPreview();
        },
        finishDraw() {
          const pts = draftPoints.slice();
          draftPoints = [];
          rebuildPreview();
          return pts.length >= 4 ? pts : null;
        },
        cancelDraw() {
          draftPoints = [];
          rebuildPreview();
        },
        setParty,
        clearMeasure,
        setFog(on) {
          fogOn = on;
          refreshColors();
          scheduleSave();
        },
        revealAll(v) {
          exploredArr.fill(v);
          gridDirty = true;
          refreshColors();
          scheduleSave();
        },
        clearRegion(idx) {
          for (let i = 0; i < regionArr.length; i++) {
            if (regionArr[i] === idx) regionArr[i] = 0;
          }
          gridDirty = true;
          refreshColors();
          scheduleSave();
        },
        rebuildTrees() {
          buildTrees();
        },
        syncRegionLabels,
        reshade() {
          refreshColors();
        },
        azimuth() {
          return controls.getAzimuthalAngle();
        },
        dispose() {
          cancelAnimationFrame(raf);
          ro.disconnect();
          window.removeEventListener("keydown", onKeyDown);
          window.removeEventListener("keyup", onKeyUp);
          dom.removeEventListener("pointerenter", onEnter);
          dom.removeEventListener("pointerleave", onLeave);
          dom.removeEventListener("pointerdown", onDown);
          dom.removeEventListener("pointermove", onMove);
          dom.removeEventListener("pointerup", onUp);
          dom.removeEventListener("pointercancel", onUp);
          for (const rec of poiMap.values()) {
            disposeGroup(rec.group);
            scene.remove(rec.label);
            (rec.label.material.map as InstanceType<typeof THREE.CanvasTexture>)?.dispose();
            rec.label.material.dispose();
          }
          poiMap.clear();
          for (const l of lightMap.values()) scene.remove(l);
          lightMap.clear();
          if (previewMesh) disposePathMesh(previewMesh);
          if (treeTrunks) {
            scene.remove(treeTrunks);
            treeTrunks.geometry.dispose();
          }
          if (treeLeaves) {
            scene.remove(treeLeaves);
            treeLeaves.geometry.dispose();
          }
          disposeLanterns();
          scene.remove(brushRing);
          brushRing.geometry.dispose();
          (brushRing.material as InstanceType<typeof THREE.MeshBasicMaterial>).dispose();
          for (const m of riverMeshes) {
            scene.remove(m);
            m.geometry.dispose();
          }
          riverMeshes.length = 0;
          for (const m of bridgeMeshes) {
            scene.remove(m);
            m.traverse((o) => {
              const me = o as InstanceType<typeof THREE.Mesh>;
              if (me.geometry) me.geometry.dispose();
            });
          }
          bridgeMeshes.length = 0;
          BRIDGE_WOOD.dispose();
          BRIDGE_DECK.dispose();
          bridgeTex.dispose();
          if (lakeMesh) {
            scene.remove(lakeMesh);
            lakeMesh.geometry.dispose();
          }
          lakeWaterMat.dispose();
          lakeTex.dispose();
          for (const m of cobbleMeshes) {
            scene.remove(m);
            m.geometry.dispose();
          }
          cobbleMeshes.length = 0;
          cobbleMat.dispose();
          brickTex.dispose();
          waterTex.dispose();
          riverWaterMat.dispose();
          for (const rec of regionLabelMap.values()) disposeRegionLabel(rec);
          regionLabelMap.clear();
          if (partySprite) disposeSprite(partySprite);
          clearMeasureObjs();
          if (weatherPoints) {
            weatherPoints.geometry.dispose();
            (weatherPoints.material as InstanceType<typeof THREE.PointsMaterial>).dispose();
          }
          controls.dispose();
          renderer.dispose();
          if (dom.parentNode) dom.parentNode.removeChild(dom);
        },
      };

      cleanup = () => engineRef.current?.dispose();
    })();

    return () => {
      disposed = true;
      cleanup();
      engineRef.current = null;
    };
    // Rebuild when switching maps or changing world resolution.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.id, world.size]);

  // Push UI changes to the engine.
  useEffect(() => engineRef.current?.setView(view), [view]);
  useEffect(() => engineRef.current?.setTime(time), [time]);
  useEffect(() => engineRef.current?.reshade(), [previewPlayer]);
  useEffect(() => engineRef.current?.reshade(), [regionColors]);
  useEffect(() => engineRef.current?.reshade(), [showRegions]);
  useEffect(() => engineRef.current?.syncRegionLabels(), [world.regions, regionColors]);

  // Rotate the compass every frame.
  useEffect(() => {
    frameCbRef.current = () => {
      const eng = engineRef.current;
      if (eng && compassRef.current) {
        compassRef.current.style.transform = `rotate(${-eng.azimuth()}rad)`;
      }
    };
    return () => {
      frameCbRef.current = null;
    };
  }, []);

  // Rebuild in-scene marker sprites when POIs (or visibility) change.
  useEffect(() => {
    engineRef.current?.syncPois(visibleResolved);
  }, [visibleResolved]);

  // Rebuild path tubes when paths change.
  useEffect(() => {
    engineRef.current?.syncPaths();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths]);

  // Fullscreen for the atlas.
  const rootRef = useRef<HTMLDivElement>(null);
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const onFs = () => setIsFs(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
  };

  // Finish / cancel an in-progress path draw (shared by buttons + keyboard).
  const finishDrawing = () => {
    const pts = engineRef.current?.finishDraw();
    if (pts)
      savePaths([
        ...paths,
        { id: newId(), kind: drawKind, points: pts, width: drawWidth },
      ]);
    setDrawing(false);
  };
  const cancelDrawing = () => {
    engineRef.current?.cancelDraw();
    setDrawing(false);
  };

  // Enter = finish, Escape = cancel — while drawing/placing/measuring.
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "Enter") {
        if (drawing) {
          e.preventDefault();
          finishDrawing();
        }
      } else if (e.key === "Escape") {
        if (drawing) cancelDrawing();
        if (placing) setPlacing(false);
        if (placingParty) setPlacingParty(false);
        if (measuring) {
          engineRef.current?.clearMeasure();
          setMeasuring(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, drawing, placing, placingParty, measuring, drawKind, paths]);

  const segBtn = "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors";
  // Collapsible tool sections (native <details> accordion).
  const groupCls = "rounded-md border border-parchment-400/40";
  const summaryCls =
    "cursor-pointer select-none rounded-md px-2 py-1.5 text-xs font-semibold text-ink-soft hover:bg-parchment-300/40 marker:text-ink-faint";
  const groupBody = "space-y-1.5 border-t border-parchment-400/30 p-2";

  const placeCursor =
    placing || drawing || placingParty || measuring ? "cursor-crosshair" : "";

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative h-[80vh] min-h-[40rem] w-full overflow-hidden rounded-card border-2 border-parchment-400/70 bg-leather",
        placeCursor,
      )}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Controls hint */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-parchment-400/40 bg-parchment-100/70 px-3 py-1 text-[0.6rem] text-ink-faint shadow-card">
        WASD / right-drag move · Q/E height · wheel zoom
      </div>

      {/* Compass */}
      <div className="pointer-events-none absolute bottom-3 right-3 grid h-12 w-12 place-items-center rounded-full border border-parchment-400/60 bg-parchment-100/80 shadow-card">
        <div ref={compassRef} className="relative h-full w-full">
          <span className="absolute left-1/2 top-0.5 -translate-x-1/2 text-[0.6rem] font-bold text-oxblood">
            N
          </span>
          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[0.55rem] text-ink-faint">
            S
          </span>
        </div>
      </div>

      {/* View toggle (everyone) */}
      <div className="absolute right-3 top-3 inline-flex gap-1 rounded-card border border-parchment-400/60 bg-parchment-100/90 p-1 shadow-card">
        {(["3d", "top"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              segBtn,
              view === v
                ? "bg-oxblood text-parchment-50"
                : "text-ink-soft hover:bg-parchment-300/60",
            )}
          >
            {v === "3d" ? "3D orbit" : "Top-down"}
          </button>
        ))}
        <button
          onClick={() => setShowRegions((s) => !s)}
          title="Highlight political regions & borders"
          className={cn(
            segBtn,
            showRegions
              ? "bg-arcane text-parchment-50"
              : "text-ink-soft hover:bg-parchment-300/60",
          )}
        >
          Regions
        </button>
        <button
          onClick={() => setShowRoutes((s) => !s)}
          title="Show trade routes & caravans between pinned markets"
          className={cn(
            segBtn,
            showRoutes
              ? "bg-brass text-parchment-50"
              : "text-ink-soft hover:bg-parchment-300/60",
          )}
        >
          Routes
        </button>
        <button
          onClick={toggleFullscreen}
          title={isFs ? "Exit fullscreen" : "Fullscreen atlas"}
          className={cn(segBtn, "text-ink-soft hover:bg-parchment-300/60")}
        >
          {isFs ? "⤡ Exit" : "⤢ Fullscreen"}
        </button>
      </div>

      {canEdit && (
        <>
          {/* Tools */}
          <div className="absolute left-3 top-3 max-h-[calc(100%-1.5rem)] w-52 space-y-2 overflow-y-auto rounded-card border border-parchment-400/60 bg-parchment-100/95 p-2 shadow-card">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["look", "Look"],
                  ["raise", "Raise"],
                  ["lower", "Lower"],
                  ["smooth", "Smooth"],
                  ["paint", "Paint"],
                  ["lake", "Lake"],
                  ...(fog
                    ? ([
                        ["reveal", "Reveal"],
                        ["shroud", "Shroud"],
                      ] as [Tool, string][])
                    : []),
                ] as [Tool, string][]
              ).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setTool(t)}
                  className={cn(
                    segBtn,
                    tool === t
                      ? "bg-brass text-leather"
                      : "bg-parchment-50 text-ink-soft hover:bg-parchment-300/60",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Contextual brush controls for the active tool */}
            {tool !== "look" && (
              <div className="space-y-1.5 rounded-md bg-parchment-50/70 p-2">
                {tool === "paint" && (
                  <div className="grid grid-cols-5 gap-1">
                    {PAINT_BIOMES.map((b) => (
                      <button
                        key={b.id}
                        title={b.name}
                        onClick={() => setPaintBiome(b.id)}
                        className={cn(
                          "h-5 rounded border",
                          paintBiome === b.id
                            ? "border-ink ring-1 ring-ink"
                            : "border-parchment-400/60",
                        )}
                        style={{ background: b.color }}
                      />
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between text-[0.65rem] text-ink-soft">
                  <span>Brush</span>
                  <span className="font-semibold text-ink">{brushSize}</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={Math.max(24, Math.round(world.size / 5))}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-full accent-oxblood"
                />
                {(tool === "raise" ||
                  tool === "lower" ||
                  tool === "smooth" ||
                  tool === "lake") && (
                  <>
                    <div className="flex items-center justify-between text-[0.65rem] text-ink-soft">
                      <span>Strength</span>
                      <span className="font-semibold text-ink">
                        {brushStrength.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={brushStrength}
                      onChange={(e) => setBrushStrength(Number(e.target.value))}
                      className="w-full accent-oxblood"
                    />
                  </>
                )}
              </div>
            )}

            <details className={groupCls}>
              <summary className={summaryCls}>Points of interest</summary>
              <div className={groupBody}>
            <button
              onClick={() => {
                setPlacing((p) => !p);
                if (!placing) setTool("look");
              }}
              className={cn(
                "w-full rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                placing
                  ? "bg-oxblood text-parchment-50"
                  : "bg-parchment-50 text-ink-soft hover:bg-parchment-300/60",
              )}
            >
              {placing ? "Click the map to place…" : "＋ Place point of interest"}
            </button>
              </div>
            </details>
            <details className={groupCls}>
              <summary className={summaryCls}>Fog of war</summary>
              <div className={groupBody}>
              <label className="flex items-center justify-between text-xs font-semibold text-ink-soft">
                Fog of exploration
                <input
                  type="checkbox"
                  checked={fog}
                  onChange={(e) => {
                    setFog(e.target.checked);
                    engineRef.current?.setFog(e.target.checked);
                    if (e.target.checked) setTool("reveal");
                    else if (tool === "reveal" || tool === "shroud") setTool("look");
                  }}
                  className="accent-oxblood"
                />
              </label>
              {fog && (
                <>
                  <label className="flex items-center justify-between text-[0.65rem] text-ink-soft">
                    View as player
                    <input
                      type="checkbox"
                      checked={previewPlayer}
                      onChange={(e) => setPreviewPlayer(e.target.checked)}
                      className="accent-arcane"
                    />
                  </label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => engineRef.current?.revealAll(1)}
                      className="flex-1 rounded bg-parchment-50 px-1 py-1 text-[0.65rem] text-ink-soft hover:bg-parchment-300/60"
                    >
                      Reveal all
                    </button>
                    <button
                      onClick={() => engineRef.current?.revealAll(0)}
                      className="flex-1 rounded bg-parchment-50 px-1 py-1 text-[0.65rem] text-ink-soft hover:bg-parchment-300/60"
                    >
                      Hide all
                    </button>
                  </div>
                </>
              )}
            </div>
            </details>

            {/* Territory / political regions */}
            <details className={groupCls}>
              <summary className={summaryCls}>Territory</summary>
              <div className={groupBody}>
              <div className="flex items-center justify-end">
                <button
                  onClick={addRegion}
                  className="rounded bg-parchment-50 px-1.5 py-0.5 text-[0.65rem] text-ink-soft hover:bg-parchment-300/60"
                >
                  ＋ Add
                </button>
              </div>
              {regions.length > 0 && (
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setRegionMode("paint");
                      setTool("region");
                    }}
                    className={cn(
                      "flex-1 rounded px-2 py-1 text-[0.65rem] font-semibold",
                      tool === "region" && regionMode === "paint"
                        ? "bg-arcane text-parchment-50"
                        : "bg-parchment-50 text-ink-soft hover:bg-parchment-300/60",
                    )}
                  >
                    Paint
                  </button>
                  <button
                    onClick={() => {
                      setRegionMode("erase");
                      setTool("region");
                    }}
                    className={cn(
                      "flex-1 rounded px-2 py-1 text-[0.65rem] font-semibold",
                      tool === "region" && regionMode === "erase"
                        ? "bg-oxblood text-parchment-50"
                        : "bg-parchment-50 text-ink-soft hover:bg-parchment-300/60",
                    )}
                  >
                    Erase
                  </button>
                </div>
              )}
              {regions.map((rg) => {
                const num = rg.num ?? 0;
                return (
                  <div
                    key={rg.id}
                    className={cn(
                      "flex items-center gap-1 rounded border p-1",
                      activeRegion === num
                        ? "border-brass bg-parchment-50"
                        : "border-parchment-400/40",
                    )}
                  >
                    <button
                      onClick={() => {
                        setActiveRegion(num);
                        setTool("region");
                      }}
                      title="Paint with this region"
                      className="h-4 w-4 shrink-0 rounded-full border border-ink/20"
                      style={{ background: regColor(rg) }}
                    />
                    <input
                      key={`rn-${rg.id}`}
                      defaultValue={rg.name}
                      onBlur={(e) => updateRegion(rg.id, { name: e.target.value })}
                      className="h-6 w-full min-w-0 rounded border border-parchment-400 bg-parchment-50 px-1 text-[0.65rem] text-ink"
                    />
                    <input
                      type="color"
                      value={rg.color ?? "#8a4b2d"}
                      onChange={(e) => updateRegion(rg.id, { color: e.target.value })}
                      title="Colour"
                      className="h-6 w-6 shrink-0 cursor-pointer rounded border border-parchment-400"
                    />
                    <button
                      onClick={() => {
                        if (num) engineRef.current?.clearRegion(num);
                        saveRegions(regions.filter((x) => x.id !== rg.id));
                      }}
                      title="Delete region"
                      className="shrink-0 px-1 text-oxblood hover:text-oxblood-dark"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
              {regions.length > 0 && (
                <select
                  value={regions.find((r) => r.num === activeRegion)?.factionId ?? ""}
                  onChange={(e) => {
                    const rg = regions.find((r) => r.num === activeRegion);
                    if (rg) updateRegion(rg.id, { factionId: e.target.value || undefined });
                  }}
                  aria-label="Region faction"
                  className="h-7 w-full rounded border border-parchment-400 bg-parchment-50 px-1 text-[0.65rem] text-ink"
                >
                  <option value="">— faction (active region) —</option>
                  {factions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            </details>

            {/* Rivers / roads / paths */}
            <details className={groupCls}>
              <summary className={summaryCls}>Paths</summary>
              <div className={groupBody}>
              <div className="flex items-center justify-end">
                <select
                  value={drawKind}
                  onChange={(e) => {
                    const k = e.target.value as WorldPath["kind"];
                    setDrawKind(k);
                    setDrawWidth(PATH_W_DEFAULT[k]);
                  }}
                  aria-label="Path kind"
                  disabled={drawing}
                  className="h-6 rounded border border-parchment-400 bg-parchment-50 px-1 text-[0.65rem] text-ink"
                >
                  <option value="river">River</option>
                  <option value="road">Road</option>
                  <option value="cobble">Cobblestone road</option>
                  <option value="route">Route</option>
                  <option value="border">Border</option>
                </select>
              </div>
              <div className="flex items-center justify-between text-[0.65rem] text-ink-soft">
                <span>Width</span>
                <span className="font-semibold text-ink">{drawWidth.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.15}
                max={1.6}
                step={0.05}
                value={drawWidth}
                onChange={(e) => setDrawWidth(Number(e.target.value))}
                disabled={drawing}
                className="w-full accent-arcane"
              />
              {!drawing ? (
                <button
                  onClick={() => {
                    engineRef.current?.startDraw(drawKind);
                    setDrawing(true);
                  }}
                  className="w-full rounded bg-parchment-50 px-2 py-1 text-[0.65rem] font-semibold text-ink-soft hover:bg-parchment-300/60"
                >
                  ✎ Draw a {drawKind}
                </button>
              ) : (
                <div className="space-y-1">
                  <p className="text-[0.6rem] text-ink-faint">
                    Click to add points · <b>Enter</b> to finish · <b>Esc</b> to cancel
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={finishDrawing}
                      className="flex-1 rounded bg-forest px-1 py-1 text-[0.65rem] font-semibold text-parchment-50"
                    >
                      Finish
                    </button>
                    <button
                      onClick={cancelDrawing}
                      className="flex-1 rounded bg-parchment-50 px-1 py-1 text-[0.65rem] text-ink-soft hover:bg-parchment-300/60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {paths.map((p, idx) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1 rounded border border-parchment-400/40 p-1 text-[0.65rem] text-ink-soft"
                >
                  <span className="capitalize">
                    {p.kind} {idx + 1}
                  </span>
                  <button
                    onClick={() => savePaths(paths.filter((x) => x.id !== p.id))}
                    title="Delete path"
                    className="ml-auto px-1 text-oxblood"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            </details>

            {/* Trees */}
            <details className={groupCls}>
              <summary className={summaryCls}>Trees</summary>
              <div className={groupBody}>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setTreeMode("plant");
                    setTool("trees");
                  }}
                  className={cn(
                    "flex-1 rounded px-2 py-1 text-[0.65rem] font-semibold",
                    tool === "trees" && treeMode === "plant"
                      ? "bg-forest text-parchment-50"
                      : "bg-parchment-50 text-ink-soft hover:bg-parchment-300/60",
                  )}
                >
                  ♣ Plant
                </button>
                <button
                  onClick={() => {
                    setTreeMode("clear");
                    setTool("trees");
                  }}
                  className={cn(
                    "flex-1 rounded px-2 py-1 text-[0.65rem] font-semibold",
                    tool === "trees" && treeMode === "clear"
                      ? "bg-oxblood text-parchment-50"
                      : "bg-parchment-50 text-ink-soft hover:bg-parchment-300/60",
                  )}
                >
                  Clear
                </button>
              </div>
              <div className="flex items-center justify-between text-[0.65rem] text-ink-soft">
                <span>Brush density</span>
                <span className="font-semibold text-ink">
                  {Math.round(treeDensity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={treeDensity}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setTreeDensity(v);
                  treeDensityRef.current = v;
                }}
                onPointerUp={() => saveWorld({ treeDensity })}
                className="w-full accent-forest"
              />
              <p className="text-[0.6rem] text-ink-faint">
                Density sets how thick the brush plants — it only affects what you
                paint, not existing trees. Roads & rivers clear trees beneath them.
              </p>
            </div>
            </details>

            {/* Travel: ruler + party token */}
            <details className={groupCls}>
              <summary className={summaryCls}>Travel</summary>
              <div className={groupBody}>
              <label className="flex items-center gap-1.5 text-[0.65rem] text-ink-soft">
                Speed
                <input
                  type="number"
                  min={1}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value) || 24)}
                  onBlur={() => saveWorld({ travelSpeed: speed })}
                  className="h-6 w-14 rounded border border-parchment-400 bg-parchment-50 px-1 text-[0.65rem] text-ink"
                />
                mi/day
              </label>
              <button
                onClick={() => {
                  if (measuring) engineRef.current?.clearMeasure();
                  setMeasuring((m) => !m);
                  setPlacingParty(false);
                }}
                className={cn(
                  "w-full rounded px-2 py-1 text-[0.65rem] font-semibold",
                  measuring
                    ? "bg-oxblood text-parchment-50"
                    : "bg-parchment-50 text-ink-soft hover:bg-parchment-300/60",
                )}
              >
                {measuring ? "Measuring — click two points" : "📏 Measure distance"}
              </button>
              <button
                onClick={() => {
                  setPlacingParty((p) => !p);
                  setMeasuring(false);
                }}
                className={cn(
                  "w-full rounded px-2 py-1 text-[0.65rem] font-semibold",
                  placingParty
                    ? "bg-oxblood text-parchment-50"
                    : "bg-parchment-50 text-ink-soft hover:bg-parchment-300/60",
                )}
              >
                {placingParty ? "Click to place the party…" : "⚑ Move party here"}
              </button>
              {world.party && (
                <button
                  onClick={() => {
                    saveWorld({ party: undefined });
                    engineRef.current?.setParty(null);
                  }}
                  className="w-full rounded bg-parchment-50 px-2 py-1 text-[0.6rem] text-ink-soft hover:bg-parchment-300/60"
                >
                  Remove party token
                </button>
              )}
              </div>
            </details>
          </div>

          {/* Bottom bar: sea / time / weather / generate */}
          <div className="absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-3 rounded-card border border-parchment-400/60 bg-parchment-100/95 px-3 py-2 text-xs shadow-card">
            <label className="flex items-center gap-1.5">
              Sea
              <input
                type="range"
                min={0}
                max={0.8}
                step={0.01}
                value={sea}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSea(v);
                  engineRef.current?.setSea(v);
                }}
                className="w-24 accent-arcane"
              />
            </label>
            <label className="flex items-center gap-1.5">
              Time
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={time}
                onChange={(e) => setTime(Number(e.target.value))}
                onPointerUp={scheduleSave}
                className="w-28 accent-brass"
              />
            </label>
            <select
              value={weather}
              onChange={(e) => {
                const w = e.target.value as WorldWeather;
                setWeather(w);
                engineRef.current?.setWeather(w);
                scheduleSave();
              }}
              aria-label="Weather"
              className="h-8 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-xs text-ink focus:border-brass focus:outline-none"
            >
              {["clear", "rain", "snow", "fog", "storm"].map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5">
              Size
              <select
                value={genSize}
                onChange={(e) => setGenSize(Number(e.target.value))}
                aria-label="World size"
                className="h-8 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-xs text-ink focus:border-brass focus:outline-none"
              >
                {SIZES.map((s) => (
                  <option key={s.size} value={s.size}>
                    {s.label} ({s.size})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              Scale
              <input
                type="number"
                min={1}
                defaultValue={world.milesAcross ?? 600}
                key={`miles-${world.milesAcross ?? 600}`}
                onBlur={(e) => saveWorld({ milesAcross: Number(e.target.value) || 600 })}
                aria-label="Miles across"
                className="h-8 w-16 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-xs text-ink focus:border-brass focus:outline-none"
              />
              mi
            </label>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const wm = generateWorld({
                  size: genSize,
                  seed: Math.floor(Math.random() * 99999),
                  seaLevel: sea,
                });
                if (genSize === world.size && engineRef.current) {
                  engineRef.current.load(wm);
                  onUpdate({ world: engineRef.current.exportWorld() });
                } else {
                  // Different resolution → save and let the effect rebuild.
                  onUpdate({ world: { ...wm, timeOfDay: time, weather } });
                }
              }}
            >
              Regenerate
            </Button>
          </div>
        </>
      )}

      {/* POI editor / info */}
      {selPoi && (
        <div className="absolute right-3 top-16 max-h-[70%] w-72 overflow-y-auto rounded-card border-2 border-brass/50 bg-parchment-100 p-3 shadow-raised">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-brass-dark">
              {POI_GLYPH.get(selPoi.kind) ?? "✦"} Point of interest
            </span>
            <button
              onClick={() => setSelectedPoi(null)}
              aria-label="Close"
              className="rounded p-1 text-ink-faint hover:text-ink"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
          {canEdit ? (
            <div className="space-y-2">
              <input
                key={`pn-${selPoi.id}`}
                defaultValue={selPoi.name}
                onBlur={(e) => updatePoi(selPoi.id, { name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                aria-label="Name"
                className="w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm font-semibold text-ink focus:border-brass focus:outline-none"
              />
              <div className="flex gap-2">
                <select
                  value={selPoi.kind}
                  onChange={(e) => updatePoi(selPoi.id, { kind: e.target.value })}
                  aria-label="Kind"
                  className="h-8 flex-1 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-xs text-ink focus:border-brass focus:outline-none"
                >
                  {POI_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.glyph} {k.label}
                    </option>
                  ))}
                </select>
                <input
                  type="color"
                  value={selPoi.color ?? "#7a2d2d"}
                  onChange={(e) => updatePoi(selPoi.id, { color: e.target.value })}
                  aria-label="Marker color"
                  className="h-8 w-9 cursor-pointer rounded border border-parchment-400 bg-parchment-50"
                />
              </div>
              <textarea
                key={`pd-${selPoi.id}`}
                defaultValue={selPoi.description ?? ""}
                onBlur={(e) => updatePoi(selPoi.id, { description: e.target.value })}
                rows={4}
                placeholder="Describe this place…"
                className="w-full resize-y rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none"
              />
              <label className="flex items-center gap-2 text-xs text-ink-soft">
                <input
                  type="checkbox"
                  checked={!!selPoi.hidden}
                  onChange={(e) => updatePoi(selPoi.id, { hidden: e.target.checked })}
                  className="accent-oxblood"
                />
                Hidden from players
              </label>
              <div className="space-y-1 rounded-md border border-parchment-400/50 bg-parchment-50/60 p-2">
                <p className="text-[0.6rem] font-semibold uppercase tracking-wide text-brass-dark">
                  Links
                </p>
                {normalizedLinks(selPoi).map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-1.5 text-[0.7rem] text-ink-soft"
                  >
                    <span className="rounded bg-parchment-300/70 px-1 text-[0.6rem] uppercase">
                      {LINK_KINDS.find((k) => k.kind === l.kind)?.label}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{linkName(l)}</span>
                    <button
                      onClick={() => removeLink(selPoi, l.id)}
                      aria-label="Remove link"
                      className="px-1 text-oxblood"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="flex gap-1">
                  <select
                    value={addLinkKind}
                    onChange={(e) => setAddLinkKind(e.target.value as PoiLinkKind)}
                    aria-label="Link kind"
                    className="h-7 rounded border border-parchment-400 bg-parchment-50 px-1 text-[0.65rem] text-ink"
                  >
                    {LINK_KINDS.map((k) => (
                      <option key={k.kind} value={k.kind}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) addLink(selPoi, addLinkKind, e.target.value);
                    }}
                    aria-label="Add link"
                    className="h-7 min-w-0 flex-1 rounded border border-parchment-400 bg-parchment-50 px-1 text-[0.65rem] text-ink"
                  >
                    <option value="">＋ add link…</option>
                    {linkOptions(addLinkKind).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={() => removePoi(selPoi.id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-oxblood/40 px-3 py-1.5 text-xs font-semibold text-oxblood hover:bg-oxblood hover:text-parchment-50"
              >
                <TrashIcon className="h-4 w-4" /> Remove
              </button>
            </div>
          ) : (
            <>
              <h3 className="font-display text-lg font-bold text-ink">{selPoi.name}</h3>
              <p className="text-[0.7rem] uppercase tracking-wide text-ink-faint">
                {POI_KINDS.find((k) => k.id === selPoi.kind)?.label ?? selPoi.kind}
              </p>
              {selPoi.description && (
                <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">
                  {selPoi.description}
                </p>
              )}
            </>
          )}

          {/* Linked entities (DM + players) */}
          {(() => {
            const links = normalizedLinks(selPoi);
            if (!links.length) return null;
            return (
              <div className="mt-3 space-y-1.5 border-t border-parchment-400/50 pt-2 text-xs">
                {links.map((l) => {
                  const name = linkName(l);
                  if (l.kind === "faction") {
                    const f = factions.find((x) => x.id === l.ref);
                    return (
                      <div
                        key={l.id}
                        className="flex items-center gap-1.5 text-ink-soft"
                      >
                        <span
                          className="h-3 w-3 rounded-full border border-ink/20"
                          style={{ background: f?.color || "#7a2d2d" }}
                        />
                        {name}
                      </div>
                    );
                  }
                  if (l.kind === "quest") {
                    const q = quests.find((x) => x.id === l.ref);
                    return (
                      <div
                        key={l.id}
                        className="flex items-center gap-1.5 text-ink-soft"
                      >
                        ⚑ {name}
                        {q && (
                          <span className="rounded bg-parchment-300 px-1 text-[0.6rem] uppercase tracking-wide">
                            {q.status}
                          </span>
                        )}
                      </div>
                    );
                  }
                  const glyph = l.kind === "npc" ? "👤" : l.kind === "hero" ? "🛡" : "⚔";
                  const href = linkHref(l);
                  return href ? (
                    <Link
                      key={l.id}
                      href={href}
                      className="flex items-center gap-1.5 font-semibold text-brass-dark hover:underline"
                    >
                      {glyph} {name} →
                    </Link>
                  ) : (
                    <div key={l.id} className="text-ink-soft">
                      {glyph} {name}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Economy: markets & resource nodes at this place */}
          {economy?.enabled &&
            (() => {
              const boundMarkets = (economy.markets ?? []).filter((m) => m.poiId === selPoi.id);
              const boundNodes = (economy.nodes ?? []).filter((n) => n.poiId === selPoi.id);
              const unbound = (economy.markets ?? []).filter((m) => m.poiId !== selPoi.id);
              if (!boundMarkets.length && !boundNodes.length && !canEdit) return null;
              const bindMarket = (id: string, poiId: string | undefined) =>
                updateEconomy({
                  markets: (economy.markets ?? []).map((m) =>
                    m.id === id ? { ...m, poiId, mapId: poiId ? map.id : m.mapId } : m,
                  ),
                });
              return (
                <div className="mt-3 space-y-1.5 border-t border-parchment-400/50 pt-2 text-xs">
                  {boundMarkets.map((m) => (
                    <div key={m.id} className="flex items-center gap-1.5">
                      <Link href="/market" className="flex items-center gap-1.5 font-semibold text-brass-dark hover:underline">
                        🪙 {m.name} →
                      </Link>
                      <span className="text-ink-faint">({m.goods.length} goods)</span>
                      {canEdit && (
                        <button
                          onClick={() => bindMarket(m.id, undefined)}
                          className="ml-auto text-ink-faint hover:text-oxblood"
                          aria-label="Unbind market"
                          title="Unbind from this place"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  {boundNodes.map((n) => (
                    <div key={n.id} className="flex items-center gap-1.5 text-ink-soft">
                      ⛏ {n.name}
                      <span className="text-ink-faint">
                        +{n.rate}/day{" "}
                        {economy.commodities.find((c) => c.id === n.commodityId)?.name ?? ""}
                      </span>
                    </div>
                  ))}
                  {canEdit && unbound.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => e.target.value && bindMarket(e.target.value, selPoi.id)}
                      className="h-7 w-full rounded border border-parchment-400 bg-parchment-50 px-1 text-[0.65rem] text-ink"
                    >
                      <option value="">＋ place a market here…</option>
                      {unbound.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })()}
        </div>
      )}
    </div>
  );
}
