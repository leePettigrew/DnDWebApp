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
  SKILLS,
  type Character,
  type RollMode,
  type RollResult,
  type RollSpec,
} from "@/lib/domain/types";
import { EquipmentPanel } from "./EquipmentPanel";
import {
  abilityMod,
  formatModifier,
  initiativeBonus,
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

export function CharacterSheet({ character: c, onUpdate }: SheetProps) {
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
    onUpdate({ currentHp: Math.min(c.maxHp, c.currentHp + amt) });
    setHpAmount(0);
  }
  function applyTemp() {
    const amt = Math.abs(hpAmount);
    if (!amt) return;
    onUpdate({ tempHp: Math.max(c.tempHp, amt) });
    setHpAmount(0);
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
        </div>
      </Panel>

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
      {(c.spellcastingAbility || c.spells.length > 0) && (
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
            {Object.keys(spellsByLevel)
              .map(Number)
              .sort((a, b) => a - b)
              .map((level) => (
                <div key={level}>
                  <p className="mb-1.5 font-display text-xs font-semibold uppercase tracking-[0.15em] text-brass-dark">
                    {level === 0 ? "Cantrips" : `Level ${level}`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {spellsByLevel[level].map((s) => (
                      <span
                        key={s.id}
                        title={s.description}
                        className="inline-flex items-center gap-1.5 rounded-card border border-arcane/30 bg-arcane/5 px-3 py-1 text-sm text-ink"
                      >
                        <SparkIcon className="h-3.5 w-3.5 text-arcane" />
                        {s.name}
                        {s.prepared && (
                          <span className="h-1.5 w-1.5 rounded-full bg-arcane" title="Prepared" />
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
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
