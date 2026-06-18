import type {
  BattleMap,
  Campaign,
  Character,
  CombatState,
  Encounter,
  Entity,
  Faction,
  Note,
  Quest,
  RollHistoryEntry,
  RollPreset,
  RollResult,
  RollSpec,
  SessionLog,
  StatBlock,
  TimelineEvent,
} from "@/lib/domain/types";
import type { ID } from "@/lib/domain/ids";
import type {
  CampaignSummary,
  ChatMessage,
  Handout,
  PresenceUser,
  Role,
} from "@shared/protocol";

export type { Handout };

/**
 * ===========================================================================
 *  THE DATA-LAYER SEAM
 * ===========================================================================
 *
 * This file defines the ONLY contract the UI and feature code are allowed to
 * know about. Nothing above this layer imports localStorage, fetch, sockets,
 * or any storage detail — they import these interfaces and the React hooks in
 * ./hooks.ts.
 *
 * Phase 1 ships `createLocalDataProvider()` (./local-provider.ts), an in-memory
 * store with a swappable persistence boundary (./persistence.ts).
 *
 * Phase 2 (real-time multiplayer + auth) ships a *different* implementation of
 * this SAME interface — e.g. `createRealtimeDataProvider()` backed by
 * WebSockets / Supabase / Firebase. Because every method is already async and
 * every collection is already observable via `subscribe`, swapping the
 * implementation requires NO changes to UI or feature code. See ./README.md.
 *
 * The two design decisions that make the swap free:
 *   1. Async everywhere — local resolves immediately, network resolves later,
 *      but the call sites are identical.
 *   2. Observation built in — `subscribe` lets the UI react to changes it did
 *      not initiate. Locally that's just same-tab mutations; remotely it's
 *      pushes from other players. Same code path.
 */

export type Unsubscribe = () => void;

/** Fields the caller supplies on create; the provider assigns id + timestamps. */
export type CreateInput<T extends Entity> = Omit<
  T,
  "id" | "createdAt" | "updatedAt"
>;

/** Any subset of mutable fields. id/timestamps are managed by the provider. */
export type UpdateInput<T extends Entity> = Partial<
  Omit<T, "id" | "createdAt" | "updatedAt">
>;

/** An observable CRUD collection of one entity type. */
export interface Repository<T extends Entity> {
  list(): Promise<T[]>;
  get(id: ID): Promise<T | null>;
  create(input: CreateInput<T>): Promise<T>;
  update(id: ID, patch: UpdateInput<T>): Promise<T>;
  remove(id: ID): Promise<void>;
  /**
   * Observe the whole collection. The listener is called immediately with the
   * current contents, then again after every change (local or, in Phase 2,
   * remote). Returns an unsubscribe function.
   */
  subscribe(listener: (items: T[]) => void): Unsubscribe;
}

/** A single observable document (used for the live combat tracker). */
export interface SingletonRepository<T> {
  get(): Promise<T>;
  set(value: T): Promise<T>;
  update(patch: Partial<T>): Promise<T>;
  subscribe(listener: (value: T) => void): Unsubscribe;
}

/** The current user. In Phase 1 this is always a fixed local "Dungeon Master". */
export interface CurrentUser {
  id: string;
  name: string;
  /** True for the server owner (ADMIN_USERNAME) — unlocks the admin panel. */
  isAdmin?: boolean;
}

/**
 * Auth/session seam. Phase 1 returns a fixed local user and never changes.
 * Phase 2 adds real sign-in/out here and emits user changes through `subscribe`
 * — again without the UI needing to know which backend is wired up.
 */
export interface SessionController {
  getCurrentUser(): Promise<CurrentUser | null>;
  subscribe(listener: (user: CurrentUser | null) => void): Unsubscribe;
}

/** A transient map ping delivered to subscribers. */
export interface MapPing {
  id: ID;
  mapId: ID;
  x: number;
  y: number;
  by: string;
  color: string;
}

/** Live connection state surfaced to the UI. "local" = no server configured. */
export type ConnectionStatus =
  | "local"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline";

export interface RegisterInput {
  username: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

/**
 * Auth seam. In local mode `mode === "local"` and register/login are no-ops
 * (the user is always the local Dungeon Master). In remote mode these hit the
 * server and update the current user, which the UI observes via `subscribe`.
 */
export interface AuthController extends SessionController {
  readonly mode: "local" | "remote";
  register(input: RegisterInput): Promise<void>;
  login(input: LoginInput): Promise<void>;
  logout(): Promise<void>;
}

/**
 * Realtime/campaign-session seam. Everything here is inert in local mode
 * (status "local", a single implicit campaign, presence = just you) so Phase 1
 * keeps working with no server. The realtime provider implements it against the
 * WebSocket connection.
 */
export interface RealtimeController {
  getStatus(): ConnectionStatus;
  subscribeStatus(listener: (status: ConnectionStatus) => void): Unsubscribe;

  getActiveCampaign(): CampaignSummary | null;
  getRole(): Role | null;
  subscribeActiveCampaign(
    listener: (campaign: CampaignSummary | null, role: Role | null) => void,
  ): Unsubscribe;

  /** The campaigns the current user is a member of (with role + DM join code). */
  getCampaigns(): CampaignSummary[];
  subscribeCampaigns(
    listener: (campaigns: CampaignSummary[]) => void,
  ): Unsubscribe;

  createCampaign(input: {
    name: string;
    setting?: string;
    description?: string;
  }): Promise<CampaignSummary>;
  joinByCode(code: string): Promise<CampaignSummary>;
  openCampaign(campaignId: ID): Promise<void>;
  leaveCampaign(): Promise<void>;

  subscribePresence(listener: (users: PresenceUser[]) => void): Unsubscribe;
  setTyping(context: string | null): void;

  /** Move a map token (DM: any; player: only their own). Optimistic + synced. */
  moveToken(mapId: ID, tokenId: ID, x: number, y: number): void;
  /** Drop a transient ping on the map for the whole table. */
  ping(mapId: ID, x: number, y: number): void;
  subscribePings(listener: (ping: MapPing) => void): Unsubscribe;

  /** Fires when homebrew/SRD-override/loot content changed server-side. */
  subscribeContentChanged(listener: () => void): Unsubscribe;

  /**
   * Push a handout (text/image) to the table (DM only). With `targets` (user
   * ids) it goes only to those players; otherwise to everyone.
   */
  shareHandout(handout: Handout, targets?: ID[]): void;
  subscribeHandouts(listener: (handout: Handout) => void): Unsubscribe;

  /** Campaign chat (multiplayer only; empty/no-op in local mode). */
  getChat(): ChatMessage[];
  subscribeChat(listener: (messages: ChatMessage[]) => void): Unsubscribe;
  sendChat(body: string): void;

  /**
   * Make a roll. In remote mode the SERVER computes the authoritative result
   * (anti-cheat) and broadcasts it (respecting `hidden`); the returned promise
   * resolves with that result so the UI can animate to it. In local mode it is
   * computed locally and appended to history.
   */
  roll(spec: RollSpec, opts?: { hidden?: boolean }): Promise<RollResult>;

  /**
   * Log/share a hand-thrown d20 result (from the 3D dice arena) to the roll
   * history. Trust-based: the thrown number is reported as-is and broadcast to
   * the table (always public).
   */
  logPhysicalRoll(total: number, label?: string): void;
}

/** What a given provider can actually do — lets the UI light up Phase 2 bits. */
export interface DataProviderCapabilities {
  /** True when changes from other clients arrive without a manual refresh. */
  realtime: boolean;
  /** True when real authentication is wired up. */
  auth: boolean;
  /** True when more than one user can share the same data. */
  multiUser: boolean;
}

/**
 * The whole data surface. Acquire it via `useDataProvider()` and read/write
 * collections via the hooks in ./hooks.ts — never construct one in feature code.
 */
export interface DataProvider {
  readonly capabilities: DataProviderCapabilities;

  /** Connect / hydrate. Idempotent; safe to call repeatedly. */
  init(): Promise<void>;

  readonly campaigns: Repository<Campaign>;
  readonly characters: Repository<Character>;
  readonly statBlocks: Repository<StatBlock>;
  readonly encounters: Repository<Encounter>;
  readonly notes: Repository<Note>;
  readonly sessionLogs: Repository<SessionLog>;
  readonly maps: Repository<BattleMap>;
  readonly rollPresets: Repository<RollPreset>;
  readonly quests: Repository<Quest>;
  readonly factions: Repository<Faction>;
  readonly timeline: Repository<TimelineEvent>;
  readonly rollHistory: Repository<RollHistoryEntry>;
  readonly combat: SingletonRepository<CombatState>;

  /** Current user. Kept for Phase 1 back-compat; `auth` is the superset. */
  readonly session: SessionController;
  readonly auth: AuthController;
  readonly realtime: RealtimeController;
}
