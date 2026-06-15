/**
 * ID + timestamp helpers shared by every entity.
 *
 * Kept tiny and dependency-free so both the data layer and seed data can use
 * them. `newId` uses the platform crypto UUID where available and falls back to
 * a time-seeded random string (e.g. older runtimes / non-secure contexts).
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
