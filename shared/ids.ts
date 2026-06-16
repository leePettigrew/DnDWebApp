/**
 * ID + timestamp helpers shared by every entity.
 *
 * SHARED single source of truth — imported by both the Next.js client
 * (via the `@shared/*` path alias) and the standalone server (relative import).
 * Dependency-free and runtime-agnostic: `crypto.randomUUID` is a global in both
 * modern browsers and Node, with a time-seeded fallback.
 */

export type ID = string;
export type ISODateString = string;

export function newId(prefix = ""): ID {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${uuid}` : uuid;
}

export function nowISO(): ISODateString {
  return new Date().toISOString();
}
