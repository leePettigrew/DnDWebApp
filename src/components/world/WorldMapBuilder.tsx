"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { Button } from "@/components/ui/Button";
import { CloseIcon, TrashIcon } from "@/components/ui/icons";
import {
  useCharacters,
  useFactions,
  useMaps,
  useQuests,
  useStatBlocks,
} from "@/lib/data/hooks";
import { newId } from "@/lib/domain/ids";
import type { BattleMap, WorldMap, WorldPoi, WorldWeather } from "@/lib/domain/types";
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

type Tool = "look" | "raise" | "lower" | "smooth" | "paint";

interface Engine {
  setView(v: "3d" | "top"): void;
  setSea(v: number): void;
  setTime(t: number): void;
  setWeather(w: WorldWeather): void;
  load(world: WorldMap): void;
  exportWorld(): WorldMap;
  /** Rebuild in-scene POI marker sprites from the given list. */
  syncPois(list: WorldPoi[]): void;
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
      pois.map((p) =>
        p.factionId && !p.color
          ? { ...p, color: factionColor(p.factionId) ?? p.color }
          : p,
      ),
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
      let seaLevel = world.seaLevel;

      function loadArrays(wm: WorldMap) {
        const h = decodeBytes(wm.height, size * size);
        biomeArr = decodeBytes(wm.biome, size * size);
        heightArr = new Float32Array(size * size);
        for (let i = 0; i < heightArr.length; i++) heightArr[i] = (h[i] ?? 0) / 255;
        seaLevel = wm.seaLevel;
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
      controls.maxDistance = 160;
      controls.minDistance = 4;
      controls.zoomSpeed = 1.1;

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

      const pos = geo.getAttribute("position") as InstanceType<
        typeof THREE.Float32BufferAttribute
      >;

      // --- POI marker sprites (live in the scene → no overlay drift) ---
      const spriteMap = new Map<string, InstanceType<typeof THREE.Sprite>>();
      function heightAtNorm(nx: number, ny: number) {
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
        const font = "600 28px Georgia, serif";
        const meas = document.createElement("canvas").getContext("2d")!;
        meas.font = font;
        const tw = Math.ceil(meas.measureText(name).width);
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
        ctx.strokeStyle = p.hidden ? "rgba(122,45,45,0.9)" : "rgba(60,50,40,0.55)";
        ctx.stroke();
        ctx.fillStyle = p.color || "#7a2d2d";
        ctx.beginPath();
        ctx.arc(pad + dot / 2, h / 2, dot / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2b2218";
        ctx.textBaseline = "middle";
        ctx.fillText(name, pad + dot + 10, h / 2 + 2);
        const tex = new THREE.CanvasTexture(c);
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        return { tex, aspect: w / h };
      }
      function placeSprite(sp: InstanceType<typeof THREE.Sprite>, p: WorldPoi) {
        sp.position.set(
          (p.x - 0.5) * W,
          heightAtNorm(p.x, p.y) * HEIGHT + 0.9,
          (p.y - 0.5) * W,
        );
      }
      function syncPois(list: WorldPoi[]) {
        const ids = new Set(list.map((p) => p.id));
        for (const [id, sp] of spriteMap) {
          if (!ids.has(id)) {
            scene.remove(sp);
            (sp.material.map as InstanceType<typeof THREE.CanvasTexture>)?.dispose();
            sp.material.dispose();
            spriteMap.delete(id);
          }
        }
        for (const p of list) {
          const sig = `${p.name}|${p.kind}|${p.color ?? ""}|${p.hidden ? 1 : 0}`;
          let sp = spriteMap.get(p.id);
          if (!sp) {
            const mat = new THREE.SpriteMaterial({ depthTest: false, transparent: true });
            sp = new THREE.Sprite(mat);
            sp.renderOrder = 10;
            sp.userData.id = p.id;
            scene.add(sp);
            spriteMap.set(p.id, sp);
          }
          if (sp.userData.sig !== sig) {
            const { tex, aspect } = makeLabel(p);
            (sp.material.map as InstanceType<typeof THREE.CanvasTexture> | null)?.dispose();
            sp.material.map = tex;
            sp.material.needsUpdate = true;
            sp.scale.set(1.5 * aspect, 1.5, 1);
            sp.userData.sig = sig;
          }
          placeSprite(sp, p);
        }
      }

      function refreshPositions() {
        for (let i = 0; i < heightArr.length; i++) {
          pos.setZ(i, heightArr[i] * HEIGHT);
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
        const hl = x > 0 ? heightArr[i - 1] : heightArr[i];
        const hr = x < size - 1 ? heightArr[i + 1] : heightArr[i];
        const hu = y > 0 ? heightArr[i - size] : heightArr[i];
        const hd = y < size - 1 ? heightArr[i + size] : heightArr[i];
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
        const h = heightArr[i];
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
        colorAttr.setXYZ(i, clamp01(r), clamp01(g), clamp01(b));
      }
      function refreshColors() {
        for (let i = 0; i < heightArr.length; i++) setColorAt(i);
        colorAttr.needsUpdate = true;
      }
      function setWater() {
        water.position.y = seaLevel * HEIGHT + 0.02;
      }

      refreshPositions();
      refreshColors();
      setWater();
      syncPois(
        canEdit
          ? resolvedPoisRef.current
          : resolvedPoisRef.current.filter((p) => !p.hidden),
      );

      // Day/night.
      function applyTime(t: number) {
        const ang = (t - 0.25) * Math.PI * 2;
        const elev = Math.sin(ang);
        sun.position.set(Math.cos(ang) * 30, elev * 40, 18);
        const day = Math.max(0, elev);
        sun.intensity = 0.25 + day * 1.5;
        // warm at horizon, white at noon
        const warm = 1 - Math.min(1, Math.abs(elev) * 1.4);
        sun.color.setRGB(1, 0.85 + warm * 0.0 + day * 0.15, 0.6 + day * 0.4);
        ambient.intensity = 0.28 + day * 0.45;
        const nightR = 0.05,
          nightG = 0.07,
          nightB = 0.13;
        const dayR = 0.53,
          dayG = 0.7,
          dayB = 0.92;
        const k = day;
        scene.background = new THREE.Color(
          nightR + (dayR - nightR) * k,
          nightG + (dayG - nightG) * k,
          nightB + (dayB - nightB) * k,
        );
        ambient.color.setRGB(0.6 + k * 0.4, 0.65 + k * 0.35, 0.8);
      }
      applyTime(world.timeOfDay ?? 0.5);

      // --- brushing ---
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
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
            if (touchedHeight) pos.setZ(i, heightArr[i] * HEIGHT);
            setColorAt(i);
          }
        }
        if (touchedHeight) {
          pos.needsUpdate = true;
          if (size <= 160) geo.computeVertexNormals(); // big maps defer to release
        }
        colorAttr.needsUpdate = true;
        edited = true;
      }

      const dom = renderer.domElement;
      let downX = 0;
      let downY = 0;
      function pickSprite(e: PointerEvent): string | null {
        const rect = dom.getBoundingClientRect();
        ndc.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects([...spriteMap.values()], false)[0];
        return hit ? (hit.object.userData.id as string) : null;
      }
      function onDown(e: PointerEvent) {
        downX = e.clientX;
        downY = e.clientY;
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
        if (!painting) return;
        const c = cellFromEvent(e);
        if (c !== null) applyBrush(c.i);
      }
      function onUp(e: PointerEvent) {
        if (painting && edited) {
          geo.computeVertexNormals(); // accurate lighting after the stroke
          refreshColors();
          scheduleSave();
        } else if (
          !painting &&
          !onPlaceRef.current &&
          Math.abs(e.clientX - downX) < 5 &&
          Math.abs(e.clientY - downY) < 5
        ) {
          // A click (not a drag): select a marker under the cursor.
          const id = pickSprite(e);
          if (id) onSelectRef.current?.(id);
        }
        painting = false;
        edited = false;
      }
      dom.addEventListener("pointerdown", onDown);
      dom.addEventListener("pointermove", onMove);
      dom.addEventListener("pointerup", onUp);
      dom.addEventListener("pointercancel", onUp);

      let raf = 0;
      const tick = () => {
        controls.enabled = toolRef.current === "look" && !onPlaceRef.current;
        controls.update();
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
        setWeather() {
          /* weather visuals land in a later phase; stored on export */
        },
        load(wm) {
          if (wm.size !== size) return; // size changes rebuild via the effect
          loadArrays(wm);
          refreshPositions();
          refreshColors();
          setWater();
        },
        exportWorld(): WorldMap {
          const h = new Uint8Array(size * size);
          for (let i = 0; i < h.length; i++) h[i] = Math.round(heightArr[i] * 255);
          return {
            ...worldRef.current,
            size,
            height: encodeBytes(h),
            biome: encodeBytes(biomeArr),
            seaLevel,
            timeOfDay: timeRef.current,
            weather: weatherRef.current,
          };
        },
        syncPois,
        azimuth() {
          return controls.getAzimuthalAngle();
        },
        dispose() {
          cancelAnimationFrame(raf);
          ro.disconnect();
          dom.removeEventListener("pointerdown", onDown);
          dom.removeEventListener("pointermove", onMove);
          dom.removeEventListener("pointerup", onUp);
          dom.removeEventListener("pointercancel", onUp);
          for (const sp of spriteMap.values()) {
            (sp.material.map as InstanceType<typeof THREE.CanvasTexture>)?.dispose();
            sp.material.dispose();
          }
          spriteMap.clear();
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

  const segBtn = "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors";

  const placeCursor = placing ? "cursor-crosshair" : "";

  return (
    <div
      className={cn(
        "relative h-[80vh] min-h-[40rem] w-full overflow-hidden rounded-card border-2 border-parchment-400/70 bg-leather",
        placeCursor,
      )}
    >
      <div ref={containerRef} className="absolute inset-0" />

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
      </div>

      {canEdit && (
        <>
          {/* Tools */}
          <div className="absolute left-3 top-3 max-w-[15rem] space-y-2 rounded-card border border-parchment-400/60 bg-parchment-100/95 p-2 shadow-card">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["look", "Look"],
                  ["raise", "Raise"],
                  ["lower", "Lower"],
                  ["smooth", "Smooth"],
                  ["paint", "Paint"],
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
            {tool !== "look" && tool !== "paint" && (
              <label className="block text-[0.65rem] text-ink-soft">
                Brush size {brushSize}
                <input
                  type="range"
                  min={2}
                  max={Math.max(24, Math.round(world.size / 5))}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-full accent-oxblood"
                />
                <span className="block">Strength {brushStrength.toFixed(2)}</span>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={brushStrength}
                  onChange={(e) => setBrushStrength(Number(e.target.value))}
                  className="w-full accent-oxblood"
                />
              </label>
            )}
            {tool === "paint" && (
              <div className="grid grid-cols-4 gap-1">
                {PAINT_BIOMES.map((b) => (
                  <button
                    key={b.id}
                    title={b.name}
                    onClick={() => setPaintBiome(b.id)}
                    className={cn(
                      "h-6 rounded border",
                      paintBiome === b.id
                        ? "border-ink ring-1 ring-ink"
                        : "border-parchment-400/60",
                    )}
                    style={{ background: b.color }}
                  />
                ))}
              </div>
            )}
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
                <LinkSelect
                  label="Faction"
                  value={selPoi.factionId}
                  onChange={(v) => updatePoi(selPoi.id, { factionId: v })}
                  options={factions.map((f) => ({ id: f.id, label: f.name }))}
                />
                <LinkSelect
                  label="Quest"
                  value={selPoi.questId}
                  onChange={(v) => updatePoi(selPoi.id, { questId: v })}
                  options={quests.map((q) => ({ id: q.id, label: q.title }))}
                />
                <LinkSelect
                  label="NPC"
                  value={selPoi.statBlockId}
                  onChange={(v) => updatePoi(selPoi.id, { statBlockId: v })}
                  options={statBlocks.map((s) => ({ id: s.id, label: s.name }))}
                />
                <LinkSelect
                  label="Hero"
                  value={selPoi.characterId}
                  onChange={(v) => updatePoi(selPoi.id, { characterId: v })}
                  options={characters.map((c) => ({ id: c.id, label: c.name }))}
                />
                <LinkSelect
                  label="Battle map"
                  value={selPoi.battleMapId}
                  onChange={(v) => updatePoi(selPoi.id, { battleMapId: v })}
                  options={battleMaps.map((m) => ({ id: m.id, label: m.name }))}
                />
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
            const f = selPoi.factionId
              ? factions.find((x) => x.id === selPoi.factionId)
              : null;
            const q = selPoi.questId
              ? quests.find((x) => x.id === selPoi.questId)
              : null;
            const npc = selPoi.statBlockId
              ? statBlocks.find((x) => x.id === selPoi.statBlockId)
              : null;
            const hero = selPoi.characterId
              ? characters.find((x) => x.id === selPoi.characterId)
              : null;
            const bm = selPoi.battleMapId
              ? allMaps.find((x) => x.id === selPoi.battleMapId)
              : null;
            if (!f && !q && !npc && !hero && !bm) return null;
            return (
              <div className="mt-3 space-y-1.5 border-t border-parchment-400/50 pt-2 text-xs">
                {f && (
                  <div className="flex items-center gap-1.5 text-ink-soft">
                    <span
                      className="h-3 w-3 rounded-full border border-ink/20"
                      style={{ background: f.color || "#7a2d2d" }}
                    />
                    {f.name}
                  </div>
                )}
                {q && (
                  <div className="flex items-center gap-1.5 text-ink-soft">
                    ⚑ {q.title}
                    <span className="rounded bg-parchment-300 px-1 text-[0.6rem] uppercase tracking-wide">
                      {q.status}
                    </span>
                  </div>
                )}
                {npc && (
                  <Link
                    href={`/bestiary/${npc.id}`}
                    className="flex items-center gap-1.5 font-semibold text-brass-dark hover:underline"
                  >
                    👤 {npc.name} →
                  </Link>
                )}
                {hero && (
                  <Link
                    href={`/characters/${hero.id}`}
                    className="flex items-center gap-1.5 font-semibold text-brass-dark hover:underline"
                  >
                    🛡 {hero.name} →
                  </Link>
                )}
                {bm && (
                  <Link
                    href="/combat"
                    className="flex items-center gap-1.5 font-semibold text-brass-dark hover:underline"
                  >
                    ⚔ {bm.name} →
                  </Link>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function LinkSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5 text-[0.65rem] text-ink-soft">
      <span className="w-16 shrink-0">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="h-7 flex-1 rounded border border-parchment-400 bg-parchment-50 px-1 text-xs text-ink focus:border-brass focus:outline-none"
      >
        <option value="">— none —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
