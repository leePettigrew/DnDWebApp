"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent, WheelEvent as RWheelEvent } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { CloseIcon } from "@/components/ui/icons";
import { newId, nowISO } from "@/lib/domain/ids";
import { useMaps } from "@/lib/data/hooks";
import {
  MATERIAL_MAP,
  MATERIALS,
  THEMES,
  THEME_MAP,
  emptyBattleBuild,
} from "@/lib/battle/materials";
import { PROPS, PROP_MAP } from "@/lib/battle/props";
import type { PropDef } from "@/lib/battle/props";
import type { BattleBuild, BattleMap, BattleProp } from "@/lib/domain/types";

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

function drawCell(ctx: CanvasRenderingContext2D, c: number, r: number, cp: number, id: string) {
  const m = MATERIAL_MAP.get(id);
  if (!m) return;
  const x = c * cp;
  const y = r * cp;
  ctx.fillStyle = m.color;
  ctx.fillRect(x, y, cp, cp);

  const rnd = rngFor(c, r);
  const count = m.look === "smooth" ? 4 : m.look === "liquid" ? 6 : 12;
  ctx.fillStyle = m.grain;
  for (let i = 0; i < count; i++) {
    const gx = x + rnd() * cp;
    const gy = y + rnd() * cp;
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
      const ly = y + (i / 3) * cp;
      ctx.beginPath();
      ctx.moveTo(x, ly);
      ctx.lineTo(x + cp, ly);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (m.look === "liquid") {
    ctx.strokeStyle = m.grain;
    ctx.globalAlpha = 0.32;
    ctx.lineWidth = Math.max(1, cp * 0.03);
    const wy = y + cp * (0.3 + rnd() * 0.4);
    ctx.beginPath();
    ctx.moveTo(x, wy);
    ctx.quadraticCurveTo(x + cp / 2, wy - cp * 0.12, x + cp, wy);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

type Tool = "paint" | "fill" | "erase" | "prop" | "select" | "pan";

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

  const [build, setBuild] = useState<BattleBuild>(() => map.build ?? emptyBattleBuild());
  const [tool, setTool] = useState<Tool>("paint");
  const [material, setMaterial] = useState<string>(() => {
    const t = THEME_MAP.get((map.build ?? emptyBattleBuild()).theme ?? "dungeon");
    return t?.palette[0] ?? "stone";
  });
  const [brush, setBrush] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [propKind, setPropKind] = useState<string>("chest");
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const [propCat, setPropCat] = useState("dungeon");

  const buildRef = useRef(build);
  buildRef.current = build;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const matRef = useRef(material);
  matRef.current = material;
  const brushRef = useRef(brush);
  brushRef.current = brush;
  const gridRef = useRef(showGrid);
  gridRef.current = showGrid;
  const propKindRef = useRef(propKind);
  propKindRef.current = propKind;
  const selPropRef = useRef(selectedPropId);
  selPropRef.current = selectedPropId;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
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

    // Void area (unpainted map).
    ctx.fillStyle = "#241f1a";
    ctx.fillRect(0, 0, b.cols * cp, b.rows * cp);

    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        const id = b.tiles[r * b.cols + c];
        if (id) drawCell(ctx, c, r, cp, id);
      }
    }

    if (gridRef.current) {
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.lineWidth = 1 / zoom;
      ctx.beginPath();
      for (let c = 0; c <= b.cols; c++) {
        ctx.moveTo(c * cp, 0);
        ctx.lineTo(c * cp, b.rows * cp);
      }
      for (let r = 0; r <= b.rows; r++) {
        ctx.moveTo(0, r * cp);
        ctx.lineTo(b.cols * cp, r * cp);
      }
      ctx.stroke();
    }

    // Map border.
    ctx.strokeStyle = "rgba(230,199,114,0.6)";
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(0, 0, b.cols * cp, b.rows * cp);

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

    // Brush preview.
    const h = hover.current;
    if (h && (toolRef.current === "paint" || toolRef.current === "erase" || toolRef.current === "fill")) {
      const sz = toolRef.current === "fill" ? 1 : brushRef.current;
      const off = Math.floor((sz - 1) / 2);
      ctx.strokeStyle = toolRef.current === "erase" ? "rgba(180,60,40,0.9)" : "rgba(230,199,114,0.95)";
      ctx.lineWidth = 2 / zoom;
      ctx.strokeRect((h.c - off) * cp, (h.r - off) * cp, sz * cp, sz * cp);
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
    const mw = b.cols * b.cellPx;
    const mh = b.rows * b.cellPx;
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

  // --- coordinate + paint helpers ---
  function cellAt(e: { clientX: number; clientY: number }): { c: number; r: number } | null {
    const cv = canvasRef.current;
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    const { zoom, panX, panY } = view.current;
    const wx = (e.clientX - rect.left - panX) / zoom;
    const wy = (e.clientY - rect.top - panY) / zoom;
    const cp = buildRef.current.cellPx;
    const c = Math.floor(wx / cp);
    const r = Math.floor(wy / cp);
    const b = buildRef.current;
    if (c < 0 || r < 0 || c >= b.cols || r >= b.rows) return null;
    return { c, r };
  }

  function paintAt(c: number, r: number) {
    const b = buildRef.current;
    const id = toolRef.current === "erase" ? "" : matRef.current;
    const sz = brushRef.current;
    const off = Math.floor((sz - 1) / 2);
    const tiles = b.tiles;
    let changed = false;
    for (let dr = 0; dr < sz; dr++) {
      for (let dc = 0; dc < sz; dc++) {
        const cc = c - off + dc;
        const rr = r - off + dr;
        if (cc < 0 || rr < 0 || cc >= b.cols || rr >= b.rows) continue;
        const idx = rr * b.cols + cc;
        if (tiles[idx] !== id) {
          tiles[idx] = id;
          changed = true;
        }
      }
    }
    if (changed) {
      setBuild({ ...b, tiles });
      setDirty(true);
    }
  }

  function floodFill(c: number, r: number) {
    const b = buildRef.current;
    const target = b.tiles[r * b.cols + c];
    const replace = matRef.current;
    if (target === replace) return;
    const tiles = b.tiles.slice();
    const stack = [[c, r]];
    while (stack.length) {
      const [cc, rr] = stack.pop()!;
      if (cc < 0 || rr < 0 || cc >= b.cols || rr >= b.rows) continue;
      const idx = rr * b.cols + cc;
      if (tiles[idx] !== target) continue;
      tiles[idx] = replace;
      stack.push([cc + 1, rr], [cc - 1, rr], [cc, rr + 1], [cc, rr - 1]);
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
    const off = document.createElement("canvas");
    off.width = b.cols * cp;
    off.height = b.rows * cp;
    const ctx = off.getContext("2d")!;
    ctx.fillStyle = "#1d1916";
    ctx.fillRect(0, 0, off.width, off.height);
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) {
        const id = b.tiles[r * b.cols + c];
        if (id) drawCell(ctx, c, r, cp, id);
      }
    }
    for (const p of b.props ?? []) drawProp(ctx, p, cp);
    return { dataUrl: off.toDataURL("image/png"), width: off.width, height: off.height };
  }

  function save() {
    const b = buildRef.current;
    const { dataUrl, width, height } = flatten();
    void update(map.id, {
      imageUrl: dataUrl,
      width,
      height,
      gridSize: b.cellPx,
      showGrid: true,
      feetPerCell: map.feetPerCell ?? 5,
      build: { ...b, updatedAt: nowISO() },
    });
    setDirty(false);
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-ink">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-parchment-400/30 bg-parchment-100 px-4 py-2">
        <span className="font-display text-sm font-bold text-ink">{map.name} — Battle Builder</span>
        {dirty && <span className="text-xs text-oxblood">unsaved</span>}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={fit}>Fit</Button>
          <Button size="sm" onClick={save}>Save map</Button>
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
              {([["paint", "Paint"], ["fill", "Fill"], ["erase", "Erase"], ["prop", "Prop"], ["select", "Select"], ["pan", "Pan"]] as [Tool, string][]).map(([t, label]) => (
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
            <Button size="sm" variant="ghost" className="w-full" onClick={clearAll}>Clear</Button>
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
