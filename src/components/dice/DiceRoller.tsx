"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TextField } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import {
  D20Icon,
  MinusIcon,
  PlusIcon,
  SparkIcon,
  TrashIcon,
} from "@/components/ui/icons";
import { cn } from "@/components/ui/cn";
import { DiceTray3D } from "./DiceTray3D";
import { DIE_SIDES, formatSpec } from "@/lib/domain/dice";
import type {
  DieRoll,
  RollMode,
  RollPreset,
  RollResult,
  RollSpec,
} from "@/lib/domain/types";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";
import {
  useActiveCampaign,
  useDataProvider,
  useRealtime,
  useRollPresets,
} from "@/lib/data/hooks";

const MODES: { key: RollMode; label: string }[] = [
  { key: "normal", label: "Normal" },
  { key: "advantage", label: "Advantage" },
  { key: "disadvantage", label: "Disadvantage" },
];

/** Expand advantage/disadvantage pairs into kept + dropped chips for display. */
function toDisplayRolls(rolls: DieRoll[]): DieRoll[] {
  const out: DieRoll[] = [];
  for (const r of rolls) {
    if (r.pair) {
      const [a, b] = r.pair;
      const dropped = a === r.value ? b : a;
      out.push({ sides: r.sides, value: r.value });
      out.push({ sides: r.sides, value: dropped, dropped: true });
    } else {
      out.push(r);
    }
  }
  return out;
}

export function DiceRoller() {
  const reduced = useReducedMotion();
  const { items: presets, create: createPreset, remove: removePreset } =
    useRollPresets();
  const realtime = useRealtime();
  const { capabilities } = useDataProvider();
  const { role } = useActiveCampaign();
  const isDM = capabilities.multiUser && role === "dm";

  const [counts, setCounts] = useState<Record<number, number>>({});
  const [modifier, setModifier] = useState(0);
  const [mode, setMode] = useState<RollMode>("normal");
  const [label, setLabel] = useState("");
  const [result, setResult] = useState<RollResult | null>(null);
  const [rolling, setRolling] = useState(false);
  const [savingOpen, setSavingOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [hiddenRoll, setHiddenRoll] = useState(false);
  const [rollError, setRollError] = useState<string | null>(null);

  const poolCount = DIE_SIDES.reduce((n, s) => n + (counts[s] ?? 0), 0);

  function buildSpec(): RollSpec | null {
    const groups = DIE_SIDES.filter((s) => (counts[s] ?? 0) > 0).map((s) => ({
      count: counts[s],
      sides: s,
    }));
    if (groups.length === 0) return null;
    return { groups, modifier, mode, label: label.trim() || undefined };
  }

  async function roll(spec: RollSpec) {
    setRolling(true);
    setRollError(null);
    try {
      // The provider produces the result: locally in solo mode, or on the
      // SERVER in multiplayer (authoritative, anti-cheat, hidden-aware). Either
      // way the shared roll history updates itself via the data layer.
      const r = await realtime.roll(spec, { hidden: isDM && hiddenRoll });
      setResult(r);
      if (reduced) {
        setRolling(false);
        return;
      }
      window.setTimeout(() => setRolling(false), 980);
    } catch (err) {
      setRolling(false);
      setRollError(err instanceof Error ? err.message : "Roll failed.");
    }
  }

  function handleRoll() {
    const spec = buildSpec();
    if (spec) void roll(spec);
  }

  function loadPreset(p: RollPreset) {
    const next: Record<number, number> = {};
    for (const g of p.spec.groups) next[g.sides] = (next[g.sides] ?? 0) + g.count;
    setCounts(next);
    setModifier(p.spec.modifier);
    setMode(p.spec.mode);
    setLabel(p.spec.label ?? p.name);
  }

  function savePreset() {
    const spec = buildSpec();
    if (!spec || !presetName.trim()) return;
    void createPreset({ name: presetName.trim(), spec });
    setPresetName("");
    setSavingOpen(false);
  }

  const addDie = (s: number) =>
    setCounts((c) => ({ ...c, [s]: (c[s] ?? 0) + 1 }));
  const subDie = (s: number) =>
    setCounts((c) => ({ ...c, [s]: Math.max(0, (c[s] ?? 0) - 1) }));
  const clearPool = () => {
    setCounts({});
    setModifier(0);
    setMode("normal");
    setLabel("");
  };

  const displayRolls = result ? toDisplayRolls(result.rolls) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Builder + result */}
      <div className="space-y-6 lg:col-span-3">
        <Panel
          title="Dice Tower"
          eyebrow="Build a roll"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSavingOpen(true)}
              disabled={poolCount === 0}
            >
              <SparkIcon className="h-4 w-4" /> Save preset
            </Button>
          }
        >
          {/* Die selector */}
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {DIE_SIDES.map((s) => {
              const count = counts[s] ?? 0;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => addDie(s)}
                  aria-label={`Add a d${s}`}
                  className={cn(
                    "relative flex flex-col items-center gap-1 rounded-card border-2 px-2 py-3 transition-all duration-150 hover:-translate-y-0.5",
                    count > 0
                      ? "border-brass bg-parchment-50 shadow-gilt"
                      : "border-parchment-400/70 bg-parchment-100 hover:border-brass/60",
                  )}
                >
                  <span className="font-display text-lg font-bold text-ink">
                    d{s}
                  </span>
                  {count > 0 && (
                    <span className="numerals absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-oxblood px-1 text-xs font-bold text-parchment-50">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Pool summary */}
          <div className="mt-4 flex min-h-9 flex-wrap items-center gap-2">
            {poolCount === 0 ? (
              <span className="text-sm text-ink-faint">
                Tap dice above to build your pool.
              </span>
            ) : (
              <>
                {DIE_SIDES.filter((s) => (counts[s] ?? 0) > 0).map((s) => (
                  <span
                    key={s}
                    className="numerals inline-flex items-center gap-1 rounded-full border border-parchment-400 bg-parchment-100 py-0.5 pl-3 pr-1 text-sm"
                  >
                    {counts[s]}d{s}
                    <button
                      type="button"
                      onClick={() => subDie(s)}
                      aria-label={`Remove a d${s}`}
                      className="ml-1 rounded-full p-0.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                    >
                      <MinusIcon className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={clearPool}
                  className="ml-1 text-xs font-semibold text-ink-faint underline-offset-2 hover:text-oxblood hover:underline"
                >
                  clear
                </button>
              </>
            )}
          </div>

          {/* Modifier + label */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
                Modifier
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModifier((m) => m - 1)}
                  aria-label="Decrease modifier"
                  className="flex h-10 w-10 items-center justify-center rounded-card border border-parchment-400 bg-parchment-100 hover:border-brass"
                >
                  <MinusIcon className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  value={modifier}
                  onChange={(e) => setModifier(Number(e.target.value) || 0)}
                  aria-label="Modifier value"
                  className="numerals h-10 w-16 rounded-card border border-parchment-400 bg-parchment-50 text-center text-lg font-bold text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40"
                />
                <button
                  type="button"
                  onClick={() => setModifier((m) => m + 1)}
                  aria-label="Increase modifier"
                  className="flex h-10 w-10 items-center justify-center rounded-card border border-parchment-400 bg-parchment-100 hover:border-brass"
                >
                  <PlusIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
            <TextField
              label="Label (optional)"
              placeholder="e.g. Longsword attack"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          {/* Roll mode */}
          <div className="mt-4">
            <p className="mb-1 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
              Roll mode{" "}
              <span className="font-body normal-case tracking-normal text-ink-faint">
                · applies to the first d20
              </span>
            </p>
            <div className="inline-flex flex-wrap gap-1 rounded-card border border-parchment-400/70 bg-parchment-100 p-1">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                    mode === m.key
                      ? "bg-oxblood text-parchment-50 shadow-card"
                      : "text-ink-soft hover:bg-parchment-300/60",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {isDM && (
            <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-card border border-oxblood/30 bg-oxblood/5 px-3 py-2">
              <input
                type="checkbox"
                checked={hiddenRoll}
                onChange={(e) => setHiddenRoll(e.target.checked)}
                className="h-4 w-4 accent-oxblood"
              />
              <span className="text-sm text-ink-soft">
                Hidden roll{" "}
                <span className="text-ink-faint">
                  — only you (the DM) see the result
                </span>
              </span>
            </label>
          )}

          {rollError && (
            <p className="mt-3 rounded-md border border-oxblood/40 bg-oxblood/10 px-3 py-2 text-sm text-oxblood">
              {rollError}
            </p>
          )}

          <Button
            size="lg"
            onClick={handleRoll}
            disabled={poolCount === 0 || rolling}
            className="mt-6 w-full"
          >
            <D20Icon className="h-5 w-5" />
            {rolling ? "Tumbling…" : "Roll the Bones"}
          </Button>
        </Panel>

        {/* Result */}
        {result && (
          <Panel tone="flat" className="overflow-visible">
            <div className="flex flex-col items-center gap-4 text-center">
              {result.label && (
                <p className="font-display text-sm uppercase tracking-[0.2em] text-brass-dark">
                  {result.label}
                </p>
              )}
              <DiceTray3D rolls={displayRolls} rolling={rolling} />
              {result.modifier !== 0 && (
                <span className="numerals font-display text-lg font-bold text-ink-soft">
                  modifier{" "}
                  {result.modifier > 0
                    ? `+${result.modifier}`
                    : `−${Math.abs(result.modifier)}`}
                </span>
              )}

              <div className="flex flex-col items-center">
                <span className="font-display text-xs uppercase tracking-[0.25em] text-ink-faint">
                  {formatSpec({
                    groups: result.rolls
                      .filter((r) => !r.dropped)
                      .reduce<{ count: number; sides: number }[]>((acc, r) => {
                        const g = acc.find((x) => x.sides === r.sides);
                        if (g) g.count += 1;
                        else acc.push({ count: 1, sides: r.sides });
                        return acc;
                      }, []),
                    modifier: result.modifier,
                    mode: result.mode,
                  })}
                </span>
                <span
                  className={cn(
                    "numerals font-display text-6xl font-black leading-none transition-colors",
                    rolling
                      ? "text-ink-faint"
                      : result.isCrit
                        ? "text-brass-dark"
                        : result.isFumble
                          ? "text-oxblood"
                          : "text-ink",
                  )}
                >
                  {rolling ? "…" : result.total}
                </span>
              </div>

              {!rolling && result.isCrit && (
                <Badge tone="brass">
                  <SparkIcon className="h-3.5 w-3.5" /> Critical! Natural 20
                </Badge>
              )}
              {!rolling && result.isFumble && (
                <Badge tone="oxblood">Fumble — Natural 1</Badge>
              )}
            </div>
          </Panel>
        )}
      </div>

      {/* Presets + history */}
      <div className="space-y-6 lg:col-span-2">
        <Panel title="Saved Rolls" eyebrow="Presets">
          {presets.length === 0 ? (
            <p className="text-sm text-ink-soft">
              Build a roll and save it here for one-tap rolling.
            </p>
          ) : (
            <ul className="space-y-2">
              {presets.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-card border border-parchment-400/60 bg-parchment-100/70 p-2"
                >
                  <button
                    type="button"
                    onClick={() => void roll(p.spec)}
                    className="flex-1 text-left"
                  >
                    <span className="block font-display text-sm font-semibold text-ink">
                      {p.name}
                    </span>
                    <span className="numerals block text-xs text-ink-faint">
                      {formatSpec(p.spec)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => loadPreset(p)}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-brass-dark hover:bg-parchment-300/60"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => removePreset(p.id)}
                    aria-label={`Delete ${p.name}`}
                    className="rounded-md p-1 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Modal
        open={savingOpen}
        onClose={() => setSavingOpen(false)}
        title="Save this roll as a preset"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSavingOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePreset} disabled={!presetName.trim()}>
              Save preset
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-ink-soft">
          Saving{" "}
          <span className="numerals font-semibold text-ink">
            {buildSpec() ? formatSpec(buildSpec()!) : "—"}
          </span>
        </p>
        <TextField
          label="Preset name"
          autoFocus
          placeholder="e.g. Fireball"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") savePreset();
          }}
        />
      </Modal>
    </div>
  );
}
