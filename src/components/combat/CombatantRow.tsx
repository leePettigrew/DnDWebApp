"use client";

import { useState } from "react";
import { cn } from "@/components/ui/cn";
import {
  CONDITIONS,
  type Combatant,
  type ConditionKey,
} from "@/lib/domain/types";
import {
  ChevronRightIcon,
  HeartIcon,
  ShieldIcon,
  TrashIcon,
} from "@/components/ui/icons";

export function CombatantRow({
  combatant: c,
  isActive,
  onDamage,
  onHeal,
  onSetTemp,
  onToggleCondition,
  onPatch,
  onRemove,
}: {
  combatant: Combatant;
  isActive: boolean;
  onDamage: (amt: number) => void;
  onHeal: (amt: number) => void;
  onSetTemp: (amt: number) => void;
  onToggleCondition: (condition: ConditionKey) => void;
  onPatch: (patch: Partial<Combatant>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [amount, setAmount] = useState(0);

  const hpPct = Math.max(0, Math.min(100, (c.currentHp / Math.max(1, c.maxHp)) * 100));
  const down = c.currentHp <= 0;

  function applyAndReset(fn: (n: number) => void) {
    if (!amount) return;
    fn(Math.abs(amount));
    setAmount(0);
  }

  return (
    <li
      className={cn(
        "rounded-card border transition-all",
        isActive
          ? "border-brass bg-parchment-50 shadow-gilt"
          : "border-parchment-400/60 bg-parchment-100/70",
        down && "opacity-70",
      )}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Initiative */}
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-card border-2",
            isActive
              ? "border-brass bg-brass/15 text-brass-dark"
              : "border-parchment-400 bg-parchment-100 text-ink",
          )}
          title="Initiative"
        >
          <span className="numerals font-display text-xl font-bold leading-none">
            {c.initiative}
          </span>
          <span className="text-[0.5rem] uppercase tracking-wide text-ink-faint">
            init
          </span>
        </div>

        {/* Name + conditions */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {isActive && (
              <span className="rounded bg-oxblood px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-parchment-50">
                Now
              </span>
            )}
            <span
              className={cn(
                "truncate font-display text-base font-bold",
                down ? "text-oxblood line-through" : "text-ink",
              )}
            >
              {c.name}
            </span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-wide",
                c.isPC ? "bg-arcane/15 text-arcane" : "bg-oxblood/12 text-oxblood",
              )}
            >
              {c.isPC ? "PC" : "NPC"}
            </span>
          </div>
          {c.conditions.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {c.conditions.map((cond) => (
                <button
                  key={cond}
                  onClick={() => onToggleCondition(cond)}
                  className="rounded-full border border-oxblood/40 bg-oxblood/10 px-2 py-0.5 text-[0.65rem] font-medium capitalize text-oxblood hover:bg-oxblood hover:text-parchment-50"
                  title="Click to remove"
                >
                  {cond}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* HP */}
        <div className="hidden w-36 shrink-0 sm:block">
          <div className="flex items-baseline justify-between">
            <span className="flex items-center gap-1 text-[0.6rem] uppercase tracking-wide text-ink-faint">
              <HeartIcon className="h-3 w-3 text-oxblood" /> HP
            </span>
            <span className="numerals font-display text-sm font-bold text-ink">
              {c.currentHp}
              <span className="text-ink-faint">/{c.maxHp}</span>
              {c.tempHp > 0 && <span className="text-forest"> +{c.tempHp}</span>}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full border border-parchment-400/60 bg-parchment-300/60">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                hpPct > 50 ? "bg-forest" : hpPct > 25 ? "bg-brass" : "bg-oxblood",
              )}
              style={{ width: `${hpPct}%` }}
            />
          </div>
        </div>

        {/* AC */}
        <div
          className="hidden shrink-0 flex-col items-center md:flex"
          title="Armor Class"
        >
          <ShieldIcon className="h-4 w-4 text-ink-faint" />
          <span className="numerals font-display text-sm font-bold text-ink">
            {c.armorClass}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label="Toggle combatant details"
          className="shrink-0 rounded-md p-1.5 text-ink-faint hover:bg-parchment-300/60 hover:text-ink"
        >
          <ChevronRightIcon
            className={cn("h-5 w-5 transition-transform", expanded && "rotate-90")}
          />
        </button>
      </div>

      {/* Quick HP row (always visible, compact) */}
      <div className="flex flex-wrap items-center gap-2 border-t border-parchment-400/40 px-3 py-2">
        <input
          type="number"
          value={amount || ""}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          placeholder="0"
          aria-label={`Amount for ${c.name}`}
          className="numerals h-8 w-16 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-center text-sm font-bold text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40"
        />
        <button
          onClick={() => applyAndReset(onDamage)}
          className="rounded-md border border-oxblood/40 px-2.5 py-1 text-xs font-semibold text-oxblood hover:bg-oxblood hover:text-parchment-50"
        >
          Damage
        </button>
        <button
          onClick={() => applyAndReset(onHeal)}
          className="rounded-md border border-forest/40 px-2.5 py-1 text-xs font-semibold text-forest hover:bg-forest hover:text-parchment-50"
        >
          Heal
        </button>
        <button
          onClick={() => applyAndReset(onSetTemp)}
          className="rounded-md border border-arcane/40 px-2.5 py-1 text-xs font-semibold text-arcane hover:bg-arcane hover:text-parchment-50"
        >
          Temp
        </button>
        {/* Mobile HP readout */}
        <span className="numerals ml-auto text-sm font-bold text-ink sm:hidden">
          {c.currentHp}/{c.maxHp}
          {c.tempHp > 0 && <span className="text-forest"> +{c.tempHp}</span>}
        </span>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="space-y-3 border-t border-parchment-400/40 bg-parchment-100/40 p-3 animate-fade-in">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-xs">
              <span className="mb-0.5 block font-semibold uppercase tracking-wide text-ink-faint">
                Initiative
              </span>
              <input
                type="number"
                value={c.initiative}
                onChange={(e) => onPatch({ initiative: Number(e.target.value) || 0 })}
                className="numerals h-8 w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 text-center font-bold"
              />
            </label>
            <label className="text-xs">
              <span className="mb-0.5 block font-semibold uppercase tracking-wide text-ink-faint">
                Max HP
              </span>
              <input
                type="number"
                value={c.maxHp}
                onChange={(e) => onPatch({ maxHp: Number(e.target.value) || 0 })}
                className="numerals h-8 w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 text-center font-bold"
              />
            </label>
            <label className="text-xs">
              <span className="mb-0.5 block font-semibold uppercase tracking-wide text-ink-faint">
                AC
              </span>
              <input
                type="number"
                value={c.armorClass}
                onChange={(e) => onPatch({ armorClass: Number(e.target.value) || 0 })}
                className="numerals h-8 w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 text-center font-bold"
              />
            </label>
            <label className="text-xs">
              <span className="mb-0.5 block font-semibold uppercase tracking-wide text-ink-faint">
                Current HP
              </span>
              <input
                type="number"
                value={c.currentHp}
                onChange={(e) => onPatch({ currentHp: Number(e.target.value) || 0 })}
                className="numerals h-8 w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 text-center font-bold"
              />
            </label>
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Conditions
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CONDITIONS.map((cond) => {
                const on = c.conditions.includes(cond.key);
                return (
                  <button
                    key={cond.key}
                    onClick={() => onToggleCondition(cond.key)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      on
                        ? "border-oxblood bg-oxblood text-parchment-50"
                        : "border-parchment-400 bg-parchment-50 text-ink-soft hover:border-oxblood/50",
                    )}
                  >
                    {cond.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block text-xs">
            <span className="mb-0.5 block font-semibold uppercase tracking-wide text-ink-faint">
              Notes
            </span>
            <input
              type="text"
              value={c.notes ?? ""}
              onChange={(e) => onPatch({ notes: e.target.value })}
              placeholder="e.g. concentrating on Bless"
              className="h-8 w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm"
            />
          </label>

          <button
            onClick={onRemove}
            className="inline-flex items-center gap-1.5 rounded-md border border-oxblood/40 px-3 py-1.5 text-xs font-semibold text-oxblood hover:bg-oxblood hover:text-parchment-50"
          >
            <TrashIcon className="h-4 w-4" /> Remove from combat
          </button>
        </div>
      )}
    </li>
  );
}
