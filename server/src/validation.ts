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
  "quests",
  "factions",
  "timeline",
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
  deathSaves: z
    .object({ successes: z.number().int(), failures: z.number().int() })
    .optional(),
  sourceId: z.string().optional(),
  notes: z.string().optional(),
});

const combatLogEntry = z.object({
  id: z.string().max(80),
  at: z.string().max(40),
  text: z.string().max(300),
  kind: z.string().max(20).optional(),
});

const combatState = z.object({
  id: z.literal("combat"),
  active: z.boolean(),
  round: z.number().int(),
  turnIndex: z.number().int(),
  combatants: z.array(combatant).max(200),
  encounterName: z.string().max(200).optional(),
  activeMapId: z.string().max(80).optional(),
  log: z.array(combatLogEntry).max(150).optional(),
  turnSeconds: z.number().int().min(0).max(3600).optional(),
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
    log: z.array(combatLogEntry).max(150),
    turnSeconds: z.number().int().min(0).max(3600),
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
  z.object({ type: z.literal("economy:set"), state: z.record(z.unknown()) }),
  z.object({ type: z.literal("economy:update"), patch: z.record(z.unknown()) }),
  z.object({ type: z.literal("calendar:set"), state: z.record(z.unknown()) }),
  z.object({ type: z.literal("calendar:update"), patch: z.record(z.unknown()) }),
  z.object({
    type: z.literal("trade:execute"),
    requestId: z.string().max(80),
    marketId: z.string().max(80),
    goodRef: z.string().max(80),
    action: z.enum(["buy", "sell"]),
    qty: z.number().int().min(1).max(100000),
    haggleRoll: z.number().int().min(0).max(100).optional(),
    characterId: z.string().max(80).optional(),
    characterName: z.string().max(120).optional(),
  }),
  z.object({
    type: z.literal("service:buy"),
    requestId: z.string().max(80),
    marketId: z.string().max(80),
    serviceId: z.string().max(80),
    characterId: z.string().max(80).optional(),
    characterName: z.string().max(120).optional(),
  }),
  z.object({
    type: z.literal("commission:fulfill"),
    requestId: z.string().max(80),
    commissionId: z.string().max(80),
    qty: z.number().int().min(1).max(100000),
    characterId: z.string().max(80),
    characterName: z.string().max(120).optional(),
  }),
  z.object({
    type: z.literal("job:action"),
    requestId: z.string().max(80),
    jobId: z.string().max(80),
    action: z.enum(["accept", "deliver"]),
    characterId: z.string().max(80),
    characterName: z.string().max(120).optional(),
  }),
  z.object({
    type: z.literal("consign:list"),
    requestId: z.string().max(80),
    marketId: z.string().max(80),
    itemId: z.string().max(80),
    qty: z.number().int().min(1).max(100000),
    price: z.number().min(0).max(1_000_000),
    characterId: z.string().max(80),
    characterName: z.string().max(120).optional(),
  }),
  z.object({
    type: z.literal("consign:act"),
    requestId: z.string().max(80),
    consignmentId: z.string().max(80),
    action: z.enum(["buy", "collect", "cancel"]),
    qty: z.number().int().min(1).max(100000).optional(),
    characterId: z.string().max(80),
    characterName: z.string().max(120).optional(),
  }),
  z.object({
    type: z.literal("p2ptrade:propose"),
    requestId: z.string().max(80),
    toUserId: z.string().max(80),
    fromCharacterId: z.string().max(80),
    toCharacterId: z.string().max(80),
  }),
  z.object({
    type: z.literal("p2ptrade:offer"),
    sessionId: z.string().max(80),
    gold: z.number().int().min(0).max(1_000_000),
    items: z
      .array(
        z.object({
          itemId: z.string().max(80),
          name: z.string().max(200),
          quantity: z.number().int().min(1).max(100000),
        }),
      )
      .max(50),
  }),
  z.object({ type: z.literal("p2ptrade:confirm"), sessionId: z.string().max(80) }),
  z.object({ type: z.literal("p2ptrade:cancel"), sessionId: z.string().max(80) }),
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
  z.object({
    type: z.literal("dm:handout"),
    title: z.string().max(120).optional(),
    body: z.string().max(4000).optional(),
    imageUrl: z.string().max(2000).optional(),
    targets: z.array(z.string().max(80)).max(50).optional(),
  }),
  z.object({ type: z.literal("ping") }),
]);

export function parseClientMessage(raw: unknown): ClientMessage | null {
  const result = message.safeParse(raw);
  return result.success ? (result.data as ClientMessage) : null;
}
