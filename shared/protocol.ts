import type {
  BattleMap,
  Campaign,
  Character,
  CombatState,
  EconomyState,
  EconomyTransaction,
  Encounter,
  Faction,
  Note,
  Quest,
  RollHistoryEntry,
  RollPreset,
  RollSpec,
  SessionLog,
  StatBlock,
  TimelineEvent,
} from "./domain";
import type { ID, ISODateString } from "./ids";

/**
 * ============================================================================
 *  WIRE PROTOCOL — the single source of truth for client <-> server messaging.
 * ============================================================================
 *
 * Imported by BOTH the Next.js client (realtime provider) and the standalone
 * server (validation + handlers). Never duplicated.
 *
 * Transport split:
 *  - Auth (register / login) is plain HTTP POST JSON (see *Request/*Response
 *    below) on the same host as the socket.
 *  - Everything realtime is WebSocket messages (ClientMessage / ServerMessage),
 *    discriminated on `type`.
 *
 * The map / fog-of-war feature is intentionally NOT built, but the protocol
 * leaves room for a future `map:*` namespace without breaking these unions.
 */

export type Role = "dm" | "player";

export interface UserDTO {
  id: ID;
  username: string;
  displayName: string;
  /** True for the server owner (matches ADMIN_USERNAME). Unlocks the admin panel. */
  isAdmin?: boolean;
}

/** A campaign as seen by a member, with their role. joinCode is DM-only. */
export interface CampaignSummary {
  id: ID;
  name: string;
  setting?: string;
  description?: string;
  role: Role;
  joinCode?: string;
}

export interface PresenceUser {
  userId: ID;
  name: string;
  role: Role;
  online: boolean;
  /** Free-form "editing X" context for lightweight typing indicators. */
  typing?: string | null;
}

export interface ChatMessage {
  id: ID;
  campaignId: ID;
  userId: ID;
  name: string;
  body: string;
  createdAt: ISODateString;
}

/** Maps each syncable scoped collection to its entity type (client typing). */
export interface ScopedEntityMap {
  characters: Character;
  statBlocks: StatBlock;
  encounters: Encounter;
  notes: Note;
  sessionLogs: SessionLog;
  maps: BattleMap;
  rollPresets: RollPreset;
  quests: Quest;
  factions: Faction;
  timeline: TimelineEvent;
}
export type ScopedCollection = keyof ScopedEntityMap;
export type AnyScopedEntity = ScopedEntityMap[ScopedCollection];

export const SCOPED_COLLECTIONS: ScopedCollection[] = [
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
];

/**
 * Collections only the DM may write. `characters` is owner-scoped and
 * `rollPresets`/`quests`/`factions`/`timeline` are collaborative, so none of
 * those appear here. Shared so the client UI and the server enforce the same
 * rule without drifting.
 */
export const DM_ONLY_COLLECTIONS: ScopedCollection[] = [
  "statBlocks",
  "encounters",
  "notes",
  "sessionLogs",
  "maps",
];

/** Everything a client receives when it joins/resyncs a campaign. */
export interface CampaignSnapshot {
  characters: Character[];
  statBlocks: StatBlock[];
  encounters: Encounter[];
  notes: Note[];
  sessionLogs: SessionLog[];
  maps: BattleMap[];
  rollPresets: RollPreset[];
  quests: Quest[];
  factions: Faction[];
  timeline: TimelineEvent[];
  combat: CombatState;
  economy: EconomyState;
  rollLog: RollHistoryEntry[];
  presence: PresenceUser[];
  chat: ChatMessage[];
}

// ---------------------------------------------------------------------------
// HTTP auth DTOs
// ---------------------------------------------------------------------------

export interface RegisterRequest {
  username: string;
  password: string;
  displayName?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: UserDTO;
}

export interface ApiError {
  error: string;
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "bad_request"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal";

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

export interface AuthMessage {
  type: "auth";
  token: string;
}
export interface CampaignCreateMessage {
  type: "campaign:create";
  requestId?: string;
  name: string;
  setting?: string;
  description?: string;
}
export interface CampaignJoinMessage {
  type: "campaign:join";
  requestId?: string;
  joinCode: string;
}
export interface CampaignOpenMessage {
  type: "campaign:open";
  requestId?: string;
  campaignId: ID;
}
export interface CampaignLeaveMessage {
  type: "campaign:leave";
}
export interface EntityCreateMessage {
  type: "entity:create";
  collection: ScopedCollection;
  /** Client-assigned temporary id, echoed nowhere — server assigns the real id. */
  tempId: ID;
  input: Record<string, unknown>;
}
export interface EntityUpdateMessage {
  type: "entity:update";
  collection: ScopedCollection;
  id: ID;
  patch: Record<string, unknown>;
}
export interface EntityRemoveMessage {
  type: "entity:remove";
  collection: ScopedCollection;
  id: ID;
}
export interface CombatSetMessage {
  type: "combat:set";
  state: CombatState;
}
export interface CombatUpdateMessage {
  type: "combat:update";
  patch: Partial<CombatState>;
}
export interface EconomySetMessage {
  type: "economy:set";
  state: EconomyState;
}
export interface EconomyUpdateMessage {
  type: "economy:update";
  patch: Partial<EconomyState>;
}
/** A player buying/selling at a market. Server-validated (anti-cheat). */
export interface TradeExecuteMessage {
  type: "trade:execute";
  requestId: string;
  marketId: ID;
  goodRef: ID;
  action: "buy" | "sell";
  qty: number;
  /** Optional haggle roll total (d20+mod) to discount a buy. */
  haggleRoll?: number;
  /** The character the trade is attributed to (display only). */
  characterId?: ID;
  characterName?: string;
}
export interface DiceRollMessage {
  type: "dice:roll";
  requestId: string;
  spec: RollSpec;
  hidden?: boolean;
}
/** A trust-based hand-thrown roll (3D dice arena) — server logs/broadcasts it. */
export interface DicePhysicalMessage {
  type: "dice:physical";
  total: number;
  notation?: string;
  label?: string;
}
export interface PresenceTypingMessage {
  type: "presence:typing";
  context: string | null;
}
export interface ChatSendMessage {
  type: "chat:send";
  body: string;
}
export interface MapTokenMoveMessage {
  type: "map:token:move";
  mapId: ID;
  tokenId: ID;
  x: number;
  y: number;
}
export interface MapPingMessage {
  type: "map:ping";
  mapId: ID;
  x: number;
  y: number;
}
export interface PingMessage {
  type: "ping";
}

/** A DM handout pushed to the table (text and/or an image). */
export interface Handout {
  title?: string;
  body?: string;
  imageUrl?: string;
  /** Display name of the DM who shared it (filled in server-side). */
  fromName?: string;
  /** True when it was sent to specific players rather than the whole table. */
  private?: boolean;
}
export interface DmHandoutMessage {
  type: "dm:handout";
  title?: string;
  body?: string;
  imageUrl?: string;
  /** Recipient user ids. Empty/absent = everyone at the table. */
  targets?: ID[];
}

export type ClientMessage =
  | AuthMessage
  | CampaignCreateMessage
  | CampaignJoinMessage
  | CampaignOpenMessage
  | CampaignLeaveMessage
  | EntityCreateMessage
  | EntityUpdateMessage
  | EntityRemoveMessage
  | CombatSetMessage
  | CombatUpdateMessage
  | EconomySetMessage
  | EconomyUpdateMessage
  | TradeExecuteMessage
  | DiceRollMessage
  | DicePhysicalMessage
  | PresenceTypingMessage
  | ChatSendMessage
  | MapTokenMoveMessage
  | MapPingMessage
  | DmHandoutMessage
  | PingMessage;

export type ClientMessageType = ClientMessage["type"];

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

export interface AuthedMessage {
  type: "authed";
  user: UserDTO;
}
export interface UnauthedMessage {
  type: "unauthed";
  reason?: string;
}
export interface ErrorMessage {
  type: "error";
  code: ErrorCode;
  message: string;
  requestId?: string;
}
export interface CampaignListMessage {
  type: "campaign:list";
  campaigns: CampaignSummary[];
}
export interface CampaignJoinedMessage {
  type: "campaign:joined";
  requestId?: string;
  campaign: CampaignSummary;
  snapshot: CampaignSnapshot;
}
export interface CampaignLeftMessage {
  type: "campaign:left";
}
export interface EntityChangedMessage {
  type: "entity:changed";
  collection: ScopedCollection;
  /** Authoritative full collection for the active campaign. */
  items: AnyScopedEntity[];
}
export interface CombatChangedMessage {
  type: "combat:changed";
  state: CombatState;
}
export interface EconomyChangedMessage {
  type: "economy:changed";
  state: EconomyState;
}
export interface DiceRolledMessage {
  type: "dice:rolled";
  /** Echoed to the roller so it can resolve its optimistic promise. */
  requestId?: string;
  entry: RollHistoryEntry;
}
/** Reply to the trading client (the new stock state is broadcast separately). */
export interface TradeResultMessage {
  type: "trade:result";
  requestId: string;
  ok: boolean;
  error?: string;
  transaction?: EconomyTransaction;
  unitPrice?: number;
  total?: number;
}
export interface PresenceStateMessage {
  type: "presence:state";
  users: PresenceUser[];
}
export interface ChatMessageMessage {
  type: "chat:message";
  message: ChatMessage;
}
export interface MapTokenMovedMessage {
  type: "map:token:moved";
  mapId: ID;
  tokenId: ID;
  x: number;
  y: number;
}
export interface MapPingedMessage {
  type: "map:pinged";
  mapId: ID;
  x: number;
  y: number;
  by: string;
  color: string;
}
export interface DmHandoutShownMessage {
  type: "dm:handout:shown";
  handout: Handout;
}
/** Homebrew / SRD-override / loot-config content changed — clients should refetch. */
export interface ContentChangedMessage {
  type: "content:changed";
}
export interface PongMessage {
  type: "pong";
}

export type ServerMessage =
  | AuthedMessage
  | UnauthedMessage
  | ErrorMessage
  | CampaignListMessage
  | CampaignJoinedMessage
  | CampaignLeftMessage
  | EntityChangedMessage
  | CombatChangedMessage
  | EconomyChangedMessage
  | DiceRolledMessage
  | TradeResultMessage
  | PresenceStateMessage
  | ChatMessageMessage
  | MapTokenMovedMessage
  | MapPingedMessage
  | DmHandoutShownMessage
  | ContentChangedMessage
  | PongMessage;

export type ServerMessageType = ServerMessage["type"];

/** Re-export for convenience where only the campaign entity is needed. */
export type { Campaign };
