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
import { useMapPings, useMaps, useRealtime } from "@/lib/data/hooks";
import type {
  AoeTemplate,
  BattleMap,
  CombatState,
  MapLight,
  MapToken,
  Wall,
} from "@/lib/domain/types";
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

type Tool = "select" | "pan" | "wall" | "light" | "aoe" | "draw" | "erase" | "ruler" | "ping";
type AoeShape = "circle" | "cone" | "line";

const DRAW_COLOR = "#E6C772";

const ALL_TOOLS: { key: Tool; label: string; dm?: boolean }[] = [
  { key: "select", label: "Move" },
  { key: "pan", label: "Pan" },
  { key: "ruler", label: "Ruler" },
  { key: "ping", label: "Ping" },
  { key: "wall", label: "Wall", dm: true },
  { key: "light", label: "Light", dm: true },
  { key: "aoe", label: "AoE", dm: true },
  { key: "draw", label: "Draw", dm: true },
  { key: "erase", label: "Erase", dm: true },
];

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

export function MapBoard({
  map,
  combat,
  isDM,
  userId,
}: {
  map: BattleMap;
  combat: CombatState | null;
  isDM: boolean;
  userId: string | null;
}) {
  const realtime = useRealtime();
  const { update: updateMap } = useMaps();
  const pings = useMapPings();

  const containerRef = useRef<HTMLDivElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const tempRef = useRef<HTMLCanvasElement | null>(null);
  const litRef = useRef<HTMLCanvasElement | null>(null);
  const exploredRef = useRef<HTMLCanvasElement | null>(null);

  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
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
  const drawings = map.drawings ?? [];
  const templates = map.templates ?? [];
  const pxPerFoot = grid > 0 ? grid / feetPerCell : 12;

  // Default vision for PC tokens so the map isn't pitch black if unset.
  const defaultVision = grid ? grid * 12 : imgSize ? Math.max(imgSize.w, imgSize.h) * 0.3 : 300;

  const tools = ALL_TOOLS.filter((t) => isDM || !t.dm);

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

    const viewers: MapToken[] = tokens
      .filter((t) => t.isPC && !t.hidden)
      .map((t) =>
        drag && drag.id === t.id ? { ...t, x: drag.pos.x, y: drag.pos.y } : t,
      )
      .map((t) => ({
        ...t,
        visionRadius:
          t.visionRadius && t.visionRadius > 0 ? t.visionRadius : defaultVision,
      }));

    if (viewers.length === 0) {
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
  }, [imgSize, fogEnabled, isDM, dmPreview, tokens, sightWalls, drag, defaultVision, lights, lightLevel]);

  useEffect(() => {
    renderFog();
  }, [renderFog]);

  // Warm light pools (visual tint), under the fog.
  const renderGlow = useCallback(() => {
    const g = glowCanvasRef.current;
    if (!g || !imgSize) return;
    const ctx = g.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, imgSize.w, imgSize.h);
    if (lightLevel === "bright" || lights.length === 0) return;
    ctx.globalCompositeOperation = "lighter";
    for (const L of lights) {
      if (L.radius <= 0) continue;
      const col = L.color ?? "#ffcf8a";
      const grad = ctx.createRadialGradient(L.x, L.y, L.radius * 0.1, L.x, L.y, L.radius);
      grad.addColorStop(0, hexA(col, 0.4 * (L.intensity ?? 1)));
      grad.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(L.x, L.y, L.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }, [imgSize, lights, lightLevel]);

  useEffect(() => {
    renderGlow();
  }, [renderGlow]);

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
        if (dist({ x: t.x, y: t.y }, p) <= t.radius) {
          if (isDM || t.ownerId === userId) return t;
        }
      }
      return null;
    },
    [tokens, isDM, userId],
  );

  function maskCtx() {
    return maskRef.current?.getContext("2d") ?? null;
  }

  const tokenVisible = useCallback(
    (t: MapToken): boolean => {
      if (t.hidden && !isDM) return false;
      if (isDM && !dmPreview) return true;
      if (t.ownerId && t.ownerId === userId) return true;
      if (!fogEnabled) return true;
      const ctx = maskCtx();
      if (!ctx || !imgSize) return true;
      return isVisibleAt(ctx, t.x, t.y, imgSize.w, imgSize.h);
    },
    [isDM, dmPreview, userId, fogEnabled, imgSize],
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
        } else if (isDM && toggleDoorAt(p)) {
          // handled — opened/closed a door
        } else {
          gesture.current = { mode: "pan", lastX: e.clientX, lastY: e.clientY };
        }
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
          const pos = grid ? snapToCellCenter(p, grid) : p;
          const light: MapLight = {
            id: newId(),
            x: Math.round(pos.x),
            y: Math.round(pos.y),
            radius: grid ? grid * 4 : 200,
            color: "#ffcf8a",
          };
          void updateMap(map.id, { lights: [...lights, light] });
        }
        break;
      case "aoe":
        if (isDM) {
          const origin = grid ? snapToCellCenter(p, grid) : p;
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
        }
        break;
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
      setDrag({ id: g.id, pos: { x: p.x - g.grab.x, y: p.y - g.grab.y } });
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
          const c = grid ? snapToCellCenter(p, grid) : p;
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
      const snapped = grid ? snapToCellCenter(drag.pos, grid) : drag.pos;
      realtime.moveToken(map.id, g.id, Math.round(snapped.x), Math.round(snapped.y));
      setDrag(null);
    } else if (g.mode === "ruler") {
      setRuler(null);
    } else if (g.mode === "wall" && pending && pending.kind === "wall") {
      const { from, to } = pending;
      if (dist(from, to) > 6) {
        const wall: Wall = { id: newId(), x1: from.x, y1: from.y, x2: to.x, y2: to.y };
        void updateMap(map.id, { walls: [...walls, wall] });
      }
      setPending(null);
    } else if (g.mode === "draw" && pending && pending.kind === "draw") {
      if (pending.points.length >= 4) {
        void updateMap(map.id, {
          drawings: [
            ...drawings,
            { id: newId(), color: DRAW_COLOR, width: 4, points: pending.points },
          ],
        });
      }
      setPending(null);
    } else if (g.mode === "aoe" && aoe) {
      void updateMap(map.id, { templates: [...templates, aoe] });
      setAoe(null);
    }
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
    void updateMap(map.id, {
      walls: walls.map((w) => (w.id === best ? { ...w, open: !w.open } : w)),
    });
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
      void updateMap(map.id, { templates: templates.filter((t) => t.id !== tplHit.id) });
      return;
    }
    const lightHit = lights.find((L) => dist(p, { x: L.x, y: L.y }) < Math.max(threshold, grid * 0.4));
    if (lightHit) {
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
    <div className="relative">
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          "relative h-[62vh] min-h-80 w-full overflow-hidden rounded-card border-2 border-parchment-400/70 bg-leather/90 touch-none select-none",
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
                {/* AoE spell templates — visible to everyone, above fog, under tokens */}
                {[...templates, ...(aoe ? [aoe] : [])].map((t) => {
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

                {/* Doors render live for EVERYONE (not baked) so open/closed
                    always matches state; the DM clicks one to toggle it. */}
                {walls
                  .filter((w) => (w.kind ?? "solid") === "door")
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

                {tokens.filter(tokenVisible).map((t) => {
                  const pos = drag && drag.id === t.id ? drag.pos : { x: t.x, y: t.y };
                  const c = combat?.combatants.find((x) => x.id === t.combatantId);
                  const hpPct = c && c.maxHp > 0 ? c.currentHp / c.maxHp : 1;
                  const active = t.combatantId && t.combatantId === activeCombatantId;
                  return (
                    <g key={t.id} transform={`translate(${pos.x}, ${pos.y})`}>
                      {active && (
                        <circle r={t.radius + 6} fill="none" stroke="#E6C772" strokeWidth={4} opacity={0.9} />
                      )}
                      {flashId === t.id && (
                        <circle r={t.radius + 8} fill="none" stroke="#F5E9CF" strokeWidth={5}>
                          <animate attributeName="r" values={`${t.radius + 4};${t.radius + 30}`} dur="0.85s" repeatCount="2" />
                          <animate attributeName="opacity" values="0.95;0" dur="0.85s" repeatCount="2" />
                        </circle>
                      )}
                      <circle
                        r={t.radius}
                        fill={t.isPC ? "#243524" : "#3a1c17"}
                        stroke={t.color}
                        strokeWidth={4}
                      />
                      {c && (
                        <circle
                          r={t.radius}
                          fill="none"
                          stroke={hpPct > 0.5 ? "#6E9A72" : hpPct > 0.25 ? "#E6C772" : "#C25A3D"}
                          strokeWidth={4}
                          strokeDasharray={`${Math.max(0, hpPct) * 2 * Math.PI * t.radius} ${2 * Math.PI * t.radius}`}
                          transform="rotate(-90)"
                          opacity={0.95}
                        />
                      )}
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={t.radius}
                        fontWeight={700}
                        fill="#F5E9CF"
                      >
                        {initials(t.label)}
                      </text>
                      {t.hidden && isDM && (
                        <text y={t.radius + 14} textAnchor="middle" fontSize={t.radius * 0.7} fill="#C25A3D">
                          hidden
                        </text>
                      )}
                      {c && c.conditions.length > 0 && (() => {
                        const conds = c.conditions.slice(0, 6);
                        const n = conds.length;
                        const size = Math.max(11, t.radius * 0.62);
                        const gap = size * 1.04;
                        const totalW = (n - 1) * gap + size;
                        const cy = -(t.radius + size * 0.85);
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
            </div>
          )
        )}

        {/* Tool palette */}
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
        </div>

        {/* AoE template controls */}
        {isDM && tool === "aoe" && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute bottom-2 left-2 flex flex-wrap items-center gap-1 rounded-card border border-parchment-400/60 bg-parchment-100/90 p-1 text-xs backdrop-blur"
          >
            {(["circle", "cone", "line"] as AoeShape[]).map((s) => (
              <button
                key={s}
                onClick={() => setAoeShape(s)}
                className={cn(
                  "rounded-md px-2 py-1 font-semibold capitalize transition-colors",
                  aoeShape === s ? "bg-oxblood text-parchment-50" : "text-ink-soft hover:bg-parchment-300/60",
                )}
              >
                {s}
              </button>
            ))}
            <label className="ml-1 flex items-center gap-1 text-ink-soft">
              <input
                type="number"
                min={5}
                step={5}
                value={aoeFeet}
                onChange={(e) => setAoeFeet(Math.max(5, Number(e.target.value) || 5))}
                className="numerals h-7 w-14 rounded border border-parchment-400 bg-parchment-50 px-1 text-center"
              />
              ft
            </label>
            {templates.length > 0 && (
              <button
                onClick={() => void updateMap(map.id, { templates: [] })}
                className="rounded-md px-2 py-1 font-semibold text-ink-soft hover:bg-parchment-300/60 hover:text-oxblood"
              >
                Clear ({templates.length})
              </button>
            )}
          </div>
        )}

        {/* Zoom */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute bottom-2 right-2 flex gap-1 rounded-card border border-parchment-400/60 bg-parchment-100/90 p-1 backdrop-blur"
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
