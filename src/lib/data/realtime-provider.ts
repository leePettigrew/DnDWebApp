import type {
  BattleMap,
  Campaign,
  Character,
  CombatState,
  EconomyState,
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
import { newId, nowISO, type ID } from "@/lib/domain/ids";
import type {
  ApiError,
  AuthResponse,
  CampaignSnapshot,
  CampaignSummary,
  ChatMessage,
  ClientMessage,
  PresenceUser,
  Role,
  ScopedCollection,
  ServerMessage,
} from "@shared/protocol";
import { SocketConnection } from "./realtime-connection";
import { createLocalDataProvider, emptyCombatState } from "./local-provider";
import { emptyEconomy } from "@shared/economy";
import type {
  AuthController,
  ConnectionStatus,
  CreateInput,
  CurrentUser,
  DataProvider,
  DataProviderCapabilities,
  Handout,
  LoginInput,
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
  ServiceInput,
  SessionController,
  SingletonRepository,
  TradeInput,
  TradeItemRef,
  TradeOutcome,
  TradeSession,
  TradeSide,
  Unsubscribe,
  UpdateInput,
} from "./provider";

type SendFn = (msg: ClientMessage) => boolean;
type Mode = "local" | "live";

const TOKEN_KEY = "dragons-ledger:v1:auth-token";

function loadToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function saveToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** ws://host/path -> http://host ; wss://host -> https://host (origin only). */
function toHttpBase(wsUrl: string): string {
  try {
    const u = new URL(wsUrl);
    const proto = u.protocol === "wss:" ? "https:" : "http:";
    return `${proto}//${u.host}`;
  } catch {
    return wsUrl;
  }
}

function summaryToCampaign(s: CampaignSummary): Campaign {
  return {
    id: s.id,
    name: s.name,
    setting: s.setting,
    description: s.description,
    bannerUrl: "",
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

function entryToResult(entry: RollHistoryEntry): RollResult {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    label: entry.label,
    mode: entry.mode,
    rolls: entry.rolls,
    modifier: entry.modifier,
    total: entry.total,
    isCrit: entry.isCrit,
    isFumble: entry.isFumble,
    notation: entry.notation,
  };
}

/**
 * A repository that serves the embedded LOCAL provider when solo/offline and a
 * server-fed LIVE cache when a campaign is joined. Live writes are optimistic
 * (update the cache + emit immediately) and send a message; the server's
 * authoritative broadcast replaces the cache, reconciling automatically.
 */
class SwitchableCollection<T extends Entity> implements Repository<T> {
  private listeners = new Set<(items: T[]) => void>();
  private live = new Map<ID, T>();
  private localItems: T[] = [];
  private mode: Mode = "local";

  constructor(
    private readonly localRepo: Repository<T>,
    private readonly send: SendFn,
    private readonly collection?: ScopedCollection,
  ) {
    this.localRepo.subscribe((items) => {
      this.localItems = items;
      if (this.mode === "local") this.emit();
    });
  }

  setMode(mode: Mode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.emit();
  }
  setLive(items: T[]): void {
    this.live = new Map(items.map((i) => [i.id, i]));
    if (this.mode === "live") this.emit();
  }
  appendLive(item: T): void {
    this.live.set(item.id, item);
    if (this.mode === "live") this.emit();
  }
  /** Patch a single live item in place (used for granular token moves). */
  patchLive(id: ID, updater: (item: T) => T): void {
    const existing = this.live.get(id);
    if (!existing) return;
    this.live.set(id, updater(existing));
    if (this.mode === "live") this.emit();
  }

  private current(): T[] {
    return this.mode === "live"
      ? Array.from(this.live.values())
      : this.localItems;
  }
  private emit(): void {
    const items = this.current();
    this.listeners.forEach((l) => l(items));
  }

  subscribe(listener: (items: T[]) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.current());
    return () => this.listeners.delete(listener);
  }
  async list(): Promise<T[]> {
    return this.current();
  }
  async get(id: ID): Promise<T | null> {
    return this.current().find((x) => x.id === id) ?? null;
  }
  async create(input: CreateInput<T>): Promise<T> {
    if (this.mode === "local") return this.localRepo.create(input);
    const ts = nowISO();
    const tempId = newId();
    const entity = {
      ...(input as object),
      id: tempId,
      createdAt: ts,
      updatedAt: ts,
    } as T;
    this.live.set(tempId, entity);
    this.emit();
    if (this.collection) {
      this.send({
        type: "entity:create",
        collection: this.collection,
        tempId,
        input: input as Record<string, unknown>,
      });
    }
    return entity;
  }
  async update(id: ID, patch: UpdateInput<T>): Promise<T> {
    if (this.mode === "local") return this.localRepo.update(id, patch);
    const existing = this.live.get(id);
    const next = {
      ...(existing as object),
      ...(patch as object),
      id,
      updatedAt: nowISO(),
    } as T;
    this.live.set(id, next);
    this.emit();
    if (this.collection) {
      this.send({
        type: "entity:update",
        collection: this.collection,
        id,
        patch: patch as Record<string, unknown>,
      });
    }
    return next;
  }
  async remove(id: ID): Promise<void> {
    if (this.mode === "local") return this.localRepo.remove(id);
    this.live.delete(id);
    this.emit();
    if (this.collection) {
      this.send({ type: "entity:remove", collection: this.collection, id });
    }
  }
}

/** A singleton (combat / economy), switchable between local and live. */
class SwitchableSingleton<T> implements SingletonRepository<T> {
  private listeners = new Set<(v: T) => void>();
  private liveValue: T;
  private localValue: T;
  private mode: Mode = "local";

  constructor(
    private readonly localRepo: SingletonRepository<T>,
    private readonly send: SendFn,
    empty: T,
    private readonly setType: string,
    private readonly updateType: string,
  ) {
    this.liveValue = empty;
    this.localValue = empty;
    this.localRepo.subscribe((v) => {
      this.localValue = v;
      if (this.mode === "local") this.emit();
    });
  }

  setMode(mode: Mode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.emit();
  }
  setLive(v: T): void {
    this.liveValue = v;
    if (this.mode === "live") this.emit();
  }
  private current(): T {
    return this.mode === "live" ? this.liveValue : this.localValue;
  }
  private emit(): void {
    const v = this.current();
    this.listeners.forEach((l) => l(v));
  }
  async get(): Promise<T> {
    return this.current();
  }
  async set(v: T): Promise<T> {
    if (this.mode === "local") return this.localRepo.set(v);
    this.liveValue = v;
    this.emit();
    this.send({ type: this.setType, state: v } as unknown as ClientMessage);
    return v;
  }
  async update(patch: Partial<T>): Promise<T> {
    if (this.mode === "local") return this.localRepo.update(patch);
    this.liveValue = { ...this.liveValue, ...patch };
    this.emit();
    this.send({ type: this.updateType, patch } as unknown as ClientMessage);
    return this.liveValue;
  }
  subscribe(listener: (v: T) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.current());
    return () => this.listeners.delete(listener);
  }
}

export class RealtimeDataProvider implements DataProvider {
  readonly capabilities: DataProviderCapabilities = {
    realtime: true,
    auth: true,
    multiUser: true,
  };

  private readonly local: DataProvider = createLocalDataProvider();
  private readonly conn: SocketConnection;
  private readonly httpBase: string;
  private token: string | null;

  // Scoped, switchable repositories.
  readonly characters: SwitchableCollection<Character>;
  readonly statBlocks: SwitchableCollection<StatBlock>;
  readonly encounters: SwitchableCollection<Encounter>;
  readonly notes: SwitchableCollection<Note>;
  readonly sessionLogs: SwitchableCollection<SessionLog>;
  readonly maps: SwitchableCollection<BattleMap>;
  readonly rollPresets: SwitchableCollection<RollPreset>;
  readonly quests: SwitchableCollection<Quest>;
  readonly factions: SwitchableCollection<Faction>;
  readonly timeline: SwitchableCollection<TimelineEvent>;
  readonly rollHistory: SwitchableCollection<RollHistoryEntry>;
  readonly campaigns: SwitchableCollection<Campaign>;
  readonly combat: SwitchableSingleton<CombatState>;
  readonly economy: SwitchableSingleton<EconomyState>;

  readonly session: SessionController;
  readonly auth: AuthController;
  readonly realtime: RealtimeController;

  // Session + campaign state.
  private currentUser: CurrentUser | null = null;
  private userListeners = new Set<(u: CurrentUser | null) => void>();
  private activeCampaign: CampaignSummary | null = null;
  private activeCampaignId: ID | null = null;
  private role: Role | null = null;
  private activeListeners = new Set<
    (c: CampaignSummary | null, r: Role | null) => void
  >();
  private campaignList: CampaignSummary[] = [];
  private campaignListeners = new Set<(c: CampaignSummary[]) => void>();
  private presence: PresenceUser[] = [];
  private presenceListeners = new Set<(p: PresenceUser[]) => void>();
  private chat: ChatMessage[] = [];
  private chatListeners = new Set<(m: ChatMessage[]) => void>();
  private pingListeners = new Set<(p: MapPing) => void>();
  private handoutListeners = new Set<(h: Handout) => void>();
  private contentChangedListeners = new Set<() => void>();
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private pendingCampaign = new Map<
    string,
    { resolve: (s: CampaignSummary) => void; reject: (e: Error) => void }
  >();
  private pendingRolls = new Map<
    string,
    { resolve: (r: RollResult) => void; reject: (e: Error) => void }
  >();
  private pendingTrades = new Map<
    string,
    { resolve: (o: TradeOutcome) => void; reject: (e: Error) => void }
  >();
  private pendingProposes = new Map<string, (r: ProposeTradeResult) => void>();
  private activeTrade: TradeSession | null = null;
  private tradeListeners = new Set<(s: TradeSession | null) => void>();

  constructor(wsUrl: string) {
    this.httpBase = toHttpBase(wsUrl);
    this.token = loadToken();
    this.conn = new SocketConnection(wsUrl);
    const send: SendFn = (m) => this.conn.send(m);

    this.characters = new SwitchableCollection(this.local.characters, send, "characters");
    this.statBlocks = new SwitchableCollection(this.local.statBlocks, send, "statBlocks");
    this.encounters = new SwitchableCollection(this.local.encounters, send, "encounters");
    this.notes = new SwitchableCollection(this.local.notes, send, "notes");
    this.sessionLogs = new SwitchableCollection(this.local.sessionLogs, send, "sessionLogs");
    this.maps = new SwitchableCollection(this.local.maps, send, "maps");
    this.rollPresets = new SwitchableCollection(this.local.rollPresets, send, "rollPresets");
    this.quests = new SwitchableCollection(this.local.quests, send, "quests");
    this.factions = new SwitchableCollection(this.local.factions, send, "factions");
    this.timeline = new SwitchableCollection(this.local.timeline, send, "timeline");
    this.rollHistory = new SwitchableCollection(this.local.rollHistory, send);
    this.campaigns = new SwitchableCollection(this.local.campaigns, send);
    this.combat = new SwitchableSingleton<CombatState>(
      this.local.combat,
      send,
      emptyCombatState,
      "combat:set",
      "combat:update",
    );
    this.economy = new SwitchableSingleton<EconomyState>(
      this.local.economy,
      send,
      emptyEconomy(),
      "economy:set",
      "economy:update",
    );

    this.session = {
      getCurrentUser: async () => this.currentUser,
      subscribe: (l) => this.subscribeUser(l),
    };
    this.auth = {
      mode: "remote",
      getCurrentUser: async () => this.currentUser,
      subscribe: (l) => this.subscribeUser(l),
      register: (input) => this.register(input),
      login: (input) => this.login(input),
      logout: () => this.logout(),
    };
    this.realtime = {
      getStatus: () => this.conn.status as ConnectionStatus,
      subscribeStatus: (l) => {
        this.statusListeners.add(l);
        l(this.conn.status as ConnectionStatus);
        return () => this.statusListeners.delete(l);
      },
      getActiveCampaign: () => this.activeCampaign,
      getRole: () => this.role,
      subscribeActiveCampaign: (l) => {
        this.activeListeners.add(l);
        l(this.activeCampaign, this.role);
        return () => this.activeListeners.delete(l);
      },
      getCampaigns: () => this.campaignList,
      subscribeCampaigns: (l) => {
        this.campaignListeners.add(l);
        l(this.campaignList);
        return () => this.campaignListeners.delete(l);
      },
      createCampaign: (input) =>
        this.campaignRequest((rid) =>
          this.conn.send({ type: "campaign:create", requestId: rid, ...input }),
        ),
      joinByCode: (code) =>
        this.campaignRequest((rid) =>
          this.conn.send({ type: "campaign:join", requestId: rid, joinCode: code }),
        ),
      openCampaign: async (campaignId) => {
        await this.campaignRequest((rid) =>
          this.conn.send({ type: "campaign:open", requestId: rid, campaignId }),
        );
      },
      leaveCampaign: async () => {
        this.conn.send({ type: "campaign:leave" });
        this.clearActiveCampaign();
      },
      subscribePresence: (l) => {
        this.presenceListeners.add(l);
        l(this.presence);
        return () => this.presenceListeners.delete(l);
      },
      setTyping: (context) => {
        this.conn.send({ type: "presence:typing", context });
      },
      moveToken: (mapId, tokenId, x, y) => {
        if (this.activeCampaignId && this.conn.isOpen()) {
          this.maps.patchLive(mapId, (m) => ({
            ...m,
            tokens: m.tokens?.map((t) =>
              t.id === tokenId ? { ...t, x, y } : t,
            ),
          }));
          this.conn.send({ type: "map:token:move", mapId, tokenId, x, y });
        } else {
          this.local.realtime.moveToken(mapId, tokenId, x, y);
        }
      },
      ping: (mapId, x, y) => {
        if (this.activeCampaignId && this.conn.isOpen()) {
          this.conn.send({ type: "map:ping", mapId, x, y });
        } else {
          this.emitPing({
            id: newId(),
            mapId,
            x,
            y,
            by: this.currentUser?.name ?? "You",
            color: "#E6C772",
          });
        }
      },
      subscribePings: (l) => {
        this.pingListeners.add(l);
        return () => this.pingListeners.delete(l);
      },
      shareHandout: (handout, targets) => {
        if (this.activeCampaignId && this.conn.isOpen()) {
          this.conn.send({
            type: "dm:handout",
            title: handout.title,
            body: handout.body,
            imageUrl: handout.imageUrl,
            targets: targets && targets.length ? targets : undefined,
          });
        } else {
          this.emitHandout(handout);
        }
      },
      subscribeHandouts: (l) => {
        this.handoutListeners.add(l);
        return () => this.handoutListeners.delete(l);
      },
      subscribeContentChanged: (l) => {
        this.contentChangedListeners.add(l);
        return () => this.contentChangedListeners.delete(l);
      },
      getChat: () => this.chat,
      subscribeChat: (l) => {
        this.chatListeners.add(l);
        l(this.chat);
        return () => this.chatListeners.delete(l);
      },
      sendChat: (body) => {
        const trimmed = body.trim();
        if (trimmed) this.conn.send({ type: "chat:send", body: trimmed });
      },
      roll: (spec, opts) => this.roll(spec, opts),
      executeTrade: (input) => this.executeTrade(input),
      executeService: (input) => this.executeService(input),
      executeCommission: (input) => this.executeCommission(input),
      executeJob: (input) => this.executeJob(input),
      consignList: (input) => this.consignList(input),
      consignAct: (input) => this.consignAct(input),
      proposeTrade: (input) => this.proposeTrade(input),
      updateTradeOffer: (sid, gold, items, side) =>
        this.updateTradeOffer(sid, gold, items, side),
      confirmTrade: (sid, side) => this.confirmTrade(sid, side),
      cancelTrade: (sid) => this.cancelTrade(sid),
      dismissTrade: () => this.dismissTrade(),
      getActiveTrade: () => this.activeTrade,
      subscribeTrade: (l) => this.subscribeTrade(l),
      logPhysicalRoll: (total, label) => {
        if (this.activeCampaignId && this.conn.isOpen()) {
          this.conn.send({ type: "dice:physical", total, label });
        } else {
          this.local.realtime.logPhysicalRoll(total, label);
        }
      },
    };

    this.conn.onStatus(() => this.emitStatus());
    this.conn.onOpen(() => this.handleOpen());
    this.conn.onMessage((m) => this.handleMessage(m));

    // Mirror solo (offline) trades; the server drives them when connected.
    this.local.realtime.subscribeTrade((s) => {
      if (!this.tradeOnline()) this.setTrade(s);
    });
  }

  async init(): Promise<void> {
    if (this.token) this.conn.connect();
  }

  // --- session helpers -----------------------------------------------------

  private subscribeUser(l: (u: CurrentUser | null) => void): Unsubscribe {
    this.userListeners.add(l);
    l(this.currentUser);
    return () => this.userListeners.delete(l);
  }
  private setUser(u: CurrentUser | null): void {
    this.currentUser = u;
    this.userListeners.forEach((fn) => fn(u));
  }
  private emitStatus(): void {
    const s = this.conn.status as ConnectionStatus;
    this.statusListeners.forEach((fn) => fn(s));
  }
  private emitPing(ping: MapPing): void {
    this.pingListeners.forEach((fn) => fn(ping));
  }
  private emitHandout(handout: Handout): void {
    this.handoutListeners.forEach((fn) => fn(handout));
  }
  private emitContentChanged(): void {
    this.contentChangedListeners.forEach((fn) => fn());
  }

  private setScopedMode(mode: Mode): void {
    this.characters.setMode(mode);
    this.statBlocks.setMode(mode);
    this.encounters.setMode(mode);
    this.notes.setMode(mode);
    this.sessionLogs.setMode(mode);
    this.maps.setMode(mode);
    this.rollPresets.setMode(mode);
    this.quests.setMode(mode);
    this.factions.setMode(mode);
    this.timeline.setMode(mode);
    this.rollHistory.setMode(mode);
    this.combat.setMode(mode);
    this.economy.setMode(mode);
  }

  private clearActiveCampaign(): void {
    this.activeCampaign = null;
    this.activeCampaignId = null;
    this.role = null;
    this.setScopedMode("local");
    this.activeListeners.forEach((fn) => fn(null, null));
    this.chat = [];
    this.chatListeners.forEach((fn) => fn([]));
    if (this.activeTrade) this.setTrade(null);
  }

  // --- auth ----------------------------------------------------------------

  private async http<TRes>(path: string, body: unknown): Promise<TRes> {
    const res = await fetch(`${this.httpBase}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        (data as ApiError)?.error || `Request failed (${res.status})`,
      );
    }
    return data as TRes;
  }

  private async register(input: RegisterInput): Promise<void> {
    const res = await this.http<AuthResponse>("/auth/register", input);
    this.onAuthenticated(res);
  }
  private async login(input: LoginInput): Promise<void> {
    const res = await this.http<AuthResponse>("/auth/login", input);
    this.onAuthenticated(res);
  }
  private onAuthenticated(res: AuthResponse): void {
    this.token = res.token;
    saveToken(res.token);
    this.setUser({
      id: res.user.id,
      name: res.user.displayName,
      isAdmin: res.user.isAdmin,
    });
    this.conn.connect(); // onOpen will send the auth message
  }
  private async logout(): Promise<void> {
    this.token = null;
    saveToken(null);
    this.setUser(null);
    this.campaignList = [];
    this.campaignListeners.forEach((fn) => fn([]));
    this.campaigns.setMode("local");
    this.clearActiveCampaign();
    this.conn.close();
  }

  // --- realtime helpers ----------------------------------------------------

  private campaignRequest(
    send: (requestId: string) => boolean,
  ): Promise<CampaignSummary> {
    return new Promise<CampaignSummary>((resolve, reject) => {
      if (!this.conn.isOpen()) {
        reject(new Error("Not connected to the server."));
        return;
      }
      const requestId = newId();
      this.pendingCampaign.set(requestId, { resolve, reject });
      if (!send(requestId)) {
        this.pendingCampaign.delete(requestId);
        reject(new Error("Not connected to the server."));
        return;
      }
      setTimeout(() => {
        const p = this.pendingCampaign.get(requestId);
        if (p) {
          this.pendingCampaign.delete(requestId);
          p.reject(new Error("Request timed out."));
        }
      }, 10_000);
    });
  }

  private roll(spec: RollSpec, opts?: { hidden?: boolean }): Promise<RollResult> {
    if (this.activeCampaignId && this.conn.isOpen()) {
      return new Promise<RollResult>((resolve, reject) => {
        const requestId = newId();
        this.pendingRolls.set(requestId, { resolve, reject });
        const ok = this.conn.send({
          type: "dice:roll",
          requestId,
          spec,
          hidden: opts?.hidden,
        });
        if (!ok) {
          this.pendingRolls.delete(requestId);
          reject(new Error("Not connected."));
          return;
        }
        setTimeout(() => {
          const p = this.pendingRolls.get(requestId);
          if (p) {
            this.pendingRolls.delete(requestId);
            p.reject(new Error("Roll timed out."));
          }
        }, 10_000);
      });
    }
    // Solo / offline: roll locally and append to local history.
    return this.local.realtime.roll(spec, opts);
  }

  private executeTrade(input: TradeInput): Promise<TradeOutcome> {
    if (this.activeCampaignId && this.conn.isOpen()) {
      return new Promise<TradeOutcome>((resolve, reject) => {
        const requestId = newId();
        this.pendingTrades.set(requestId, { resolve, reject });
        const ok = this.conn.send({
          type: "trade:execute",
          requestId,
          marketId: input.marketId,
          goodRef: input.goodRef,
          action: input.action,
          qty: input.qty,
          haggleRoll: input.haggleRoll,
          characterId: input.characterId,
          characterName: input.characterName,
        });
        if (!ok) {
          this.pendingTrades.delete(requestId);
          reject(new Error("Not connected."));
          return;
        }
        setTimeout(() => {
          const p = this.pendingTrades.get(requestId);
          if (p) {
            this.pendingTrades.delete(requestId);
            p.reject(new Error("Trade timed out."));
          }
        }, 10_000);
      });
    }
    // Solo / offline: apply locally.
    return this.local.realtime.executeTrade(input);
  }

  private executeService(input: ServiceInput): Promise<TradeOutcome> {
    if (this.activeCampaignId && this.conn.isOpen()) {
      return new Promise<TradeOutcome>((resolve, reject) => {
        const requestId = newId();
        this.pendingTrades.set(requestId, { resolve, reject });
        const ok = this.conn.send({
          type: "service:buy",
          requestId,
          marketId: input.marketId,
          serviceId: input.serviceId,
          characterId: input.characterId,
          characterName: input.characterName,
        });
        if (!ok) {
          this.pendingTrades.delete(requestId);
          resolve({ ok: false, error: "Not connected." });
          return;
        }
        setTimeout(() => {
          const p = this.pendingTrades.get(requestId);
          if (p) {
            this.pendingTrades.delete(requestId);
            p.reject(new Error("Service request timed out."));
          }
        }, 10_000);
      });
    }
    return this.local.realtime.executeService(input);
  }

  private executeCommission(input: CommissionInput): Promise<TradeOutcome> {
    if (this.activeCampaignId && this.conn.isOpen()) {
      return new Promise<TradeOutcome>((resolve, reject) => {
        const requestId = newId();
        this.pendingTrades.set(requestId, { resolve, reject });
        const ok = this.conn.send({
          type: "commission:fulfill",
          requestId,
          commissionId: input.commissionId,
          qty: input.qty,
          characterId: input.characterId,
          characterName: input.characterName,
        });
        if (!ok) {
          this.pendingTrades.delete(requestId);
          resolve({ ok: false, error: "Not connected." });
          return;
        }
        setTimeout(() => {
          const p = this.pendingTrades.get(requestId);
          if (p) {
            this.pendingTrades.delete(requestId);
            p.reject(new Error("Commission request timed out."));
          }
        }, 10_000);
      });
    }
    return this.local.realtime.executeCommission(input);
  }

  private executeJob(input: JobInput): Promise<TradeOutcome> {
    if (this.activeCampaignId && this.conn.isOpen()) {
      return new Promise<TradeOutcome>((resolve, reject) => {
        const requestId = newId();
        this.pendingTrades.set(requestId, { resolve, reject });
        const ok = this.conn.send({
          type: "job:action",
          requestId,
          jobId: input.jobId,
          action: input.action,
          characterId: input.characterId,
          characterName: input.characterName,
        });
        if (!ok) {
          this.pendingTrades.delete(requestId);
          resolve({ ok: false, error: "Not connected." });
          return;
        }
        setTimeout(() => {
          const p = this.pendingTrades.get(requestId);
          if (p) {
            this.pendingTrades.delete(requestId);
            p.reject(new Error("Job request timed out."));
          }
        }, 10_000);
      });
    }
    return this.local.realtime.executeJob(input);
  }

  /** Shared request/await over the trade:result channel. */
  private tradeRequest(
    build: (requestId: string) => ClientMessage,
    timeoutLabel: string,
  ): Promise<TradeOutcome> {
    return new Promise<TradeOutcome>((resolve, reject) => {
      const requestId = newId();
      this.pendingTrades.set(requestId, { resolve, reject });
      if (!this.conn.send(build(requestId))) {
        this.pendingTrades.delete(requestId);
        resolve({ ok: false, error: "Not connected." });
        return;
      }
      setTimeout(() => {
        const p = this.pendingTrades.get(requestId);
        if (p) {
          this.pendingTrades.delete(requestId);
          p.reject(new Error(`${timeoutLabel} timed out.`));
        }
      }, 10_000);
    });
  }

  private consignList(input: ConsignListInput): Promise<TradeOutcome> {
    if (this.activeCampaignId && this.conn.isOpen()) {
      return this.tradeRequest(
        (requestId) => ({
          type: "consign:list",
          requestId,
          marketId: input.marketId,
          itemId: input.itemId,
          qty: input.qty,
          price: input.price,
          characterId: input.characterId,
          characterName: input.characterName,
        }),
        "Listing",
      );
    }
    return this.local.realtime.consignList(input);
  }

  private consignAct(input: ConsignActInput): Promise<TradeOutcome> {
    if (this.activeCampaignId && this.conn.isOpen()) {
      return this.tradeRequest(
        (requestId) => ({
          type: "consign:act",
          requestId,
          consignmentId: input.consignmentId,
          action: input.action,
          qty: input.qty,
          characterId: input.characterId,
          characterName: input.characterName,
        }),
        "Stall action",
      );
    }
    return this.local.realtime.consignAct(input);
  }

  // --- player ↔ player trading --------------------------------------------

  private tradeOnline(): boolean {
    return Boolean(this.activeCampaignId) && this.conn.isOpen();
  }
  private setTrade(s: TradeSession | null): void {
    this.activeTrade = s;
    this.tradeListeners.forEach((l) => l(s));
  }
  private subscribeTrade(listener: (s: TradeSession | null) => void): Unsubscribe {
    this.tradeListeners.add(listener);
    listener(this.activeTrade);
    return () => this.tradeListeners.delete(listener);
  }

  private proposeTrade(input: ProposeTradeInput): Promise<ProposeTradeResult> {
    if (this.tradeOnline()) {
      return new Promise<ProposeTradeResult>((resolve) => {
        const requestId = newId();
        this.pendingProposes.set(requestId, resolve);
        const ok = this.conn.send({
          type: "p2ptrade:propose",
          requestId,
          toUserId: input.toUserId,
          fromCharacterId: input.fromCharacterId,
          toCharacterId: input.toCharacterId,
        });
        if (!ok) {
          this.pendingProposes.delete(requestId);
          resolve({ ok: false, error: "Not connected." });
          return;
        }
        setTimeout(() => {
          const r = this.pendingProposes.get(requestId);
          if (r) {
            this.pendingProposes.delete(requestId);
            r({ ok: false, error: "Trade request timed out." });
          }
        }, 10_000);
      });
    }
    return this.local.realtime.proposeTrade(input);
  }

  private updateTradeOffer(
    sessionId: string,
    gold: number,
    items: TradeItemRef[],
    side: TradeSide,
  ): void {
    if (this.tradeOnline()) {
      this.conn.send({ type: "p2ptrade:offer", sessionId, gold, items });
    } else {
      this.local.realtime.updateTradeOffer(sessionId, gold, items, side);
    }
  }

  private confirmTrade(sessionId: string, side: TradeSide): void {
    if (this.tradeOnline()) {
      this.conn.send({ type: "p2ptrade:confirm", sessionId });
    } else {
      this.local.realtime.confirmTrade(sessionId, side);
    }
  }

  private cancelTrade(sessionId: string): void {
    if (this.tradeOnline()) {
      this.conn.send({ type: "p2ptrade:cancel", sessionId });
    } else {
      this.local.realtime.cancelTrade(sessionId);
    }
  }

  private dismissTrade(): void {
    this.local.realtime.dismissTrade();
    if (this.activeTrade && this.activeTrade.status !== "open") this.setTrade(null);
  }

  private handleOpen(): void {
    if (this.token) this.conn.send({ type: "auth", token: this.token });
  }

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "authed": {
        this.setUser({
          id: msg.user.id,
          name: msg.user.displayName,
          isAdmin: msg.user.isAdmin,
        });
        // After a reconnect, rejoin the campaign we were in.
        if (this.activeCampaignId) {
          this.conn.send({
            type: "campaign:open",
            campaignId: this.activeCampaignId,
          });
        }
        break;
      }
      case "unauthed": {
        this.token = null;
        saveToken(null);
        this.setUser(null);
        this.campaigns.setMode("local");
        this.clearActiveCampaign();
        break;
      }
      case "error": {
        if (msg.requestId && this.pendingCampaign.has(msg.requestId)) {
          this.pendingCampaign.get(msg.requestId)!.reject(new Error(msg.message));
          this.pendingCampaign.delete(msg.requestId);
        } else if (msg.requestId && this.pendingRolls.has(msg.requestId)) {
          this.pendingRolls.get(msg.requestId)!.reject(new Error(msg.message));
          this.pendingRolls.delete(msg.requestId);
        } else if (msg.requestId && this.pendingTrades.has(msg.requestId)) {
          this.pendingTrades.get(msg.requestId)!.resolve({ ok: false, error: msg.message });
          this.pendingTrades.delete(msg.requestId);
        } else if (msg.requestId && this.pendingProposes.has(msg.requestId)) {
          this.pendingProposes.get(msg.requestId)!({ ok: false, error: msg.message });
          this.pendingProposes.delete(msg.requestId);
        } else if (typeof console !== "undefined") {
          console.warn(`[server error] ${msg.code}: ${msg.message}`);
        }
        break;
      }
      case "campaign:list": {
        this.campaignList = msg.campaigns;
        this.campaignListeners.forEach((fn) => fn(msg.campaigns));
        this.campaigns.setLive(msg.campaigns.map(summaryToCampaign));
        this.campaigns.setMode("live");
        break;
      }
      case "campaign:joined": {
        this.activeCampaign = msg.campaign;
        this.activeCampaignId = msg.campaign.id;
        this.role = msg.campaign.role;
        this.applySnapshot(msg.snapshot);
        this.setScopedMode("live");
        this.activeListeners.forEach((fn) => fn(this.activeCampaign, this.role));
        if (msg.requestId && this.pendingCampaign.has(msg.requestId)) {
          this.pendingCampaign.get(msg.requestId)!.resolve(msg.campaign);
          this.pendingCampaign.delete(msg.requestId);
        }
        break;
      }
      case "campaign:left": {
        this.clearActiveCampaign();
        break;
      }
      case "entity:changed": {
        this.applyEntityChanged(msg.collection, msg.items);
        break;
      }
      case "economy:changed": {
        this.economy.setLive(msg.state);
        break;
      }
      case "combat:changed": {
        this.combat.setLive(msg.state);
        break;
      }
      case "dice:rolled": {
        this.rollHistory.appendLive(msg.entry);
        if (msg.requestId && this.pendingRolls.has(msg.requestId)) {
          this.pendingRolls.get(msg.requestId)!.resolve(entryToResult(msg.entry));
          this.pendingRolls.delete(msg.requestId);
        }
        break;
      }
      case "trade:result": {
        const p = this.pendingTrades.get(msg.requestId);
        if (p) {
          this.pendingTrades.delete(msg.requestId);
          p.resolve({
            ok: msg.ok,
            error: msg.error,
            transaction: msg.transaction,
            unitPrice: msg.unitPrice,
            total: msg.total,
          });
        }
        break;
      }
      case "p2ptrade:result": {
        const r = this.pendingProposes.get(msg.requestId);
        if (r) {
          this.pendingProposes.delete(msg.requestId);
          r({ ok: msg.ok, error: msg.error, sessionId: msg.sessionId });
        }
        break;
      }
      case "p2ptrade:changed": {
        this.setTrade(msg.session);
        break;
      }
      case "presence:state": {
        this.presence = msg.users;
        this.presenceListeners.forEach((fn) => fn(msg.users));
        break;
      }
      case "chat:message": {
        this.chat = [...this.chat, msg.message].slice(-200);
        this.chatListeners.forEach((fn) => fn(this.chat));
        break;
      }
      case "map:token:moved": {
        this.maps.patchLive(msg.mapId, (m) => ({
          ...m,
          tokens: m.tokens?.map((t) =>
            t.id === msg.tokenId ? { ...t, x: msg.x, y: msg.y } : t,
          ),
        }));
        break;
      }
      case "map:pinged": {
        this.emitPing({
          id: newId(),
          mapId: msg.mapId,
          x: msg.x,
          y: msg.y,
          by: msg.by,
          color: msg.color,
        });
        break;
      }
      case "dm:handout:shown": {
        this.emitHandout(msg.handout);
        break;
      }
      case "content:changed": {
        this.emitContentChanged();
        break;
      }
      case "pong":
        break;
    }
  }

  private applyEntityChanged(
    collection: ScopedCollection,
    items: unknown[],
  ): void {
    switch (collection) {
      case "characters":
        this.characters.setLive(items as Character[]);
        break;
      case "statBlocks":
        this.statBlocks.setLive(items as StatBlock[]);
        break;
      case "encounters":
        this.encounters.setLive(items as Encounter[]);
        break;
      case "notes":
        this.notes.setLive(items as Note[]);
        break;
      case "sessionLogs":
        this.sessionLogs.setLive(items as SessionLog[]);
        break;
      case "maps":
        this.maps.setLive(items as BattleMap[]);
        break;
      case "rollPresets":
        this.rollPresets.setLive(items as RollPreset[]);
        break;
    }
  }

  private applySnapshot(snap: CampaignSnapshot): void {
    this.characters.setLive(snap.characters);
    this.statBlocks.setLive(snap.statBlocks);
    this.encounters.setLive(snap.encounters);
    this.notes.setLive(snap.notes);
    this.sessionLogs.setLive(snap.sessionLogs);
    this.maps.setLive(snap.maps);
    this.rollPresets.setLive(snap.rollPresets);
    this.quests.setLive(snap.quests);
    this.factions.setLive(snap.factions);
    this.timeline.setLive(snap.timeline);
    this.rollHistory.setLive(snap.rollLog);
    this.combat.setLive(snap.combat);
    this.economy.setLive(snap.economy);
    this.presence = snap.presence;
    this.presenceListeners.forEach((fn) => fn(snap.presence));
    this.chat = snap.chat;
    this.chatListeners.forEach((fn) => fn(snap.chat));
  }
}

export function createRealtimeDataProvider(wsUrl: string): DataProvider {
  return new RealtimeDataProvider(wsUrl);
}
