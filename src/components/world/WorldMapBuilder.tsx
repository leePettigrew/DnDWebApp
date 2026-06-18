"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { Button } from "@/components/ui/Button";
import { CloseIcon, TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import type { BattleMap, WorldMap, WorldPoi, WorldWeather } from "@/lib/domain/types";
import { BIOME_RGB, PAINT_BIOMES } from "@/lib/world/biomes";
import { decodeBytes, encodeBytes } from "@/lib/world/codec";
import { generateWorld } from "@/lib/world/generate";

const W = 28; // world span (units)
const HEIGHT = 4.6; // max elevation (units)

/** Selectable world resolutions (cells per side). */
const SIZES: { label: string; size: number }[] = [
  { label: "Small", size: 96 },
  { label: "Medium", size: 128 },
  { label: "Large", size: 192 },
  { label: "Huge", size: 256 },
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
  /** Project a normalized grid point to container-relative screen px. */
  project(nx: number, ny: number): { x: number; y: number; vis: boolean };
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

  // --- POIs ---
  const pois = world.pois ?? [];
  const [placing, setPlacing] = useState(false);
  const [selectedPoi, setSelectedPoi] = useState<string | null>(null);
  const selPoi = pois.find((p) => p.id === selectedPoi) ?? null;
  const poisRef = useRef(pois);
  poisRef.current = pois;
  const worldRef = useRef(world);
  worldRef.current = world;
  const markerEls = useRef(new Map<string, HTMLButtonElement | null>());
  const compassRef = useRef<HTMLDivElement | null>(null);
  const frameCbRef = useRef<(() => void) | null>(null);
  const onPlaceRef = useRef<((nx: number, ny: number) => void) | null>(null);

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
      const camera = new THREE.PerspectiveCamera(45, width / heightPx, 0.1, 400);
      camera.position.set(0, 22, 26);

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
      const projVec = new THREE.Vector3();
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
      function onDown(e: PointerEvent) {
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
      function onUp() {
        if (painting && edited) {
          geo.computeVertexNormals(); // accurate lighting after the stroke
          refreshColors();
          scheduleSave();
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
            camera.position.set(0, 40, 0.01);
          } else {
            controls.minPolarAngle = 0;
            controls.maxPolarAngle = 1.35;
            if (camera.position.y > 35) camera.position.set(0, 22, 26);
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
        project(nx, ny) {
          const col = Math.max(0, Math.min(size - 1, Math.round(nx * N)));
          const row = Math.max(0, Math.min(size - 1, Math.round(ny * N)));
          const wy = heightArr[row * size + col] * HEIGHT + 0.06;
          projVec.set((nx - 0.5) * W, wy, (ny - 0.5) * W).project(camera);
          return {
            x: (projVec.x * 0.5 + 0.5) * dom.clientWidth,
            y: (-projVec.y * 0.5 + 0.5) * dom.clientHeight,
            vis: projVec.z < 1,
          };
        },
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

  // Project POI markers + rotate the compass every frame.
  useEffect(() => {
    frameCbRef.current = () => {
      const eng = engineRef.current;
      if (!eng) return;
      for (const p of poisRef.current) {
        const el = markerEls.current.get(p.id);
        if (!el) continue;
        const pr = eng.project(p.x, p.y);
        if (!pr.vis) {
          el.style.display = "none";
          continue;
        }
        el.style.display = "";
        el.style.transform = `translate(${pr.x}px, ${pr.y}px) translate(-50%, -50%)`;
      }
      if (compassRef.current) {
        compassRef.current.style.transform = `rotate(${-eng.azimuth()}rad)`;
      }
    };
    return () => {
      frameCbRef.current = null;
    };
  }, []);

  const segBtn = "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors";

  const placeCursor = placing ? "cursor-crosshair" : "";

  return (
    <div
      className={cn(
        "relative h-[34rem] w-full overflow-hidden rounded-card border-2 border-parchment-400/70 bg-leather",
        placeCursor,
      )}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* POI markers (projected each frame) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {(canEdit ? pois : pois.filter((p) => !p.hidden)).map((p) => (
          <button
            key={p.id}
            ref={(el) => {
              markerEls.current.set(p.id, el);
            }}
            type="button"
            onClick={() => setSelectedPoi(p.id)}
            style={{ position: "absolute", left: 0, top: 0, willChange: "transform" }}
            className={cn(
              "pointer-events-auto flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-xs font-semibold shadow-card transition-transform hover:scale-110",
              selectedPoi === p.id
                ? "border-brass bg-parchment-50 text-ink ring-1 ring-brass"
                : "border-parchment-400/70 bg-parchment-100/95 text-ink-soft",
              p.hidden && "opacity-60 ring-1 ring-dashed ring-oxblood",
            )}
          >
            <span aria-hidden style={p.color ? { color: p.color } : undefined}>
              {POI_GLYPH.get(p.kind) ?? "✦"}
            </span>
            <span>{p.name}</span>
          </button>
        ))}
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
        <div className="absolute right-3 top-16 max-h-[26rem] w-60 overflow-y-auto rounded-card border border-parchment-400/60 bg-parchment-100/97 p-3 shadow-card">
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
        </div>
      )}
    </div>
  );
}
