import type {
  BattleMap,
  Campaign,
  Character,
  CombatState,
  Encounter,
  Entity,
  Note,
  RollHistoryEntry,
  RollPreset,
  SessionLog,
  StatBlock,
} from "@/lib/domain/types";
import type { ID } from "@/lib/domain/ids";

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
  readonly rollHistory: Repository<RollHistoryEntry>;
  readonly combat: SingletonRepository<CombatState>;

  readonly session: SessionController;
}
