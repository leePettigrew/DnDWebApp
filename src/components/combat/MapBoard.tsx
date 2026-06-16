"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { cn } from "@/components/ui/cn";
import { useMapPings, useMaps, useRealtime } from "@/lib/data/hooks";
import type {
  BattleMap,
  CombatState,
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
  accumulateExplored,
  computeVisibilityMask,
  isVisibleAt,
  paintFog,
} from "@/lib/map/fog";

type Tool = "select" | "pan" | "wall" | "draw" | "erase" | "ruler" | "ping";

const DRAW_COLOR = "#E6C772";

const ALL_TOOLS: { key: Tool; label: string; dm?: boolean }[] = [
  { key: "select", label: "Move" },
  { key: "pan", label: "Pan" },
  { key: "ruler", label: "Ruler" },
  { key: "ping", label: "Ping" },
  { key: "wall", label: "Wall", dm: true },
  { key: "draw", label: "Draw", dm: true },
  { key: "erase", label: "Erase", dm: true },
];

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
}

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
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const tempRef = useRef<HTMLCanvasElement | null>(null);
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

  const gesture = useRef<
    | { mode: "pan"; lastX: number; lastY: number }
    | { mode: "token"; id: string; grab: Pt }
    | { mode: "wall"; from: Pt }
    | { mode: "draw" }
    | { mode: "ruler"; from: Pt }
    | null
  >(null);

  const grid = map.gridSize ?? 0;
  const feetPerCell = map.feetPerCell ?? 5;
  const fogEnabled = map.fogEnabled ?? false;
  const tokens = map.tokens ?? [];
  const walls = map.walls ?? [];
  const drawings = map.drawings ?? [];

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

    const showFog = fogEnabled && (!isDM || dmPreview);
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

    computeVisibilityMask(mctx, tctx, imgSize.w, imgSize.h, viewers, walls);
    accumulateExplored(ectx, mask);
    paintFog(fctx, imgSize.w, imgSize.h, mask, explored, {
      fogColor: "rgba(8,6,4,0.98)",
      exploredDim: 0.55,
    });
  }, [imgSize, fogEnabled, isDM, dmPreview, tokens, walls, drag, defaultVision]);

  useEffect(() => {
    renderFog();
  }, [renderFog]);

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
    }
  }

  function eraseAt(p: Pt) {
    // Nearest wall within threshold first, else nearest drawing.
    const threshold = 14 / view.scale;
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

  function onWheel(e: ReactWheelEvent) {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
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
  }

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
        onWheel={onWheel}
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
                {isDM && (
                  <g stroke="#C25A3D" strokeWidth={3} strokeLinecap="round" opacity={0.85}>
                    {walls.map((w) => (
                      <line key={w.id} x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} />
                    ))}
                    {pending?.kind === "wall" && (
                      <line
                        x1={pending.from.x}
                        y1={pending.from.y}
                        x2={pending.to.x}
                        y2={pending.to.y}
                        strokeDasharray="6 6"
                      />
                    )}
                  </g>
                )}

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
        <div className="absolute left-2 top-2 flex flex-wrap gap-1 rounded-card border border-parchment-400/60 bg-parchment-100/90 p-1 backdrop-blur">
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

        {/* Zoom */}
        <div className="absolute bottom-2 right-2 flex gap-1 rounded-card border border-parchment-400/60 bg-parchment-100/90 p-1 backdrop-blur">
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
