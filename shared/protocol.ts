import type {
  BattleMap,
  Campaign,
  Character,
  CombatState,
  Encounter,
  Note,
  RollHistoryEntry,
  RollPreset,
  RollSpec,
  SessionLog,
  StatBlock,
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
  combat: CombatState;
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
export interface DiceRollMessage {
  type: "dice:roll";
  requestId: string;
  spec: RollSpec;
  hidden?: boolean;
}
export interface PresenceTypingMessage {
  type: "presence:typing";
  context: string | null;
}
export interface ChatSendMessage {
  type: "chat:send";
  body: string;
}
export interface PingMessage {
  type: "ping";
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
  | DiceRollMessage
  | PresenceTypingMessage
  | ChatSendMessage
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
export interface DiceRolledMessage {
  type: "dice:rolled";
  /** Echoed to the roller so it can resolve its optimistic promise. */
  requestId?: string;
  entry: RollHistoryEntry;
}
export interface PresenceStateMessage {
  type: "presence:state";
  users: PresenceUser[];
}
export interface ChatMessageMessage {
  type: "chat:message";
  message: ChatMessage;
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
  | DiceRolledMessage
  | PresenceStateMessage
  | ChatMessageMessage
  | PongMessage;

export type ServerMessageType = ServerMessage["type"];

/** Re-export for convenience where only the campaign entity is needed. */
export type { Campaign };
