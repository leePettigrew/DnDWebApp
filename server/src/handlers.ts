import type { WebSocket } from "ws";
import { newId, nowISO } from "../../shared/ids";
import { rollSpec as computeRoll } from "../../shared/dice";
import type {
  BattleMap,
  Entity,
  MapToken,
  RollHistoryEntry,
} from "../../shared/domain";
import type {
  AnyScopedEntity,
  CampaignCreateMessage,
  CampaignJoinMessage,
  CampaignSnapshot,
  CampaignSummary,
  ChatMessage,
  ChatSendMessage,
  ClientMessage,
  DicePhysicalMessage,
  DiceRollMessage,
  DmHandoutMessage,
  MapPingMessage,
  MapTokenMoveMessage,
  EntityCreateMessage,
  EntityRemoveMessage,
  EntityUpdateMessage,
  ErrorCode,
  Role,
  ScopedCollection,
  ServerMessage,
} from "../../shared/protocol";
import { DM_ONLY_COLLECTIONS } from "../../shared/protocol";
import type { CombatState } from "../../shared/domain";
import type { Repositories } from "./repositories";
import type { RoomMember, RoomManager } from "./rooms";
import { parseClientMessage } from "./validation";
import { verifyToken } from "./auth";
import { cryptoRng, emptyCombat, generateJoinCode } from "./util";

/** Collections only the DM may write. characters + rollPresets have own rules. */
const DM_ONLY: ReadonlySet<ScopedCollection> = new Set<ScopedCollection>(
  DM_ONLY_COLLECTIONS,
);

/**
 * Per-socket session. Holds who this connection is (after auth) and which
 * campaign it's in. EVERY privileged action is checked here, server-side —
 * the client's claimed role is never trusted.
 */
export class ClientSession {
  private userId: string | null = null;
  private displayName = "";
  private campaignId: string | null = null;
  private role: Role | null = null;
  private member: RoomMember | null = null;

  constructor(
    private readonly socket: WebSocket,
    private readonly repos: Repositories,
    private readonly rooms: RoomManager,
  ) {}

  send(message: ServerMessage): void {
    if (this.socket.readyState === this.socket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
  private error(code: ErrorCode, message: string, requestId?: string): void {
    this.send({ type: "error", code, message, requestId });
  }

  handleRaw(data: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      this.error("bad_request", "Malformed message.");
      return;
    }
    const msg = parseClientMessage(parsed);
    if (!msg) {
      this.error("bad_request", "Unrecognized or invalid message.");
      return;
    }
    try {
      this.dispatch(msg);
    } catch (err) {
      console.error("[ws] handler error", err);
      this.error("internal", "Server error handling that action.");
    }
  }

  private dispatch(msg: ClientMessage): void {
    if (msg.type === "auth") return this.onAuth(msg.token);
    if (msg.type === "ping") return this.send({ type: "pong" });
    if (!this.userId) return this.error("unauthorized", "Not authenticated.");

    switch (msg.type) {
      case "campaign:create":
        return this.onCampaignCreate(msg);
      case "campaign:join":
        return this.onCampaignJoin(msg);
      case "campaign:open":
        return this.onCampaignOpen(msg.campaignId, msg.requestId);
      case "campaign:leave":
        return this.onCampaignLeave();
      case "entity:create":
        return this.onEntityCreate(msg);
      case "entity:update":
        return this.onEntityUpdate(msg);
      case "entity:remove":
        return this.onEntityRemove(msg);
      case "combat:set":
        return this.onCombatSet(msg.state);
      case "combat:update":
        return this.onCombatUpdate(msg.patch);
      case "dice:roll":
        return this.onDiceRoll(msg);
      case "dice:physical":
        return this.onDicePhysical(msg);
      case "presence:typing":
        return this.onTyping(msg.context);
      case "chat:send":
        return this.onChat(msg);
      case "map:token:move":
        return this.onMapTokenMove(msg);
      case "map:ping":
        return this.onMapPing(msg);
      case "dm:handout":
        return this.onDmHandout(msg);
    }
  }

  // --- auth + campaign list ------------------------------------------------

  private onAuth(token: string): void {
    const verified = verifyToken(token);
    const user = verified ? this.repos.users.findById(verified.userId) : null;
    if (!verified || !user) {
      this.send({ type: "unauthed", reason: "Invalid or expired token." });
      return;
    }
    this.userId = user.id;
    this.displayName = user.displayName;
    this.send({
      type: "authed",
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
    });
    this.sendCampaignList();
  }

  private sendCampaignList(): void {
    const memberships = this.repos.memberships.listForUser(this.userId!);
    const campaigns: CampaignSummary[] = [];
    for (const m of memberships) {
      const c = this.repos.campaigns.findById(m.campaignId);
      if (!c) continue;
      campaigns.push(this.summary(c, m.role));
    }
    this.send({ type: "campaign:list", campaigns });
  }

  private summary(
    c: { id: string; name: string; setting?: string; description?: string; joinCode: string },
    role: Role,
  ): CampaignSummary {
    return {
      id: c.id,
      name: c.name,
      setting: c.setting,
      description: c.description,
      role,
      joinCode: role === "dm" ? c.joinCode : undefined,
    };
  }

  // --- campaign lifecycle --------------------------------------------------

  private onCampaignCreate(msg: CampaignCreateMessage): void {
    const id = newId();
    const ts = nowISO();
    const joinCode = generateJoinCode(this.repos);
    this.repos.campaigns.create({
      id,
      name: msg.name,
      setting: msg.setting,
      description: msg.description,
      joinCode,
      createdAt: ts,
      updatedAt: ts,
    });
    this.repos.memberships.create({
      userId: this.userId!,
      campaignId: id,
      role: "dm",
      createdAt: ts,
    });
    this.sendCampaignList();
    this.onCampaignOpen(id, msg.requestId);
  }

  private onCampaignJoin(msg: CampaignJoinMessage): void {
    const campaign = this.repos.campaigns.findByJoinCode(msg.joinCode.trim());
    if (!campaign) {
      return this.error("not_found", "No campaign with that invite code.", msg.requestId);
    }
    if (!this.repos.memberships.find(this.userId!, campaign.id)) {
      this.repos.memberships.create({
        userId: this.userId!,
        campaignId: campaign.id,
        role: "player",
        createdAt: nowISO(),
      });
    }
    this.sendCampaignList();
    this.onCampaignOpen(campaign.id, msg.requestId);
  }

  private onCampaignOpen(campaignId: string, requestId?: string): void {
    const membership = this.repos.memberships.find(this.userId!, campaignId);
    if (!membership) {
      return this.error("forbidden", "You are not a member of that campaign.", requestId);
    }
    const campaign = this.repos.campaigns.findById(campaignId);
    if (!campaign) {
      return this.error("not_found", "Campaign not found.", requestId);
    }

    // Leaving a different room first keeps presence accurate (no duplicate join).
    if (this.campaignId && this.campaignId !== campaignId) this.leaveRoom();

    this.campaignId = campaignId;
    this.role = membership.role;
    const room = this.rooms.get(campaignId);
    this.member = {
      socket: this.socket,
      userId: this.userId!,
      name: this.displayName,
      role: membership.role,
      typing: null,
    };
    room.add(this.member);

    this.send({
      type: "campaign:joined",
      requestId,
      campaign: this.summary(campaign, membership.role),
      snapshot: this.buildSnapshot(membership.role),
    });
    room.broadcastPresence();
  }

  private onCampaignLeave(): void {
    this.leaveRoom();
    this.send({ type: "campaign:left" });
  }

  private leaveRoom(): void {
    if (this.campaignId && this.member) {
      const room = this.rooms.get(this.campaignId);
      room.remove(this.member);
      room.broadcastPresence();
      this.rooms.drop(this.campaignId);
    }
    this.campaignId = null;
    this.role = null;
    this.member = null;
  }

  private buildSnapshot(role: Role): CampaignSnapshot {
    const cid = this.campaignId!;
    const e = this.repos.entities;
    return {
      characters: e.characters.list(cid) as CampaignSnapshot["characters"],
      statBlocks: e.statBlocks.list(cid) as CampaignSnapshot["statBlocks"],
      encounters: e.encounters.list(cid) as CampaignSnapshot["encounters"],
      notes: e.notes.list(cid) as CampaignSnapshot["notes"],
      sessionLogs: e.sessionLogs.list(cid) as CampaignSnapshot["sessionLogs"],
      maps: e.maps.list(cid) as CampaignSnapshot["maps"],
      rollPresets: e.rollPresets.list(cid) as CampaignSnapshot["rollPresets"],
      quests: e.quests.list(cid) as CampaignSnapshot["quests"],
      factions: e.factions.list(cid) as CampaignSnapshot["factions"],
      timeline: e.timeline.list(cid) as CampaignSnapshot["timeline"],
      combat: this.repos.combat.get(cid) ?? emptyCombat(),
      rollLog: this.repos.rollLog.list(cid, { includeHidden: role === "dm" }),
      presence: this.rooms.get(cid).presence(),
      chat: this.repos.chat.list(cid),
    };
  }

  // --- entity CRUD with permissions ---------------------------------------

  private canWrite(
    collection: ScopedCollection,
    existingOwnerId: string | null,
  ): boolean {
    if (this.role === "dm") return true; // DM may edit anything in the campaign
    if (collection === "characters") {
      // Players may edit only characters they own (or create new ones).
      return existingOwnerId === null || existingOwnerId === this.userId;
    }
    if (collection === "rollPresets") return true; // shared, collaborative
    return !DM_ONLY.has(collection); // everything else is DM-only
  }

  private onEntityCreate(msg: EntityCreateMessage): void {
    if (!this.requireCampaign()) return;
    if (!this.canWrite(msg.collection, null)) {
      return this.error("forbidden", "You don't have permission to add that.");
    }
    const ts = nowISO();
    const entity: Record<string, unknown> = {
      ...msg.input,
      id: newId(),
      campaignId: this.campaignId,
      createdAt: ts,
      updatedAt: ts,
    };
    let ownerId: string | null = null;
    if (msg.collection === "characters") {
      entity.ownerId = this.userId;
      ownerId = this.userId;
    }
    this.repos.entities[msg.collection].upsert(
      this.campaignId!,
      entity as unknown as Entity,
      ownerId,
    );
    this.broadcastCollection(msg.collection);
  }

  private onEntityUpdate(msg: EntityUpdateMessage): void {
    if (!this.requireCampaign()) return;
    const repo = this.repos.entities[msg.collection];
    const existing = repo.get(this.campaignId!, msg.id) as
      | (Entity & { ownerId?: string })
      | null;
    if (!existing) return this.error("not_found", "That item no longer exists.");
    const ownerId =
      msg.collection === "characters" ? existing.ownerId ?? null : null;
    if (!this.canWrite(msg.collection, ownerId)) {
      return this.error("forbidden", "You can only edit your own character.");
    }
    const next: Record<string, unknown> = {
      ...existing,
      ...msg.patch,
      id: existing.id,
      campaignId: this.campaignId,
      createdAt: existing.createdAt,
      updatedAt: nowISO(),
    };
    // Owner is server-controlled; clients can never reassign it.
    if (msg.collection === "characters") {
      next.ownerId = existing.ownerId ?? this.userId;
    }
    repo.upsert(
      this.campaignId!,
      next as unknown as Entity,
      msg.collection === "characters" ? (next.ownerId as string) : null,
    );
    this.broadcastCollection(msg.collection);
  }

  private onEntityRemove(msg: EntityRemoveMessage): void {
    if (!this.requireCampaign()) return;
    const repo = this.repos.entities[msg.collection];
    const existing = repo.get(this.campaignId!, msg.id) as
      | (Entity & { ownerId?: string })
      | null;
    if (!existing) {
      this.broadcastCollection(msg.collection);
      return;
    }
    const ownerId =
      msg.collection === "characters" ? existing.ownerId ?? null : null;
    if (!this.canWrite(msg.collection, ownerId)) {
      return this.error("forbidden", "You don't have permission to remove that.");
    }
    repo.remove(this.campaignId!, msg.id);
    this.broadcastCollection(msg.collection);
  }

  private broadcastCollection(collection: ScopedCollection): void {
    const items = this.repos.entities[collection].list(this.campaignId!);
    this.rooms.get(this.campaignId!).broadcast({
      type: "entity:changed",
      collection,
      items: items as AnyScopedEntity[],
    });
  }

  // --- combat (DM only) ----------------------------------------------------

  private onCombatSet(state: CombatState): void {
    if (!this.requireCampaign()) return;
    if (this.role !== "dm") {
      return this.error("forbidden", "Only the DM controls the combat tracker.");
    }
    const next: CombatState = { ...state, id: "combat", updatedAt: nowISO() };
    this.repos.combat.set(this.campaignId!, next);
    this.rooms.get(this.campaignId!).broadcast({ type: "combat:changed", state: next });
  }

  private onCombatUpdate(patch: Partial<CombatState>): void {
    if (!this.requireCampaign()) return;
    if (this.role !== "dm") {
      return this.error("forbidden", "Only the DM controls the combat tracker.");
    }
    const current = this.repos.combat.get(this.campaignId!) ?? emptyCombat();
    const next: CombatState = {
      ...current,
      ...patch,
      id: "combat",
      updatedAt: nowISO(),
    };
    this.repos.combat.set(this.campaignId!, next);
    this.rooms.get(this.campaignId!).broadcast({ type: "combat:changed", state: next });
  }

  // --- dice (server-authoritative, hidden-aware) ---------------------------

  private onDiceRoll(msg: DiceRollMessage): void {
    if (!this.requireCampaign()) return;
    // Players' rolls are ALWAYS public; only a DM may hide a roll.
    const hidden = this.role === "dm" ? Boolean(msg.hidden) : false;
    const result = computeRoll(msg.spec, cryptoRng);
    const { id: _id, ...rest } = result;
    void _id;
    const entry: RollHistoryEntry = {
      id: newId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
      campaignId: this.campaignId!,
      rolledByUserId: this.userId!,
      rolledByName: this.displayName,
      hidden,
      ...rest,
    };
    this.repos.rollLog.append(this.campaignId!, entry);

    const room = this.rooms.get(this.campaignId!);
    const message: ServerMessage = {
      type: "dice:rolled",
      requestId: msg.requestId,
      entry,
    };
    // Hidden rolls go ONLY to DM sockets — they can never leak to players.
    if (hidden) room.broadcast(message, (m) => m.role === "dm");
    else room.broadcast(message);
  }

  // --- tactical map --------------------------------------------------------

  private onMapTokenMove(msg: MapTokenMoveMessage): void {
    if (!this.requireCampaign()) return;
    const map = this.repos.entities.maps.get(
      this.campaignId!,
      msg.mapId,
    ) as BattleMap | null;
    if (!map) return this.error("not_found", "Map not found.");
    const tokens: MapToken[] = map.tokens ?? [];
    const token = tokens.find((t) => t.id === msg.tokenId);
    if (!token) return this.error("not_found", "Token not found.");
    if (this.role !== "dm" && token.ownerId !== this.userId) {
      return this.error("forbidden", "You can only move your own token.");
    }
    const nextMap: BattleMap = {
      ...map,
      tokens: tokens.map((t) =>
        t.id === msg.tokenId ? { ...t, x: msg.x, y: msg.y } : t,
      ),
      updatedAt: nowISO(),
    };
    this.repos.entities.maps.upsert(this.campaignId!, nextMap, null);
    // Lightweight broadcast — don't resend the whole maps collection per drag.
    this.rooms.get(this.campaignId!).broadcast({
      type: "map:token:moved",
      mapId: msg.mapId,
      tokenId: msg.tokenId,
      x: msg.x,
      y: msg.y,
    });
  }

  private onMapPing(msg: MapPingMessage): void {
    if (!this.requireCampaign()) return;
    const color = this.role === "dm" ? "#C25A3D" : "#E6C772";
    this.rooms.get(this.campaignId!).broadcast({
      type: "map:pinged",
      mapId: msg.mapId,
      x: msg.x,
      y: msg.y,
      by: this.displayName,
      color,
    });
  }

  // --- DM handouts (DM only) -----------------------------------------------

  private onDmHandout(msg: DmHandoutMessage): void {
    if (!this.requireCampaign()) return;
    if (this.role !== "dm") return; // only the DM may push handouts
    const title = msg.title?.trim() || undefined;
    const body = msg.body?.trim() || undefined;
    const imageUrl = msg.imageUrl?.trim() || undefined;
    if (!title && !body && !imageUrl) return;
    this.rooms.get(this.campaignId!).broadcast({
      type: "dm:handout:shown",
      handout: { title, body, imageUrl, fromName: this.displayName },
    });
  }

  // --- chat ----------------------------------------------------------------

  private onChat(msg: ChatSendMessage): void {
    if (!this.requireCampaign()) return;
    const body = msg.body.trim();
    if (!body) return;
    const message: ChatMessage = {
      id: newId(),
      campaignId: this.campaignId!,
      userId: this.userId!,
      name: this.displayName,
      body: body.slice(0, 2000),
      createdAt: nowISO(),
    };
    this.repos.chat.append(message);
    this.rooms.get(this.campaignId!).broadcast({ type: "chat:message", message });
  }

  private onDicePhysical(msg: DicePhysicalMessage): void {
    if (!this.requireCampaign()) return;
    const total = Math.round(msg.total);
    const entry: RollHistoryEntry = {
      id: newId(),
      createdAt: nowISO(),
      updatedAt: nowISO(),
      campaignId: this.campaignId!,
      rolledByUserId: this.userId!,
      rolledByName: this.displayName,
      hidden: false,
      physical: true,
      timestamp: nowISO(),
      label: msg.label,
      mode: "normal",
      rolls: [{ sides: 20, value: total }],
      modifier: 0,
      total,
      isCrit: total === 20,
      isFumble: total === 1,
      notation: msg.notation ?? "d20",
    };
    this.repos.rollLog.append(this.campaignId!, entry);
    this.rooms.get(this.campaignId!).broadcast({ type: "dice:rolled", entry });
  }

  // --- presence ------------------------------------------------------------

  private onTyping(context: string | null): void {
    if (!this.campaignId || !this.member) return;
    this.member.typing = context;
    this.rooms.get(this.campaignId).broadcastPresence();
  }

  private requireCampaign(): boolean {
    if (!this.campaignId) {
      this.error("bad_request", "Join a campaign first.");
      return false;
    }
    return true;
  }

  onClose(): void {
    this.leaveRoom();
  }
}

/** Wire a freshly-connected socket to a session. */
export function handleConnection(
  socket: WebSocket,
  repos: Repositories,
  rooms: RoomManager,
): void {
  const session = new ClientSession(socket, repos, rooms);
  socket.on("message", (data) => session.handleRaw(data.toString()));
  socket.on("close", () => session.onClose());
  socket.on("error", () => {
    /* swallow socket errors; close handler cleans up */
  });
}
