import type { Role } from "../../shared/protocol";

/**
 * Whether a non-DM may see an entity. DMs see everything; players see anything
 * not hidden, anything explicitly revealed to them (visibleTo), and their own
 * character (ownerId). Entities without the fields are always visible.
 */
export function isVisible(
  entity: unknown,
  role: Role,
  userId: string | null,
): boolean {
  if (role === "dm") return true;
  const v = entity as {
    hidden?: boolean;
    visibleTo?: string[];
    ownerId?: string;
  };
  if (!v.hidden) return true;
  if (userId && v.visibleTo?.includes(userId)) return true;
  if (userId && v.ownerId === userId) return true;
  return false;
}
