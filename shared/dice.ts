import { newId, nowISO } from "./ids";
import type { DieRoll, RollMode, RollResult, RollSpec } from "./domain";

/**
 * Pure dice engine — SHARED so the client and the *server* roll with identical
 * logic. The server is the authoritative roller in multiplayer; the client uses
 * the same code for solo/local mode and for the animation.
 *
 * Randomness is injectable (`rng`) so the server can supply a CSPRNG and tests
 * can be deterministic.
 */
export type RNG = () => number;

const defaultRng: RNG = () => Math.random();

export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
export type DieSides = (typeof DIE_SIDES)[number];

export function rollDie(sides: number, rng: RNG = defaultRng): number {
  return Math.floor(rng() * sides) + 1;
}

/** Format a spec compactly, e.g. "2d6 + 1d8 + 3" (advantage shown as " (adv)"). */
export function formatSpec(spec: RollSpec): string {
  const groups = spec.groups
    .filter((g) => g.count > 0)
    .map((g) => `${g.count}d${g.sides}`)
    .join(" + ");
  const mod =
    spec.modifier > 0
      ? ` + ${spec.modifier}`
      : spec.modifier < 0
        ? ` − ${Math.abs(spec.modifier)}`
        : "";
  const suffix =
    spec.mode === "advantage"
      ? " (adv)"
      : spec.mode === "disadvantage"
        ? " (dis)"
        : "";
  return `${groups || "0"}${mod}${suffix}`;
}

/**
 * Roll a spec into a full RollResult.
 *
 * Advantage/disadvantage applies to the FIRST d20 in the spec (5e semantics):
 * that die is rolled twice and the higher (adv) or lower (dis) is kept; the
 * other is recorded as `dropped` for display.
 */
export function rollSpec(spec: RollSpec, rng: RNG = defaultRng): RollResult {
  const rolls: DieRoll[] = [];
  let advApplied = false;

  for (const group of spec.groups) {
    if (group.count <= 0) continue;
    for (let i = 0; i < group.count; i++) {
      const isAdvTarget =
        spec.mode !== "normal" && group.sides === 20 && !advApplied;
      if (isAdvTarget) {
        advApplied = true;
        const a = rollDie(20, rng);
        const b = rollDie(20, rng);
        const keepHigher = spec.mode === "advantage";
        const kept = keepHigher ? Math.max(a, b) : Math.min(a, b);
        rolls.push({ sides: 20, value: kept, pair: [a, b] });
      } else {
        rolls.push({ sides: group.sides, value: rollDie(group.sides, rng) });
      }
    }
  }

  const diceTotal = rolls.reduce((sum, r) => sum + r.value, 0);
  const total = diceTotal + spec.modifier;

  const d20s = rolls.filter((r) => r.sides === 20);
  const isCrit = d20s.some((r) => r.value === 20);
  const isFumble = d20s.some((r) => r.value === 1);

  return {
    id: newId("roll"),
    timestamp: nowISO(),
    label: spec.label,
    mode: spec.mode,
    rolls,
    modifier: spec.modifier,
    total,
    isCrit,
    isFumble,
    notation: formatSpec(spec),
  };
}

/** Convenience: build a simple single-group spec. */
export function spec(
  count: number,
  sides: number,
  modifier = 0,
  mode: RollMode = "normal",
  label?: string,
): RollSpec {
  return { groups: [{ count, sides }], modifier, mode, label };
}

/**
 * Parse a dice expression into a RollSpec, e.g. "1d8+3", "2d6", "1d10+1d6+5",
 * "d20-1". Trailing words are ignored, so weapon damage like "1d8+3 slashing"
 * works. Returns null when there are no dice.
 */
export function parseRollSpec(notation: string, label?: string): RollSpec | null {
  const lead = notation.trim().toLowerCase().match(/^[0-9d\s+-]+/);
  if (!lead) return null;
  const cleaned = lead[0].replace(/\s+/g, "");
  if (!cleaned) return null;

  const terms = cleaned.match(/[+-]?[^+-]+/g);
  if (!terms) return null;

  const groups: { count: number; sides: number }[] = [];
  let modifier = 0;
  for (const raw of terms) {
    const sign = raw.startsWith("-") ? -1 : 1;
    const body = raw.replace(/^[+-]/, "");
    const dice = body.match(/^(\d*)d(\d+)$/);
    if (dice) {
      const count = dice[1] === "" ? 1 : parseInt(dice[1], 10);
      const sides = parseInt(dice[2], 10);
      if (count > 0 && sides > 0) groups.push({ count, sides });
    } else if (/^\d+$/.test(body)) {
      modifier += sign * parseInt(body, 10);
    }
  }
  if (groups.length === 0) return null;
  return { groups, modifier, mode: "normal", label };
}
