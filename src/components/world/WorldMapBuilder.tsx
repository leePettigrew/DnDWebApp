"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { Button } from "@/components/ui/Button";
import { newId } from "@/lib/domain/ids";
import type { BattleMap, WorldMap, WorldWeather } from "@/lib/domain/types";
import { BIOME_RGB, PAINT_BIOMES } from "@/lib/world/biomes";
import { decodeBytes, encodeBytes } from "@/lib/world/codec";
import { generateWorld } from "@/lib/world/generate";

const W = 24; // world span (units)
const HEIGHT = 4; // max elevation (units)

type Tool = "look" | "raise" | "lower" | "smooth" | "paint";

interface Engine {
  setView(v: "3d" | "top"): void;
  setSea(v: number): void;
  setTime(t: number): void;
  setWeather(w: WorldWeather): void;
  load(world: WorldMap): void;
  exportWorld(): WorldMap;
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

  // Live refs the pointer handlers read.
  const toolRef = useRef(tool);
  toolRef.current = canEdit ? tool : "look";
  const sizeRef = useRef(brushSize);
  sizeRef.current = brushSize;
  const strengthRef = useRef(brushStrength);
  strengthRef.current = brushStrength;
  const biomeRef = useRef(paintBiome);
  biomeRef.current = paintBiome;

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
      controls.maxDistance = 90;
      controls.minDistance = 6;

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

      // Water.
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x2f6ea0,
        transparent: true,
        opacity: 0.66,
        roughness: 0.25,
        metalness: 0.1,
      });
      const water = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.6, W * 1.6), waterMat);
      water.rotation.x = -Math.PI / 2;
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
      function refreshColors() {
        for (let i = 0; i < heightArr.length; i++) {
          const h = heightArr[i];
          let r: number, g: number, b: number;
          if (h < seaLevel) {
            const depth = Math.max(0, Math.min(1, (seaLevel - h) / seaLevel));
            r = 0.13 - depth * 0.06;
            g = 0.32 - depth * 0.14;
            b = 0.45 - depth * 0.12;
          } else {
            const [br, bg, bb] = BIOME_RGB[biomeArr[i]] ?? [110, 140, 80];
            const t = 0.82 + h * 0.32;
            r = (br / 255) * t;
            g = (bg / 255) * t;
            b = (bb / 255) * t;
          }
          colorAttr.setXYZ(i, r, g, b);
        }
        colorAttr.needsUpdate = true;
      }
      function setWater() {
        water.position.y = seaLevel * HEIGHT + 0.01;
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
      let painting = false;
      let edited = false;

      function cellFromEvent(e: PointerEvent): number | null {
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObject(terrain, false)[0];
        if (!hit || !hit.uv) return null;
        const col = Math.round(hit.uv.x * N);
        const row = Math.round((1 - hit.uv.y) * N);
        return Math.max(0, Math.min(size * size - 1, row * size + col));
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
        if (touchedHeight) refreshPositions();
        refreshColors();
        edited = true;
      }

      const dom = renderer.domElement;
      function onDown(e: PointerEvent) {
        if (toolRef.current === "look") return;
        const c = cellFromEvent(e);
        if (c === null) return;
        painting = true;
        dom.setPointerCapture(e.pointerId);
        applyBrush(c);
      }
      function onMove(e: PointerEvent) {
        if (!painting) return;
        const c = cellFromEvent(e);
        if (c !== null) applyBrush(c);
      }
      function onUp() {
        if (painting && edited) scheduleSave();
        painting = false;
        edited = false;
      }
      dom.addEventListener("pointerdown", onDown);
      dom.addEventListener("pointermove", onMove);
      dom.addEventListener("pointerup", onUp);
      dom.addEventListener("pointercancel", onUp);

      let raf = 0;
      const tick = () => {
        controls.enabled = toolRef.current === "look";
        controls.update();
        renderer.render(scene, camera);
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
          loadArrays(wm);
          refreshPositions();
          refreshColors();
          setWater();
        },
        exportWorld(): WorldMap {
          const h = new Uint8Array(size * size);
          for (let i = 0; i < h.length; i++) h[i] = Math.round(heightArr[i] * 255);
          return {
            ...world,
            size,
            height: encodeBytes(h),
            biome: encodeBytes(biomeArr),
            seaLevel,
          };
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
    // Rebuild only when switching maps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.id]);

  // Push UI changes to the engine.
  useEffect(() => engineRef.current?.setView(view), [view]);
  useEffect(() => engineRef.current?.setTime(time), [time]);

  const segBtn = "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors";

  return (
    <div className="relative h-[34rem] w-full overflow-hidden rounded-card border-2 border-parchment-400/70 bg-leather">
      <div ref={containerRef} className="absolute inset-0" />

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
            {tool !== "look" && tool !== "paint" && (
              <label className="block text-[0.65rem] text-ink-soft">
                Brush size {brushSize}
                <input
                  type="range"
                  min={2}
                  max={24}
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
                className="w-28 accent-brass"
              />
            </label>
            <select
              value={weather}
              onChange={(e) => {
                const w = e.target.value as WorldWeather;
                setWeather(w);
                engineRef.current?.setWeather(w);
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
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const wm = generateWorld({ size: world.size, seed: Math.floor(Math.random() * 99999), seaLevel: sea });
                engineRef.current?.load(wm);
                onUpdate({ world: { ...engineRef.current!.exportWorld() } });
              }}
            >
              Regenerate
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
