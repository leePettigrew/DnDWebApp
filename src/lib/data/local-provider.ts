import type {
  BattleMap,
  Campaign,
  Character,
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
import {
  applyCommission,
  applyConsignBuy,
  applyConsignList,
  applyConsignManage,
  applyJobAction,
  applyServicePurchase,
  applyTrade,
  isTradeError,
} from "@shared/economy-trade";
import type { ConsignApplied } from "@shared/economy-trade";
import { improveStanding, standingToRep } from "@shared/economy-pricing";
import { applyP2PTrade, makeParty, touchSession } from "@shared/trade";
import type { TradeSession } from "@shared/trade";
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
  CommissionInput,
  ConsignActInput,
  ConsignListInput,
  JobInput,
  ProposeTradeInput,
  ProposeTradeResult,
  Repository,
  SessionController,
  SingletonRepository,
  ServiceInput,
  TradeInput,
  TradeItemRef,
  TradeOutcome,
  TradeSide,
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
  private activeTrade: TradeSession | null = null;
  private tradeListeners = new Set<(s: TradeSession | null) => void>();

  constructor(
    private readonly campaigns: Repository<Campaign>,
    private readonly rollHistory: Repository<RollHistoryEntry>,
    private readonly maps: Repository<BattleMap>,
    private readonly economy: SingletonRepository<EconomyState>,
    private readonly factions: Repository<Faction>,
    private readonly characters: Repository<Character>,
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

  async executeService(input: ServiceInput): Promise<TradeOutcome> {
    const economy = await this.economy.get();
    let rep = 2;
    const market = (economy.markets ?? []).find((m) => m.id === input.marketId);
    if (market?.factionId) {
      const faction = await this.factions.get(market.factionId);
      rep = standingToRep(faction?.standing);
    }
    const outcome = applyServicePurchase(
      economy,
      { marketId: input.marketId, serviceId: input.serviceId },
      {
        rep,
        actorId: LOCAL_USER.id,
        actorName: input.characterName || LOCAL_USER.name,
        isDM: true,
        userId: LOCAL_USER.id,
      },
    );
    if ("error" in outcome) return { ok: false, error: outcome.error };
    await this.economy.set(outcome.economy);
    return {
      ok: true,
      transaction: outcome.transaction,
      unitPrice: outcome.unitPrice,
      total: outcome.total,
    };
  }

  async executeCommission(input: CommissionInput): Promise<TradeOutcome> {
    const economy = await this.economy.get();
    const character = await this.characters.get(input.characterId);
    if (!character) return { ok: false, error: "Character not found." };
    const com = (economy.commissions ?? []).find((c) => c.id === input.commissionId);
    let rep = 2;
    if (com?.factionId) {
      const faction = await this.factions.get(com.factionId);
      rep = standingToRep(faction?.standing);
    }
    const outcome = applyCommission(
      economy,
      character,
      { commissionId: input.commissionId, qty: input.qty },
      {
        rep,
        actorId: LOCAL_USER.id,
        actorName: input.characterName || character.name,
        isDM: true,
        userId: LOCAL_USER.id,
      },
    );
    if ("error" in outcome) return { ok: false, error: outcome.error };
    await this.economy.set(outcome.economy);
    await this.characters.update(outcome.character.id, {
      inventory: outcome.character.inventory,
      currency: outcome.character.currency,
    });
    if (outcome.completed && com?.repReward && outcome.factionId) {
      const faction = await this.factions.get(outcome.factionId);
      if (faction) {
        await this.factions.update(faction.id, {
          standing: improveStanding(faction.standing),
        });
      }
    }
    return {
      ok: true,
      transaction: outcome.transaction,
      unitPrice: outcome.transaction.unitPrice,
      total: outcome.total,
    };
  }

  async executeJob(input: JobInput): Promise<TradeOutcome> {
    const economy = await this.economy.get();
    const character = await this.characters.get(input.characterId);
    if (!character) return { ok: false, error: "Character not found." };
    const outcome = applyJobAction(
      economy,
      character,
      { jobId: input.jobId, action: input.action },
      {
        rep: 2,
        actorId: LOCAL_USER.id,
        actorName: input.characterName || character.name,
        isDM: true,
        userId: LOCAL_USER.id,
      },
    );
    if ("error" in outcome) return { ok: false, error: outcome.error };
    await this.economy.set(outcome.economy);
    await this.characters.update(outcome.character.id, {
      inventory: outcome.character.inventory,
      currency: outcome.character.currency,
    });
    return {
      ok: true,
      transaction: outcome.transaction,
      unitPrice: outcome.transaction?.unitPrice,
      total: outcome.total,
    };
  }

  private async commitConsign(outcome: ConsignApplied): Promise<TradeOutcome> {
    await this.economy.set(outcome.economy);
    await this.characters.update(outcome.character.id, {
      inventory: outcome.character.inventory,
      currency: outcome.character.currency,
    });
    return {
      ok: true,
      transaction: outcome.transaction,
      unitPrice: outcome.transaction?.unitPrice,
      total: outcome.total,
    };
  }

  async consignList(input: ConsignListInput): Promise<TradeOutcome> {
    const economy = await this.economy.get();
    const character = await this.characters.get(input.characterId);
    if (!character) return { ok: false, error: "Character not found." };
    const outcome = applyConsignList(
      economy,
      character,
      { marketId: input.marketId, itemId: input.itemId, qty: input.qty, price: input.price },
      { rep: 2, actorId: LOCAL_USER.id, actorName: input.characterName || character.name, isDM: true, userId: LOCAL_USER.id },
    );
    if ("error" in outcome) return { ok: false, error: outcome.error };
    return this.commitConsign(outcome);
  }

  async consignAct(input: ConsignActInput): Promise<TradeOutcome> {
    const economy = await this.economy.get();
    const character = await this.characters.get(input.characterId);
    if (!character) return { ok: false, error: "Character not found." };
    const ctx = { rep: 2, actorId: LOCAL_USER.id, actorName: input.characterName || character.name, isDM: true, userId: LOCAL_USER.id };
    const outcome =
      input.action === "buy"
        ? applyConsignBuy(economy, character, { consignmentId: input.consignmentId, qty: input.qty ?? 1 }, ctx)
        : applyConsignManage(economy, character, { consignmentId: input.consignmentId, action: input.action }, ctx);
    if ("error" in outcome) return { ok: false, error: outcome.error };
    return this.commitConsign(outcome);
  }

  // --- player ↔ player trading (solo: between two of your characters) -------

  private setTrade(s: TradeSession | null): void {
    this.activeTrade = s;
    this.tradeListeners.forEach((l) => l(s));
  }
  getActiveTrade(): TradeSession | null {
    return this.activeTrade;
  }
  subscribeTrade(listener: (s: TradeSession | null) => void): Unsubscribe {
    this.tradeListeners.add(listener);
    listener(this.activeTrade);
    return () => this.tradeListeners.delete(listener);
  }
  dismissTrade(): void {
    if (this.activeTrade && this.activeTrade.status !== "open") this.setTrade(null);
  }

  async proposeTrade(input: ProposeTradeInput): Promise<ProposeTradeResult> {
    if (input.fromCharacterId === input.toCharacterId) {
      return { ok: false, error: "Pick two different characters." };
    }
    const from = await this.characters.get(input.fromCharacterId);
    const to = await this.characters.get(input.toCharacterId);
    if (!from || !to) return { ok: false, error: "Character not found." };
    const session = touchSession({
      id: newId(),
      status: "open",
      from: makeParty(LOCAL_USER.id, from),
      to: makeParty(LOCAL_USER.id, to),
    });
    this.setTrade(session);
    return { ok: true, sessionId: session.id };
  }

  updateTradeOffer(
    sessionId: string,
    gold: number,
    items: TradeItemRef[],
    side: TradeSide,
  ): void {
    const s = this.activeTrade;
    if (!s || s.id !== sessionId || s.status !== "open") return;
    const stake = { gold: Math.max(0, Math.floor(gold || 0)), items };
    this.setTrade(
      touchSession({
        ...s,
        from: { ...s.from, confirmed: false, ...(side === "from" ? { stake } : {}) },
        to: { ...s.to, confirmed: false, ...(side === "to" ? { stake } : {}) },
        error: undefined,
      }),
    );
  }

  confirmTrade(sessionId: string, side: TradeSide): void {
    const s = this.activeTrade;
    if (!s || s.id !== sessionId || s.status !== "open") return;
    const next = touchSession({
      ...s,
      from: { ...s.from, confirmed: side === "from" ? true : s.from.confirmed },
      to: { ...s.to, confirmed: side === "to" ? true : s.to.confirmed },
      error: undefined,
    });
    if (next.from.confirmed && next.to.confirmed) {
      void this.completeTrade(next);
      return;
    }
    this.setTrade(next);
  }

  private async completeTrade(session: TradeSession): Promise<void> {
    const a = await this.characters.get(session.from.characterId);
    const b = await this.characters.get(session.to.characterId);
    if (!a || !b) {
      this.setTrade(touchSession({ ...session, status: "cancelled", error: "A character is gone." }));
      return;
    }
    const result = applyP2PTrade(a, b, session);
    if ("error" in result) {
      this.setTrade(
        touchSession({
          ...session,
          from: { ...session.from, confirmed: false },
          to: { ...session.to, confirmed: false },
          error: result.error,
        }),
      );
      return;
    }
    await this.characters.update(result.a.id, {
      inventory: result.a.inventory,
      currency: result.a.currency,
    });
    await this.characters.update(result.b.id, {
      inventory: result.b.inventory,
      currency: result.b.currency,
    });
    this.setTrade(touchSession({ ...session, status: "completed" }));
  }

  cancelTrade(sessionId: string): void {
    const s = this.activeTrade;
    if (!s || s.id !== sessionId) return;
    this.setTrade(touchSession({ ...s, status: "cancelled", error: undefined }));
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
      this.characters,
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
