"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, SwordsIcon } from "@/components/ui/icons";
import { MapBoard, snapTokenPos, tokenCells, type TargetPick } from "./MapBoard";
import {
  useCharacters,
  useCombat,
  useMaps,
  usePermissions,
  useRealtime,
  useRollHistory,
  useStatBlocks,
} from "@/lib/data/hooks";
import * as Combat from "@/lib/combat/state";
import {
  attackOptionsFor,
  usableItems,
  usableSpells,
  type AttackOption,
  type SpellEffect,
} from "@/lib/combat/attacks";
import { parseRollSpec, spec } from "@/lib/domain/dice";
import { newId } from "@/lib/domain/ids";
import {
  abilityMod,
  formatModifier,
  savingThrowBonus,
  skillBonus,
  spellSaveDC,
} from "@/lib/domain/character";
import { HAZARD_MAP } from "@/lib/battle/hazards";
import type { View } from "@/lib/map/geometry";
import { SKILLS, TOKEN_SIZE_CELLS } from "@/lib/domain/types";
import type {
  AbilityKey,
  Character,
  Combatant,
  MapToken,
  RollMode,
  RollResult,
  StatBlock,
  TokenSize,
} from "@/lib/domain/types";

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

const ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

const trayChip =
  "rounded-md border border-parchment-400/70 bg-parchment-50 px-2 py-1 text-[0.7rem] font-semibold text-ink-soft transition-colors hover:bg-brass/20 hover:text-brass-dark disabled:opacity-50";

/**
 * The active combatant's action tray: their attacks, ability checks, saves
 * and skills as one-click rolls — shown to whoever runs that combatant (its
 * owning player, or the DM), so each turn plays like a proper game turn.
 */
function TurnTray({
  cb,
  char,
  sb,
  attacks,
  remainingFt,
  rolling,
  onD20,
  onDamage,
}: {
  cb: Combatant;
  char: Character | null;
  sb: StatBlock | null;
  attacks: AttackOption[];
  remainingFt: number | null;
  rolling: boolean;
  onD20: (bonus: number, label: string, mode: RollMode) => void;
  onDamage: (damage: string, label: string) => void;
}) {
  const [mode, setMode] = useState<RollMode>("normal");
  const [skillKey, setSkillKey] = useState(SKILLS[0]?.key ?? "athletics");
  const [openSpellId, setOpenSpellId] = useState<string | null>(null);
  const scores = char?.abilityScores ?? sb?.abilityScores ?? null;
  const dying = cb.currentHp <= 0 && cb.maxHp > 0;
  const skill = SKILLS.find((s) => s.key === skillKey) ?? SKILLS[0];
  const spells = usableSpells(char);
  const items = usableItems(char);
  const dc = char ? spellSaveDC(char) : null;
  const openSpell = spells.find((s) => s.spell.id === openSpellId) ?? null;
  const armAoe = (fx: SpellEffect) => {
    if (!fx.shape || !fx.feet) return;
    window.dispatchEvent(
      new CustomEvent("dl:arm-aoe", { detail: { shape: fx.shape, feet: fx.feet } }),
    );
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute bottom-3 left-1/2 max-h-[38%] w-[42rem] max-w-[96%] -translate-x-1/2 space-y-1.5 overflow-y-auto rounded-card border border-brass/50 bg-parchment-100/97 px-3 py-2 text-xs shadow-gilt backdrop-blur"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-sm font-bold text-ink">⚔ {cb.name}&apos;s turn</span>
        {remainingFt !== null && (
          <span className="rounded-full bg-forest/15 px-2 py-0.5 font-semibold text-forest">
            {remainingFt} ft movement left
          </span>
        )}
        <span className="text-ink-faint">
          HP {cb.currentHp}/{cb.maxHp} · AC {cb.armorClass}
        </span>
        <span className="ml-auto flex overflow-hidden rounded-md border border-parchment-400/70">
          {(["normal", "advantage", "disadvantage"] as RollMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "px-1.5 py-0.5 text-[0.6rem] font-bold uppercase",
                mode === m ? "bg-oxblood text-parchment-50" : "bg-parchment-50 text-ink-faint hover:text-ink",
              )}
              title={m}
            >
              {m === "normal" ? "—" : m === "advantage" ? "ADV" : "DIS"}
            </button>
          ))}
        </span>
      </div>

      {dying && (
        <div className="flex items-center gap-2 rounded-md border border-oxblood/50 bg-oxblood/10 px-2 py-1">
          <span className="font-semibold text-oxblood">At 0 HP — roll a death save (10+ succeeds)</span>
          <button disabled={rolling} onClick={() => onD20(0, `${cb.name} — death save`, mode)} className={trayChip}>
            🎲 Death save
          </button>
        </div>
      )}

      {attacks.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-12 shrink-0 text-[0.6rem] font-semibold uppercase tracking-wide text-ink-faint">Attacks</span>
          {attacks.map((a) => (
            <span key={a.id} className="flex overflow-hidden rounded-md border border-parchment-400/70">
              <button
                disabled={rolling}
                onClick={() => onD20(a.bonus ?? 0, `${cb.name} — ${a.name}`, mode)}
                title={a.note ?? a.name}
                className="bg-parchment-50 px-2 py-1 text-[0.7rem] font-semibold text-ink-soft hover:bg-oxblood/15 hover:text-oxblood disabled:opacity-50"
              >
                ⚔ {a.name} {a.bonus !== undefined ? formatModifier(a.bonus) : ""}
                {a.range ? <span className="ml-1 text-[0.6rem] text-ink-faint">{a.range.normal}/{a.range.long} ft</span> : null}
              </button>
              {a.damage && parseRollSpec(a.damage) && (
                <button
                  disabled={rolling}
                  onClick={() => onDamage(a.damage!, `${cb.name} — ${a.name} damage`)}
                  title={`Roll ${a.damage}`}
                  className="border-l border-parchment-400/70 bg-parchment-50 px-1.5 py-1 text-[0.65rem] text-ink-faint hover:bg-oxblood/15 hover:text-oxblood disabled:opacity-50"
                >
                  {a.damage.split(" ")[0]}
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {spells.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-12 shrink-0 text-[0.6rem] font-semibold uppercase tracking-wide text-ink-faint">Spells</span>
          {spells.map(({ spell, fx }) => (
            <button
              key={spell.id}
              onClick={() => setOpenSpellId(openSpellId === spell.id ? null : spell.id)}
              title={spell.description}
              className={cn(
                "rounded-md border px-2 py-1 text-[0.7rem] font-semibold transition-colors",
                openSpellId === spell.id
                  ? "border-arcane bg-arcane/20 text-arcane"
                  : "border-parchment-400/70 bg-parchment-50 text-ink-soft hover:bg-arcane/15 hover:text-arcane",
              )}
            >
              ✦ {spell.name}
            </button>
          ))}
        </div>
      )}

      {openSpell && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-arcane/40 bg-arcane/10 px-2 py-1.5">
          <span className="font-semibold text-arcane">✦ {openSpell.spell.name}</span>
          {openSpell.fx.rangeText && <span className="text-ink-soft">📏 {openSpell.fx.rangeText}</span>}
          {openSpell.fx.shape && openSpell.fx.feet && (
            <span className="text-ink-soft">
              ⌖ {openSpell.fx.feet}-ft {openSpell.fx.shape}
            </span>
          )}
          {openSpell.fx.save && (
            <span className="text-ink-soft">
              🛡 {openSpell.fx.save} save{dc !== null ? ` DC ${dc}` : ""}
            </span>
          )}
          {openSpell.fx.damage && parseRollSpec(openSpell.fx.damage) && (
            <button
              disabled={rolling}
              onClick={() => onDamage(openSpell.fx.damage!, `${cb.name} — ${openSpell.spell.name}`)}
              className={trayChip}
            >
              🎲 {openSpell.fx.damage}
            </button>
          )}
          {openSpell.fx.shape && openSpell.fx.feet && (
            <button onClick={() => armAoe(openSpell.fx)} className={trayChip} title="Click the map to place the template">
              ⌖ Place template
            </button>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-12 shrink-0 text-[0.6rem] font-semibold uppercase tracking-wide text-ink-faint">Items</span>
          {items.map(({ item, dice }) => (
            <button
              key={item.id}
              disabled={rolling}
              onClick={() => onDamage(dice, `${cb.name} — ${item.name}`)}
              title={item.description ?? item.properties ?? item.name}
              className={trayChip}
            >
              🧪 {item.name} ({dice}
              {item.quantity > 1 ? ` ×${item.quantity}` : ""})
            </button>
          ))}
        </div>
      )}

      {scores && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-12 shrink-0 text-[0.6rem] font-semibold uppercase tracking-wide text-ink-faint">Checks</span>
          {ABILITIES.map((k) => {
            const m = abilityMod(scores, k);
            return (
              <button
                key={k}
                disabled={rolling}
                onClick={() => onD20(m, `${cb.name} — ${k.toUpperCase()} check`, mode)}
                className={trayChip}
              >
                {k.toUpperCase()} {formatModifier(m)}
              </button>
            );
          })}
        </div>
      )}

      {scores && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-12 shrink-0 text-[0.6rem] font-semibold uppercase tracking-wide text-ink-faint">Saves</span>
          {ABILITIES.map((k) => {
            const m = char ? savingThrowBonus(char, k) : abilityMod(scores, k);
            return (
              <button
                key={k}
                disabled={rolling}
                onClick={() => onD20(m, `${cb.name} — ${k.toUpperCase()} save`, mode)}
                className={trayChip}
              >
                {k.toUpperCase()} {formatModifier(m)}
              </button>
            );
          })}
        </div>
      )}

      {char && skill && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-12 shrink-0 text-[0.6rem] font-semibold uppercase tracking-wide text-ink-faint">Skills</span>
          <select
            value={skillKey}
            onChange={(e) => setSkillKey(e.target.value as typeof skillKey)}
            className="h-6 rounded border border-parchment-400 bg-parchment-50 px-1 text-[0.7rem]"
          >
            {SKILLS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label} ({formatModifier(skillBonus(char, s))})
              </option>
            ))}
          </select>
          <button
            disabled={rolling}
            onClick={() => onD20(skillBonus(char, skill), `${cb.name} — ${skill.label}`, mode)}
            className={trayChip}
          >
            🎲 Roll {skill.label}
          </button>
        </div>
      )}

      {!scores && attacks.length === 0 && (
        <p className="text-[0.65rem] text-ink-faint">
          No linked sheet or stat block — quick d20:
          <button disabled={rolling} onClick={() => onD20(0, `${cb.name} — d20`, mode)} className={cn(trayChip, "ml-2")}>
            🎲 d20
          </button>
        </p>
      )}
    </div>
  );
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
  const [logOpen, setLogOpen] = useState(true);
  const { items: rollLog } = useRollHistory();
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const turnStartRef = useRef(Date.now());
  const [conPrompts, setConPrompts] = useState<
    { id: string; cbId: string; name: string; dmg: number; dc: number; bonus: number }[]
  >([]);
  const [oaPrompt, setOaPrompt] = useState<{
    id: string;
    moverName: string;
    enemies: { cbId: string; name: string; attack: AttackOption | null }[];
  } | null>(null);

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
    let next = Combat.applyDamage(combat, targetCb.id, dmgResult.total);
    next = Combat.appendLog(
      next,
      `${attackerCb?.name ?? "Someone"} hits ${targetCb.name} for ${dmgResult.total} damage.`,
      "damage",
    );
    void setCombat(next);
    setDmgResult(null);
    setAtkResult(null);
  }

  const grid = map?.gridSize ?? 0;
  const feetPerCell = map?.feetPerCell ?? 5;
  const pxPerFoot = grid > 0 ? grid / feetPerCell : 12;

  const active: Combatant | null =
    combat && combat.active ? combat.combatants[combat.turnIndex] ?? null : null;

  // ── Turn tray (the active combatant's playable actions) ────────────
  const activeChar = active?.isPC
    ? characters.find((c) => c.id === active.sourceId) ?? null
    : null;
  const activeSb =
    active && !active.isPC ? statBlocks.find((s) => s.id === active.sourceId) ?? null : null;
  const activeAttacks = useMemo(
    () => attackOptionsFor(active ?? undefined, characters, statBlocks),
    [active, characters, statBlocks],
  );
  const canAct = !!active && (isDM || (!!activeChar?.ownerId && activeChar.ownerId === userId));
  async function trayD20(bonus: number, label: string, mode: RollMode) {
    if (rolling) return;
    setRolling(true);
    try {
      await realtime.roll(spec(1, 20, bonus, mode, label));
    } finally {
      setRolling(false);
    }
  }
  async function trayDamage(damage: string, label: string) {
    const parsed = parseRollSpec(damage, label);
    if (!parsed || rolling) return;
    setRolling(true);
    try {
      await realtime.roll(parsed);
    } finally {
      setRolling(false);
    }
  }

  // ── Turn advance (chronicled) + timer ───────────────────────────────
  function advanceTurn(dir: 1 | -1) {
    if (!combat) return;
    let next = dir === 1 ? Combat.nextTurn(combat) : Combat.prevTurn(combat);
    const nm = next.combatants[next.turnIndex]?.name ?? "—";
    next = Combat.appendLog(next, `Round ${next.round} — ${nm}'s turn.`, "turn");
    void setCombat(next);
  }
  const turnSeconds = combat?.turnSeconds ?? 0;
  useEffect(() => {
    if (!combat?.active || turnSeconds <= 0) return;
    const id = window.setInterval(() => setTimerNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [combat?.active, turnSeconds]);
  const timerLeft =
    combat?.active && turnSeconds > 0
      ? Math.max(0, turnSeconds - (timerNow - turnStartRef.current) / 1000)
      : null;

  // ── Concentration watchdog (DM): damage → CON save prompt ──────────
  const prevHpRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const prev = prevHpRef.current;
    const next = new Map<string, number>();
    for (const cb of combat?.combatants ?? []) next.set(cb.id, cb.currentHp);
    if (isDM && combat?.active) {
      for (const cb of combat.combatants) {
        const p = prev.get(cb.id);
        if (p !== undefined && cb.currentHp < p && cb.conditions.includes("concentration")) {
          const dmg = p - cb.currentHp;
          const dc = Math.max(10, Math.floor(dmg / 2));
          const ch = cb.isPC ? characters.find((c) => c.id === cb.sourceId) : null;
          const sbX = !cb.isPC ? statBlocks.find((s) => s.id === cb.sourceId) : null;
          const bonus = ch
            ? savingThrowBonus(ch, "con")
            : sbX
              ? abilityMod(sbX.abilityScores, "con")
              : 0;
          setConPrompts((q) => [...q, { id: newId(), cbId: cb.id, name: cb.name, dmg, dc, bonus }]);
        }
      }
    }
    prevHpRef.current = next;
  }, [combat, isDM, characters, statBlocks]);

  async function rollConcentration(p: (typeof conPrompts)[number]) {
    if (rolling) return;
    setRolling(true);
    try {
      const r = await realtime.roll(
        spec(1, 20, p.bonus, "normal", `${p.name} — concentration (DC ${p.dc})`),
      );
      const kept = r.isCrit ? true : r.isFumble ? false : r.total >= p.dc;
      if (combat) {
        let next = combat;
        if (!kept) next = Combat.toggleCondition(next, p.cbId, "concentration");
        next = Combat.appendLog(
          next,
          kept
            ? `${p.name} holds concentration (${r.total} vs DC ${p.dc}).`
            : `${p.name} LOSES concentration (${r.total} vs DC ${p.dc})!`,
          "save",
        );
        void setCombat(next);
      }
      setConPrompts((q) => q.filter((x) => x.id !== p.id));
    } finally {
      setRolling(false);
    }
  }

  // ── Opportunity attacks (fired by the DM client's move watcher) ─────
  function handleProvoke({ moverTokenId, enemyTokenIds }: { moverTokenId: string; enemyTokenIds: string[] }) {
    const toks = map?.tokens ?? [];
    const mover = toks.find((t) => t.id === moverTokenId);
    if (!mover || !combat) return;
    const enemies = enemyTokenIds
      .map((id) => {
        const t = toks.find((x) => x.id === id);
        const cb = combat.combatants.find((c) => c.id === t?.combatantId);
        if (!cb) return null;
        const atts = attackOptionsFor(cb, characters, statBlocks);
        return { cbId: cb.id, name: cb.name, attack: atts[0] ?? null };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    if (!enemies.length) return;
    setOaPrompt({ id: newId(), moverName: mover.label, enemies });
    void updateCombat(
      Combat.appendLog(
        combat,
        `${mover.label} moves out of reach — ${enemies.map((e) => e.name).join(", ")} may take an opportunity attack!`,
        "misc",
      ),
    );
  }

  // ── Chronicle: combat log + shared dice rolls, merged by time ──────
  const chronicle = useMemo(() => {
    const icons: Record<string, string> = { turn: "⚔", damage: "💥", door: "🚪", save: "🛡", misc: "❗" };
    const fromLog = (combat?.log ?? []).map((e) => ({
      id: e.id,
      at: e.at,
      icon: icons[e.kind ?? "misc"] ?? "•",
      text: e.text,
    }));
    const fromRolls = rollLog.map((r) => ({
      id: r.id,
      at: r.timestamp,
      icon: "🎲",
      text: `${r.rolledByName ? `${r.rolledByName}: ` : ""}${r.label ?? r.notation} → ${r.total}`,
    }));
    return [...fromLog, ...fromRolls]
      .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
      .slice(-70);
  }, [combat?.log, rollLog]);
  const chronicleEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chronicleEndRef.current?.scrollIntoView({ block: "end" });
  }, [chronicle.length, logOpen]);

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
    turnStartRef.current = Date.now();
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
    // bg-leather stays dark in BOTH themes (bg-ink flips to light in dark
    // mode, which read as a blank cream void while the map loaded).
    <div className="fixed inset-0 z-[70] flex flex-col bg-leather">
      {/* ── Command bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-parchment-400/30 bg-parchment-100 px-4 py-2">
        <SwordsIcon className="h-5 w-5 text-oxblood" />
        <span className="font-display text-sm font-bold text-ink">
          {combat?.encounterName || map?.name || "War Table"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setLogOpen((v) => !v)}>
            📜 Chronicle
          </Button>
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
              onProvoke={isDM ? handleProvoke : undefined}
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

          {/* Chronicle — the fight's story: rolls, damage, turns, doors */}
          {logOpen && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute bottom-14 right-2 z-10 flex max-h-[42%] w-80 max-w-[85%] flex-col overflow-hidden rounded-card border border-[#c9a24a]/40 bg-[#161009]/92 shadow-lg backdrop-blur"
            >
              <div className="flex items-center gap-2 border-b border-[#c9a24a]/25 px-3 py-1.5">
                <span className="text-[0.6rem] font-bold uppercase tracking-[0.2em] text-[#c9a24a]">
                  📜 Chronicle
                </span>
                <button
                  onClick={() => setLogOpen(false)}
                  className="ml-auto rounded p-0.5 text-[#a3906c] hover:text-[#f2e6cb]"
                  aria-label="Close chronicle"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-2">
                {chronicle.length === 0 ? (
                  <p className="text-[0.7rem] text-[#a3906c]">Nothing yet — the tale begins…</p>
                ) : (
                  chronicle.map((e) => (
                    <p key={e.id} className="text-[0.7rem] leading-snug text-[#e8d9b5]">
                      <span className="mr-1">{e.icon}</span>
                      {e.text}
                    </p>
                  ))
                )}
                <div ref={chronicleEndRef} />
              </div>
            </div>
          )}

          {/* ── Top-center HUD stack: turn banner, reminders, saves, OAs ── */}
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 flex w-[30rem] max-w-[94%] -translate-x-1/2 flex-col items-center gap-2">
            {combat?.active && (
              <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-[#c9a24a]/60 bg-[#161009]/95 py-1.5 pl-2 pr-2 shadow-lg backdrop-blur">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
                  {timerLeft !== null && turnSeconds > 0 && (
                    <svg viewBox="0 0 44 44" className="absolute inset-0 h-full w-full -rotate-90">
                      <circle cx="22" cy="22" r="20" fill="none" stroke="#3a2d1a" strokeWidth="3" />
                      <circle
                        cx="22"
                        cy="22"
                        r="20"
                        fill="none"
                        stroke={timerLeft / turnSeconds < 0.25 ? "#e05545" : "#c9a24a"}
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={`${(timerLeft / turnSeconds) * 125.7} 125.7`}
                        className={timerLeft / turnSeconds < 0.25 ? "animate-pulse" : undefined}
                      />
                    </svg>
                  )}
                  <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-[#c9a24a]/70 bg-[#241a10] text-xs font-bold text-[#f0d885]">
                    {active && portraitOf(active) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={portraitOf(active)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      active?.name.slice(0, 2).toUpperCase() ?? "—"
                    )}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-[0.6rem] font-bold uppercase tracking-[0.2em] text-[#c9a24a]">
                    Round {combat.round}
                    {timerLeft !== null && turnSeconds > 0 ? ` · ${Math.ceil(timerLeft)}s` : ""}
                  </span>
                  <span className="block max-w-52 truncate font-display text-base font-bold leading-tight text-[#f2e6cb]">
                    {active?.name ?? "—"}
                  </span>
                </span>
                {canEditCombat && (
                  <span className="ml-1 flex items-center gap-1">
                    <button
                      onClick={() => advanceTurn(-1)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-[#c9a24a]/40 text-[#e8d9b5] hover:bg-[#c9a24a]/20"
                      aria-label="Previous turn"
                    >
                      <ChevronLeftIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => advanceTurn(1)}
                      className="flex h-8 items-center gap-1 rounded-full border border-[#c9a24a]/60 bg-[#c9a24a]/15 px-3 text-xs font-bold uppercase tracking-wide text-[#f0d885] hover:bg-[#c9a24a]/30"
                    >
                      End turn <ChevronRightIcon className="h-4 w-4" />
                    </button>
                  </span>
                )}
              </div>
            )}

            {prompt && (
              <div className="pointer-events-auto w-full rounded-card border border-brass/60 bg-parchment-100/95 p-3 shadow-gilt backdrop-blur">
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

            {conPrompts.map((p) => (
              <div key={p.id} className="pointer-events-auto flex w-full flex-wrap items-center gap-2 rounded-card border border-arcane/60 bg-parchment-100/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                <span className="text-base">🧠</span>
                <span className="min-w-0 flex-1 font-semibold text-ink">
                  {p.name} took {p.dmg} — CON save DC {p.dc} to keep concentration
                </span>
                <Button size="sm" disabled={rolling} onClick={() => void rollConcentration(p)}>
                  🎲 Roll {formatModifier(p.bonus)}
                </Button>
                <button
                  onClick={() => setConPrompts((q) => q.filter((x) => x.id !== p.id))}
                  className="rounded p-1 text-ink-faint hover:text-ink"
                  aria-label="Dismiss"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
            ))}

            {oaPrompt && (
              <div className="pointer-events-auto w-full rounded-card border border-oxblood/60 bg-parchment-100/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚡</span>
                  <span className="min-w-0 flex-1 font-semibold text-ink">
                    {oaPrompt.moverName} provokes opportunity attacks!
                  </span>
                  <button
                    onClick={() => setOaPrompt(null)}
                    className="rounded p-1 text-ink-faint hover:text-ink"
                    aria-label="Dismiss"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {oaPrompt.enemies.map((e) => (
                    <span key={e.cbId} className="flex items-center gap-1">
                      <button
                        disabled={rolling}
                        onClick={() =>
                          void trayD20(
                            e.attack?.bonus ?? 0,
                            `${e.name} — opportunity attack vs ${oaPrompt.moverName}`,
                            "normal",
                          )
                        }
                        className="rounded-md border border-oxblood/50 bg-oxblood/10 px-2 py-1 font-semibold text-oxblood hover:bg-oxblood/20 disabled:opacity-50"
                      >
                        ⚔ {e.name} {e.attack?.bonus !== undefined ? formatModifier(e.attack.bonus) : ""}
                      </button>
                      {e.attack?.damage && parseRollSpec(e.attack.damage) && (
                        <button
                          disabled={rolling}
                          onClick={() => void trayDamage(e.attack!.damage!, `${e.name} — OA damage`)}
                          className="rounded-md border border-parchment-400/70 bg-parchment-50 px-1.5 py-1 text-[0.65rem] text-ink-faint hover:text-oxblood disabled:opacity-50"
                        >
                          {e.attack.damage.split(" ")[0]}
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

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
                {(() => {
                  const opt = attackOptions.find((o) => o.id === attackId);
                  if (!opt?.range) return null;
                  if (engage.feet > opt.range.long)
                    return <span className="font-bold text-oxblood">out of range ({opt.range.long} ft max)</span>;
                  if (engage.feet > opt.range.normal)
                    return <span className="font-semibold text-brass-dark">long range — disadvantage</span>;
                  return null;
                })()}
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

          {/* Turn tray — your combatant's actions, like a proper game turn */}
          {!engage && !selectedToken && map && active && canAct && (
            <TurnTray
              cb={active}
              char={activeChar}
              sb={activeSb}
              attacks={activeAttacks}
              remainingFt={(() => {
                if ((map.enforceSpeed ?? "off") === "off") return null;
                const tk = map.tokens?.find((t) => t.combatantId === active.id);
                return tk ? Math.max(0, (tk.speed ?? 30) - (tk.movedFt ?? 0)) : null;
              })()}
              rolling={rolling}
              onD20={(b, l, m) => void trayD20(b, l, m)}
              onDamage={(d, l) => void trayDamage(d, l)}
            />
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
                <label className="flex items-center gap-1" title="Shift the grid right to line the tiles up with the map art">
                  off x
                  <input
                    type="number"
                    value={map.gridOffsetX ?? 0}
                    onChange={(e) => updateMap(map.id, { gridOffsetX: Number(e.target.value) || 0 })}
                    className="numerals h-6 w-14 rounded border border-parchment-400 bg-parchment-50 px-1 text-center"
                  />
                </label>
                <label className="flex items-center gap-1" title="Shift the grid down to line the tiles up with the map art">
                  off y
                  <input
                    type="number"
                    value={map.gridOffsetY ?? 0}
                    onChange={(e) => updateMap(map.id, { gridOffsetY: Number(e.target.value) || 0 })}
                    className="numerals h-6 w-14 rounded border border-parchment-400 bg-parchment-50 px-1 text-center"
                  />
                </label>
                <button
                  onClick={() => {
                    const g = map.gridSize ?? 0;
                    if (!g) return;
                    void updateMap(map.id, {
                      tokens: (map.tokens ?? []).map((t) => {
                        const s = snapTokenPos(
                          { x: t.x, y: t.y },
                          g,
                          tokenCells(t),
                          map.gridOffsetX ?? 0,
                          map.gridOffsetY ?? 0,
                        );
                        return { ...t, x: Math.round(s.x), y: Math.round(s.y) };
                      }),
                    });
                  }}
                  title="Re-center every token onto the current grid (after changing size/offset)"
                  className="rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 font-semibold text-ink-soft hover:bg-parchment-300/60"
                >
                  ⌗ Snap tokens to grid
                </button>
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
                <label className="flex items-center gap-1.5" title="Snap dropped tokens to the grid; off = place tokens anywhere">
                  <input
                    type="checkbox"
                    checked={map.snapToGrid ?? true}
                    onChange={(e) => updateMap(map.id, { snapToGrid: e.target.checked })}
                    className="h-3.5 w-3.5 accent-brass"
                  />
                  Snap tokens to grid
                </label>
                <label className="flex items-center justify-between" title="Per-turn countdown shown on the banner (0 = off)">
                  Turn timer
                  <span className="flex items-center gap-1">
                    {[0, 60, 90].map((s) => (
                      <button
                        key={s}
                        onClick={() => combat && void updateCombat({ turnSeconds: s })}
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[0.65rem] font-semibold",
                          (combat?.turnSeconds ?? 0) === s
                            ? "bg-oxblood text-parchment-50"
                            : "bg-parchment-50 text-ink-soft hover:bg-parchment-300/60",
                        )}
                      >
                        {s === 0 ? "Off" : `${s}s`}
                      </button>
                    ))}
                  </span>
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
