import { z } from "zod";
import type { ClientMessage } from "../../shared/protocol";

/**
 * Strict validation of the message envelope. Entity `input`/`patch` payloads are
 * treated as opaque objects — the server controls the sensitive fields (id,
 * campaignId, ownerId, timestamps) itself, so a malicious client can't forge
 * them by stuffing the payload.
 */

const scopedCollection = z.enum([
  "characters",
  "statBlocks",
  "encounters",
  "notes",
  "sessionLogs",
  "maps",
  "rollPresets",
]);

const diceGroup = z.object({
  count: z.number().int().min(0).max(100),
  sides: z.number().int().min(2).max(1000),
});

const rollSpec = z.object({
  label: z.string().max(120).optional(),
  groups: z.array(diceGroup).max(50),
  modifier: z.number().int().min(-10000).max(10000),
  mode: z.enum(["normal", "advantage", "disadvantage"]),
});

const combatant = z.object({
  id: z.string(),
  name: z.string().max(200),
  initiative: z.number(),
  maxHp: z.number(),
  currentHp: z.number(),
  tempHp: z.number(),
  armorClass: z.number(),
  conditions: z.array(z.string()),
  isPC: z.boolean(),
  sourceId: z.string().optional(),
  notes: z.string().optional(),
});

const combatState = z.object({
  id: z.literal("combat"),
  active: z.boolean(),
  round: z.number().int(),
  turnIndex: z.number().int(),
  combatants: z.array(combatant).max(200),
  encounterName: z.string().max(200).optional(),
  activeMapId: z.string().max(80).optional(),
  updatedAt: z.string(),
});

const combatPatch = z
  .object({
    active: z.boolean(),
    round: z.number().int(),
    turnIndex: z.number().int(),
    combatants: z.array(combatant).max(200),
    encounterName: z.string().max(200),
    activeMapId: z.string().max(80),
    updatedAt: z.string(),
  })
  .partial();

const message = z.discriminatedUnion("type", [
  z.object({ type: z.literal("auth"), token: z.string().max(4096) }),
  z.object({
    type: z.literal("campaign:create"),
    requestId: z.string().optional(),
    name: z.string().min(1).max(80),
    setting: z.string().max(80).optional(),
    description: z.string().max(4000).optional(),
  }),
  z.object({
    type: z.literal("campaign:join"),
    requestId: z.string().optional(),
    joinCode: z.string().min(1).max(16),
  }),
  z.object({
    type: z.literal("campaign:open"),
    requestId: z.string().optional(),
    campaignId: z.string().max(80),
  }),
  z.object({ type: z.literal("campaign:leave") }),
  z.object({
    type: z.literal("entity:create"),
    collection: scopedCollection,
    tempId: z.string().max(80),
    input: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal("entity:update"),
    collection: scopedCollection,
    id: z.string().max(80),
    patch: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal("entity:remove"),
    collection: scopedCollection,
    id: z.string().max(80),
  }),
  z.object({ type: z.literal("combat:set"), state: combatState }),
  z.object({ type: z.literal("combat:update"), patch: combatPatch }),
  z.object({
    type: z.literal("dice:roll"),
    requestId: z.string().max(80),
    spec: rollSpec,
    hidden: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("dice:physical"),
    total: z.number().int().min(1).max(1000),
    notation: z.string().max(20).optional(),
    label: z.string().max(120).optional(),
  }),
  z.object({
    type: z.literal("presence:typing"),
    context: z.string().max(120).nullable(),
  }),
  z.object({
    type: z.literal("chat:send"),
    body: z.string().min(1).max(2000),
  }),
  z.object({
    type: z.literal("map:token:move"),
    mapId: z.string().max(80),
    tokenId: z.string().max(80),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({
    type: z.literal("map:ping"),
    mapId: z.string().max(80),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
  z.object({ type: z.literal("ping") }),
]);

export function parseClientMessage(raw: unknown): ClientMessage | null {
  const result = message.safeParse(raw);
  return result.success ? (result.data as ClientMessage) : null;
}
