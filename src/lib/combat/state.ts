import { nowISO } from "@/lib/domain/ids";
import type { Combatant, CombatState, ConditionKey } from "@/lib/domain/types";
import { sortByInitiative } from "./factory";

/**
 * Pure reducers over CombatState. The tracker UI calls these and persists the
 * result through the data layer, so the turn logic is framework-free and easy
 * to reason about (and to test).
 *
 * Combatants are always kept sorted by initiative (highest first). When that
 * order changes, we re-point `turnIndex` at whoever was active so the current
 * turn never silently jumps to someone else.
 */

function stamp(state: Omit<CombatState, "updatedAt">): CombatState {
  return { ...state, updatedAt: nowISO() };
}

function activeId(state: CombatState): string | undefined {
  return state.combatants[state.turnIndex]?.id;
}

export function startCombat(
  combatants: Combatant[],
  encounterName?: string,
): CombatState {
  return stamp({
    id: "combat",
    active: true,
    round: 1,
    turnIndex: 0,
    combatants: sortByInitiative(combatants),
    encounterName,
  });
}

export function endCombat(): CombatState {
  return stamp({
    id: "combat",
    active: false,
    round: 0,
    turnIndex: 0,
    combatants: [],
  });
}

export function nextTurn(state: CombatState): CombatState {
  if (state.combatants.length === 0) return state;
  let turnIndex = state.turnIndex + 1;
  let round = state.round;
  if (turnIndex >= state.combatants.length) {
    turnIndex = 0;
    round += 1;
  }
  return stamp({ ...state, turnIndex, round });
}

export function prevTurn(state: CombatState): CombatState {
  if (state.combatants.length === 0) return state;
  let turnIndex = state.turnIndex - 1;
  let round = state.round;
  if (turnIndex < 0) {
    turnIndex = state.combatants.length - 1;
    round = Math.max(1, round - 1);
  }
  return stamp({ ...state, turnIndex, round });
}

export function addCombatant(state: CombatState, c: Combatant): CombatState {
  const keep = activeId(state);
  const combatants = sortByInitiative([...state.combatants, c]);
  const turnIndex = Math.max(
    0,
    combatants.findIndex((x) => x.id === keep),
  );
  return stamp({ ...state, combatants, turnIndex });
}

export function removeCombatant(state: CombatState, id: string): CombatState {
  const keep = activeId(state);
  const combatants = state.combatants.filter((c) => c.id !== id);
  if (combatants.length === 0) {
    return stamp({ ...state, combatants, turnIndex: 0 });
  }
  let turnIndex: number;
  if (keep && keep !== id) {
    turnIndex = combatants.findIndex((c) => c.id === keep);
  } else {
    // The active combatant was removed: the next one slides into its slot.
    turnIndex = Math.min(state.turnIndex, combatants.length - 1);
  }
  return stamp({ ...state, combatants, turnIndex: Math.max(0, turnIndex) });
}

export function patchCombatant(
  state: CombatState,
  id: string,
  patch: Partial<Combatant>,
): CombatState {
  const keep = activeId(state);
  let combatants = state.combatants.map((c) =>
    c.id === id ? { ...c, ...patch } : c,
  );
  let turnIndex = state.turnIndex;
  if (patch.initiative !== undefined) {
    combatants = sortByInitiative(combatants);
    turnIndex = Math.max(0, combatants.findIndex((c) => c.id === keep));
  }
  return stamp({ ...state, combatants, turnIndex });
}

export function applyDamage(
  state: CombatState,
  id: string,
  amount: number,
): CombatState {
  return patchCombatant(state, id, damageHp(findCombatant(state, id), amount));
}

export function applyHeal(
  state: CombatState,
  id: string,
  amount: number,
): CombatState {
  const c = findCombatant(state, id);
  if (!c) return state;
  const patch: Partial<Combatant> = {
    currentHp: Math.min(c.maxHp, c.currentHp + Math.abs(amount)),
  };
  // Rising off 0 HP ends the dying state — clear death saves.
  if (c.currentHp <= 0 && Math.abs(amount) > 0) {
    patch.deathSaves = { successes: 0, failures: 0 };
  }
  return patchCombatant(state, id, patch);
}

export function setTempHp(
  state: CombatState,
  id: string,
  amount: number,
): CombatState {
  const c = findCombatant(state, id);
  if (!c) return state;
  return patchCombatant(state, id, { tempHp: Math.max(c.tempHp, Math.abs(amount)) });
}

export function toggleCondition(
  state: CombatState,
  id: string,
  condition: ConditionKey,
): CombatState {
  const c = findCombatant(state, id);
  if (!c) return state;
  const conditions = c.conditions.includes(condition)
    ? c.conditions.filter((x) => x !== condition)
    : [...c.conditions, condition];
  return patchCombatant(state, id, { conditions });
}

function findCombatant(state: CombatState, id: string): Combatant | undefined {
  return state.combatants.find((c) => c.id === id);
}

function damageHp(c: Combatant | undefined, amount: number): Partial<Combatant> {
  if (!c) return {};
  const amt = Math.abs(amount);
  let temp = c.tempHp;
  let remaining = amt;
  if (temp > 0) {
    const absorbed = Math.min(temp, remaining);
    temp -= absorbed;
    remaining -= absorbed;
  }
  return { tempHp: temp, currentHp: Math.max(0, c.currentHp - remaining) };
}
