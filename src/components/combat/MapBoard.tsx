"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/components/ui/cn";
import { useCombat, useMapPings, useMaps, useRealtime } from "@/lib/data/hooks";
import type {
  AoeTemplate,
  BattleMap,
  CombatState,
  MapAnnotation,
  MapLight,
  MapToken,
  Wall,
} from "@/lib/domain/types";
import { TOKEN_SIZE_CELLS } from "@/lib/domain/types";
import * as Combat from "@/lib/combat/state";
import { WeatherLayer } from "./WeatherLayer";
import { newId } from "@/lib/domain/ids";
import {
  clamp,
  dist,
  feetBetween,
  screenToMap,
  snapToCellCenter,
  type Pt,
  type View,
} from "@/lib/map/geometry";
import {
  computeVisibilityMask,
  isVisibleAt,
  paintFog,
} from "@/lib/map/fog";

type Tool = "select" | "pan" | "target" | "wall" | "light" | "aoe" | "draw" | "erase" | "ruler" | "ping";
type AoeShape = "circle" | "cone" | "line";

/** What the Target tool hands the roll card when an attack is lined up. */
export interface TargetPick {
  attackerTokenId: string;
  targetTokenId: string;
  feet: number;
  losBlocked: boolean;
}

const DRAW_COLOR = "#E6C772";

const ALL_TOOLS: { key: Tool; label: string; dm?: boolean }[] = [
  { key: "select", label: "Move" },
  { key: "pan", label: "Pan" },
  { key: "target", label: "Target" },
  { key: "ruler", label: "Ruler" },
  { key: "ping", label: "Ping" },
  { key: "wall", label: "Wall", dm: true },
  { key: "light", label: "Light", dm: true },
  { key: "aoe", label: "AoE", dm: true },
  { key: "draw", label: "Draw", dm: true },
  { key: "erase", label: "Erase", dm: true },
];

/** Icon glyphs for the fullscreen HUD's slim tool strip. */
const TOOL_ICONS: Record<Tool, string> = {
  select: "✥",
  pan: "✋",
  target: "🎯",
  ruler: "📏",
  ping: "📍",
  wall: "🧱",
  light: "🔥",
  aoe: "⌖",
  draw: "✎",
  erase: "⌫",
};

function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/** Do segments a1→a2 and b1→b2 properly intersect? (for wall blocking) */
function segsCross(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
  const d = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = d(b1, b2, a1);
  const d2 = d(b1, b2, a2);
  const d3 = d(a1, a2, b1);
  const d4 = d(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Cells-per-side a token occupies (medium 1, large 2, huge 3…). */
export function tokenCells(t: MapToken): number {
  return TOKEN_SIZE_CELLS[t.size ?? "medium"] ?? 1;
}

/** Effective on-map radius: size × grid when a grid exists, else stored px. */
function tokenR(t: MapToken, grid: number): number {
  if (!grid) return t.radius;
  return grid * tokenCells(t) * 0.46;
}

/** Size-aware grid snap: odd-cell tokens sit on cell centers, even-cell
 *  tokens (Large 2×2, Gargantuan 4×4) sit on cell intersections. Honors the
 *  map's grid offset so snapping matches a shifted/aligned grid. */
export function snapTokenPos(p: Pt, grid: number, cells: number, ox = 0, oy = 0): Pt {
  if (!grid) return p;
  const x = p.x - ox;
  const y = p.y - oy;
  const even = cells >= 1 && Math.round(cells) % 2 === 0;
  if (even) {
    return { x: ox + Math.round(x / grid) * grid, y: oy + Math.round(y / grid) * grid };
  }
  return {
    x: ox + (Math.floor(x / grid) + 0.5) * grid,
    y: oy + (Math.floor(y / grid) + 0.5) * grid,
  };
}

/** SVG polygon points for a cone or line AoE template (D&D geometry). */
function aoePolygon(t: AoeTemplate): string {
  const ang = t.angle ?? 0;
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const px = -dy;
  const py = dx;
  const fx = t.x + dx * t.size;
  const fy = t.y + dy * t.size;
  if (t.shape === "cone") {
    const h = t.size / 2; // far edge width = length (5e cone)
    return `${t.x},${t.y} ${fx + px * h},${fy + py * h} ${fx - px * h},${fy - py * h}`;
  }
  const w = (t.width ?? 0) / 2;
  return `${t.x + px * w},${t.y + py * w} ${fx + px * w},${fy + py * w} ${fx - px * w},${fy - py * w} ${t.x - px * w},${t.y - py * w}`;
}

/** At-a-glance glyphs for the 5e conditions, drawn as badges above a token. */
const CONDITION_ICON: Record<string, string> = {
  blinded: "🙈",
  charmed: "💗",
  deafened: "🔇",
  exhaustion: "😩",
  frightened: "😱",
  grappled: "🤼",
  incapacitated: "💫",
  invisible: "👻",
  paralyzed: "🌀",
  petrified: "🗿",
  poisoned: "🤢",
  prone: "⬇️",
  restrained: "⛓️",
  stunned: "⭐",
  unconscious: "💤",
  concentration: "🧠",
};

/** A map annotation rendered on the board: label, numbered marker, or DM note. */
function AnnotationMark({ a, grid }: { a: MapAnnotation; grid: number }) {
  const fs = Math.max(13, grid * (a.kind === "label" ? 0.42 : 0.34));
  if (a.kind === "marker") {
    const r = grid ? grid * 0.3 : 18;
    return (
      <g transform={`translate(${a.x}, ${a.y})`}>
        <circle r={r} fill={a.color ?? "#E6C772"} stroke="#0E0A06" strokeWidth={2} />
        <text textAnchor="middle" dominantBaseline="central" fontSize={fs} fontWeight={700} fill="#0E0A06">
          {a.text}
        </text>
      </g>
    );
  }
  if (a.kind === "note") {
    return (
      <g transform={`translate(${a.x}, ${a.y})`}>
        <circle r={grid ? grid * 0.16 : 8} fill="#c060c0" stroke="#0E0A06" strokeWidth={1.5} />
        <text
          x={grid ? grid * 0.26 : 12}
          dominantBaseline="central"
          fontSize={fs * 0.8}
          fontStyle="italic"
          fill="#e0a0e0"
          stroke="#0E0A06"
          strokeWidth={Math.max(2, grid * 0.02)}
          paintOrder="stroke"
        >
          {a.text}
        </text>
      </g>
    );
  }
  return (
    <text
      x={a.x}
      y={a.y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={fs}
      fontWeight={700}
      fill={a.color ?? "#F5E9CF"}
      stroke="#0E0A06"
      strokeWidth={Math.max(2, grid * 0.03)}
      paintOrder="stroke"
    >
      {a.text}
    </text>
  );
}

export function MapBoard({
  map,
  combat,
  isDM,
  userId,
  fillHeight = false,
  chrome = "panel",
  onSelectToken,
  onTarget,
  onProvoke,
  onAimChange,
  lockedAttackerId = null,
  lockedTargetId = null,
  onViewChange,
  shortcuts = false,
}: {
  map: BattleMap;
  combat: CombatState | null;
  isDM: boolean;
  userId: string | null;
  /** Fill the parent (fullscreen War Table) instead of the 62vh panel. */
  fillHeight?: boolean;
  /** "panel": the classic floating toolbars; "hud": slim dark icon strip
   *  (zoom folded in) for the fullscreen War Table's docked frame. */
  chrome?: "panel" | "hud";
  /** Fired when the user picks (or clears) a token with the Move tool. */
  onSelectToken?: (id: string | null) => void;
  /** Enables the Target tool: fired when attacker → target is lined up. */
  onTarget?: (pick: TargetPick) => void;
  /** Fired when a token's move leaves an enemy's melee reach (opportunity attack). */
  onProvoke?: (p: { moverTokenId: string; enemyTokenIds: string[] }) => void;
  /** Reports the Target tool's lined-up attacker (null when not aiming). */
  onAimChange?: (attackerTokenId: string | null) => void;
  /** A locked engagement to draw persistently (attacker → target). */
  lockedAttackerId?: string | null;
  /** The locked-on target of the current engagement. */
  lockedTargetId?: string | null;
  /** Reports camera + viewport so a parent can draw a minimap. */
  onViewChange?: (view: View, viewport: { w: number; h: number }) => void;
  /** Enable keyboard shortcuts (1-9 tools, +/- zoom, F fit, Ctrl+Z undo). */
  shortcuts?: boolean;
}) {
  const realtime = useRealtime();
  const { update: updateMap } = useMaps();
  const { update: updateCombat } = useCombat();
  const pings = useMapPings();

  const containerRef = useRef<HTMLDivElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const tempRef = useRef<HTMLCanvasElement | null>(null);
  const litRef = useRef<HTMLCanvasElement | null>(null);
  const exploredRef = useRef<HTMLCanvasElement | null>(null);

  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const imgSizeRef = useRef(imgSize);
  imgSizeRef.current = imgSize;
  const [view, setView] = useState<View>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [tool, setTool] = useState<Tool>("select");
  const [dmPreview, setDmPreview] = useState(false);
  const [drag, setDrag] = useState<{ id: string; pos: Pt } | null>(null);
  const [ruler, setRuler] = useState<{ from: Pt; to: Pt } | null>(null);
  const [pending, setPending] = useState<
    | { kind: "wall"; from: Pt; to: Pt }
    | { kind: "draw"; points: number[] }
    | null
  >(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [speedDenied, setSpeedDenied] = useState<{ id: string; at: number } | null>(null);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [attackerId, setAttackerId] = useState<string | null>(null);
  const [aimPos, setAimPos] = useState<Pt | null>(null);
  const [showAnnos, setShowAnnos] = useState(true);
  const [aoeShape, setAoeShape] = useState<AoeShape>("circle");
  const [aoeFeet, setAoeFeet] = useState(20);
  const [aoe, setAoe] = useState<AoeTemplate | null>(null);

  const gesture = useRef<
    | { mode: "pan"; lastX: number; lastY: number }
    | { mode: "token"; id: string; grab: Pt }
    | { mode: "wall"; from: Pt }
    | { mode: "draw" }
    | { mode: "ruler"; from: Pt }
    | { mode: "aoe"; origin: Pt }
    | null
  >(null);

  const grid = map.gridSize ?? 0;
  const gridOx = map.gridOffsetX ?? 0;
  const gridOy = map.gridOffsetY ?? 0;
  const feetPerCell = map.feetPerCell ?? 5;
  const fogEnabled = map.fogEnabled ?? false;
  const lightLevel = map.lightLevel ?? "bright";
  const lights = useMemo(() => map.lights ?? [], [map.lights]);
  const tokens = map.tokens ?? [];
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const walls = map.walls ?? [];
  // Only these block line of sight: solid walls, plus closed doors / secret
  // doors. Windows (and open doors) let sight + light pass straight through.
  const sightWalls = useMemo(
    () =>
      walls.filter((w) => {
        const k = w.kind ?? "solid";
        if (k === "window") return false;
        if (k === "door" || k === "secret") return !w.open;
        return true;
      }),
    [walls],
  );
  // Walls that stop MOVEMENT: solid, windows/bars, and closed doors. Open
  // doors let creatures through; sight is a separate (sightWalls) filter.
  const moveWalls = useMemo(
    () =>
      walls.filter((w) => {
        const k = w.kind ?? "solid";
        if (k === "door" || k === "secret") return !w.open;
        return true; // solid + window both block movement
      }),
    [walls],
  );
  const drawings = map.drawings ?? [];
  const templates = map.templates ?? [];
  const annotations = map.annotations ?? [];
  const portals = map.portals ?? [];
  const pxPerFoot = grid > 0 ? grid / feetPerCell : 12;
  const autoCost = map.autoTerrainCost ?? false;
  const enforceWalls = map.enforceWalls ?? false;
  const enforceSpeed = map.enforceSpeed ?? "off";
  // Speed budgets only exist while combat runs — outside it movement is free
  // (otherwise movedFt would accumulate forever with nothing to reset it).
  const speedActive = enforceSpeed !== "off" && (combat?.active ?? false);
  const weather = map.weather ?? "none";
  const difficultAt = useMemo(() => {
    const tc = map.terrainCost;
    if (!tc) return null;
    return (px: number, py: number) => {
      const c = Math.floor(px / tc.cell);
      const r = Math.floor(py / tc.cell);
      if (c < 0 || r < 0 || c >= tc.cols || r >= tc.rows) return false;
      return tc.cells[r * tc.cols + c] === "1";
    };
  }, [map.terrainCost]);

  /** Feet spent moving from→to (rounded to 5 ft). When auto terrain cost is on,
   *  cells of difficult terrain along the path count double. */
  function pathFeet(from: Pt, to: Pt): number {
    if (!grid) return Math.round(dist(from, to));
    const total = dist(from, to);
    if (!autoCost || !difficultAt) return Math.round((total / grid) * feetPerCell / 5) * 5;
    const steps = Math.max(1, Math.ceil(total / (grid * 0.4)));
    let ft = 0;
    let prev = from;
    for (let i = 1; i <= steps; i++) {
      const tt = i / steps;
      const pt = { x: from.x + (to.x - from.x) * tt, y: from.y + (to.y - from.y) * tt };
      ft += (dist(prev, pt) / grid) * feetPerCell * (difficultAt(pt.x, pt.y) ? 2 : 1);
      prev = pt;
    }
    return Math.round(ft / 5) * 5;
  }

  // Default vision for PC tokens so the map isn't pitch black if unset.
  const defaultVision = grid ? grid * 12 : imgSize ? Math.max(imgSize.w, imgSize.h) * 0.3 : 300;

  const tools = ALL_TOOLS.filter(
    (t) => (isDM || !t.dm) && (t.key !== "target" || !!onTarget),
  );
  const toolsListRef = useRef(tools);
  toolsListRef.current = tools;

  // --- image load + canvas sizing -----------------------------------------

  useEffect(() => {
    if (!map.imageUrl) {
      setImgSize(null);
      return;
    }
    const img = new Image();
    img.onload = () => setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = map.imageUrl;
  }, [map.imageUrl]);

  useEffect(() => {
    if (!imgSize) return;
    const mk = (): HTMLCanvasElement => {
      const c = document.createElement("canvas");
      c.width = imgSize.w;
      c.height = imgSize.h;
      return c;
    };
    maskRef.current = mk();
    tempRef.current = mk();
    litRef.current = mk();
    exploredRef.current = mk();
  }, [imgSize]);

  // Fit the image into the viewport when it (or the map) loads.
  useEffect(() => {
    if (!imgSize || !containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    const scale = Math.min(r.width / imgSize.w, r.height / imgSize.h) || 1;
    setView({
      scale,
      offsetX: (r.width - imgSize.w * scale) / 2,
      offsetY: (r.height - imgSize.h * scale) / 2,
    });
  }, [imgSize, map.id]);

  // Re-fit when the viewport itself changes size (entering fullscreen, panel
  // resize) — only meaningful jumps, so pan/zoom isn't fought over pixels.
  useEffect(() => {
    const cont = containerRef.current;
    if (!cont) return;
    let last = { w: cont.clientWidth, h: cont.clientHeight };
    const ro = new ResizeObserver(() => {
      const w = cont.clientWidth;
      const h = cont.clientHeight;
      if (Math.abs(w - last.w) < 40 && Math.abs(h - last.h) < 40) return;
      last = { w, h };
      const sz = imgSizeRef.current;
      if (!sz) return;
      const scale = Math.min(w / sz.w, h / sz.h) || 1;
      setView({
        scale,
        offsetX: (w - sz.w * scale) / 2,
        offsetY: (h - sz.h * scale) / 2,
      });
    });
    ro.observe(cont);
    return () => ro.disconnect();
  }, []);

  // Center + flash a token when its row is clicked in the initiative tracker.
  useEffect(() => {
    const onFocus = (e: Event) => {
      const id = (e as CustomEvent<{ combatantId?: string }>).detail?.combatantId;
      const cont = containerRef.current;
      if (!id || !cont) return;
      const tk = tokensRef.current.find((t) => t.combatantId === id);
      if (!tk) return;
      const r = cont.getBoundingClientRect();
      setView((v) => ({
        ...v,
        offsetX: r.width / 2 - tk.x * v.scale,
        offsetY: r.height / 2 - tk.y * v.scale,
      }));
      setFlashId(tk.id);
      window.setTimeout(() => setFlashId((cur) => (cur === tk.id ? null : cur)), 1700);
    };
    window.addEventListener("dl:focus-combatant", onFocus);
    return () => window.removeEventListener("dl:focus-combatant", onFocus);
  }, []);

  // Clear the "not enough movement" flash after a beat.
  useEffect(() => {
    if (!speedDenied) return;
    const id = window.setTimeout(() => setSpeedDenied(null), 1400);
    return () => window.clearTimeout(id);
  }, [speedDenied]);

  // Leaving the Target tool clears the lined-up attacker.
  useEffect(() => {
    if (tool !== "target") {
      setAttackerId(null);
      setAimPos(null);
    }
  }, [tool]);

  // Report aiming state so the parent can show an attack picker.
  useEffect(() => {
    onAimChange?.(tool === "target" ? attackerId : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, attackerId]);

  // "dl:arm-target" {attackerTokenId}: a tray attack was clicked — jump
  // straight into aiming with that token; null disarms back to Move.
  useEffect(() => {
    const onArm = (e: Event) => {
      const d = (e as CustomEvent<{ attackerTokenId: string | null }>).detail;
      if (d?.attackerTokenId) {
        setTool("target");
        setAttackerId(d.attackerTokenId);
        setAimPos(null);
      } else {
        setAttackerId(null);
        setAimPos(null);
        setTool("select");
      }
    };
    window.addEventListener("dl:arm-target", onArm);
    return () => window.removeEventListener("dl:arm-target", onArm);
  }, []);

  // "dl:arm-aoe" {shape, feet}: a spell card arms the AoE tool with that
  // template so the next map click places it (players get a local preview).
  useEffect(() => {
    const onArm = (e: Event) => {
      const d = (e as CustomEvent<{ shape?: AoeShape; feet?: number }>).detail;
      if (!d?.shape || !d?.feet) return;
      setAoeShape(d.shape);
      setAoeFeet(d.feet);
      setTool("aoe");
    };
    window.addEventListener("dl:arm-aoe", onArm);
    return () => window.removeEventListener("dl:arm-aoe", onArm);
  }, []);

  // External camera control ("dl:map-camera" {x, y, scale?}) — minimap
  // clicks and saved bookmarks jump the viewport here.
  useEffect(() => {
    const onCam = (e: Event) => {
      const d = (e as CustomEvent<{ x: number; y: number; scale?: number }>).detail;
      const cont = containerRef.current;
      if (!d || !cont) return;
      const r = cont.getBoundingClientRect();
      setView((v) => {
        const scale = d.scale ?? v.scale;
        return { scale, offsetX: r.width / 2 - d.x * scale, offsetY: r.height / 2 - d.y * scale };
      });
    };
    window.addEventListener("dl:map-camera", onCam);
    return () => window.removeEventListener("dl:map-camera", onCam);
  }, []);

  // Report the camera to the parent (minimap viewport rectangle).
  useEffect(() => {
    const cont = containerRef.current;
    if (!cont || !onViewChange) return;
    onViewChange(view, { w: cont.clientWidth, h: cont.clientHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // --- DM undo of map edits (walls, lights, ink, templates, token moves) ---
  const mapRef = useRef(map);
  mapRef.current = map;
  const mapUndo = useRef<{ mapId: string; snap: Partial<BattleMap> }[]>([]);
  function pushMapUndo(...keys: ("walls" | "lights" | "templates" | "drawings" | "tokens")[]) {
    const m = mapRef.current;
    const snap: Partial<BattleMap> = {};
    for (const k of keys) snap[k] = (m[k] ?? []) as never;
    mapUndo.current.push({ mapId: m.id, snap });
    if (mapUndo.current.length > 30) mapUndo.current.shift();
  }
  function undoMapEdit() {
    // Never apply a snapshot taken on a different map (portal jumps, map
    // switches) — those entries are stale history, not undoable state.
    const cur = mapRef.current.id;
    while (mapUndo.current.length) {
      const top = mapUndo.current.pop()!;
      if (top.mapId === cur) {
        void updateMap(cur, top.snap);
        return;
      }
    }
  }

  // Keyboard shortcuts (fullscreen War Table only).
  const toolsRef = toolsListRef;
  useEffect(() => {
    if (!shortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        if (isDM) {
          e.preventDefault();
          undoMapEdit();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key >= "1" && e.key <= "9") {
        const t = toolsRef.current[Number(e.key) - 1];
        if (t) setTool(t.key);
      } else if (e.key === "+" || e.key === "=") {
        setView((v) => ({ ...v, scale: clamp(v.scale * 1.15, 0.1, 8) }));
      } else if (e.key === "-") {
        setView((v) => ({ ...v, scale: clamp(v.scale / 1.15, 0.1, 8) }));
      } else if (e.key.toLowerCase() === "f") {
        const cont = containerRef.current;
        const sz = imgSizeRef.current;
        if (!cont || !sz) return;
        const r = cont.getBoundingClientRect();
        const scale = Math.min(r.width / sz.w, r.height / sz.h) || 1;
        setView({
          scale,
          offsetX: (r.width - sz.w * scale) / 2,
          offsetY: (r.height - sz.h * scale) / 2,
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortcuts, isDM]);

  // The DM's client watches synced token positions and is the single writer
  // for movement bookkeeping: it charges speed-budget feet, and flags
  // opportunity attacks when a move leaves an enemy's melee reach.
  const prevPosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  useEffect(() => {
    const prev = prevPosRef.current;
    const next = new Map(tokens.map((t) => [t.id, { x: t.x, y: t.y }]));
    if (isDM) {
      const moved = tokens.filter((t) => {
        const p = prev.get(t.id);
        return p && (p.x !== t.x || p.y !== t.y);
      });
      if (speedActive && moved.length) {
        let changed = false;
        const upd = tokens.map((t) => {
          const p = prev.get(t.id);
          if (p && (p.x !== t.x || p.y !== t.y)) {
            const ft = pathFeet(p, { x: t.x, y: t.y });
            if (ft > 0) {
              changed = true;
              return { ...t, movedFt: (t.movedFt ?? 0) + ft };
            }
          }
          return t;
        });
        if (changed) void updateMap(map.id, { tokens: upd });
      }
      // Opportunity attacks: enemy melee reach (5 ft edge-to-edge) covered
      // the mover's START but not their END, and the enemy is still standing.
      if (onProvoke && combat?.active && pxPerFoot > 0) {
        for (const tk of moved) {
          if (!tk.combatantId) continue;
          const from = prev.get(tk.id)!;
          const inReach = (e: MapToken, pos: Pt) =>
            (dist({ x: e.x, y: e.y }, pos) - tokenR(e, grid) - tokenR(tk, grid)) / pxPerFoot <= 5.5;
          const provokers = tokens.filter((e) => {
            if (e.id === tk.id || !e.combatantId || e.isPC === tk.isPC || e.hidden) return false;
            const cb = combat.combatants.find((c) => c.id === e.combatantId);
            if (!cb || (cb.maxHp > 0 && cb.currentHp <= 0)) return false;
            return inReach(e, from) && !inReach(e, { x: tk.x, y: tk.y });
          });
          if (provokers.length) {
            onProvoke({ moverTokenId: tk.id, enemyTokenIds: provokers.map((e) => e.id) });
          }
        }
      }
    }
    prevPosRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, isDM, speedActive, map.id, combat]);

  // Fresh legs: when the turn passes to a combatant, the DM's client resets
  // that combatant's spent movement (single writer avoids write races).
  const activeCombatantIdRef = useRef<string | null>(null);
  useEffect(() => {
    const active = combat && combat.active ? combat.combatants[combat.turnIndex]?.id ?? null : null;
    if (active === activeCombatantIdRef.current) return;
    activeCombatantIdRef.current = active;
    if (!isDM || !active) return;
    const toks = tokensRef.current;
    if (!toks.some((t) => t.combatantId === active && (t.movedFt ?? 0) !== 0)) return;
    void updateMap(map.id, {
      tokens: toks.map((t) => (t.combatantId === active ? { ...t, movedFt: 0 } : t)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat?.turnIndex, combat?.active, combat?.combatants, isDM, map.id]);

  // --- fog rendering -------------------------------------------------------

  const renderFog = useCallback(() => {
    const fog = fogCanvasRef.current;
    const mask = maskRef.current;
    const temp = tempRef.current;
    const explored = exploredRef.current;
    if (!fog || !mask || !temp || !explored || !imgSize) return;
    const fctx = fog.getContext("2d");
    const mctx = mask.getContext("2d");
    const tctx = temp.getContext("2d");
    const ectx = explored.getContext("2d");
    if (!fctx || !mctx || !tctx || !ectx) return;

    const dark = lightLevel !== "bright";
    const showFog = (fogEnabled || dark) && (!isDM || dmPreview);
    if (!showFog) {
      fctx.clearRect(0, 0, imgSize.w, imgSize.h);
      return;
    }

    // Personal vision: each player sees only through their OWN tokens; shared
    // (default) pools the whole party's sight. The DM previews shared sight.
    const personal = (map.visionMode ?? "shared") === "personal" && !isDM;
    const viewers: MapToken[] = tokens
      .filter((t) => t.isPC && !t.hidden)
      .filter((t) => !personal || t.ownerId === userId)
      .map((t) =>
        drag && drag.id === t.id ? { ...t, x: drag.pos.x, y: drag.pos.y } : t,
      )
      .map((t) => ({
        ...t,
        visionRadius:
          t.visionRadius && t.visionRadius > 0 ? t.visionRadius : defaultVision,
      }));

    if (viewers.length === 0) {
      if (personal) {
        // You have no token on this map — you see nothing but darkness.
        mctx.clearRect(0, 0, imgSize.w, imgSize.h);
        paintFog(fctx, imgSize.w, imgSize.h, mask, null, {
          fogColor: dark ? "rgba(6,5,8,0.985)" : "rgba(8,6,4,0.99)",
          exploredDim: 0,
        });
        return;
      }
      // No party vision yet — show the map rather than a black void.
      fctx.clearRect(0, 0, imgSize.w, imgSize.h);
      return;
    }

    // Binary fog: areas not currently visible are fully dark (no dim "memory"
    // layer), so a wall always blocks to the same darkness whether or not the
    // player had seen behind it before. In dim/dark ambient, sight is gated by
    // light + darkvision (see computeVisibilityMask).
    void ectx;
    computeVisibilityMask(
      mctx,
      tctx,
      imgSize.w,
      imgSize.h,
      viewers,
      sightWalls,
      lights,
      lightLevel,
      litRef.current?.getContext("2d") ?? null,
    );
    paintFog(fctx, imgSize.w, imgSize.h, mask, null, {
      fogColor: dark ? "rgba(6,5,8,0.985)" : "rgba(8,6,4,0.99)",
      exploredDim: 0,
    });
  }, [imgSize, fogEnabled, isDM, dmPreview, tokens, sightWalls, drag, defaultVision, lights, lightLevel, map.visionMode, userId]);

  useEffect(() => {
    renderFog();
  }, [renderFog]);

  // Warm light pools (visual tint), under the fog. `flickerTick` makes each
  // pool breathe a little, like real flame.
  const [flickerTick, setFlickerTick] = useState(0);
  const renderGlow = useCallback(() => {
    const g = glowCanvasRef.current;
    if (!g || !imgSize) return;
    const ctx = g.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, imgSize.w, imgSize.h);
    if (lightLevel === "bright" || lights.length === 0) return;
    ctx.globalCompositeOperation = "lighter";
    lights.forEach((L, idx) => {
      if (L.radius <= 0) return;
      const col = L.color ?? "#ffcf8a";
      // Deterministic per-light wobble: phase from index, driven by the tick.
      const f = 0.86 + 0.14 * Math.sin(flickerTick * 0.9 + idx * 2.7);
      const rad = L.radius * (0.97 + 0.03 * f);
      const grad = ctx.createRadialGradient(L.x, L.y, rad * 0.1, L.x, L.y, rad);
      grad.addColorStop(0, hexA(col, 0.4 * (L.intensity ?? 1) * f));
      grad.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(L.x, L.y, rad, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = "source-over";
  }, [imgSize, lights, lightLevel, flickerTick]);

  useEffect(() => {
    renderGlow();
  }, [renderGlow]);

  // Drive the flame flicker only while lights are actually glowing.
  useEffect(() => {
    if (lightLevel === "bright" || lights.length === 0) return;
    const id = window.setInterval(() => setFlickerTick((t) => (t + 1) % 100000), 160);
    return () => window.clearInterval(id);
  }, [lightLevel, lights.length]);

  // Reset explored memory when the map changes.
  useEffect(() => {
    const ex = exploredRef.current?.getContext("2d");
    if (ex && imgSize) ex.clearRect(0, 0, imgSize.w, imgSize.h);
  }, [map.id, imgSize]);

  // --- helpers -------------------------------------------------------------

  const toMap = useCallback(
    (e: ReactPointerEvent): Pt => {
      const r = containerRef.current!.getBoundingClientRect();
      return screenToMap({ x: e.clientX - r.left, y: e.clientY - r.top }, view);
    },
    [view],
  );

  const movableTokenAt = useCallback(
    (p: Pt): MapToken | null => {
      for (let i = tokens.length - 1; i >= 0; i--) {
        const t = tokens[i];
        if (dist({ x: t.x, y: t.y }, p) <= tokenR(t, grid)) {
          if (isDM || t.ownerId === userId) return t;
        }
      }
      return null;
    },
    [tokens, isDM, userId, grid],
  );

  /** Any token under the point, regardless of move permission (targeting). */
  const anyTokenAt = useCallback(
    (p: Pt): MapToken | null => {
      for (let i = tokens.length - 1; i >= 0; i--) {
        const t = tokens[i];
        if (dist({ x: t.x, y: t.y }, p) <= tokenR(t, grid)) return t;
      }
      return null;
    },
    [tokens, grid],
  );

  function maskCtx() {
    return maskRef.current?.getContext("2d") ?? null;
  }

  /** Is a map point visible to this viewer? (players: gated by the fog mask
   *  whenever fog or darkness is active; the DM always sees structure). */
  const pointVisible = useCallback(
    (x: number, y: number): boolean => {
      if (isDM) return true;
      if (!fogEnabled && lightLevel === "bright") return true;
      const ctx = maskCtx();
      if (!ctx || !imgSize) return true;
      return isVisibleAt(ctx, x, y, imgSize.w, imgSize.h);
    },
    [isDM, fogEnabled, lightLevel, imgSize],
  );

  const tokenVisible = useCallback(
    (t: MapToken): boolean => {
      if (t.hidden && !isDM) return false;
      // Invisible creatures vanish for everyone except the DM and their owner.
      const cb = combat?.combatants.find((x) => x.id === t.combatantId);
      if (cb?.conditions.includes("invisible") && !isDM && t.ownerId !== userId) return false;
      if (isDM && !dmPreview) return true;
      if (t.ownerId && t.ownerId === userId) return true;
      if (!fogEnabled) return true;
      const ctx = maskCtx();
      if (!ctx || !imgSize) return true;
      return isVisibleAt(ctx, t.x, t.y, imgSize.w, imgSize.h);
    },
    [isDM, dmPreview, userId, fogEnabled, imgSize, combat],
  );

  // --- pointer interactions ------------------------------------------------

  function onPointerDown(e: ReactPointerEvent) {
    if (!imgSize) return;
    containerRef.current?.setPointerCapture(e.pointerId);
    const p = toMap(e);
    const panButton = e.button === 1 || e.button === 2;

    if (panButton || tool === "pan") {
      gesture.current = { mode: "pan", lastX: e.clientX, lastY: e.clientY };
      return;
    }
    switch (tool) {
      case "select": {
        const t = movableTokenAt(p);
        if (t) {
          gesture.current = {
            mode: "token",
            id: t.id,
            grab: { x: p.x - t.x, y: p.y - t.y },
          };
          setDrag({ id: t.id, pos: { x: t.x, y: t.y } });
          setSelectedTokenId(t.id);
          onSelectToken?.(t.id);
        } else if (isDM && toggleDoorAt(p)) {
          // handled — opened/closed a door
        } else if (isDM && tryPortalAt(p)) {
          // handled — jumped to the linked map
        } else {
          const inspect = anyTokenAt(p);
          if (inspect && isDM) {
            // DM can inspect a token they aren't dragging.
            setSelectedTokenId(inspect.id);
            onSelectToken?.(inspect.id);
          } else {
            setSelectedTokenId(null);
            onSelectToken?.(null);
            if (!isDM) setAoe(null); // clear a player's local spell preview
          }
          gesture.current = { mode: "pan", lastX: e.clientX, lastY: e.clientY };
        }
        break;
      }
      case "target": {
        const hit = anyTokenAt(p);
        if (!hit) {
          // Empty ground pans — the armed attacker and any lock stay put
          // (Esc or the card's ✕ is how you stand down).
          gesture.current = { mode: "pan", lastX: e.clientX, lastY: e.clientY };
          break;
        }
        const atk = attackerId ? tokens.find((t) => t.id === attackerId) : null;
        if (!atk) {
          // First click picks the attacker — a token you control.
          if (isDM || hit.ownerId === userId) {
            setAttackerId(hit.id);
            setAimPos(null);
          }
          break;
        }
        if (hit.id === atk.id) break;
        // Clicking another token on your own side re-arms the attacker;
        // anything else becomes (or replaces) the locked target.
        const sameSide = isDM ? hit.isPC === atk.isPC : hit.ownerId === userId;
        if (sameSide && (isDM || hit.ownerId === userId)) {
          setAttackerId(hit.id);
          setAimPos(null);
          break;
        }
        if (!tokenVisible(hit)) break; // can't target what you can't see
        const info = engageInfo(atk, hit);
        onTarget?.({
          attackerTokenId: atk.id,
          targetTokenId: hit.id,
          feet: info.feet,
          losBlocked: info.losBlocked,
        });
        break;
      }
      case "ping":
        realtime.ping(map.id, p.x, p.y);
        break;
      case "ruler":
        gesture.current = { mode: "ruler", from: p };
        setRuler({ from: p, to: p });
        break;
      case "wall":
        if (isDM) {
          gesture.current = { mode: "wall", from: p };
          setPending({ kind: "wall", from: p, to: p });
        }
        break;
      case "light":
        if (isDM) {
          const pos = snapCell(p);
          const light: MapLight = {
            id: newId(),
            x: Math.round(pos.x),
            y: Math.round(pos.y),
            radius: grid ? grid * 4 : 200,
            color: "#ffcf8a",
          };
          pushMapUndo("lights");
          void updateMap(map.id, { lights: [...lights, light] });
        }
        break;
      case "aoe": {
        // Players reach this tool only by arming a spell — their template is
        // a personal preview (map writes are DM-only on the server).
        const origin = snapCell(p);
        const sizePx = Math.max(1, aoeFeet) * pxPerFoot;
        gesture.current = { mode: "aoe", origin };
        setAoe({
          id: newId(),
          shape: aoeShape,
          x: origin.x,
          y: origin.y,
          size: sizePx,
          angle: 0,
          width: aoeShape === "line" ? Math.max(pxPerFoot * 5, grid || pxPerFoot * 5) : undefined,
          color: "#C25A3D",
        });
        break;
      }
      case "draw":
        if (isDM) {
          gesture.current = { mode: "draw" };
          setPending({ kind: "draw", points: [p.x, p.y] });
        }
        break;
      case "erase":
        if (isDM) eraseAt(p);
        break;
    }
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (tool === "target" && attackerId && imgSize) {
      setAimPos(toMap(e));
    }
    const g = gesture.current;
    if (!g) return;
    if (g.mode === "pan") {
      const dx = e.clientX - g.lastX;
      const dy = e.clientY - g.lastY;
      g.lastX = e.clientX;
      g.lastY = e.clientY;
      setView((v) => ({ ...v, offsetX: v.offsetX + dx, offsetY: v.offsetY + dy }));
      return;
    }
    const p = toMap(e);
    if (g.mode === "token") {
      const next = { x: p.x - g.grab.x, y: p.y - g.grab.y };
      // Wall enforcement: refuse drag steps that pass through a movement
      // blocker — the token stops at the wall instead of ghosting through.
      if (enforceWalls && drag && drag.id === g.id) {
        const blocked = moveWalls.some((w) =>
          segsCross(drag.pos, next, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }),
        );
        if (blocked) return;
      }
      setDrag({ id: g.id, pos: next });
    } else if (g.mode === "ruler") {
      setRuler({ from: g.from, to: p });
    } else if (g.mode === "wall") {
      setPending({ kind: "wall", from: g.from, to: p });
    } else if (g.mode === "draw") {
      setPending((cur) =>
        cur && cur.kind === "draw"
          ? { kind: "draw", points: [...cur.points, p.x, p.y] }
          : cur,
      );
    } else if (g.mode === "aoe") {
      setAoe((cur) => {
        if (!cur) return cur;
        if (cur.shape === "circle") {
          const c = snapCell(p);
          return { ...cur, x: c.x, y: c.y };
        }
        return { ...cur, angle: Math.atan2(p.y - g.origin.y, p.x - g.origin.x) };
      });
    }
  }

  function onPointerUp(e: ReactPointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    try {
      containerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!g) return;

    if (g.mode === "token" && drag) {
      const tk = tokens.find((t) => t.id === g.id);
      const snapped =
        grid && (map.snapToGrid ?? true)
          ? snapTokenPos(drag.pos, grid, tk ? tokenCells(tk) : 1, gridOx, gridOy)
          : drag.pos;
      const spent = tk ? pathFeet({ x: tk.x, y: tk.y }, snapped) : 0;
      const remaining = Math.max(0, (tk?.speed ?? 30) - (tk?.movedFt ?? 0));
      if (enforceSpeed === "block" && speedActive && tk && spent > remaining) {
        // Over budget — the move is refused and the token springs back.
        setDrag(null);
        setSpeedDenied({ id: g.id, at: Date.now() });
        return;
      }
      pushMapUndo("tokens");
      // Position always goes through moveToken — it's the only map write
      // players are allowed; budget accounting happens on the DM client.
      realtime.moveToken(map.id, g.id, Math.round(snapped.x), Math.round(snapped.y));
      setDrag(null);
    } else if (g.mode === "ruler") {
      setRuler(null);
    } else if (g.mode === "wall" && pending && pending.kind === "wall") {
      const { from, to } = pending;
      if (dist(from, to) > 6) {
        const wall: Wall = { id: newId(), x1: from.x, y1: from.y, x2: to.x, y2: to.y };
        pushMapUndo("walls");
        void updateMap(map.id, { walls: [...walls, wall] });
      }
      setPending(null);
    } else if (g.mode === "draw" && pending && pending.kind === "draw") {
      if (pending.points.length >= 4) {
        pushMapUndo("drawings");
        void updateMap(map.id, {
          drawings: [
            ...drawings,
            { id: newId(), color: DRAW_COLOR, width: 4, points: pending.points },
          ],
        });
      }
      setPending(null);
    } else if (g.mode === "aoe" && aoe) {
      if (isDM) {
        pushMapUndo("templates");
        void updateMap(map.id, { templates: [...templates, aoe] });
        setAoe(null);
      } else {
        // Player spell preview: keep it on screen locally and hand the
        // pointer back to Move — clicking empty ground clears it.
        setTool("select");
      }
    }
  }

  /** Offset-aware cell-center snap for lights/AoE origins. */
  function snapCell(p: Pt): Pt {
    if (!grid) return p;
    const s = snapToCellCenter({ x: p.x - gridOx, y: p.y - gridOy }, grid);
    return { x: s.x + gridOx, y: s.y + gridOy };
  }

  /** Distance in feet (5-ft steps, incl. elevation) and line-of-sight. */
  function engageInfo(a: MapToken, b: MapToken): { feet: number; losBlocked: boolean } {
    const flat = dist({ x: a.x, y: a.y }, { x: b.x, y: b.y });
    const dEle = ((a.elevation ?? 0) - (b.elevation ?? 0)) * pxPerFoot;
    const d3 = Math.hypot(flat, dEle);
    const feet = grid ? Math.round(((d3 / grid) * feetPerCell) / 5) * 5 : Math.round(d3);
    const losBlocked = sightWalls.some((w) =>
      segsCross({ x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }),
    );
    return { feet, losBlocked };
  }

  /** DM clicks a door/secret-door to toggle it open or closed (synced). */
  function toggleDoorAt(p: Pt): boolean {
    const threshold = Math.max(14 / view.scale, grid * 0.5);
    let best: string | null = null;
    let bestD = threshold;
    for (const w of walls) {
      const k = w.kind ?? "solid";
      if (k !== "door" && k !== "secret") continue;
      const d = distToSegment(p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
      if (d < bestD) {
        bestD = d;
        best = w.id;
      }
    }
    if (!best) return false;
    pushMapUndo("walls");
    const opened = !walls.find((w) => w.id === best)?.open;
    void updateMap(map.id, {
      walls: walls.map((w) => (w.id === best ? { ...w, open: !w.open } : w)),
    });
    if (combat?.active) {
      void updateCombat(
        Combat.appendLog(combat, `The DM ${opened ? "opens" : "closes"} a door.`, "door"),
      );
    }
    return true;
  }

  /** DM clicks a portal to jump the War Table to the linked map. */
  function tryPortalAt(p: Pt): boolean {
    const threshold = Math.max(18 / view.scale, grid * 0.5);
    const hit = portals.find((pt) => pt.targetMapId && dist(p, { x: pt.x, y: pt.y }) < threshold);
    if (!hit?.targetMapId) return false;
    void updateCombat({ activeMapId: hit.targetMapId });
    return true;
  }

  function eraseAt(p: Pt) {
    // AoE template first (click its origin / inside a circle), then light, wall, drawing.
    const threshold = 14 / view.scale;
    const tplHit = templates.find((t) =>
      t.shape === "circle"
        ? dist(p, { x: t.x, y: t.y }) <= t.size
        : dist(p, { x: t.x, y: t.y }) <= Math.max(threshold, grid * 0.6),
    );
    if (tplHit) {
      pushMapUndo("templates");
      void updateMap(map.id, { templates: templates.filter((t) => t.id !== tplHit.id) });
      return;
    }
    const lightHit = lights.find((L) => dist(p, { x: L.x, y: L.y }) < Math.max(threshold, grid * 0.4));
    if (lightHit) {
      pushMapUndo("lights");
      void updateMap(map.id, { lights: lights.filter((L) => L.id !== lightHit.id) });
      return;
    }
    let bestWall: string | null = null;
    let bestWallD = threshold;
    for (const w of walls) {
      const d = distToSegment(p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
      if (d < bestWallD) {
        bestWallD = d;
        bestWall = w.id;
      }
    }
    if (bestWall) {
      pushMapUndo("walls");
      void updateMap(map.id, { walls: walls.filter((w) => w.id !== bestWall) });
      return;
    }
    let bestDraw: string | null = null;
    let bestDrawD = threshold;
    for (const dr of drawings) {
      for (let i = 0; i + 1 < dr.points.length; i += 2) {
        const d = dist(p, { x: dr.points[i], y: dr.points[i + 1] });
        if (d < bestDrawD) {
          bestDrawD = d;
          bestDraw = dr.id;
        }
      }
    }
    if (bestDraw) {
      pushMapUndo("drawings");
      void updateMap(map.id, { drawings: drawings.filter((d) => d.id !== bestDraw) });
    }
  }

  // Native, non-passive wheel listener so preventDefault() actually stops the
  // page from scrolling while we zoom the map (React's onWheel is passive).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setView((v) => {
        const scale = clamp(v.scale * factor, 0.1, 8);
        const k = scale / v.scale;
        return {
          scale,
          offsetX: cx - (cx - v.offsetX) * k,
          offsetY: cy - (cy - v.offsetY) * k,
        };
      });
    };
    el.addEventListener("wheel", onWheelNative, { passive: false });
    return () => el.removeEventListener("wheel", onWheelNative);
  }, []);

  const activeCombatantId = useMemo(() => {
    if (!combat || !combat.active) return null;
    return combat.combatants[combat.turnIndex]?.id ?? null;
  }, [combat]);

  const layerStyle = {
    transform: `translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.scale})`,
    transformOrigin: "0 0",
  } as const;

  return (
    // Fill mode pins to the parent's box with absolute positioning — immune
    // to percentage-height resolution quirks through nested flex parents.
    <div className={fillHeight ? "absolute inset-0" : "relative"}>
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "relative w-full overflow-hidden bg-leather/90 touch-none select-none",
          fillHeight
            ? "h-full"
            : "h-[62vh] min-h-80 rounded-card border-2 border-parchment-400/70",
          tool === "pan" && "cursor-grab",
          tool === "ping" && "cursor-pointer",
        )}
      >
        {!map.imageUrl ? (
          <div className="flex h-full w-full items-center justify-center px-6 text-center text-parchment-300">
            No map image yet — add one in the map settings (or the Codex).
          </div>
        ) : (
          imgSize && (
            <div className="absolute left-0 top-0" style={layerStyle}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={map.imageUrl}
                alt={map.name}
                width={imgSize.w}
                height={imgSize.h}
                className="block max-w-none"
                draggable={false}
              />

              {/* atmosphere tint (dusk, torchlight…) washed over the terrain */}
              {map.lightTint && (
                <div
                  className="pointer-events-none absolute left-0 top-0 mix-blend-multiply"
                  style={{ width: imgSize.w, height: imgSize.h, backgroundColor: map.lightTint, opacity: 0.34 }}
                />
              )}

              {/* warm light pools */}
              <canvas
                ref={glowCanvasRef}
                width={imgSize.w}
                height={imgSize.h}
                className="pointer-events-none absolute left-0 top-0 mix-blend-screen"
              />

              <svg
                width={imgSize.w}
                height={imgSize.h}
                viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}
                className="pointer-events-none absolute left-0 top-0"
              >
                {/* grid */}
                {map.showGrid && grid > 0 && (
                  <g stroke="rgba(255,255,255,0.12)" strokeWidth={1}>
                    {Array.from({ length: Math.ceil(imgSize.w / grid) + 1 }).map(
                      (_, i) => (
                        <line
                          key={`v${i}`}
                          x1={i * grid + (map.gridOffsetX ?? 0)}
                          y1={0}
                          x2={i * grid + (map.gridOffsetX ?? 0)}
                          y2={imgSize.h}
                        />
                      ),
                    )}
                    {Array.from({ length: Math.ceil(imgSize.h / grid) + 1 }).map(
                      (_, i) => (
                        <line
                          key={`h${i}`}
                          x1={0}
                          y1={i * grid + (map.gridOffsetY ?? 0)}
                          x2={imgSize.w}
                          y2={i * grid + (map.gridOffsetY ?? 0)}
                        />
                      ),
                    )}
                  </g>
                )}
                {/* drawings */}
                {drawings.map((d) => (
                  <polyline
                    key={d.id}
                    points={pointsStr(d.points)}
                    fill="none"
                    stroke={d.color}
                    strokeWidth={d.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {pending?.kind === "draw" && (
                  <polyline
                    points={pointsStr(pending.points)}
                    fill="none"
                    stroke={DRAW_COLOR}
                    strokeWidth={4}
                    strokeLinecap="round"
                  />
                )}
              </svg>

              {/* fog */}
              <canvas
                ref={fogCanvasRef}
                width={imgSize.w}
                height={imgSize.h}
                className="pointer-events-none absolute left-0 top-0"
              />

              {/* walls (DM only), tokens, ruler, pings — above fog */}
              <svg
                width={imgSize.w}
                height={imgSize.h}
                viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}
                className="pointer-events-none absolute left-0 top-0"
              >
                {/* AoE spell templates — above fog, under tokens; players only
                    see templates whose origin their sight has reached. */}
                {[...templates.filter((t) => pointVisible(t.x, t.y)), ...(aoe ? [aoe] : [])].map((t) => {
                  const color = t.color ?? "#C25A3D";
                  const feet = Math.round(t.size / pxPerFoot);
                  const lx = t.shape === "circle" ? t.x : t.x + Math.cos(t.angle ?? 0) * t.size * 0.5;
                  const ly = t.shape === "circle" ? t.y : t.y + Math.sin(t.angle ?? 0) * t.size * 0.5;
                  return (
                    <g key={t.id}>
                      {t.shape === "circle" ? (
                        <circle cx={t.x} cy={t.y} r={t.size} fill={hexA(color, 0.22)} stroke={color} strokeWidth={2.5} opacity={0.9} />
                      ) : (
                        <polygon points={aoePolygon(t)} fill={hexA(color, 0.22)} stroke={color} strokeWidth={2.5} opacity={0.9} />
                      )}
                      <text
                        x={lx}
                        y={ly}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={Math.max(12, grid * 0.3)}
                        fontWeight={700}
                        fill="#F5E9CF"
                        stroke="#0E0A06"
                        strokeWidth={Math.max(2, grid * 0.02)}
                        paintOrder="stroke"
                      >
                        {feet} ft
                      </text>
                    </g>
                  );
                })}

                {/* Doors render live (not baked) so open/closed always matches
                    state; players only see doors their sight has reached. */}
                {walls
                  .filter((w) => (w.kind ?? "solid") === "door")
                  .filter((w) => pointVisible((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2))
                  .map((w) => {
                    const dx = w.x2 - w.x1;
                    const dy = w.y2 - w.y1;
                    const L = Math.hypot(dx, dy) || 1;
                    const lw = Math.max(5, grid * 0.16);
                    if (w.open) {
                      const ex = w.x1 + (-dy / L) * L;
                      const ey = w.y1 + (dx / L) * L;
                      return (
                        <g key={w.id}>
                          <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#caa46a" strokeWidth={2} strokeDasharray="4 5" opacity={0.6} />
                          <line x1={w.x1} y1={w.y1} x2={ex} y2={ey} stroke="#8a5a2b" strokeWidth={lw} strokeLinecap="round" />
                        </g>
                      );
                    }
                    return (
                      <g key={w.id}>
                        <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#3a2a18" strokeWidth={lw + 3} strokeLinecap="round" />
                        <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#8a5a2b" strokeWidth={lw} strokeLinecap="round" />
                      </g>
                    );
                  })}

                {/* DM-only overlay marking the (player-invisible) sight walls. */}
                {isDM && (
                  <g strokeWidth={3} strokeLinecap="round" opacity={0.85}>
                    {walls
                      .filter((w) => (w.kind ?? "solid") !== "door")
                      .map((w) => {
                        const k = w.kind ?? "solid";
                        const stroke = k === "window" ? "#7fd1e6" : k === "secret" ? "#c060c0" : "#C25A3D";
                        return (
                          <line
                            key={w.id}
                            x1={w.x1}
                            y1={w.y1}
                            x2={w.x2}
                            y2={w.y2}
                            stroke={stroke}
                            strokeDasharray={k === "secret" ? "8 6" : undefined}
                          />
                        );
                      })}
                    {pending?.kind === "wall" && (
                      <line
                        x1={pending.from.x}
                        y1={pending.from.y}
                        x2={pending.to.x}
                        y2={pending.to.y}
                        stroke="#C25A3D"
                        strokeDasharray="6 6"
                      />
                    )}
                  </g>
                )}

                {isDM &&
                  lightLevel !== "bright" &&
                  lights.map((L) => (
                    <g key={L.id} transform={`translate(${L.x}, ${L.y})`}>
                      <circle r={L.radius} fill="none" stroke={L.color ?? "#ffcf8a"} strokeWidth={1.5} strokeDasharray="6 8" opacity={0.35} />
                      <circle r={grid ? grid * 0.2 : 10} fill={L.color ?? "#ffcf8a"} stroke="#5a4012" strokeWidth={2} />
                    </g>
                  ))}

                {/* Stairs / portals — fog-gated for players; the DM clicks to jump. */}
                {portals.filter((pt) => pointVisible(pt.x, pt.y)).map((pt) => (
                  <g key={pt.id} transform={`translate(${pt.x}, ${pt.y})`}>
                    <circle r={grid ? grid * 0.34 : 22} fill="rgba(40,90,140,0.5)" stroke="#7fd1e6" strokeWidth={3} />
                    {[0, 1, 2].map((i) => {
                      const s = grid ? grid * 0.13 : 8;
                      const yy = -s + i * s;
                      return <line key={i} x1={-s * 1.3 + i * s * 0.5} y1={yy} x2={s * 1.3} y2={yy} stroke="#dff3fb" strokeWidth={2.5} />;
                    })}
                    {pt.label && (
                      <text y={grid ? grid * 0.34 + 14 : 36} textAnchor="middle" fontSize={Math.max(11, grid * 0.26)} fill="#dff3fb" stroke="#0E0A06" strokeWidth={Math.max(2, grid * 0.02)} paintOrder="stroke">
                        {pt.label}
                      </text>
                    )}
                  </g>
                ))}

                {/* Annotations — labels & markers fog-gated for players; notes DM-only. */}
                {showAnnos &&
                  annotations
                    .filter((a) => a.kind !== "note" || isDM)
                    .filter((a) => pointVisible(a.x, a.y))
                    .map((a) => <AnnotationMark key={a.id} a={a} grid={grid} />)}

                {/* Locked engagement — persists whatever tool is active,
                    until the target is switched or the card is closed. */}
                {lockedAttackerId && lockedTargetId && (() => {
                  const a = tokens.find((t) => t.id === lockedAttackerId);
                  const b = tokens.find((t) => t.id === lockedTargetId);
                  if (!a || !b) return null;
                  return (
                    <g>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="#e05545"
                        strokeWidth={2.5}
                        strokeDasharray="12 7"
                        opacity={0.65}
                      />
                      <circle
                        cx={b.x}
                        cy={b.y}
                        r={tokenR(b, grid) + 7}
                        fill="none"
                        stroke="#e05545"
                        strokeWidth={3.5}
                      >
                        <animate attributeName="opacity" values="1;0.45;1" dur="1.6s" repeatCount="indefinite" />
                      </circle>
                      <text
                        x={b.x}
                        y={b.y - tokenR(b, grid) - 14}
                        textAnchor="middle"
                        fontSize={Math.max(12, grid * 0.26)}
                        fontWeight={700}
                        fill="#e05545"
                        stroke="#0E0A06"
                        strokeWidth={2}
                        paintOrder="stroke"
                      >
                        ◎ locked
                      </text>
                    </g>
                  );
                })()}

                {/* Target tool: attacker reticle + aim line with range. */}
                {tool === "target" && attackerId && (() => {
                  const atk = tokens.find((t) => t.id === attackerId);
                  if (!atk) return null;
                  const hover = aimPos ? anyTokenAt(aimPos) : null;
                  const tgt = hover && hover.id !== atk.id && tokenVisible(hover) ? hover : null;
                  const end = tgt ? { x: tgt.x, y: tgt.y } : aimPos;
                  const info = tgt ? engageInfo(atk, tgt) : null;
                  const flatFeet =
                    !tgt && end && grid
                      ? Math.round(((dist({ x: atk.x, y: atk.y }, end) / grid) * feetPerCell) / 5) * 5
                      : null;
                  const color = info?.losBlocked ? "#ff6a4d" : "#7fd1e6";
                  return (
                    <g>
                      <circle
                        cx={atk.x}
                        cy={atk.y}
                        r={tokenR(atk, grid) + 7}
                        fill="none"
                        stroke="#7fd1e6"
                        strokeWidth={3}
                        strokeDasharray="4 5"
                      />
                      {end && (
                        <>
                          <line
                            x1={atk.x}
                            y1={atk.y}
                            x2={end.x}
                            y2={end.y}
                            stroke={color}
                            strokeWidth={3}
                            strokeDasharray="10 6"
                            opacity={0.9}
                          />
                          {tgt && (
                            <circle
                              cx={tgt.x}
                              cy={tgt.y}
                              r={tokenR(tgt, grid) + 7}
                              fill="none"
                              stroke={color}
                              strokeWidth={3.5}
                            />
                          )}
                          <text
                            x={(atk.x + end.x) / 2}
                            y={(atk.y + end.y) / 2 - 12}
                            textAnchor="middle"
                            fontSize={Math.max(14, 22 / view.scale)}
                            fontWeight={700}
                            fill={color}
                            stroke="#0E0A06"
                            strokeWidth={Math.max(2, 3 / view.scale)}
                            paintOrder="stroke"
                          >
                            {info ? `${info.feet} ft${info.losBlocked ? " · no line of sight" : ""}` : flatFeet !== null ? `${flatFeet} ft` : ""}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })()}

                {tokens.filter(tokenVisible).map((t) => {
                  const pos = drag && drag.id === t.id ? drag.pos : { x: t.x, y: t.y };
                  const c = combat?.combatants.find((x) => x.id === t.combatantId);
                  const hpPct = c && c.maxHp > 0 ? c.currentHp / c.maxHp : 1;
                  const r = tokenR(t, grid);
                  const dead = !!c && c.maxHp > 0 && c.currentHp <= 0;
                  const bloodied = !!c && !dead && hpPct <= 0.5;
                  const ghost = !!c?.conditions.includes("invisible") || (t.hidden && isDM);
                  const moveFt =
                    drag && drag.id === t.id ? pathFeet({ x: t.x, y: t.y }, drag.pos) : null;
                  const budget = t.speed ?? 30;
                  const remaining = Math.max(0, budget - (t.movedFt ?? 0));
                  const overBudget = moveFt !== null && speedActive && moveFt > remaining;
                  const active = t.combatantId && t.combatantId === activeCombatantId;
                  return (
                    <g
                      key={t.id}
                      style={{
                        transform: `translate(${pos.x}px, ${pos.y}px)`,
                        // Remote moves glide; your own drag tracks the pointer raw.
                        transition:
                          drag && drag.id === t.id
                            ? "none"
                            : "transform 0.45s cubic-bezier(0.25, 0.9, 0.3, 1)",
                      }}
                      opacity={ghost ? 0.45 : 1}
                    >
                      {moveFt !== null && (
                        <text
                          y={-r - 10}
                          textAnchor="middle"
                          fontSize={Math.max(13, grid * 0.32)}
                          fontWeight={700}
                          fill={overBudget ? "#ff6a4d" : "#F5E9CF"}
                          stroke="#0E0A06"
                          strokeWidth={Math.max(2, grid * 0.02)}
                          paintOrder="stroke"
                        >
                          {moveFt} ft{speedActive ? ` / ${remaining}` : ""}
                        </text>
                      )}
                      {active && (
                        <circle r={r + 6} fill="none" stroke="#E6C772" strokeWidth={4} opacity={0.9} />
                      )}
                      {selectedTokenId === t.id && (
                        <circle r={r + 3} fill="none" stroke="#7fd1e6" strokeWidth={2.5} strokeDasharray="5 4" opacity={0.9} />
                      )}
                      {flashId === t.id && (
                        <circle r={r + 8} fill="none" stroke="#F5E9CF" strokeWidth={5}>
                          <animate attributeName="r" values={`${r + 4};${r + 30}`} dur="0.85s" repeatCount="2" />
                          <animate attributeName="opacity" values="0.95;0" dur="0.85s" repeatCount="2" />
                        </circle>
                      )}
                      {speedDenied?.id === t.id && (
                        <g>
                          <circle r={r + 6} fill="none" stroke="#ff6a4d" strokeWidth={4}>
                            <animate attributeName="opacity" values="1;0" dur="1.3s" repeatCount="1" />
                          </circle>
                          <text
                            y={-r - 12}
                            textAnchor="middle"
                            fontSize={Math.max(12, grid * 0.3)}
                            fontWeight={700}
                            fill="#ff6a4d"
                            stroke="#0E0A06"
                            strokeWidth={2}
                            paintOrder="stroke"
                          >
                            no movement left
                          </text>
                        </g>
                      )}
                      <circle
                        r={r}
                        fill={dead ? "#2c2c2a" : bloodied ? (t.isPC ? "#3a2424" : "#4a1c14") : t.isPC ? "#243524" : "#3a1c17"}
                        stroke={dead ? "#6b6b66" : t.color}
                        strokeWidth={4}
                      />
                      {t.portraitUrl && !dead && (
                        <>
                          <clipPath id={`tkclip-${t.id}`}>
                            <circle r={r - 2} />
                          </clipPath>
                          <image
                            href={t.portraitUrl}
                            x={-r + 2}
                            y={-r + 2}
                            width={(r - 2) * 2}
                            height={(r - 2) * 2}
                            clipPath={`url(#tkclip-${t.id})`}
                            preserveAspectRatio="xMidYMid slice"
                            opacity={bloodied ? 0.8 : 1}
                          />
                          {bloodied && (
                            <circle r={r - 2} fill="#8a1a10" opacity={0.28} clipPath={`url(#tkclip-${t.id})`} />
                          )}
                        </>
                      )}
                      {c && !dead && (
                        <circle
                          r={r}
                          fill="none"
                          stroke={hpPct > 0.5 ? "#6E9A72" : hpPct > 0.25 ? "#E6C772" : "#C25A3D"}
                          strokeWidth={4}
                          strokeDasharray={`${Math.max(0, hpPct) * 2 * Math.PI * r} ${2 * Math.PI * r}`}
                          transform="rotate(-90)"
                          opacity={0.95}
                        />
                      )}
                      {(!t.portraitUrl || dead) && (
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={dead ? r * 1.1 : Math.min(r, grid * 0.5 || r)}
                          fontWeight={700}
                          fill={dead ? "#c9c9c2" : "#F5E9CF"}
                        >
                          {dead ? "☠" : initials(t.label)}
                        </text>
                      )}
                      {(t.elevation ?? 0) !== 0 && (
                        <g transform={`translate(${r * 0.78}, ${-r * 0.78})`}>
                          <rect x={-15} y={-9} width={30} height={18} rx={9} fill="#1c2f45" stroke="#7fd1e6" strokeWidth={1.5} />
                          <text textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill="#dff3fb">
                            {(t.elevation ?? 0) > 0 ? `↑${t.elevation}` : `↓${Math.abs(t.elevation ?? 0)}`}
                          </text>
                        </g>
                      )}
                      {t.hidden && isDM && (
                        <text y={r + 14} textAnchor="middle" fontSize={Math.max(11, r * 0.5)} fill="#C25A3D">
                          hidden
                        </text>
                      )}
                      {c && c.conditions.length > 0 && !dead && (() => {
                        const conds = c.conditions.slice(0, 6);
                        const n = conds.length;
                        const size = Math.max(11, r * 0.5);
                        const gap = size * 1.04;
                        const totalW = (n - 1) * gap + size;
                        const cy = -(r + size * 0.85);
                        return (
                          <g>
                            <title>{conds.join(", ")}</title>
                            <rect
                              x={-totalW / 2 - 3}
                              y={cy - size / 2 - 2}
                              width={totalW + 6}
                              height={size + 4}
                              rx={(size + 4) / 2}
                              fill="#0E0A06"
                              opacity={0.6}
                            />
                            {conds.map((cond, i) => (
                              <text
                                key={cond}
                                x={-totalW / 2 + size / 2 + i * gap}
                                y={cy}
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={size}
                              >
                                {CONDITION_ICON[cond] ?? "•"}
                              </text>
                            ))}
                          </g>
                        );
                      })()}
                    </g>
                  );
                })}

                {ruler && (
                  <g>
                    <line
                      x1={ruler.from.x}
                      y1={ruler.from.y}
                      x2={ruler.to.x}
                      y2={ruler.to.y}
                      stroke="#E6C772"
                      strokeWidth={3}
                      strokeDasharray="8 6"
                    />
                    <circle cx={ruler.to.x} cy={ruler.to.y} r={5} fill="#E6C772" />
                    <text
                      x={(ruler.from.x + ruler.to.x) / 2}
                      y={(ruler.from.y + ruler.to.y) / 2 - 10}
                      textAnchor="middle"
                      fontSize={Math.max(14, 22 / view.scale)}
                      fontWeight={700}
                      fill="#F5E9CF"
                      stroke="#0E0A06"
                      strokeWidth={Math.max(2, 3 / view.scale)}
                      paintOrder="stroke"
                    >
                      {grid ? `${feetBetween(ruler.from, ruler.to, grid, feetPerCell)} ft` : `${Math.round(dist(ruler.from, ruler.to))} px`}
                    </text>
                  </g>
                )}

                {pings
                  .filter((p) => p.mapId === map.id)
                  .map((p) => (
                    <circle
                      key={p.id}
                      cx={p.x}
                      cy={p.y}
                      r={grid ? grid * 0.6 : 30}
                      fill="none"
                      stroke={p.color}
                      strokeWidth={5}
                      className="map-ping"
                    />
                  ))}
              </svg>

              {/* ambient weather — topmost map-space layer */}
              {weather !== "none" && (
                <WeatherLayer w={imgSize.w} h={imgSize.h} kind={weather} />
              )}
            </div>
          )
        )}

        {/* Tool palette — floating parchment bar (panel) or slim HUD strip */}
        {chrome === "hud" ? (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute left-2 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-1 rounded-xl border border-[#c9a24a]/30 bg-[#161009]/95 p-1.5 shadow-lg backdrop-blur"
          >
            {tools.map((t, i) => (
              <button
                key={t.key}
                onClick={() => setTool(t.key)}
                title={`${t.label} (${i + 1})`}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-base transition-colors",
                  tool === t.key
                    ? "bg-[#c25a3d] text-[#f9ecd2] shadow"
                    : "text-[#e8d9b5] hover:bg-[#c9a24a]/20",
                )}
              >
                {TOOL_ICONS[t.key]}
              </button>
            ))}
            <div className="my-0.5 h-px w-6 bg-[#c9a24a]/25" />
            <button
              onClick={() => setView((v) => ({ ...v, scale: clamp(v.scale * 1.15, 0.1, 8) }))}
              title="Zoom in (+)"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-[#e8d9b5] hover:bg-[#c9a24a]/20"
            >
              +
            </button>
            <button
              onClick={() => setView((v) => ({ ...v, scale: clamp(v.scale / 1.15, 0.1, 8) }))}
              title="Zoom out (−)"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-[#e8d9b5] hover:bg-[#c9a24a]/20"
            >
              −
            </button>
            <button
              onClick={() => {
                const cont = containerRef.current;
                const sz = imgSizeRef.current;
                if (!cont || !sz) return;
                const r = cont.getBoundingClientRect();
                const scale = Math.min(r.width / sz.w, r.height / sz.h) || 1;
                setView({
                  scale,
                  offsetX: (r.width - sz.w * scale) / 2,
                  offsetY: (r.height - sz.h * scale) / 2,
                });
              }}
              title="Fit map (F)"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-base text-[#e8d9b5] hover:bg-[#c9a24a]/20"
            >
              ⛶
            </button>
            {(isDM && fogEnabled) || annotations.length > 0 ? (
              <div className="my-0.5 h-px w-6 bg-[#c9a24a]/25" />
            ) : null}
            {isDM && fogEnabled && (
              <button
                onClick={() => setDmPreview((v) => !v)}
                title="See the map as your players do"
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-base transition-colors",
                  dmPreview ? "bg-[#6e5a99] text-[#f9ecd2]" : "text-[#e8d9b5] hover:bg-[#c9a24a]/20",
                )}
              >
                👁
              </button>
            )}
            {annotations.length > 0 && (
              <button
                onClick={() => setShowAnnos((v) => !v)}
                title="Show or hide room labels & markers"
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg text-base transition-colors",
                  showAnnos ? "bg-[#c9a24a]/30 text-[#f0d885]" : "text-[#e8d9b5] hover:bg-[#c9a24a]/20",
                )}
              >
                🏷
              </button>
            )}
          </div>
        ) : (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute left-2 top-2 flex flex-wrap gap-1 rounded-card border border-parchment-400/60 bg-parchment-100/90 p-1 backdrop-blur"
          >
            {tools.map((t) => (
              <button
                key={t.key}
                onClick={() => setTool(t.key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                  tool === t.key
                    ? "bg-oxblood text-parchment-50"
                    : "text-ink-soft hover:bg-parchment-300/60",
                )}
              >
                {t.label}
              </button>
            ))}
            {isDM && fogEnabled && (
              <button
                onClick={() => setDmPreview((v) => !v)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                  dmPreview
                    ? "bg-arcane text-parchment-50"
                    : "text-ink-soft hover:bg-parchment-300/60",
                )}
                title="See the map as your players do"
              >
                {dmPreview ? "Previewing" : "Player view"}
              </button>
            )}
            {annotations.length > 0 && (
              <button
                onClick={() => setShowAnnos((v) => !v)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
                  showAnnos ? "bg-brass/20 text-brass-dark" : "text-ink-soft hover:bg-parchment-300/60",
                )}
                title="Show or hide room labels & markers"
              >
                Labels
              </button>
            )}
          </div>
        )}

        {/* AoE template controls */}
        {isDM && tool === "aoe" && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              "absolute flex flex-wrap items-center gap-1 p-1 text-xs backdrop-blur",
              chrome === "hud"
                ? "bottom-2 left-14 rounded-xl border border-[#c9a24a]/30 bg-[#161009]/95 text-[#e8d9b5]"
                : "bottom-2 left-2 rounded-card border border-parchment-400/60 bg-parchment-100/90",
            )}
          >
            {(["circle", "cone", "line"] as AoeShape[]).map((s) => (
              <button
                key={s}
                onClick={() => setAoeShape(s)}
                className={cn(
                  "rounded-md px-2 py-1 font-semibold capitalize transition-colors",
                  aoeShape === s
                    ? chrome === "hud"
                      ? "bg-[#c25a3d] text-[#f9ecd2]"
                      : "bg-oxblood text-parchment-50"
                    : chrome === "hud"
                      ? "text-[#e8d9b5] hover:bg-[#c9a24a]/20"
                      : "text-ink-soft hover:bg-parchment-300/60",
                )}
              >
                {s}
              </button>
            ))}
            <label className={cn("ml-1 flex items-center gap-1", chrome === "hud" ? "text-[#a3906c]" : "text-ink-soft")}>
              <input
                type="number"
                min={5}
                step={5}
                value={aoeFeet}
                onChange={(e) => setAoeFeet(Math.max(5, Number(e.target.value) || 5))}
                className="numerals h-7 w-14 rounded border border-parchment-400 bg-parchment-50 px-1 text-center text-ink"
              />
              ft
            </label>
            {templates.length > 0 && (
              <button
                onClick={() => void updateMap(map.id, { templates: [] })}
                className={cn(
                  "rounded-md px-2 py-1 font-semibold",
                  chrome === "hud" ? "text-[#a3906c] hover:text-[#e07a5f]" : "text-ink-soft hover:bg-parchment-300/60 hover:text-oxblood",
                )}
              >
                Clear ({templates.length})
              </button>
            )}
          </div>
        )}

        {/* Zoom (panel mode only — the HUD strip carries zoom) */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "absolute bottom-2 right-2 flex gap-1 rounded-card border border-parchment-400/60 bg-parchment-100/90 p-1 backdrop-blur",
            chrome === "hud" && "hidden",
          )}
        >
          <button
            onClick={() => setView((v) => ({ ...v, scale: clamp(v.scale * 1.15, 0.1, 8) }))}
            className="h-7 w-7 rounded-md text-ink-soft hover:bg-parchment-300/60"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => setView((v) => ({ ...v, scale: clamp(v.scale / 1.15, 0.1, 8) }))}
            className="h-7 w-7 rounded-md text-ink-soft hover:bg-parchment-300/60"
            aria-label="Zoom out"
          >
            −
          </button>
        </div>
      </div>
    </div>
  );
}

function pointsStr(flat: number[]): string {
  let s = "";
  for (let i = 0; i + 1 < flat.length; i += 2) s += `${flat[i]},${flat[i + 1]} `;
  return s.trim();
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = clamp(t, 0, 1);
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}
