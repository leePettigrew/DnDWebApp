import type { CombatState, Entity } from "@/lib/domain/types";
import { newId, nowISO } from "@/lib/domain/ids";
import type { ID } from "@/lib/domain/ids";
import type { PersistenceAdapter } from "./persistence";
import { createBrowserPersistence } from "./persistence";
import type {
  CreateInput,
  CurrentUser,
  DataProvider,
  DataProviderCapabilities,
  Repository,
  SessionController,
  SingletonRepository,
  Unsubscribe,
  UpdateInput,
} from "./provider";
import { buildSeedData, type SeedData } from "./seed";

/**
 * Phase 1 DataProvider: an in-memory, observable store with a localStorage
 * persistence boundary. Implements the exact `DataProvider` interface that a
 * Phase 2 realtime provider will also implement.
 */

/** An observable in-memory collection persisted through a PersistenceAdapter. */
class LocalCollection<T extends Entity> implements Repository<T> {
  private items: Map<ID, T>;
  private listeners = new Set<(items: T[]) => void>();

  constructor(
    private readonly key: string,
    private readonly persistence: PersistenceAdapter,
    seed: T[],
  ) {
    const loaded = persistence.load<T[]>(key);
    const initial = loaded ?? seed;
    this.items = new Map(initial.map((item) => [item.id, item]));
    // Seed only the first time (when nothing was persisted yet).
    if (!loaded) this.persist();
  }

  private snapshot(): T[] {
    return Array.from(this.items.values());
  }

  private persist(): void {
    this.persistence.save(this.key, this.snapshot());
  }

  private emit(): void {
    const items = this.snapshot();
    this.listeners.forEach((listener) => listener(items));
  }

  async list(): Promise<T[]> {
    return this.snapshot();
  }

  async get(id: ID): Promise<T | null> {
    return this.items.get(id) ?? null;
  }

  async create(input: CreateInput<T>): Promise<T> {
    const ts = nowISO();
    const entity = {
      ...(input as object),
      id: newId(),
      createdAt: ts,
      updatedAt: ts,
    } as T;
    this.items.set(entity.id, entity);
    this.persist();
    this.emit();
    return entity;
  }

  async update(id: ID, patch: UpdateInput<T>): Promise<T> {
    const existing = this.items.get(id);
    if (!existing) throw new Error(`No ${this.key} with id ${id}`);
    const next = {
      ...existing,
      ...(patch as object),
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: nowISO(),
    } as T;
    this.items.set(id, next);
    this.persist();
    this.emit();
    return next;
  }

  async remove(id: ID): Promise<void> {
    if (this.items.delete(id)) {
      this.persist();
      this.emit();
    }
  }

  subscribe(listener: (items: T[]) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.snapshot()); // emit current state immediately
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/** An observable single-document store (the live combat tracker). */
class LocalSingleton<T> implements SingletonRepository<T> {
  private value: T;
  private listeners = new Set<(value: T) => void>();

  constructor(
    private readonly key: string,
    private readonly persistence: PersistenceAdapter,
    fallback: T,
  ) {
    this.value = persistence.load<T>(key) ?? fallback;
    if (persistence.load<T>(key) === null) this.persist();
  }

  private persist(): void {
    this.persistence.save(this.key, this.value);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.value));
  }

  async get(): Promise<T> {
    return this.value;
  }

  async set(value: T): Promise<T> {
    this.value = value;
    this.persist();
    this.emit();
    return this.value;
  }

  async update(patch: Partial<T>): Promise<T> {
    this.value = { ...this.value, ...patch };
    this.persist();
    this.emit();
    return this.value;
  }

  subscribe(listener: (value: T) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.value);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/** Phase 1 session: a fixed local Dungeon Master, never changes. */
class LocalSessionController implements SessionController {
  private user: CurrentUser = { id: "local-dm", name: "Dungeon Master" };

  async getCurrentUser(): Promise<CurrentUser | null> {
    return this.user;
  }

  subscribe(listener: (user: CurrentUser | null) => void): Unsubscribe {
    listener(this.user);
    return () => {};
  }
}

export const emptyCombatState: CombatState = {
  id: "combat",
  active: false,
  round: 0,
  turnIndex: 0,
  combatants: [],
  updatedAt: nowISO(),
};

export interface LocalProviderOptions {
  persistence?: PersistenceAdapter;
  seed?: SeedData;
}

class LocalDataProvider implements DataProvider {
  readonly capabilities: DataProviderCapabilities = {
    realtime: false,
    auth: false,
    multiUser: false,
  };

  readonly campaigns;
  readonly characters;
  readonly statBlocks;
  readonly encounters;
  readonly notes;
  readonly sessionLogs;
  readonly maps;
  readonly rollPresets;
  readonly rollHistory;
  readonly combat;
  readonly session = new LocalSessionController();

  constructor(options: LocalProviderOptions = {}) {
    const persistence = options.persistence ?? createBrowserPersistence();
    const seed = options.seed ?? buildSeedData();

    this.campaigns = new LocalCollection("campaigns", persistence, seed.campaigns);
    this.characters = new LocalCollection("characters", persistence, seed.characters);
    this.statBlocks = new LocalCollection("statBlocks", persistence, seed.statBlocks);
    this.encounters = new LocalCollection("encounters", persistence, seed.encounters);
    this.notes = new LocalCollection("notes", persistence, seed.notes);
    this.sessionLogs = new LocalCollection("sessionLogs", persistence, seed.sessionLogs);
    this.maps = new LocalCollection("maps", persistence, seed.maps);
    this.rollPresets = new LocalCollection("rollPresets", persistence, seed.rollPresets);
    this.rollHistory = new LocalCollection("rollHistory", persistence, []);
    this.combat = new LocalSingleton("combat", persistence, emptyCombatState);
  }

  async init(): Promise<void> {
    // State is hydrated in the constructor; nothing else to connect locally.
  }
}

export function createLocalDataProvider(
  options: LocalProviderOptions = {},
): DataProvider {
  return new LocalDataProvider(options);
}
