"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent, WheelEvent as RWheelEvent } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { CloseIcon } from "@/components/ui/icons";
import { newId, nowISO } from "@/lib/domain/ids";
import { useCombat, useMaps } from "@/lib/data/hooks";
import {
  MATERIAL_MAP,
  MATERIALS,
  THEMES,
  THEME_MAP,
  emptyBattleBuild,
} from "@/lib/battle/materials";
import { PROPS, PROP_MAP } from "@/lib/battle/props";
import type { PropDef } from "@/lib/battle/props";
import {
  brushCells,
  cellCenter,
  cellPolygon,
  mapSize,
  neighbors,
  pixelToCell,
  snapVertex,
} from "@/lib/battle/grid";
import type { BattleBuild, BattleGrid, BattleMap, BattleProp, BattleWall, WallKind } from "@/lib/domain/types";
import type { Material } from "@/lib/battle/materials";

/** Draw all wall segments (shared by live canvas + flatten). */
function drawOneWall(
  ctx: CanvasRenderingContext2D,
  w: BattleWall,
  cp: number,
  opts: { secretAsSolid?: boolean } = {},
) {
  const kind = w.kind ?? "solid";
  const x1 = w.x1 * cp;
  const y1 = w.y1 * cp;
  const x2 = w.x2 * cp;
  const y2 = w.y2 * cp;
  const line = (color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  if (kind === "window") {
    line("#34302b", cp * 0.16);
    line("#9fd3e6", cp * 0.08);
    // iron-bar mullions across the pane
    const dx = x2 - x1;
    const dy = y2 - y1;
    const pl = Math.hypot(dx, dy) || 1;
    const nx = -dy / pl;
    const ny = dx / pl;
    ctx.strokeStyle = "#34302b";
    ctx.lineWidth = cp * 0.04;
    for (const t of [0.3, 0.5, 0.7]) {
      const mx = x1 + dx * t;
      const my = y1 + dy * t;
      ctx.beginPath();
      ctx.moveTo(mx - nx * cp * 0.09, my - ny * cp * 0.09);
      ctx.lineTo(mx + nx * cp * 0.09, my + ny * cp * 0.09);
      ctx.stroke();
    }
  } else if (kind === "door") {
    line("#3a2a18", cp * 0.26);
    line("#8a5a2b", cp * 0.14);
    ctx.fillStyle = "#e6c772";
    const hx = x1 + (x2 - x1) * 0.76;
    const hy = y1 + (y2 - y1) * 0.76;
    ctx.beginPath();
    ctx.arc(hx, hy, cp * 0.05, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // solid / secret base = stone
    line("#332e28", cp * 0.18);
    line("#574f45", cp * 0.07);
    if (kind === "secret" && !opts.secretAsSolid) {
      ctx.save();
      ctx.setLineDash([cp * 0.14, cp * 0.1]);
      line("#c060c0", cp * 0.05);
      ctx.restore();
      ctx.setLineDash([]);
    }
  }
}

function drawWalls(
  ctx: CanvasRenderingContext2D,
  walls: BattleWall[],
  cp: number,
  opts: { secretAsSolid?: boolean } = {},
) {
  if (!walls.length) return;
  ctx.lineCap = "round";
  for (const w of walls) drawOneWall(ctx, w, cp, opts);
  ctx.lineCap = "butt";
}

/** Draw a placed prop (shared by live canvas + flatten). */
function drawProp(ctx: CanvasRenderingContext2D, p: BattleProp, cp: number) {
  const def = PROP_MAP.get(p.kind);
  if (!def) return;
  const sc = p.scale ?? 1;
  const cx = p.x * cp;
  const cy = p.y * cp;
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(cx, cy + cp * 0.14 * sc, cp * 0.42 * sc, cp * 0.18 * sc, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((p.rot ?? 0) * Math.PI) / 180);
  ctx.scale(sc, sc);
  def.draw(ctx, cp);
  ctx.restore();
}

/** A small library thumbnail rendered from a prop's draw function. */
function PropThumb({ def, selected, onClick }: { def: PropDef; selected: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.save();
    ctx.translate(cv.width / 2, cv.height / 2 + 1);
    def.draw(ctx, cv.width * 0.78);
    ctx.restore();
  }, [def]);
  return (
    <button
      onClick={onClick}
      title={def.name}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-md border bg-parchment-50",
        selected ? "border-brass ring-2 ring-brass/40" : "border-parchment-400 hover:border-brass/60",
      )}
    >
      <canvas ref={ref} width={34} height={34} />
    </button>
  );
}

// --- procedural cell rendering (shared by live canvas + flatten) ------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngFor = (c: number, r: number) => mulberry32((c * 374761393 + r * 668265263) >>> 0);

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function paintGrain(ctx: CanvasRenderingContext2D, m: Material, id: string, col: number, row: number, cx: number, cy: number, cp: number) {
  const rnd = rngFor(col, row);
  const count = m.look === "smooth" ? 4 : m.look === "liquid" ? 6 : 12;
  ctx.fillStyle = m.grain;
  for (let i = 0; i < count; i++) {
    const gx = cx + (rnd() - 0.5) * cp * 0.92;
    const gy = cy + (rnd() - 0.5) * cp * 0.92;
    const sz = (m.look === "rough" ? 0.06 : 0.035) * cp * (0.5 + rnd());
    ctx.globalAlpha = 0.14 + rnd() * 0.2;
    ctx.beginPath();
    ctx.arc(gx, gy, sz, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (m.look === "floor" && id === "wood") {
    ctx.strokeStyle = m.grain;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = Math.max(1, cp * 0.02);
    for (let i = 1; i < 3; i++) {
      const ly = cy - cp * 0.4 + (i / 3) * cp * 0.8;
      ctx.beginPath();
      ctx.moveTo(cx - cp * 0.45, ly);
      ctx.lineTo(cx + cp * 0.45, ly);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (m.look === "liquid") {
    ctx.strokeStyle = m.grain;
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = Math.max(1, cp * 0.03);
    const wy = cy + (rnd() - 0.3) * cp * 0.3;
    ctx.beginPath();
    ctx.moveTo(cx - cp * 0.45, wy);
    ctx.quadraticCurveTo(cx, wy - cp * 0.12, cx + cp * 0.45, wy);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawCell(ctx: CanvasRenderingContext2D, grid: BattleGrid, col: number, row: number, cp: number, id: string) {
  const m = MATERIAL_MAP.get(id);
  if (!m) return;
  if (grid === "square") {
    const x = col * cp;
    const y = row * cp;
    ctx.fillStyle = m.color;
    ctx.fillRect(x, y, cp, cp);
    paintGrain(ctx, m, id, col, row, x + cp / 2, y + cp / 2, cp);
    return;
  }
  const c = cellCenter("hex", col, row, cp);
  const poly = cellPolygon("hex", col, row, cp);
  ctx.save();
  ctx.beginPath();
  poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = m.color;
  ctx.fillRect(c.x - cp, c.y - cp, cp * 2, cp * 2);
  paintGrain(ctx, m, id, col, row, c.x, c.y, cp);
  ctx.restore();
}

type Tool = "paint" | "fill" | "erase" | "room" | "wall" | "prop" | "light" | "select" | "pan";

const PROP_CATS: { key: string; label: string }[] = [
  { key: "dungeon", label: "Dungeon" },
  { key: "furniture", label: "Furniture" },
  { key: "nature", label: "Nature" },
  { key: "town", label: "Town" },
  { key: "arcane", label: "Arcane" },
  { key: "hazard", label: "Hazard" },
];

const swatch =
  "h-7 w-7 rounded-md border-2 transition-transform hover:scale-110";

export function BattleMapBuilder({ map, onClose }: { map: BattleMap; onClose: () => void }) {
  const { update } = useMaps();
  const { update: updateCombat } = useCombat();

  const [build, setBuild] = useState<BattleBuild>(() => map.build ?? emptyBattleBuild());
  const [tool, setTool] = useState<Tool>("paint");
  const [material, setMaterial] = useState<string>(() => {
    const t = THEME_MAP.get((map.build ?? emptyBattleBuild()).theme ?? "dungeon");
    return t?.palette[0] ?? "stone";
  });
  const [brush, setBrush] = useState(1);
  const [wallKind, setWallKind] = useState<WallKind>("solid");
  const [showGrid, setShowGrid] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [propKind, setPropKind] = useState<string>("chest");
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const [propCat, setPropCat] = useState("dungeon");
  const [showTrace, setShowTrace] = useState(true);
  const [traceOpacity, setTraceOpacity] = useState(0.5);
  const [isFs, setIsFs] = useState(false);

  const buildRef = useRef(build);
  buildRef.current = build;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const matRef = useRef(material);
  matRef.current = material;
  const brushRef = useRef(brush);
  brushRef.current = brush;
  const wallKindRef = useRef(wallKind);
  wallKindRef.current = wallKind;
  const gridRef = useRef(showGrid);
  gridRef.current = showGrid;
  const propKindRef = useRef(propKind);
  propKindRef.current = propKind;
  const selPropRef = useRef(selectedPropId);
  selPropRef.current = selectedPropId;
  const showTraceRef = useRef(showTrace);
  showTraceRef.current = showTrace;
  const traceOpacityRef = useRef(traceOpacity);
  traceOpacityRef.current = traceOpacity;
  const traceImg = useRef<HTMLImageElement | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const view = useRef({ zoom: 1, panX: 0, panY: 0 });
  const hover = useRef<{ c: number; r: number } | null>(null);
  const renderScheduled = useRef(false);

  // Undo / redo of terrain + prop snapshots.
  type Snap = { tiles: string[]; props: BattleProp[] };
  const undoStack = useRef<Snap[]>([]);
  const redoStack = useRef<Snap[]>([]);
  const [histLen, setHistLen] = useState(0);
  const snapshot = (): Snap => ({
    tiles: buildRef.current.tiles.slice(),
    props: (buildRef.current.props ?? []).map((p) => ({ ...p })),
  });
  const pushUndo = () => {
    undoStack.current.push(snapshot());
    if (undoStack.current.length > 40) undoStack.current.shift();
    redoStack.current = [];
    setHistLen(undoStack.current.length);
  };

  const theme = THEME_MAP.get(build.theme ?? "dungeon") ?? THEMES[0];

  const requestRender = () => {
    if (renderScheduled.current) return;
    renderScheduled.current = true;
    requestAnimationFrame(() => {
      renderScheduled.current = false;
      render();
    });
  };

  function render() {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const b = buildRef.current;
    const cp = b.cellPx;
    const { zoom, panX, panY } = view.current;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#181410";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(zoom, 0, 0, zoom, panX, panY);

    const ms = mapSize(b.grid, b.cols, b.rows, cp);

    // Void area (unpainted map).
    ctx.fillStyle = "#241f1a";
    ctx.fillRect(0, 0, ms.w, ms.h);

    // Reference/trace image under everything.
    if (traceImg.current && showTraceRef.current) {
      ctx.globalAlpha = traceOpacityRef.current;
      ctx.drawImage(traceImg.current, 0, 0, ms.w, ms.h);
      ctx.globalAlpha = 1;
    }

    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        const id = b.tiles[r * b.cols + c];
        if (id) drawCell(ctx, b.grid, c, r, cp, id);
      }
    }

    if (gridRef.current) {
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      if (b.grid === "square") {
        for (let c = 0; c <= b.cols; c++) {
          ctx.moveTo(c * cp, 0);
          ctx.lineTo(c * cp, b.rows * cp);
        }
        for (let r = 0; r <= b.rows; r++) {
          ctx.moveTo(0, r * cp);
          ctx.lineTo(b.cols * cp, r * cp);
        }
      } else {
        for (let r = 0; r < b.rows; r++) {
          for (let c = 0; c < b.cols; c++) {
            const poly = cellPolygon("hex", c, r, cp);
            poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.closePath();
          }
        }
      }
      ctx.stroke();
    }

    // Map border.
    ctx.strokeStyle = "rgba(230,199,114,0.6)";
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(0, 0, ms.w, ms.h);

    // Walls (under props so furniture can sit against them).
    drawWalls(ctx, b.walls ?? [], cp);

    // Props.
    for (const p of b.props ?? []) {
      drawProp(ctx, p, cp);
      if (p.id === selPropRef.current) {
        const sc = p.scale ?? 1;
        ctx.strokeStyle = "rgba(230,199,114,0.95)";
        ctx.lineWidth = 2 / zoom;
        ctx.strokeRect(p.x * cp - cp * 0.5 * sc, p.y * cp - cp * 0.5 * sc, cp * sc, cp * sc);
      }
    }

    // Light glow — warm pools from manual lights and light-emitting props, so the
    // DM previews where the map will be lit in dim/dark combat.
    const allLights: { x: number; y: number; radius: number; color: string }[] = [];
    for (const L of b.lights ?? [])
      allLights.push({ x: L.x, y: L.y, radius: L.radius, color: L.color ?? "#ffcf8a" });
    for (const p of b.props ?? []) {
      const def = PROP_MAP.get(p.kind);
      if (def?.light) allLights.push({ x: p.x, y: p.y, radius: def.light * (p.scale ?? 1), color: def.lightColor ?? "#ffcf8a" });
    }
    if (allLights.length) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const L of allLights) {
        const g = ctx.createRadialGradient(L.x * cp, L.y * cp, L.radius * cp * 0.12, L.x * cp, L.y * cp, L.radius * cp);
        g.addColorStop(0, hexA(L.color, 0.32));
        g.addColorStop(1, hexA(L.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(L.x * cp, L.y * cp, L.radius * cp, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Manual light markers (dot + dashed radius ring) — only when the Light tool is active.
    if (toolRef.current === "light") {
      for (const L of b.lights ?? []) {
        const col = L.color ?? "#ffcf8a";
        ctx.strokeStyle = hexA(col, 0.6);
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([6 / zoom, 8 / zoom]);
        ctx.beginPath();
        ctx.arc(L.x * cp, L.y * cp, L.radius * cp, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(L.x * cp, L.y * cp, cp * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();
      }
    }

    // Brush preview.
    const h = hover.current;
    if (h && (toolRef.current === "paint" || toolRef.current === "erase" || toolRef.current === "fill")) {
      const sz = toolRef.current === "fill" ? 1 : brushRef.current;
      const cells = brushCells(b.grid, h.c, h.r, sz, b.cols, b.rows);
      ctx.strokeStyle = toolRef.current === "erase" ? "rgba(180,60,40,0.9)" : "rgba(230,199,114,0.95)";
      ctx.lineWidth = 2 / zoom;
      ctx.beginPath();
      for (const [c, r] of cells) {
        const poly = cellPolygon(b.grid, c, r, cp);
        poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
      }
      ctx.stroke();
    }

    // Room / wall drag preview.
    const ds = dragStruct.current;
    if (ds) {
      ctx.strokeStyle = "rgba(230,199,114,0.95)";
      if (toolRef.current === "room") {
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.strokeRect(
          Math.min(ds.sx, ds.cx) * cp,
          Math.min(ds.sy, ds.cy) * cp,
          Math.abs(ds.cx - ds.sx) * cp,
          Math.abs(ds.cy - ds.sy) * cp,
        );
        ctx.setLineDash([]);
      } else {
        ctx.lineCap = "round";
        ctx.lineWidth = cp * 0.16;
        ctx.beginPath();
        ctx.moveTo(ds.sx * cp, ds.sy * cp);
        ctx.lineTo(ds.cx * cp, ds.cy * cp);
        ctx.stroke();
        ctx.lineCap = "butt";
      }
    }
  }

  // Fit the map to the viewport on mount + size.
  function fit() {
    const wrap = wrapRef.current;
    const cv = canvasRef.current;
    if (!wrap || !cv) return;
    const w = wrap.clientWidth;
    const hgt = wrap.clientHeight;
    cv.width = w;
    cv.height = hgt;
    const b = buildRef.current;
    const ms = mapSize(b.grid, b.cols, b.rows, b.cellPx);
    const mw = ms.w;
    const mh = ms.h;
    const zoom = Math.min(w / mw, hgt / mh) * 0.92;
    view.current = {
      zoom,
      panX: (w - mw * zoom) / 2,
      panY: (hgt - mh * zoom) / 2,
    };
    requestRender();
  }

  useEffect(() => {
    fit();
    const ro = new ResizeObserver(() => {
      const wrap = wrapRef.current;
      const cv = canvasRef.current;
      if (wrap && cv) {
        cv.width = wrap.clientWidth;
        cv.height = wrap.clientHeight;
        requestRender();
      }
    });
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw the canvas whenever the build or selection changes.
  useEffect(() => {
    requestRender();
  });

  // Load the trace/reference image.
  useEffect(() => {
    if (!build.trace) {
      traceImg.current = null;
      requestRender();
      return;
    }
    const img = new Image();
    img.onload = () => {
      traceImg.current = img;
      requestRender();
    };
    img.src = build.trace;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build.trace]);

  // Track browser fullscreen state.
  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.();
    setTimeout(fit, 120);
  }
  function importImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setBuild({ ...buildRef.current, trace: reader.result as string });
      setDirty(true);
    };
    reader.readAsDataURL(file);
  }

  // --- coordinate + paint helpers ---
  function cellAt(e: { clientX: number; clientY: number }): { c: number; r: number } | null {
    const cv = canvasRef.current;
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    const { zoom, panX, panY } = view.current;
    const wx = (e.clientX - rect.left - panX) / zoom;
    const wy = (e.clientY - rect.top - panY) / zoom;
    const b = buildRef.current;
    const cell = pixelToCell(b.grid, wx, wy, b.cellPx, b.cols, b.rows);
    return cell ? { c: cell.col, r: cell.row } : null;
  }

  function paintAt(c: number, r: number) {
    const b = buildRef.current;
    const id = toolRef.current === "erase" ? "" : matRef.current;
    const sz = brushRef.current;
    const cells = brushCells(b.grid, c, r, sz, b.cols, b.rows);
    const tiles = b.tiles;
    let changed = false;
    for (const [cc, rr] of cells) {
      const idx = rr * b.cols + cc;
      if (tiles[idx] !== id) {
        tiles[idx] = id;
        changed = true;
      }
    }
    // Erasing also clears walls whose midpoint cell is under the brush.
    let walls = b.walls;
    let wallsChanged = false;
    if (id === "" && b.walls?.length) {
      const keys = new Set(cells.map(([cc, rr]) => rr * b.cols + cc));
      const kept = b.walls.filter((w) => {
        const mx = ((w.x1 + w.x2) / 2) * b.cellPx;
        const my = ((w.y1 + w.y2) / 2) * b.cellPx;
        const cell = pixelToCell(b.grid, mx, my, b.cellPx, b.cols, b.rows);
        return !(cell && keys.has(cell.row * b.cols + cell.col));
      });
      if (kept.length !== b.walls.length) {
        walls = kept;
        wallsChanged = true;
      }
    }
    if (changed || wallsChanged) {
      setBuild({ ...b, tiles, ...(wallsChanged ? { walls } : {}) });
      setDirty(true);
    }
  }

  function floodFill(c: number, r: number) {
    const b = buildRef.current;
    const target = b.tiles[r * b.cols + c];
    const replace = matRef.current;
    if (target === replace) return;
    const tiles = b.tiles.slice();
    const stack: [number, number][] = [[c, r]];
    while (stack.length) {
      const [cc, rr] = stack.pop()!;
      if (cc < 0 || rr < 0 || cc >= b.cols || rr >= b.rows) continue;
      const idx = rr * b.cols + cc;
      if (tiles[idx] !== target) continue;
      tiles[idx] = replace;
      for (const [nc, nr] of neighbors(b.grid, cc, rr)) stack.push([nc, nr]);
    }
    setBuild({ ...b, tiles });
    setDirty(true);
  }

  // --- props ---
  function worldPoint(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const cv = canvasRef.current;
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    const { zoom, panX, panY } = view.current;
    const cp = buildRef.current.cellPx;
    return {
      x: (e.clientX - rect.left - panX) / zoom / cp,
      y: (e.clientY - rect.top - panY) / zoom / cp,
    };
  }
  function placeProp(x: number, y: number): string {
    const b = buildRef.current;
    const prop: BattleProp = { id: newId(), kind: propKindRef.current, x, y, rot: 0, scale: 1 };
    setBuild({ ...b, props: [...(b.props ?? []), prop] });
    setSelectedPropId(prop.id);
    setDirty(true);
    return prop.id;
  }
  function propAt(x: number, y: number): BattleProp | null {
    const props = buildRef.current.props ?? [];
    for (let i = props.length - 1; i >= 0; i--) {
      const p = props[i];
      const sc = p.scale ?? 1;
      if (Math.abs(x - p.x) <= 0.55 * sc && Math.abs(y - p.y) <= 0.55 * sc) return p;
    }
    return null;
  }
  function moveProp(id: string, x: number, y: number) {
    setBuild({
      ...buildRef.current,
      props: (buildRef.current.props ?? []).map((p) => (p.id === id ? { ...p, x, y } : p)),
    });
    setDirty(true);
  }
  function patchProp(id: string, patch: Partial<BattleProp>) {
    pushUndo();
    setBuild({
      ...buildRef.current,
      props: (buildRef.current.props ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
    setDirty(true);
  }
  function deleteProp(id: string) {
    pushUndo();
    setBuild({
      ...buildRef.current,
      props: (buildRef.current.props ?? []).filter((p) => p.id !== id),
    });
    setSelectedPropId(null);
    setDirty(true);
  }

  // --- pointer handling ---
  const painting = useRef(false);
  const panning = useRef<{ x: number; y: number } | null>(null);
  const dragProp = useRef<string | null>(null);
  const dragUndo = useRef(false);
  const dragStruct = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);

  function snapCorner(e: { clientX: number; clientY: number }) {
    const wp = worldPoint(e);
    const b = buildRef.current;
    if (!wp) return null;
    return snapVertex(b.grid, wp.x, wp.y, b.cellPx, b.cols, b.rows);
  }

  function onPointerDown(e: RPointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (tool === "pan" || e.button === 1 || e.button === 2) {
      panning.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (tool === "prop") {
      const wp = worldPoint(e);
      const b = buildRef.current;
      if (!wp || wp.x < 0 || wp.y < 0 || wp.x >= b.cols || wp.y >= b.rows) return;
      pushUndo();
      dragProp.current = placeProp(wp.x, wp.y);
      dragUndo.current = true;
      requestRender();
      return;
    }
    if (tool === "light") {
      const wp = worldPoint(e);
      const b = buildRef.current;
      if (!wp || wp.x < 0 || wp.y < 0 || wp.x >= b.cols || wp.y >= b.rows) return;
      const lights = b.lights ?? [];
      const hit = lights.find((L) => Math.hypot(L.x - wp.x, L.y - wp.y) < 0.5);
      setBuild({
        ...b,
        lights: hit
          ? lights.filter((L) => L.id !== hit.id)
          : [...lights, { id: newId(), x: wp.x, y: wp.y, radius: 4, color: "#ffcf8a" }],
      });
      setDirty(true);
      requestRender();
      return;
    }
    if (tool === "select") {
      const wp = worldPoint(e);
      if (!wp) return;
      const p = propAt(wp.x, wp.y);
      setSelectedPropId(p?.id ?? null);
      dragProp.current = p?.id ?? null;
      dragUndo.current = false;
      requestRender();
      return;
    }
    if (tool === "room" || tool === "wall") {
      const s = snapCorner(e);
      if (s) dragStruct.current = { sx: s.x, sy: s.y, cx: s.x, cy: s.y };
      requestRender();
      return;
    }
    const cell = cellAt(e);
    if (!cell) return;
    pushUndo();
    if (tool === "fill") {
      floodFill(cell.c, cell.r);
    } else {
      painting.current = true;
      paintAt(cell.c, cell.r);
    }
    requestRender();
  }

  function onPointerMove(e: RPointerEvent) {
    if (panning.current) {
      const dx = e.clientX - panning.current.x;
      const dy = e.clientY - panning.current.y;
      panning.current = { x: e.clientX, y: e.clientY };
      view.current.panX += dx;
      view.current.panY += dy;
      requestRender();
      return;
    }
    if (dragProp.current) {
      const wp = worldPoint(e);
      if (wp) {
        if (!dragUndo.current) {
          pushUndo();
          dragUndo.current = true;
        }
        moveProp(dragProp.current, wp.x, wp.y);
      }
      requestRender();
      return;
    }
    if (dragStruct.current) {
      const s = snapCorner(e);
      if (s) {
        dragStruct.current.cx = s.x;
        dragStruct.current.cy = s.y;
      }
      requestRender();
      return;
    }
    const cell = cellAt(e);
    hover.current = cell;
    if (painting.current && cell) paintAt(cell.c, cell.r);
    requestRender();
  }

  function onPointerUp() {
    painting.current = false;
    panning.current = null;
    dragProp.current = null;
    dragUndo.current = false;
    const ds = dragStruct.current;
    if (ds) {
      dragStruct.current = null;
      const cMin = Math.min(ds.sx, ds.cx);
      const cMax = Math.max(ds.sx, ds.cx);
      const rMin = Math.min(ds.sy, ds.cy);
      const rMax = Math.max(ds.sy, ds.cy);
      const b = buildRef.current;
      if (toolRef.current === "room" && cMax - cMin > 0.1 && rMax - rMin > 0.1) {
        pushUndo();
        const cp = b.cellPx;
        const tiles = b.tiles.slice();
        // Paint every cell whose centre falls inside the dragged rectangle.
        for (let r = 0; r < b.rows; r++) {
          for (let c = 0; c < b.cols; c++) {
            const ctr = cellCenter(b.grid, c, r, cp);
            if (ctr.x >= cMin * cp && ctr.x <= cMax * cp && ctr.y >= rMin * cp && ctr.y <= rMax * cp) {
              tiles[r * b.cols + c] = matRef.current;
            }
          }
        }
        const add: BattleWall[] = [
          { id: newId(), x1: cMin, y1: rMin, x2: cMax, y2: rMin },
          { id: newId(), x1: cMin, y1: rMax, x2: cMax, y2: rMax },
          { id: newId(), x1: cMin, y1: rMin, x2: cMin, y2: rMax },
          { id: newId(), x1: cMax, y1: rMin, x2: cMax, y2: rMax },
        ];
        setBuild({ ...b, tiles, walls: [...(b.walls ?? []), ...add] });
        setDirty(true);
      } else if (toolRef.current === "wall" && (ds.sx !== ds.cx || ds.sy !== ds.cy)) {
        pushUndo();
        setBuild({
          ...b,
          walls: [
            ...(b.walls ?? []),
            { id: newId(), x1: ds.sx, y1: ds.sy, x2: ds.cx, y2: ds.cy, kind: wallKindRef.current },
          ],
        });
        setDirty(true);
      }
      requestRender();
    }
  }

  function onWheel(e: RWheelEvent) {
    const cv = canvasRef.current;
    if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const v = view.current;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const z = Math.max(0.15, Math.min(6, v.zoom * factor));
    v.panX = mx - (mx - v.panX) * (z / v.zoom);
    v.panY = my - (my - v.panY) * (z / v.zoom);
    v.zoom = z;
    requestRender();
  }

  // --- actions ---
  function undo() {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(snapshot());
    setBuild({ ...buildRef.current, tiles: prev.tiles, props: prev.props });
    setHistLen(undoStack.current.length);
    setDirty(true);
  }
  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(snapshot());
    setBuild({ ...buildRef.current, tiles: next.tiles, props: next.props });
    setHistLen(undoStack.current.length);
    setDirty(true);
  }

  function fillAll() {
    pushUndo();
    setBuild({ ...build, tiles: new Array(build.cols * build.rows).fill(theme.base) });
    setDirty(true);
  }
  function clearAll() {
    pushUndo();
    setBuild({ ...build, tiles: new Array(build.cols * build.rows).fill("") });
    setDirty(true);
  }
  function clearWalls() {
    pushUndo();
    setBuild({ ...build, walls: [] });
    setDirty(true);
  }

  function resize(cols: number, rows: number) {
    cols = Math.max(8, Math.min(80, cols));
    rows = Math.max(8, Math.min(80, rows));
    const b = build;
    const tiles = new Array(cols * rows).fill("");
    for (let r = 0; r < Math.min(rows, b.rows); r++) {
      for (let c = 0; c < Math.min(cols, b.cols); c++) {
        tiles[r * cols + c] = b.tiles[r * b.cols + c];
      }
    }
    pushUndo();
    setBuild({ ...b, cols, rows, tiles });
    setDirty(true);
    setTimeout(fit, 0);
  }

  function setTheme(id: string) {
    const t = THEME_MAP.get(id);
    setBuild({ ...build, theme: id });
    if (t && !t.palette.includes(material)) setMaterial(t.palette[0]);
  }

  function flatten() {
    const b = buildRef.current;
    const cp = b.cellPx;
    const ms = mapSize(b.grid, b.cols, b.rows, cp);
    const off = document.createElement("canvas");
    off.width = Math.ceil(ms.w);
    off.height = Math.ceil(ms.h);
    const ctx = off.getContext("2d")!;
    ctx.fillStyle = "#1d1916";
    ctx.fillRect(0, 0, off.width, off.height);
    if (traceImg.current) ctx.drawImage(traceImg.current, 0, 0, off.width, off.height);
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        const id = b.tiles[r * b.cols + c];
        if (id) drawCell(ctx, b.grid, c, r, cp, id);
      }
    }
    // Bake the hex grid into the image (the combat board only draws square grids).
    if (b.grid === "hex") {
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let r = 0; r < b.rows; r++) {
        for (let c = 0; c < b.cols; c++) {
          const poly = cellPolygon("hex", c, r, cp);
          poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
          ctx.closePath();
        }
      }
      ctx.stroke();
    }
    // Bake static walls only — doors render live on the War Table (open/closed),
    // and secret doors bake as plain stone so players can't spot them.
    drawWalls(
      ctx,
      (b.walls ?? []).filter((w) => (w.kind ?? "solid") !== "door"),
      cp,
      { secretAsSolid: true },
    );
    for (const p of b.props ?? []) drawProp(ctx, p, cp);
    return { dataUrl: off.toDataURL("image/png"), width: off.width, height: off.height };
  }

  function save() {
    const b = buildRef.current;
    const cp = b.cellPx;
    const { dataUrl, width, height } = flatten();
    // Export lights (cell coords → image px) so dim/dark combat is pre-lit:
    // manual Light-tool placements + every light-emitting prop (brazier, campfire…).
    const lights = [
      ...(b.lights ?? []).map((L) => ({
        id: L.id,
        x: L.x * cp,
        y: L.y * cp,
        radius: L.radius * cp,
        color: L.color,
      })),
      ...(b.props ?? []).flatMap((p) => {
        const def = PROP_MAP.get(p.kind);
        if (!def?.light) return [];
        return [{
          id: `pl-${p.id}`,
          x: p.x * cp,
          y: p.y * cp,
          radius: def.light * (p.scale ?? 1) * cp,
          color: def.lightColor ?? "#ffcf8a",
        }];
      }),
    ];
    void update(map.id, {
      imageUrl: dataUrl,
      width,
      height,
      gridSize: cp,
      // Square maps let the combat board draw the grid; hex bakes its own.
      showGrid: b.grid === "square",
      feetPerCell: map.feetPerCell ?? 5,
      // Export walls (cell coords → image px) so combat line-of-sight works.
      // Doors start closed; kind drives sight + the War Table door toggle.
      walls: (b.walls ?? []).map((w) => ({
        id: w.id,
        x1: w.x1 * cp,
        y1: w.y1 * cp,
        x2: w.x2 * cp,
        y2: w.y2 * cp,
        kind: w.kind ?? "solid",
        open: false,
      })),
      lights,
      build: { ...b, updatedAt: nowISO() },
    });
    setDirty(false);
  }

  function sendToWarTable() {
    save();
    void updateCombat({ activeMapId: map.id });
    onClose();
  }

  return (
    <div ref={rootRef} className="fixed inset-0 z-[70] flex flex-col bg-ink">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-parchment-400/30 bg-parchment-100 px-4 py-2">
        <span className="font-display text-sm font-bold text-ink">{map.name} — Battle Builder</span>
        {dirty && <span className="text-xs text-oxblood">unsaved</span>}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={toggleFullscreen}>
            {isFs ? "⤡ Exit" : "⤢ Fullscreen"}
          </Button>
          <Button size="sm" variant="secondary" onClick={fit}>Fit</Button>
          <Button size="sm" variant="secondary" onClick={save}>Save map</Button>
          <Button size="sm" onClick={sendToWarTable} title="Save and bring this map to the War Table">
            Open in War Table
          </Button>
          <button
            onClick={onClose}
            aria-label="Close builder"
            className="rounded-md p-1.5 text-ink-faint hover:bg-parchment-300/60 hover:text-ink"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Toolbar */}
        <div className="w-56 shrink-0 space-y-3 overflow-y-auto border-r border-parchment-400/30 bg-parchment-100/95 p-3 text-sm">
          <div>
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Tools</p>
            <div className="grid grid-cols-3 gap-1">
              {([["paint", "Paint"], ["fill", "Fill"], ["erase", "Erase"], ["room", "Room"], ["wall", "Wall"], ["prop", "Prop"], ["light", "Light"], ["select", "Select"], ["pan", "Pan"]] as [Tool, string][]).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setTool(t)}
                  className={cn(
                    "rounded-md border px-1 py-1.5 text-[0.7rem] font-semibold",
                    tool === t ? "border-brass bg-brass/20 text-brass-dark" : "border-parchment-400 text-ink-soft hover:bg-parchment-300/50",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {(tool === "room" || tool === "wall") && (
              <p className="mt-1 text-[0.65rem] text-ink-faint">
                {tool === "room" ? "Drag a rectangle → floor + walls." : "Drag corner to corner → a wall."}
              </p>
            )}
            {tool === "select" && (
              <p className="mt-1 text-[0.65rem] text-ink-faint">Click a prop to select &amp; drag it.</p>
            )}
          </div>

          <div>
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Brush size</p>
            <div className="flex gap-1">
              {[1, 2, 3, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setBrush(s)}
                  className={cn(
                    "h-7 flex-1 rounded-md border text-xs font-semibold",
                    brush === s ? "border-brass bg-brass/20 text-brass-dark" : "border-parchment-400 text-ink-soft hover:bg-parchment-300/50",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Theme</p>
            <select
              value={build.theme ?? "dungeon"}
              onChange={(e) => setTheme(e.target.value)}
              className="h-8 w-full rounded-md border border-parchment-400 bg-parchment-50 px-1 text-xs text-ink focus:border-brass focus:outline-none"
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Grid</p>
            <div className="flex gap-1">
              {(["square", "hex"] as BattleGrid[]).map((g) => (
                <button
                  key={g}
                  onClick={() => {
                    setBuild({ ...build, grid: g });
                    setTimeout(fit, 0);
                  }}
                  className={cn(
                    "h-7 flex-1 rounded-md border text-xs font-semibold capitalize",
                    build.grid === g ? "border-brass bg-brass/20 text-brass-dark" : "border-parchment-400 text-ink-soft hover:bg-parchment-300/50",
                  )}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Materials</p>
            <div className="flex flex-wrap gap-1.5">
              {theme.palette.map((id) => {
                const m = MATERIAL_MAP.get(id);
                if (!m) return null;
                return (
                  <button
                    key={id}
                    title={m.name}
                    onClick={() => {
                      setMaterial(id);
                      if (tool === "erase") setTool("paint");
                    }}
                    style={{ background: m.color }}
                    className={cn(swatch, material === id ? "border-brass ring-2 ring-brass/40" : "border-ink/20")}
                  />
                );
              })}
            </div>
            <p className="mt-1 text-[0.65rem] text-ink-faint">{MATERIAL_MAP.get(material)?.name}</p>
            <details className="mt-1">
              <summary className="cursor-pointer text-[0.65rem] text-ink-faint">All materials…</summary>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {MATERIALS.map((m) => (
                  <button
                    key={m.id}
                    title={m.name}
                    onClick={() => { setMaterial(m.id); if (tool === "erase") setTool("paint"); }}
                    style={{ background: m.color }}
                    className={cn(swatch, material === m.id ? "border-brass ring-2 ring-brass/40" : "border-ink/20")}
                  />
                ))}
              </div>
            </details>
          </div>

          {tool === "wall" && (
            <div className="space-y-1.5 border-t border-parchment-400/40 pt-2">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Wall type</p>
              <div className="grid grid-cols-2 gap-1">
                {([["solid", "Solid"], ["door", "Door"], ["window", "Window"], ["secret", "Secret"]] as [WallKind, string][]).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setWallKind(k)}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-semibold transition-colors",
                      wallKind === k ? "bg-oxblood text-parchment-50" : "bg-parchment-50 text-ink-soft hover:bg-parchment-300/60",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[0.6rem] text-ink-faint">
                {wallKind === "door" && "Blocks sight & movement; the DM toggles it open in the War Table."}
                {wallKind === "window" && "Blocks movement but not sight, and lets light through (iron bars)."}
                {wallKind === "secret" && "Looks like solid wall to players; only the DM can open it."}
                {wallKind === "solid" && "Full wall — blocks sight and movement."}
              </p>
              <p className="text-[0.6rem] text-ink-faint">Drag along a cell edge. Leave a gap in a wall to fit a door or window.</p>
            </div>
          )}

          {tool === "prop" && (
            <div className="border-t border-parchment-400/40 pt-2">
              <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Props</p>
              <div className="mb-1.5 flex flex-wrap gap-1">
                {PROP_CATS.map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setPropCat(cat.key)}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[0.6rem] font-semibold",
                      propCat === cat.key ? "bg-brass/20 text-brass-dark" : "text-ink-soft hover:bg-parchment-300/50",
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {PROPS.filter((p) => p.category === propCat).map((def) => (
                  <PropThumb key={def.id} def={def} selected={propKind === def.id} onClick={() => setPropKind(def.id)} />
                ))}
              </div>
              <p className="mt-1 text-[0.65rem] text-ink-faint">
                {PROP_MAP.get(propKind)?.name} — click the map to place
              </p>
            </div>
          )}

          {tool === "light" && (
            <div className="space-y-1.5 border-t border-parchment-400/40 pt-2">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Light sources</p>
              <p className="text-[0.65rem] text-ink-faint">
                Click to drop a warm light (radius ~4 cells); click an existing light to remove it. Braziers &amp;
                campfires already glow. Lights only matter when the War Table is set to <em>Dim</em> or <em>Dark</em>.
              </p>
              {(build.lights ?? []).length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => { setBuild({ ...build, lights: [] }); setDirty(true); }}
                >
                  Clear lights ({(build.lights ?? []).length})
                </Button>
              )}
            </div>
          )}

          {tool === "select" &&
            selectedPropId &&
            (() => {
              const p = (build.props ?? []).find((x) => x.id === selectedPropId);
              if (!p) return null;
              return (
                <div className="space-y-1.5 border-t border-parchment-400/40 pt-2">
                  <p className="text-xs font-semibold text-ink">{PROP_MAP.get(p.kind)?.name}</p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" className="flex-1" title="Rotate left" onClick={() => patchProp(p.id, { rot: (p.rot ?? 0) - 15 })}>⟲</Button>
                    <Button size="sm" variant="secondary" className="flex-1" title="Rotate right" onClick={() => patchProp(p.id, { rot: (p.rot ?? 0) + 15 })}>⟳</Button>
                    <Button size="sm" variant="secondary" className="flex-1" title="Smaller" onClick={() => patchProp(p.id, { scale: Math.max(0.4, (p.scale ?? 1) - 0.2) })}>−</Button>
                    <Button size="sm" variant="secondary" className="flex-1" title="Bigger" onClick={() => patchProp(p.id, { scale: Math.min(3, (p.scale ?? 1) + 0.2) })}>＋</Button>
                  </div>
                  <Button size="sm" variant="danger" className="w-full" onClick={() => deleteProp(p.id)}>Delete prop</Button>
                </div>
              );
            })()}

          <div className="space-y-1.5 border-t border-parchment-400/40 pt-2">
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" className="flex-1" onClick={undo} disabled={histLen === 0}>Undo</Button>
              <Button size="sm" variant="secondary" className="flex-1" onClick={redo} disabled={redoStack.current.length === 0}>Redo</Button>
            </div>
            <Button size="sm" variant="secondary" className="w-full" onClick={fillAll}>Fill all ({theme.base})</Button>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="flex-1" onClick={clearAll}>Clear tiles</Button>
              <Button size="sm" variant="ghost" className="flex-1" onClick={clearWalls}>Clear walls</Button>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-ink-soft">
              <input type="checkbox" checked={showGrid} onChange={(e) => { setShowGrid(e.target.checked); requestRender(); }} />
              Show grid
            </label>
          </div>

          <div className="border-t border-parchment-400/40 pt-2">
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Map size (cells)</p>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={8}
                max={80}
                defaultValue={build.cols}
                key={`cols-${build.cols}`}
                onBlur={(e) => resize(Number(e.target.value) || build.cols, build.rows)}
                className="h-8 w-16 rounded-md border border-parchment-400 bg-parchment-50 px-1 text-xs text-ink focus:border-brass focus:outline-none"
              />
              <span className="text-xs text-ink-faint">×</span>
              <input
                type="number"
                min={8}
                max={80}
                defaultValue={build.rows}
                key={`rows-${build.rows}`}
                onBlur={(e) => resize(build.cols, Number(e.target.value) || build.rows)}
                className="h-8 w-16 rounded-md border border-parchment-400 bg-parchment-50 px-1 text-xs text-ink focus:border-brass focus:outline-none"
              />
            </div>
          </div>

          <div className="border-t border-parchment-400/40 pt-2">
            <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Reference image</p>
            {build.trace ? (
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                  <input type="checkbox" checked={showTrace} onChange={(e) => setShowTrace(e.target.checked)} />
                  Show under map
                </label>
                <label className="block text-[0.65rem] text-ink-soft">
                  Opacity
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={traceOpacity}
                    onChange={(e) => setTraceOpacity(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
                <Button size="sm" variant="ghost" className="w-full" onClick={() => { setBuild({ ...build, trace: undefined }); setDirty(true); }}>
                  Remove image
                </Button>
              </div>
            ) : (
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importImage(f);
                }}
                className="block w-full text-[0.65rem] text-ink-soft file:mr-2 file:rounded file:border file:border-parchment-400 file:bg-parchment-50 file:px-2 file:py-1 file:text-[0.65rem] file:font-semibold file:text-ink"
              />
            )}
            <p className="mt-1 text-[0.6rem] text-ink-faint">Trace or build over a map image (stretched to the grid; baked into the saved map).</p>
          </div>
        </div>

        {/* Canvas */}
        <div ref={wrapRef} className="relative min-w-0 flex-1 overflow-hidden bg-ink">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={() => { hover.current = null; onPointerUp(); requestRender(); }}
            onWheel={onWheel}
            onContextMenu={(e) => e.preventDefault()}
            className={cn("h-full w-full touch-none", tool === "pan" ? "cursor-grab" : "cursor-crosshair")}
          />
        </div>
      </div>
    </div>
  );
}
