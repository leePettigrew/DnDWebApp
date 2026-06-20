import type {
  BattleMap,
  Campaign,
  CombatState,
  EconomyState,
  Entity,
  Faction,
  RollHistoryEntry,
  RollResult,
  RollSpec,
} from "@/lib/domain/types";
import { newId, nowISO } from "@/lib/domain/ids";
import type { ID } from "@/lib/domain/ids";
import { rollSpec } from "@/lib/domain/dice";
import { emptyEconomy } from "@shared/economy";
import { applyTrade, isTradeError } from "@shared/economy-trade";
import { standingToRep } from "@shared/economy-pricing";
import type {
  CampaignSummary,
  ChatMessage,
  PresenceUser,
  Role,
} from "@shared/protocol";
import type { PersistenceAdapter } from "./persistence";
import { createBrowserPersistence } from "./persistence";
import type {
  AuthController,
  ConnectionStatus,
  CreateInput,
  CurrentUser,
  DataProvider,
  DataProviderCapabilities,
  LoginInput,
  Handout,
  MapPing,
  RealtimeController,
  RegisterInput,
  Repository,
  SessionController,
  SingletonRepository,
  TradeInput,
  TradeOutcome,
  Unsubscribe,
  UpdateInput,
} from "./provider";
import { buildSeedData, type SeedData } from "./seed";

const LOCAL_USER: CurrentUser = { id: "local-dm", name: "Dungeon Master" };

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

/** Phase 1 auth: a fixed local Dungeon Master. register/login are no-ops. */
class LocalAuthController implements AuthController {
  readonly mode = "local" as const;

  async getCurrentUser(): Promise<CurrentUser | null> {
    return LOCAL_USER;
  }

  subscribe(listener: (user: CurrentUser | null) => void): Unsubscribe {
    listener(LOCAL_USER);
    return () => {};
  }

  // No accounts in local mode — you are always the local DM.
  async register(_input: RegisterInput): Promise<void> {}
  async login(_input: LoginInput): Promise<void> {}
  async logout(): Promise<void> {}
}

/** Phase 1 realtime: inert. Status "local", presence = just you, you are DM. */
class LocalRealtimeController implements RealtimeController {
  private summaries: CampaignSummary[] = [];

  private pingListeners = new Set<(p: MapPing) => void>();
  private handoutListeners = new Set<(h: Handout) => void>();

  constructor(
    private readonly campaigns: Repository<Campaign>,
    private readonly rollHistory: Repository<RollHistoryEntry>,
    private readonly maps: Repository<BattleMap>,
    private readonly economy: SingletonRepository<EconomyState>,
    private readonly factions: Repository<Faction>,
  ) {
    // Mirror local campaigns as DM memberships for any UI that asks.
    this.campaigns.subscribe((items) => {
      this.summaries = items.map((c) => ({
        id: c.id,
        name: c.name,
        setting: c.setting,
        description: c.description,
        role: "dm" as Role,
      }));
    });
  }

  getStatus(): ConnectionStatus {
    return "local";
  }
  subscribeStatus(listener: (status: ConnectionStatus) => void): Unsubscribe {
    listener("local");
    return () => {};
  }

  getActiveCampaign(): CampaignSummary | null {
    return null;
  }
  getRole(): Role | null {
    return "dm";
  }
  subscribeActiveCampaign(
    listener: (campaign: CampaignSummary | null, role: Role | null) => void,
  ): Unsubscribe {
    listener(null, "dm");
    return () => {};
  }

  getCampaigns(): CampaignSummary[] {
    return this.summaries;
  }
  subscribeCampaigns(
    listener: (campaigns: CampaignSummary[]) => void,
  ): Unsubscribe {
    return this.campaigns.subscribe((items) => {
      listener(
        items.map((c) => ({
          id: c.id,
          name: c.name,
          setting: c.setting,
          description: c.description,
          role: "dm" as Role,
        })),
      );
    });
  }

  async createCampaign(input: {
    name: string;
    setting?: string;
    description?: string;
  }): Promise<CampaignSummary> {
    const campaign = await this.campaigns.create({
      name: input.name,
      setting: input.setting,
      description: input.description,
      bannerUrl: "",
    });
    return {
      id: campaign.id,
      name: campaign.name,
      setting: campaign.setting,
      description: campaign.description,
      role: "dm",
    };
  }
  async joinByCode(_code: string): Promise<CampaignSummary> {
    throw new Error("Joining campaigns requires the multiplayer server.");
  }
  async openCampaign(_campaignId: ID): Promise<void> {}
  async leaveCampaign(): Promise<void> {}

  subscribePresence(listener: (users: PresenceUser[]) => void): Unsubscribe {
    listener([
      { userId: LOCAL_USER.id, name: LOCAL_USER.name, role: "dm", online: true },
    ]);
    return () => {};
  }
  setTyping(_context: string | null): void {}

  moveToken(mapId: string, tokenId: string, x: number, y: number): void {
    void (async () => {
      const map = await this.maps.get(mapId);
      if (!map?.tokens) return;
      await this.maps.update(mapId, {
        tokens: map.tokens.map((t) =>
          t.id === tokenId ? { ...t, x, y } : t,
        ),
      });
    })();
  }
  ping(mapId: string, x: number, y: number): void {
    const ping: MapPing = {
      id: newId(),
      mapId,
      x,
      y,
      by: LOCAL_USER.name,
      color: "#E6C772",
    };
    this.pingListeners.forEach((l) => l(ping));
  }
  subscribePings(listener: (p: MapPing) => void): Unsubscribe {
    this.pingListeners.add(listener);
    return () => this.pingListeners.delete(listener);
  }
  shareHandout(handout: Handout): void {
    // Solo has no table, but surface it locally as a preview.
    this.handoutListeners.forEach((l) => l(handout));
  }
  subscribeHandouts(listener: (h: Handout) => void): Unsubscribe {
    this.handoutListeners.add(listener);
    return () => this.handoutListeners.delete(listener);
  }
  subscribeContentChanged(_listener: () => void): Unsubscribe {
    return () => {};
  }

  getChat(): ChatMessage[] {
    return [];
  }
  subscribeChat(listener: (messages: ChatMessage[]) => void): Unsubscribe {
    listener([]);
    return () => {};
  }
  sendChat(_body: string): void {}

  async roll(spec: RollSpec): Promise<RollResult> {
    const result = rollSpec(spec);
    const { id: _id, ...rest } = result;
    void _id;
    await this.rollHistory.create({ ...rest });
    return result;
  }

  async executeTrade(input: TradeInput): Promise<TradeOutcome> {
    const economy = await this.economy.get();
    let rep = 2;
    const market = (economy.markets ?? []).find((m) => m.id === input.marketId);
    if (market?.factionId) {
      const faction = await this.factions.get(market.factionId);
      rep = standingToRep(faction?.standing);
    }
    const outcome = applyTrade(
      economy,
      {
        marketId: input.marketId,
        goodRef: input.goodRef,
        action: input.action,
        qty: input.qty,
        haggleRoll: input.haggleRoll,
      },
      {
        rep,
        actorId: LOCAL_USER.id,
        actorName: input.characterName || LOCAL_USER.name,
        isDM: true,
        userId: LOCAL_USER.id,
      },
    );
    if (isTradeError(outcome)) return { ok: false, error: outcome.error };
    await this.economy.set(outcome.economy);
    return {
      ok: true,
      transaction: outcome.transaction,
      unitPrice: outcome.unitPrice,
      total: outcome.total,
    };
  }

  logPhysicalRoll(total: number, label?: string): void {
    void this.rollHistory.create({
      timestamp: nowISO(),
      label,
      mode: "normal",
      rolls: [{ sides: 20, value: total }],
      modifier: 0,
      total,
      isCrit: total === 20,
      isFumble: total === 1,
      notation: "d20",
      rolledByName: LOCAL_USER.name,
      physical: true,
    });
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
  readonly quests;
  readonly factions;
  readonly timeline;
  readonly rollHistory;
  readonly combat;
  readonly economy;
  readonly session: SessionController;
  readonly auth: AuthController;
  readonly realtime: RealtimeController;

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
    this.quests = new LocalCollection("quests", persistence, seed.quests);
    this.factions = new LocalCollection("factions", persistence, seed.factions);
    this.timeline = new LocalCollection("timeline", persistence, seed.timeline);
    this.rollHistory = new LocalCollection("rollHistory", persistence, []);
    this.combat = new LocalSingleton("combat", persistence, emptyCombatState);
    this.economy = new LocalSingleton("economy", persistence, emptyEconomy());

    const auth = new LocalAuthController();
    this.auth = auth;
    this.session = auth;
    this.realtime = new LocalRealtimeController(
      this.campaigns,
      this.rollHistory,
      this.maps,
      this.economy,
      this.factions,
    );
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
