import crypto from "node:crypto";
import { nowISO } from "../../shared/ids";
import type { CombatState } from "../../shared/domain";
import type { Repositories } from "./repositories";

// Unambiguous alphabet (no I, O, 0, 1) for human-friendly invite codes.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateJoinCode(repos: Repositories): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
    }
    if (!repos.campaigns.findByJoinCode(code)) return code;
  }
  throw new Error("Could not generate a unique join code.");
}

/** Cryptographically-strong RNG in [0, 1) for authoritative server rolls. */
export const cryptoRng = (): number =>
  crypto.randomInt(0, 0x100000000) / 0x100000000;

export function emptyCombat(): CombatState {
  return {
    id: "combat",
    active: false,
    round: 0,
    turnIndex: 0,
    combatants: [],
    updatedAt: nowISO(),
  };
}
