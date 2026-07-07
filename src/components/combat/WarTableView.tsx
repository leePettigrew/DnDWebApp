"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, SwordsIcon } from "@/components/ui/icons";
import { MapBoard, type TargetPick } from "./MapBoard";
import {
  useCharacters,
  useCombat,
  useMaps,
  usePermissions,
  useRealtime,
  useStatBlocks,
} from "@/lib/data/hooks";
import * as Combat from "@/lib/combat/state";
import { attackOptionsFor, type AttackOption } from "@/lib/combat/attacks";
import { parseRollSpec, spec } from "@/lib/domain/dice";
import { newId } from "@/lib/domain/ids";
import { HAZARD_MAP } from "@/lib/battle/hazards";
import type { View } from "@/lib/map/geometry";
import { TOKEN_SIZE_CELLS } from "@/lib/domain/types";
import type { Combatant, MapToken, RollMode, RollResult, TokenSize } from "@/lib/domain/types";

const SIZES: TokenSize[] = ["tiny", "small", "medium", "large", "huge", "gargantuan"];

const LIGHT_PRESETS = [
  { id: "day", label: "Daylight", level: "bright", tint: "" },
  { id: "dusk", label: "Dusk", level: "dim", tint: "#2a3358" },
  { id: "torch", label: "Torchlit", level: "dim", tint: "#6b3d12" },
  { id: "pitch", label: "Pitch black", level: "dark", tint: "#0a0a14" },
] as const;

function hpTone(pct: number): string {
  return pct > 0.5 ? "bg-forest" : pct > 0.25 ? "bg-brass" : "bg-oxblood";
}

/** The immersive fullscreen War Table: initiative rail, live map, token HUD. */
export function WarTableView({ onClose }: { onClose: () => void }) {
  const { value: combat, set: setCombat, update: updateCombat } = useCombat();
  const { items: maps, update: updateMap } = useMaps();
  const { items: characters } = useCharacters();
  const { items: statBlocks } = useStatBlocks();
  const { isDM, userId, canEditCombat } = usePermissions();

  const realtime = useRealtime();
  const map = maps.find((m) => m.id === combat?.activeMapId) ?? null;
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prompt, setPrompt] = useState<{ name: string; lines: string[] } | null>(null);
  const [cam, setCam] = useState<{ view: View; viewport: { w: number; h: number } } | null>(null);
  const [miniNat, setMiniNat] = useState<{ w: number; h: number } | null>(null);
  const [bookmarkName, setBookmarkName] = useState("");

  // ── Target & roll ──────────────────────────────────────────────────
  const [engage, setEngage] = useState<TargetPick | null>(null);
  const [attackId, setAttackId] = useState<string>("");
  const [bonusStr, setBonusStr] = useState<string>("0");
  const [damageStr, setDamageStr] = useState<string>("");
  const [rollMode, setRollMode] = useState<RollMode>("normal");
  const [atkResult, setAtkResult] = useState<RollResult | null>(null);
  const [dmgResult, setDmgResult] = useState<RollResult | null>(null);
  const [rolling, setRolling] = useState(false);

  const attackerToken = map?.tokens?.find((t) => t.id === engage?.attackerTokenId) ?? null;
  const targetToken = map?.tokens?.find((t) => t.id === engage?.targetTokenId) ?? null;
  const attackerCb = combat?.combatants.find((c) => c.id === attackerToken?.combatantId);
  const targetCb = combat?.combatants.find((c) => c.id === targetToken?.combatantId);
  const attackOptions = useMemo(
    () => attackOptionsFor(attackerCb, characters, statBlocks),
    [attackerCb, characters, statBlocks],
  );

  function applyAttackOption(o: AttackOption | undefined) {
    setAttackId(o?.id ?? "");
    setBonusStr(String(o?.bonus ?? 0));
    setDamageStr(o?.damage ?? "");
  }
  function handleTarget(pick: TargetPick) {
    setEngage(pick);
    setAtkResult(null);
    setDmgResult(null);
    setRollMode("normal");
  }
  // Prefill the roll card whenever a new attacker lines up.
  const lastAttackerRef = useRef<string | null>(null);
  useEffect(() => {
    const id = engage?.attackerTokenId ?? null;
    if (id === lastAttackerRef.current) return;
    lastAttackerRef.current = id;
    applyAttackOption(attackOptions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engage?.attackerTokenId, attackOptions]);

  async function rollAttack() {
    if (rolling || !attackerCb || !targetCb) return;
    setRolling(true);
    try {
      const bonus = parseInt(bonusStr, 10) || 0;
      const name = attackOptions.find((o) => o.id === attackId)?.name ?? "Attack";
      const r = await realtime.roll(
        spec(1, 20, bonus, rollMode, `${attackerCb.name} → ${targetCb.name}: ${name}`),
      );
      setAtkResult(r);
      setDmgResult(null);
    } finally {
      setRolling(false);
    }
  }
  async function rollDamage() {
    if (rolling || !attackerCb || !targetCb) return;
    const parsed = parseRollSpec(damageStr, undefined);
    if (!parsed) return;
    setRolling(true);
    try {
      const name = attackOptions.find((o) => o.id === attackId)?.name ?? "Attack";
      const crit = atkResult?.isCrit ?? false;
      const groups = crit ? parsed.groups.map((g) => ({ ...g, count: g.count * 2 })) : parsed.groups;
      const r = await realtime.roll({
        ...parsed,
        groups,
        label: `${attackerCb.name} → ${targetCb.name}: ${name} damage${crit ? " (CRIT)" : ""}`,
      });
      setDmgResult(r);
    } finally {
      setRolling(false);
    }
  }
  function applyRolledDamage() {
    if (!combat || !targetCb || !dmgResult) return;
    void setCombat(Combat.applyDamage(combat, targetCb.id, dmgResult.total));
    setDmgResult(null);
    setAtkResult(null);
  }

  const grid = map?.gridSize ?? 0;
  const feetPerCell = map?.feetPerCell ?? 5;
  const pxPerFoot = grid > 0 ? grid / feetPerCell : 12;

  const active: Combatant | null =
    combat && combat.active ? combat.combatants[combat.turnIndex] ?? null : null;

  const portraitOf = (c: Combatant): string | undefined => {
    if (!c.sourceId) return undefined;
    return c.isPC
      ? characters.find((x) => x.id === c.sourceId)?.portraitUrl || undefined
      : statBlocks.find((x) => x.id === c.sourceId)?.portraitUrl || undefined;
  };

  // Auto-center the camera on the active combatant when the turn changes,
  // and (DM) surface start-of-turn reminders: hazards underfoot, conditions,
  // death saves.
  const lastActiveRef = useRef<string | null>(null);
  useEffect(() => {
    const id = active?.id ?? null;
    if (id === lastActiveRef.current) return;
    lastActiveRef.current = id;
    setPrompt(null);
    if (!id || !active) return;
    window.dispatchEvent(new CustomEvent("dl:focus-combatant", { detail: { combatantId: id } }));
    if (!isDM) return;
    const lines: string[] = [];
    const token = map?.tokens?.find((t) => t.combatantId === id);
    const build = map?.build;
    if (token && build?.hazards && build.cellPx > 0) {
      const col = Math.floor(token.x / build.cellPx);
      const row = Math.floor(token.y / build.cellPx);
      if (col >= 0 && row >= 0 && col < build.cols && row < build.rows) {
        const hz = build.hazards[row * build.cols + col];
        const def = hz ? HAZARD_MAP.get(hz) : undefined;
        if (def) {
          lines.push(
            `Standing in ${def.name}${def.damage ? ` — ${def.damage}` : ""}${def.difficult ? " (difficult terrain)" : ""}`,
          );
        }
      }
    }
    if (active.conditions.length > 0) lines.push(`Conditions: ${active.conditions.join(", ")}`);
    if (active.currentHp <= 0 && active.maxHp > 0) {
      const ds = active.deathSaves ?? { successes: 0, failures: 0 };
      lines.push(`At 0 HP — death save! (${ds.successes}✓ / ${ds.failures}✗)`);
    }
    if (lines.length) setPrompt({ name: active.name, lines });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  // Esc: first dismiss the roll card, then leave the War Table.
  const engageOpenRef = useRef(false);
  engageOpenRef.current = !!engage;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key !== "Escape") return;
      if (engageOpenRef.current) {
        setEngage(null);
        setAtkResult(null);
        setDmgResult(null);
      } else {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectedToken: MapToken | null = useMemo(
    () => map?.tokens?.find((t) => t.id === selectedTokenId) ?? null,
    [map?.tokens, selectedTokenId],
  );
  // Map documents are DM-only on the server, so only the DM edits tokens
  // here; players get a read-out of their own token instead.
  const canEditToken = !!selectedToken && isDM;

  function patchToken(patch: Partial<MapToken>) {
    if (!map || !selectedToken) return;
    void updateMap(map.id, {
      tokens: (map.tokens ?? []).map((t) => (t.id === selectedToken.id ? { ...t, ...patch } : t)),
    });
  }
  function removeToken() {
    if (!map || !selectedToken) return;
    void updateMap(map.id, {
      tokens: (map.tokens ?? []).filter((t) => t.id !== selectedToken.id),
    });
    setSelectedTokenId(null);
  }
  function useSheetArt() {
    if (!selectedToken) return;
    const cb = combat?.combatants.find((c) => c.id === selectedToken.combatantId);
    if (!cb) return;
    const url = portraitOf(cb);
    if (url) patchToken({ portraitUrl: url });
  }

  const ftOf = (px: number | undefined) => (px && pxPerFoot > 0 ? Math.round(px / pxPerFoot) : 0);
  const pxOf = (ft: number) => Math.max(0, Math.round(ft * pxPerFoot));

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-ink">
      {/* ── Command bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-parchment-400/30 bg-parchment-100 px-4 py-2">
        <SwordsIcon className="h-5 w-5 text-oxblood" />
        <span className="font-display text-sm font-bold text-ink">
          {combat?.encounterName || map?.name || "War Table"}
        </span>
        {combat?.active && (
          <span className="rounded-full border border-brass/50 bg-brass/10 px-3 py-0.5 text-sm font-semibold text-brass-dark">
            Round {combat.round} · {active?.name ?? "—"}
          </span>
        )}
        {canEditCombat && combat?.active && (
          <span className="flex items-center gap-1">
            <Button size="sm" variant="secondary" onClick={() => void setCombat(Combat.prevTurn(combat))}>
              <ChevronLeftIcon className="h-4 w-4" /> Prev
            </Button>
            <Button size="sm" onClick={() => void setCombat(Combat.nextTurn(combat))}>
              Next turn <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {isDM && map && (
            <Button size="sm" variant="secondary" onClick={() => setSettingsOpen((v) => !v)}>
              {settingsOpen ? "✕ Settings" : "⚙ Map settings"}
            </Button>
          )}
          {isDM && maps.length > 0 && (
            <select
              value={map?.id ?? ""}
              onChange={(e) => {
                const m = maps.find((x) => x.id === e.target.value);
                if (m && m.gridSize === undefined) {
                  void updateMap(m.id, { gridSize: 70, feetPerCell: 5, showGrid: true, fogEnabled: false });
                }
                void updateCombat({ activeMapId: e.target.value || undefined });
              }}
              aria-label="Active map"
              className="h-8 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none"
            >
              <option value="">Choose a map…</option>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={onClose}
            aria-label="Leave the War Table"
            className="rounded-md p-1.5 text-ink-faint hover:bg-parchment-300/60 hover:text-ink"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── Initiative rail ─────────────────────────────────────── */}
        <div className="flex w-60 shrink-0 flex-col border-r border-parchment-400/30 bg-parchment-100/95">
          <p className="border-b border-parchment-400/40 px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">
            Initiative
          </p>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
            {!combat?.active || combat.combatants.length === 0 ? (
              <p className="px-1 py-2 text-xs text-ink-faint">
                No combat running — muster combatants on the Combat page, or use the map freely.
              </p>
            ) : (
              combat.combatants.map((c, i) => {
                const isActive = i === combat.turnIndex;
                const pct = c.maxHp > 0 ? Math.max(0, c.currentHp / c.maxHp) : 1;
                const down = c.currentHp <= 0 && c.maxHp > 0;
                const art = portraitOf(c);
                return (
                  <button
                    key={c.id}
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("dl:focus-combatant", { detail: { combatantId: c.id } }),
                      )
                    }
                    className={cn(
                      "block w-full rounded-lg border p-2 text-left transition-colors",
                      isActive
                        ? "border-brass bg-brass/15 shadow-gilt"
                        : "border-parchment-400/50 bg-parchment-50/60 hover:bg-parchment-300/40",
                      down && "opacity-60",
                    )}
                    title="Find on the map"
                  >
                    <span className="flex items-center gap-2">
                      <span className="numerals w-6 shrink-0 text-center font-display text-sm font-bold text-ink">
                        {c.initiative}
                      </span>
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 text-[0.6rem] font-bold",
                          c.isPC ? "border-forest/70 bg-forest/15 text-forest" : "border-oxblood/70 bg-oxblood/10 text-oxblood",
                        )}
                      >
                        {art ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={art} alt="" className="h-full w-full object-cover" />
                        ) : down ? (
                          "☠"
                        ) : (
                          c.name.slice(0, 2).toUpperCase()
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-xs font-semibold", down ? "text-oxblood line-through" : "text-ink")}>
                          {c.name}
                        </span>
                        <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-parchment-300/70">
                          <span className={cn("block h-full rounded-full", hpTone(pct))} style={{ width: `${pct * 100}%` }} />
                        </span>
                      </span>
                      {isDM && (
                        <span className="numerals shrink-0 text-[0.65rem] text-ink-faint">
                          {c.currentHp}/{c.maxHp}
                        </span>
                      )}
                    </span>
                    {c.conditions.length > 0 && (
                      <span className="mt-1 block truncate text-[0.6rem] text-oxblood">
                        {c.conditions.join(" · ")}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── Map ─────────────────────────────────────────────────── */}
        <div className="relative min-w-0 flex-1">
          {map ? (
            <MapBoard
              map={map}
              combat={combat}
              isDM={isDM}
              userId={userId}
              fillHeight
              shortcuts
              onSelectToken={setSelectedTokenId}
              onTarget={handleTarget}
              onViewChange={(view, viewport) => setCam({ view, viewport })}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-parchment-300/70">
                {isDM ? "Choose a map above to begin." : "The DM hasn't set a battle map yet."}
              </p>
            </div>
          )}

          {/* Minimap (DM — the plain image would leak fogged areas to players) */}
          {isDM && map && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute right-2 top-2 w-44 overflow-hidden rounded-md border border-parchment-400/70 bg-ink/80 shadow-lg"
              style={{ display: settingsOpen ? "none" : undefined }}
            >
              <div
                className="relative cursor-pointer"
                onClick={(e) => {
                  if (!miniNat) return;
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const fx = (e.clientX - r.left) / r.width;
                  const fy = (e.clientY - r.top) / r.height;
                  window.dispatchEvent(
                    new CustomEvent("dl:map-camera", {
                      detail: { x: fx * miniNat.w, y: fy * miniNat.h },
                    }),
                  );
                }}
                title="Click to jump the camera"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={map.imageUrl}
                  alt=""
                  className="block w-full opacity-90"
                  onLoad={(e) =>
                    setMiniNat({
                      w: (e.target as HTMLImageElement).naturalWidth,
                      h: (e.target as HTMLImageElement).naturalHeight,
                    })
                  }
                />
                {miniNat && (
                  <svg
                    viewBox={`0 0 ${miniNat.w} ${miniNat.h}`}
                    className="pointer-events-none absolute inset-0 h-full w-full"
                  >
                    {(map.tokens ?? []).map((t) => (
                      <circle
                        key={t.id}
                        cx={t.x}
                        cy={t.y}
                        r={Math.max(6, miniNat.w * 0.012)}
                        fill={t.isPC ? "#86b58a" : "#d6794a"}
                      />
                    ))}
                    {cam && cam.view.scale > 0 && (
                      <rect
                        x={-cam.view.offsetX / cam.view.scale}
                        y={-cam.view.offsetY / cam.view.scale}
                        width={cam.viewport.w / cam.view.scale}
                        height={cam.viewport.h / cam.view.scale}
                        fill="none"
                        stroke="#E6C772"
                        strokeWidth={Math.max(2, miniNat.w * 0.004)}
                      />
                    )}
                  </svg>
                )}
              </div>
            </div>
          )}

          {/* Start-of-turn reminders (DM) */}
          {prompt && (
            <div className="absolute left-1/2 top-3 w-[26rem] max-w-[90%] -translate-x-1/2 rounded-card border border-brass/60 bg-parchment-100/95 p-3 shadow-gilt backdrop-blur">
              <div className="flex items-start gap-2">
                <span className="text-lg">⚔️</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{prompt.name}&apos;s turn</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                    {prompt.lines.map((l, i) => (
                      <li key={i}>• {l}</li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={() => setPrompt(null)}
                  className="rounded p-1 text-ink-faint hover:text-ink"
                  aria-label="Dismiss"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Roll card — attack lined up with the Target tool */}
          {engage && attackerToken && targetToken && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute bottom-3 left-1/2 w-[34rem] max-w-[95%] -translate-x-1/2 rounded-card border border-oxblood/50 bg-parchment-100/97 p-3 text-xs shadow-lg backdrop-blur"
            >
              <div className="flex items-center gap-2">
                <SwordsIcon className="h-4 w-4 text-oxblood" />
                <span className="font-display text-sm font-bold text-ink">
                  {attackerToken.label} → {targetToken.label}
                </span>
                <span className={cn("font-semibold", engage.losBlocked ? "text-oxblood" : "text-ink-soft")}>
                  {engage.feet} ft{engage.losBlocked ? " · no line of sight!" : ""}
                </span>
                {isDM && targetCb && (
                  <span className="text-ink-faint">AC {targetCb.armorClass}</span>
                )}
                <button
                  onClick={() => { setEngage(null); setAtkResult(null); setDmgResult(null); }}
                  className="ml-auto rounded p-1 text-ink-faint hover:text-ink"
                  aria-label="Close roll card"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-end gap-2">
                {attackOptions.length > 0 && (
                  <label className="text-ink-soft">
                    <span className="mb-0.5 block text-[0.6rem] font-semibold uppercase tracking-wide">Attack</span>
                    <select
                      value={attackId}
                      onChange={(e) => applyAttackOption(attackOptions.find((o) => o.id === e.target.value))}
                      className="h-7 max-w-40 rounded border border-parchment-400 bg-parchment-50 px-1"
                    >
                      {attackOptions.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="text-ink-soft">
                  <span className="mb-0.5 block text-[0.6rem] font-semibold uppercase tracking-wide">To hit</span>
                  <input
                    value={bonusStr}
                    onChange={(e) => setBonusStr(e.target.value)}
                    className="numerals h-7 w-12 rounded border border-parchment-400 bg-parchment-50 px-1 text-center"
                  />
                </label>
                <label className="text-ink-soft">
                  <span className="mb-0.5 block text-[0.6rem] font-semibold uppercase tracking-wide">Damage</span>
                  <input
                    value={damageStr}
                    onChange={(e) => setDamageStr(e.target.value)}
                    placeholder="1d8+3 slashing"
                    className="h-7 w-32 rounded border border-parchment-400 bg-parchment-50 px-1"
                  />
                </label>
                <label className="text-ink-soft">
                  <span className="mb-0.5 block text-[0.6rem] font-semibold uppercase tracking-wide">Mode</span>
                  <select
                    value={rollMode}
                    onChange={(e) => setRollMode(e.target.value as RollMode)}
                    className="h-7 rounded border border-parchment-400 bg-parchment-50 px-1"
                  >
                    <option value="normal">Normal</option>
                    <option value="advantage">Advantage</option>
                    <option value="disadvantage">Disadvantage</option>
                  </select>
                </label>
                <Button size="sm" disabled={rolling} onClick={() => void rollAttack()}>
                  🎲 Attack
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={rolling || !parseRollSpec(damageStr)}
                  onClick={() => void rollDamage()}
                >
                  Damage{atkResult?.isCrit ? " ×2 (crit!)" : ""}
                </Button>
              </div>

              {(atkResult || dmgResult) && (
                <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-parchment-400/50 pt-2">
                  {atkResult && (
                    <span className="font-semibold text-ink">
                      To hit: <span className="numerals text-base">{atkResult.total}</span>
                      {atkResult.isCrit && <span className="ml-1 text-forest">natural 20!</span>}
                      {atkResult.isFumble && <span className="ml-1 text-oxblood">natural 1…</span>}
                      {isDM && targetCb && !atkResult.isFumble && (
                        <span className={cn("ml-2 rounded px-1.5 py-0.5 text-[0.65rem] font-bold uppercase", atkResult.isCrit || atkResult.total >= targetCb.armorClass ? "bg-forest/15 text-forest" : "bg-oxblood/12 text-oxblood")}>
                          {atkResult.isCrit || atkResult.total >= targetCb.armorClass ? "HIT" : "MISS"}
                        </span>
                      )}
                    </span>
                  )}
                  {dmgResult && (
                    <span className="font-semibold text-ink">
                      Damage: <span className="numerals text-base text-oxblood">{dmgResult.total}</span>
                    </span>
                  )}
                  {dmgResult && canEditCombat && targetCb && (
                    <Button size="sm" onClick={applyRolledDamage}>
                      Apply {dmgResult.total} to {targetCb.name}
                    </Button>
                  )}
                  <span className="ml-auto text-[0.6rem] text-ink-faint">rolls land in the shared dice log</span>
                </div>
              )}
            </div>
          )}

          {/* Token HUD */}
          {!engage && selectedToken && map && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute bottom-3 left-1/2 flex max-w-[95%] -translate-x-1/2 flex-wrap items-end gap-2 rounded-card border border-parchment-400/70 bg-parchment-100/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
            >
              <span className="mr-1 font-display text-sm font-bold text-ink">{selectedToken.label}</span>
              {canEditToken ? (
                <>
                  {isDM && (
                    <label className="text-ink-soft">
                      <span className="mb-0.5 block text-[0.6rem] font-semibold uppercase tracking-wide">Size</span>
                      <select
                        value={selectedToken.size ?? "medium"}
                        onChange={(e) => {
                          const size = e.target.value as TokenSize;
                          patchToken({
                            size,
                            radius: grid ? grid * 0.42 * Math.max(1, TOKEN_SIZE_CELLS[size]) : selectedToken.radius,
                          });
                        }}
                        className="h-7 rounded border border-parchment-400 bg-parchment-50 px-1 capitalize"
                      >
                        {SIZES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="text-ink-soft">
                    <span className="mb-0.5 block text-[0.6rem] font-semibold uppercase tracking-wide">Speed ft</span>
                    <input
                      type="number"
                      value={selectedToken.speed ?? 30}
                      onChange={(e) => patchToken({ speed: Math.max(0, Number(e.target.value) || 0) })}
                      className="numerals h-7 w-14 rounded border border-parchment-400 bg-parchment-50 px-1 text-center"
                    />
                  </label>
                  <label className="text-ink-soft">
                    <span className="mb-0.5 block text-[0.6rem] font-semibold uppercase tracking-wide">Elev ft</span>
                    <input
                      type="number"
                      step={5}
                      value={selectedToken.elevation ?? 0}
                      onChange={(e) => patchToken({ elevation: Number(e.target.value) || 0 })}
                      className="numerals h-7 w-14 rounded border border-parchment-400 bg-parchment-50 px-1 text-center"
                    />
                  </label>
                  <label className="text-ink-soft" title="How far this creature sees (0 = blind beyond others' sight)">
                    <span className="mb-0.5 block text-[0.6rem] font-semibold uppercase tracking-wide">Vision ft</span>
                    <input
                      type="number"
                      step={5}
                      value={ftOf(selectedToken.visionRadius)}
                      onChange={(e) => patchToken({ visionRadius: pxOf(Number(e.target.value) || 0) })}
                      className="numerals h-7 w-14 rounded border border-parchment-400 bg-parchment-50 px-1 text-center"
                    />
                  </label>
                  <label className="text-ink-soft" title="Light this creature carries (a torch is 40 ft)">
                    <span className="mb-0.5 block text-[0.6rem] font-semibold uppercase tracking-wide">Torch ft</span>
                    <input
                      type="number"
                      step={5}
                      value={ftOf(selectedToken.lightRadius)}
                      onChange={(e) => patchToken({ lightRadius: pxOf(Number(e.target.value) || 0) })}
                      className="numerals h-7 w-14 rounded border border-parchment-400 bg-parchment-50 px-1 text-center"
                    />
                  </label>
                  <label className="text-ink-soft" title="Sees in the dark without light">
                    <span className="mb-0.5 block text-[0.6rem] font-semibold uppercase tracking-wide">Darkv ft</span>
                    <input
                      type="number"
                      step={5}
                      value={ftOf(selectedToken.darkvision)}
                      onChange={(e) => patchToken({ darkvision: pxOf(Number(e.target.value) || 0) })}
                      className="numerals h-7 w-14 rounded border border-parchment-400 bg-parchment-50 px-1 text-center"
                    />
                  </label>
                  {isDM && (
                    <>
                      <label className="flex h-7 items-center gap-1 self-end text-ink-soft">
                        <input
                          type="checkbox"
                          checked={selectedToken.hidden ?? false}
                          onChange={(e) => patchToken({ hidden: e.target.checked })}
                          className="h-3.5 w-3.5 accent-oxblood"
                        />
                        Hidden
                      </label>
                      <Button size="sm" variant="secondary" onClick={useSheetArt} title="Pull portrait art from the linked sheet/stat block">
                        Use art
                      </Button>
                      <button
                        onClick={removeToken}
                        className="h-7 self-end rounded-md px-2 text-[0.65rem] font-semibold text-ink-faint hover:text-oxblood"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </>
              ) : (
                <span className="text-ink-faint">
                  {selectedToken.size ?? "medium"} · speed {selectedToken.speed ?? 30} ft
                  {(selectedToken.elevation ?? 0) !== 0 ? ` · elevation ${selectedToken.elevation} ft` : ""}
                </span>
              )}
            </div>
          )}

          {/* Settings drawer (DM) */}
          {isDM && map && settingsOpen && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute right-0 top-0 h-full w-64 space-y-3 overflow-y-auto border-l border-parchment-400/40 bg-parchment-100/95 p-3 text-xs backdrop-blur"
            >
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Grid</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={map.showGrid ?? false}
                    onChange={(e) => updateMap(map.id, { showGrid: e.target.checked })}
                    className="h-3.5 w-3.5 accent-brass"
                  />
                  Show grid
                </label>
                <label className="flex items-center gap-1">
                  px
                  <input
                    type="number"
                    value={map.gridSize ?? 70}
                    onChange={(e) => updateMap(map.id, { gridSize: Math.max(8, Number(e.target.value) || 0) })}
                    className="numerals h-6 w-14 rounded border border-parchment-400 bg-parchment-50 px-1 text-center"
                  />
                </label>
                <label className="flex items-center gap-1">
                  ft
                  <input
                    type="number"
                    value={map.feetPerCell ?? 5}
                    onChange={(e) => updateMap(map.id, { feetPerCell: Math.max(1, Number(e.target.value) || 5) })}
                    className="numerals h-6 w-12 rounded border border-parchment-400 bg-parchment-50 px-1 text-center"
                  />
                </label>
              </div>

              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Light & sight</p>
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1">
                  {LIGHT_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => updateMap(map.id, { lightLevel: p.level, lightTint: p.tint })}
                      className="rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 font-semibold text-ink-soft hover:bg-parchment-300/60"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center justify-between">
                  Ambient
                  <select
                    value={map.lightLevel ?? "bright"}
                    onChange={(e) => updateMap(map.id, { lightLevel: e.target.value as "bright" | "dim" | "dark" })}
                    className="h-6 rounded border border-parchment-400 bg-parchment-50 px-1"
                  >
                    <option value="bright">Bright</option>
                    <option value="dim">Dim</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
                <label className="flex items-center justify-between" title="Personal: each player only sees through their own tokens">
                  Vision
                  <select
                    value={map.visionMode ?? "shared"}
                    onChange={(e) => updateMap(map.id, { visionMode: e.target.value as "shared" | "personal" })}
                    className="h-6 rounded border border-parchment-400 bg-parchment-50 px-1"
                  >
                    <option value="shared">Shared party</option>
                    <option value="personal">Personal</option>
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={map.fogEnabled ?? false}
                    onChange={(e) => updateMap(map.id, { fogEnabled: e.target.checked })}
                    className="h-3.5 w-3.5 accent-oxblood"
                  />
                  Fog of war
                </label>
                <label className="flex items-center justify-between">
                  Weather
                  <select
                    value={map.weather ?? "none"}
                    onChange={(e) =>
                      updateMap(map.id, {
                        weather: e.target.value as "none" | "rain" | "snow" | "embers" | "mist",
                      })
                    }
                    className="h-6 rounded border border-parchment-400 bg-parchment-50 px-1"
                  >
                    <option value="none">Clear</option>
                    <option value="rain">Rain</option>
                    <option value="snow">Snow</option>
                    <option value="embers">Embers</option>
                    <option value="mist">Mist</option>
                  </select>
                </label>
              </div>

              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Rules</p>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5" title="Tokens can't pass through solid walls or closed doors">
                  <input
                    type="checkbox"
                    checked={map.enforceWalls ?? false}
                    onChange={(e) => updateMap(map.id, { enforceWalls: e.target.checked })}
                    className="h-3.5 w-3.5 accent-brass"
                  />
                  Walls block movement
                </label>
                <label className="flex items-center gap-1.5" title="Count difficult terrain double when measuring moves">
                  <input
                    type="checkbox"
                    checked={map.autoTerrainCost ?? false}
                    onChange={(e) => updateMap(map.id, { autoTerrainCost: e.target.checked })}
                    className="h-3.5 w-3.5 accent-brass"
                  />
                  Auto terrain cost
                </label>
                <label className="flex items-center justify-between">
                  Speed budget
                  <select
                    value={map.enforceSpeed ?? "off"}
                    onChange={(e) => updateMap(map.id, { enforceSpeed: e.target.value as "off" | "warn" | "block" })}
                    className="h-6 rounded border border-parchment-400 bg-parchment-50 px-1"
                  >
                    <option value="off">Free</option>
                    <option value="warn">Warn</option>
                    <option value="block">Enforce</option>
                  </select>
                </label>
              </div>

              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Camera spots</p>
              <div className="space-y-1.5">
                <div className="flex gap-1">
                  <input
                    value={bookmarkName}
                    onChange={(e) => setBookmarkName(e.target.value)}
                    placeholder="The altar…"
                    className="h-7 min-w-0 flex-1 rounded border border-parchment-400 bg-parchment-50 px-2"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      if (!cam || !bookmarkName.trim()) return;
                      const cx = (cam.viewport.w / 2 - cam.view.offsetX) / cam.view.scale;
                      const cy = (cam.viewport.h / 2 - cam.view.offsetY) / cam.view.scale;
                      void updateMap(map.id, {
                        bookmarks: [
                          ...(map.bookmarks ?? []),
                          { id: newId(), name: bookmarkName.trim(), scale: cam.view.scale, offsetX: cx, offsetY: cy },
                        ],
                      });
                      setBookmarkName("");
                    }}
                  >
                    Save
                  </Button>
                </div>
                {(map.bookmarks ?? []).map((b) => (
                  <div key={b.id} className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent("dl:map-camera", {
                            detail: { x: b.offsetX, y: b.offsetY, scale: b.scale },
                          }),
                        )
                      }
                      className="min-w-0 flex-1 truncate rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-left font-semibold text-ink-soft hover:bg-parchment-300/60"
                    >
                      📍 {b.name}
                    </button>
                    <button
                      onClick={() =>
                        updateMap(map.id, {
                          bookmarks: (map.bookmarks ?? []).filter((x) => x.id !== b.id),
                        })
                      }
                      className="px-1 text-ink-faint hover:text-oxblood"
                      aria-label={`Delete bookmark ${b.name}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">Housekeeping</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => updateMap(map.id, { tokens: [] })}
                  className="rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 font-semibold text-ink-soft hover:text-oxblood"
                >
                  Clear tokens
                </button>
                <button
                  onClick={() => updateMap(map.id, { walls: [], drawings: [] })}
                  className="rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 font-semibold text-ink-soft hover:text-oxblood"
                >
                  Clear walls/ink
                </button>
                <button
                  onClick={() => updateMap(map.id, { lights: [] })}
                  className="rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 font-semibold text-ink-soft hover:text-oxblood"
                >
                  Clear lights
                </button>
                <button
                  onClick={() => updateMap(map.id, { templates: [] })}
                  className="rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 font-semibold text-ink-soft hover:text-oxblood"
                >
                  Clear AoE
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
