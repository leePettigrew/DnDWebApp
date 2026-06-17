"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Portrait } from "@/components/ui/Portrait";
import { cn } from "@/components/ui/cn";
import { HeartIcon, ShieldIcon, SparkIcon, D20Icon } from "@/components/ui/icons";
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  EXHAUSTION_EFFECTS,
  SKILLS,
  type Character,
  type RollMode,
  type RollResult,
  type RollSpec,
} from "@/lib/domain/types";
import { EquipmentPanel } from "./EquipmentPanel";
import {
  abilityMod,
  emptyDeathSaves,
  formatModifier,
  hitDiceRemaining,
  hitDieSize,
  initiativeBonus,
  longRestPatch,
  MAX_EXHAUSTION,
  passivePerception,
  proficiencyBonus,
  savingThrowBonus,
  skillBonus,
  spellAttackBonus,
  spellSaveDC,
} from "@/lib/domain/character";
import { spec } from "@/lib/domain/dice";
import { useRealtime } from "@/lib/data/hooks";

interface SheetProps {
  character: Character;
  onUpdate: (patch: Partial<Character>) => void;
  /** When false (a player viewing a sheet they don't own), editing controls
   *  are hidden/disabled. Rolling stays available. Defaults to true. */
  canEdit?: boolean;
}

function StatPill({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-parchment-400/60 bg-parchment-100/70 px-3 py-2 text-center">
      <span className="flex items-center gap-1 text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-ink-faint">
        {icon}
        {label}
      </span>
      <span className="numerals font-display text-xl font-bold text-ink">
        {value}
      </span>
    </div>
  );
}

export function CharacterSheet({
  character: c,
  onUpdate,
  canEdit = true,
}: SheetProps) {
  const realtime = useRealtime();
  const [lastRoll, setLastRoll] = useState<RollResult | null>(null);
  const [hpAmount, setHpAmount] = useState(0);

  const pb = proficiencyBonus(c.level);

  // Route through the provider so multiplayer rolls are server-authoritative
  // and broadcast to the whole table (solo still computes locally).
  function quickRoll(labelText: string, bonus: number, mode: RollMode = "normal") {
    void realtime
      .roll(spec(1, 20, bonus, mode, labelText))
      .then((r) => setLastRoll(r))
      .catch(() => {});
  }

  // Roll an arbitrary spec (used by weapon attacks/damage in EquipmentPanel).
  function onRoll(s: RollSpec) {
    void realtime
      .roll(s)
      .then((r) => setLastRoll(r))
      .catch(() => {});
  }

  function applyDamage() {
    const amt = Math.abs(hpAmount);
    if (!amt) return;
    let temp = c.tempHp;
    let dmg = amt;
    if (temp > 0) {
      const absorbed = Math.min(temp, dmg);
      temp -= absorbed;
      dmg -= absorbed;
    }
    onUpdate({ tempHp: temp, currentHp: Math.max(0, c.currentHp - dmg) });
    setHpAmount(0);
  }
  function applyHeal() {
    const amt = Math.abs(hpAmount);
    if (!amt) return;
    // Rising off 0 HP ends the dying state — reset death saves.
    const patch: Partial<Character> = {
      currentHp: Math.min(c.maxHp, c.currentHp + amt),
    };
    if (c.currentHp === 0) patch.deathSaves = emptyDeathSaves();
    onUpdate(patch);
    setHpAmount(0);
  }
  function applyTemp() {
    const amt = Math.abs(hpAmount);
    if (!amt) return;
    onUpdate({ tempHp: Math.max(c.tempHp, amt) });
    setHpAmount(0);
  }

  // --- Spell slots, concentration, rests, exhaustion & death saves ---
  const conMod = abilityMod(c.abilityScores, "con");
  const deaths = c.deathSaves ?? emptyDeathSaves();
  const hdRemaining = hitDiceRemaining(c);
  const hdSize = hitDieSize(c);
  const exhaustion = c.exhaustion ?? 0;

  function setSlotUsed(level: number, used: number) {
    const slots = c.spellSlots ?? [];
    onUpdate({
      spellSlots: slots.map((s) =>
        s.level === level
          ? { ...s, used: Math.max(0, Math.min(s.max, used)) }
          : s,
      ),
    });
  }
  function toggleConcentration(name: string) {
    onUpdate({ concentratingOn: c.concentratingOn === name ? "" : name });
  }
  function spendHitDie() {
    if (hdRemaining <= 0) return;
    onUpdate({ hitDiceUsed: (c.hitDiceUsed ?? 0) + 1 });
    void realtime
      .roll(spec(1, hdSize, conMod, "normal", "Hit die — short rest"))
      .then((r) => {
        setLastRoll(r);
        onUpdate({
          currentHp: Math.min(c.maxHp, c.currentHp + Math.max(1, r.total)),
        });
      })
      .catch(() => {});
  }
  function longRest() {
    onUpdate(longRestPatch(c));
  }
  function setExhaustion(n: number) {
    onUpdate({ exhaustion: Math.max(0, Math.min(MAX_EXHAUSTION, n)) });
  }
  function setDeath(kind: "successes" | "failures", n: number) {
    onUpdate({ deathSaves: { ...deaths, [kind]: Math.max(0, Math.min(3, n)) } });
  }

  const hpPct = Math.max(0, Math.min(100, (c.currentHp / Math.max(1, c.maxHp)) * 100));
  const saveDC = spellSaveDC(c);
  const spellAtk = spellAttackBonus(c);
  const spellsByLevel = c.spells.reduce<Record<number, typeof c.spells>>(
    (acc, s) => {
      (acc[s.level] ??= []).push(s);
      return acc;
    },
    {},
  );
  const slotByLevel = new Map((c.spellSlots ?? []).map((s) => [s.level, s]));
  // Levels to render: any with spells or with configured slots, sorted.
  const spellLevels = [
    ...new Set([
      ...Object.keys(spellsByLevel).map(Number),
      ...(c.spellSlots ?? []).map((s) => s.level),
    ]),
  ].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {/* Last roll banner */}
      {lastRoll && (
        <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-card border border-brass/50 bg-parchment-50 px-4 py-2 shadow-gilt animate-fade-in-up">
          <span className="text-sm text-ink-soft">
            <span className="font-semibold text-ink">{lastRoll.label}</span>{" "}
            <span className="numerals text-ink-faint">({lastRoll.notation})</span>
          </span>
          <span
            className={cn(
              "numerals font-display text-2xl font-bold",
              lastRoll.isCrit
                ? "text-brass-dark"
                : lastRoll.isFumble
                  ? "text-oxblood"
                  : "text-ink",
            )}
          >
            {lastRoll.total}
          </span>
        </div>
      )}

      {/* Identity + key stats */}
      <Panel tone="flat">
        <div className="flex flex-col gap-5 sm:flex-row">
          <Portrait
            src={c.portraitUrl}
            name={c.name}
            className="h-28 w-28 shrink-0 self-center sm:self-start"
          />
          <div className="flex-1">
            <h2 className="font-display text-3xl font-bold text-ink">{c.name}</h2>
            <p className="mt-1 text-ink-soft">
              {[
                c.race,
                `${c.className}${c.subclass ? ` (${c.subclass})` : ""}`,
                `Level ${c.level}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {c.background && <Badge tone="brass">{c.background}</Badge>}
              {c.alignment && <Badge>{c.alignment}</Badge>}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              <StatPill label="AC" value={c.armorClass} icon={<ShieldIcon className="h-3 w-3" />} />
              <StatPill label="Speed" value={`${c.speed}`} />
              <StatPill label="Prof" value={formatModifier(pb)} />
              <button onClick={() => quickRoll("Initiative", initiativeBonus(c))} className="text-left">
                <StatPill label="Init" value={formatModifier(initiativeBonus(c))} icon={<D20Icon className="h-3 w-3" />} />
              </button>
              <StatPill label="Pass. Perc" value={passivePerception(c)} />
              <StatPill label="Hit Dice" value={c.hitDice ?? "—"} />
            </div>
          </div>
        </div>

        {/* HP control */}
        <div className="mt-5 rounded-card border border-parchment-400/60 bg-parchment-100/70 p-4">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink-soft">
              <HeartIcon className="h-4 w-4 text-oxblood" /> Hit Points
            </span>
            <span className="numerals font-display text-lg font-bold text-ink">
              {c.currentHp}
              <span className="text-ink-faint"> / {c.maxHp}</span>
              {c.tempHp > 0 && (
                <span className="ml-2 text-forest">+{c.tempHp} temp</span>
              )}
            </span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full border border-parchment-400/70 bg-parchment-300/60">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                hpPct > 50 ? "bg-forest" : hpPct > 25 ? "bg-brass" : "bg-oxblood",
              )}
              style={{ width: `${hpPct}%` }}
            />
          </div>
          {canEdit && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="number"
                value={hpAmount || ""}
                onChange={(e) => setHpAmount(Number(e.target.value) || 0)}
                placeholder="0"
                aria-label="HP amount"
                className="numerals h-9 w-20 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-center font-bold text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40"
              />
              <button onClick={applyDamage} className="rounded-md border border-oxblood/40 px-3 py-1.5 text-sm font-semibold text-oxblood hover:bg-oxblood hover:text-parchment-50">
                Damage
              </button>
              <button onClick={applyHeal} className="rounded-md border border-forest/40 px-3 py-1.5 text-sm font-semibold text-forest hover:bg-forest hover:text-parchment-50">
                Heal
              </button>
              <button onClick={applyTemp} className="rounded-md border border-arcane/40 px-3 py-1.5 text-sm font-semibold text-arcane hover:bg-arcane hover:text-parchment-50">
                Temp
              </button>
            </div>
          )}

          {/* Death saving throws — surfaced once dropped to 0 HP. */}
          {c.currentHp === 0 && (
            <div className="mt-3 rounded-md border border-oxblood/40 bg-oxblood/5 p-3">
              <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.12em] text-oxblood">
                Death Saving Throws
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-forest">Successes</span>
                  {[0, 1, 2].map((i) => (
                    <button
                      key={i}
                      aria-label={`Success ${i + 1}`}
                      disabled={!canEdit}
                      onClick={() =>
                        setDeath("successes", i < deaths.successes ? i : i + 1)
                      }
                      className={cn(
                        "h-5 w-5 rounded-full border-2 transition-colors",
                        i < deaths.successes
                          ? "border-forest bg-forest"
                          : "border-forest/50 bg-transparent hover:bg-forest/20",
                      )}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-oxblood">Failures</span>
                  {[0, 1, 2].map((i) => (
                    <button
                      key={i}
                      aria-label={`Failure ${i + 1}`}
                      disabled={!canEdit}
                      onClick={() =>
                        setDeath("failures", i < deaths.failures ? i : i + 1)
                      }
                      className={cn(
                        "h-5 w-5 rounded-full border-2 transition-colors",
                        i < deaths.failures
                          ? "border-oxblood bg-oxblood"
                          : "border-oxblood/50 bg-transparent hover:bg-oxblood/20",
                      )}
                    />
                  ))}
                </div>
                <button
                  onClick={() => quickRoll("Death save", 0)}
                  className="rounded-md border border-parchment-400 px-2.5 py-1 text-xs font-semibold text-ink-soft hover:bg-parchment-200"
                >
                  Roll d20
                </button>
              </div>
              {deaths.successes >= 3 && (
                <p className="mt-2 text-xs font-semibold text-forest">
                  Stabilized — heal to rise.
                </p>
              )}
              {deaths.failures >= 3 && (
                <p className="mt-2 text-xs font-semibold text-oxblood">
                  The character has fallen.
                </p>
              )}
            </div>
          )}
        </div>
      </Panel>

      {/* Rest & recovery — hit dice, long rest, exhaustion, concentration */}
      {canEdit && (
      <Panel title="Rest &amp; Recovery" eyebrow="Hit dice · exhaustion">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-card border border-parchment-400/60 bg-parchment-100/70 p-3">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
              Hit Dice
            </p>
            <p className="numerals mt-1 font-display text-xl font-bold text-ink">
              {hdRemaining}
              <span className="text-ink-faint"> / {c.level}</span>{" "}
              <span className="text-sm text-ink-faint">d{hdSize}</span>
            </p>
            <button
              onClick={spendHitDie}
              disabled={hdRemaining <= 0 || c.currentHp >= c.maxHp}
              className="mt-2 w-full rounded-md border border-forest/40 px-3 py-1.5 text-sm font-semibold text-forest hover:bg-forest hover:text-parchment-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-forest"
            >
              Spend (1d{hdSize}
              {formatModifier(conMod)})
            </button>
          </div>

          <div className="flex flex-col rounded-card border border-parchment-400/60 bg-parchment-100/70 p-3">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
              Long Rest
            </p>
            <p className="mt-1 flex-1 text-xs text-ink-faint">
              Full HP, all spell slots, half your hit dice back, −1 exhaustion.
            </p>
            <button
              onClick={longRest}
              className="mt-2 w-full rounded-md border border-arcane/40 px-3 py-1.5 text-sm font-semibold text-arcane hover:bg-arcane hover:text-parchment-50"
            >
              Take a long rest
            </button>
          </div>

          <div className="rounded-card border border-parchment-400/60 bg-parchment-100/70 p-3">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
              Exhaustion
            </p>
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={() => setExhaustion(exhaustion - 1)}
                aria-label="Decrease exhaustion"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-parchment-400 bg-parchment-50 text-lg font-bold hover:border-brass"
              >
                −
              </button>
              <span className="numerals w-6 text-center font-display text-xl font-bold text-ink">
                {exhaustion}
              </span>
              <button
                onClick={() => setExhaustion(exhaustion + 1)}
                aria-label="Increase exhaustion"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-parchment-400 bg-parchment-50 text-lg font-bold hover:border-brass"
              >
                +
              </button>
            </div>
            <p
              className={cn(
                "mt-1.5 text-xs",
                exhaustion > 0 ? "text-oxblood" : "text-ink-faint",
              )}
            >
              {EXHAUSTION_EFFECTS[exhaustion]}
            </p>
          </div>
        </div>

        {c.concentratingOn && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-arcane/40 bg-arcane/5 px-3 py-2">
            <span className="text-sm text-ink">
              <span className="font-semibold text-arcane">Concentrating</span> on{" "}
              {c.concentratingOn}
            </span>
            <button
              onClick={() => onUpdate({ concentratingOn: "" })}
              className="rounded-md border border-arcane/40 px-2.5 py-1 text-xs font-semibold text-arcane hover:bg-arcane hover:text-parchment-50"
            >
              Drop
            </button>
          </div>
        )}
      </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Abilities + saves */}
        <div className="space-y-6">
          <Panel title="Abilities" eyebrow="Tap to roll a check">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ABILITY_KEYS.map((key) => {
                const mod = abilityMod(c.abilityScores, key);
                return (
                  <button
                    key={key}
                    onClick={() => quickRoll(`${ABILITY_LABELS[key]} check`, mod)}
                    className="flex flex-col items-center rounded-card border border-parchment-400/70 bg-parchment-100 py-3 transition-all hover:-translate-y-0.5 hover:border-brass hover:shadow-gilt"
                  >
                    <span className="text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-ink-faint">
                      {ABILITY_LABELS[key].slice(0, 3)}
                    </span>
                    <span className="numerals font-display text-2xl font-bold text-ink">
                      {formatModifier(mod)}
                    </span>
                    <span className="numerals text-xs text-ink-faint">
                      {c.abilityScores[key]}
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Saving Throws">
            <ul className="space-y-1">
              {ABILITY_KEYS.map((key) => {
                const bonus = savingThrowBonus(c, key);
                const proficient = c.savingThrowProficiencies[key];
                return (
                  <li key={key}>
                    <button
                      onClick={() => quickRoll(`${ABILITY_LABELS[key]} save`, bonus)}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-parchment-200/70"
                    >
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full border",
                          proficient
                            ? "border-brass-dark bg-brass"
                            : "border-parchment-400 bg-transparent",
                        )}
                      />
                      <span className="flex-1 text-sm text-ink">
                        {ABILITY_LABELS[key]}
                      </span>
                      <span className="numerals font-display font-bold text-ink">
                        {formatModifier(bonus)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>

        {/* Skills */}
        <Panel title="Skills" eyebrow="Tap to roll" className="lg:col-span-1">
          <ul className="space-y-0.5">
            {SKILLS.map((skill) => {
              const bonus = skillBonus(c, skill);
              const prof = c.skillProficiencies[skill.key] ?? "none";
              return (
                <li key={skill.key}>
                  <button
                    onClick={() => quickRoll(skill.label, bonus)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1 text-left hover:bg-parchment-200/70"
                  >
                    <span
                      className={cn(
                        "h-2.5 w-2.5 shrink-0 rounded-full border",
                        prof === "expertise"
                          ? "border-oxblood bg-oxblood"
                          : prof === "proficient"
                            ? "border-brass-dark bg-brass"
                            : "border-parchment-400 bg-transparent",
                      )}
                    />
                    <span className="flex-1 text-sm text-ink">{skill.label}</span>
                    <span className="text-[0.6rem] uppercase text-ink-faint">
                      {skill.ability}
                    </span>
                    <span className="numerals w-9 text-right font-display font-bold text-ink">
                      {formatModifier(bonus)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* Features */}
        <div className="space-y-6">
          <Panel title="Features & Traits">
            {c.features.length === 0 ? (
              <p className="text-sm text-ink-faint">No features recorded.</p>
            ) : (
              <ul className="space-y-2.5">
                {c.features.map((f) => (
                  <li key={f.id}>
                    <p className="text-sm font-semibold text-ink">{f.name}</p>
                    {f.description && (
                      <p className="text-xs text-ink-soft">{f.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <EquipmentPanel character={c} onRoll={onRoll} />

      {/* Spellcasting */}
      {(c.spellcastingAbility ||
        c.spells.length > 0 ||
        (c.spellSlots?.length ?? 0) > 0) && (
        <Panel
          title="Spellcasting"
          eyebrow={c.spellcastingAbility ? ABILITY_LABELS[c.spellcastingAbility] : undefined}
          action={
            saveDC !== null ? (
              <div className="flex gap-2">
                <Badge tone="arcane">Save DC {saveDC}</Badge>
                <Badge tone="arcane">Atk {formatModifier(spellAtk ?? 0)}</Badge>
              </div>
            ) : undefined
          }
        >
          <div className="space-y-4">
            {spellLevels.map((level) => {
              const slot = slotByLevel.get(level);
              const spells = spellsByLevel[level] ?? [];
              return (
                <div key={level}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <p className="font-display text-xs font-semibold uppercase tracking-[0.15em] text-brass-dark">
                      {level === 0 ? "Cantrips" : `Level ${level}`}
                    </p>
                    {slot && slot.max > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[0.6rem] uppercase tracking-wide text-ink-faint">
                          Slots
                        </span>
                        {Array.from({ length: slot.max }).map((_, i) => {
                          const spent = i < slot.used;
                          return (
                            <button
                              key={i}
                              aria-label={`Level ${level} slot ${i + 1}`}
                              disabled={!canEdit}
                              title={
                                spent
                                  ? "Spent — tap to restore"
                                  : "Available — tap to expend"
                              }
                              onClick={() => setSlotUsed(level, spent ? i : i + 1)}
                              className={cn(
                                "h-3.5 w-3.5 rounded-full border-2 transition-colors",
                                spent
                                  ? "border-arcane/40 bg-transparent hover:bg-arcane/20"
                                  : "border-arcane bg-arcane",
                              )}
                            />
                          );
                        })}
                        <span className="numerals ml-1 text-xs text-ink-faint">
                          {slot.max - slot.used}/{slot.max}
                        </span>
                      </div>
                    )}
                  </div>
                  {spells.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {spells.map((s) => {
                        const conc = c.concentratingOn === s.name;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            disabled={!canEdit}
                            title={
                              s.description
                                ? `${s.description}\n(tap to toggle concentration)`
                                : "Tap to toggle concentration"
                            }
                            onClick={() => toggleConcentration(s.name)}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-card border px-3 py-1 text-sm text-ink transition-colors",
                              conc
                                ? "border-arcane bg-arcane/15 ring-1 ring-arcane"
                                : "border-arcane/30 bg-arcane/5 hover:border-arcane/60",
                            )}
                          >
                            <SparkIcon className="h-3.5 w-3.5 text-arcane" />
                            {s.name}
                            {s.prepared && (
                              <span className="h-1.5 w-1.5 rounded-full bg-arcane" title="Prepared" />
                            )}
                            {conc && (
                              <span className="text-[0.55rem] font-bold uppercase tracking-wide text-arcane">
                                Conc.
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {(c.languages || c.notes) && (
        <Panel title="Lore & Notes">
          {c.languages && (
            <p className="text-sm text-ink-soft">
              <span className="font-semibold text-ink">Languages:</span>{" "}
              {c.languages}
            </p>
          )}
          {c.notes && (
            <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">
              {c.notes}
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}
