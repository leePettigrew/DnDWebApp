import { WebSocket } from "ws";
import type {
  AnyScopedEntity,
  PresenceUser,
  Role,
  ScopedCollection,
  ServerMessage,
} from "../../shared/protocol";
import type { TradeSession } from "../../shared/trade";
import { touchSession } from "../../shared/trade";
import type { Repositories } from "./repositories";
import { isVisible } from "./visibility";

export interface RoomMember {
  socket: WebSocket;
  userId: string;
  name: string;
  role: Role;
  typing: string | null;
}

/**
 * The live set of sockets connected to one campaign. The DATABASE is the source
 * of truth for entity/combat state; the room only tracks who's connected (for
 * broadcast + presence) and re-reads from the repositories when broadcasting.
 */
export class CampaignRoom {
  private members = new Set<RoomMember>();
  /** Live player↔player trade sessions, by id (ephemeral, never persisted). */
  private trades = new Map<string, TradeSession>();

  constructor(
    public readonly campaignId: string,
    private readonly repos: Repositories,
  ) {}

  add(member: RoomMember): void {
    this.members.add(member);
  }
  remove(member: RoomMember): void {
    this.members.delete(member);
  }
  isEmpty(): boolean {
    return this.members.size === 0;
  }

  broadcast(message: ServerMessage, filter?: (m: RoomMember) => boolean): void {
    const data = JSON.stringify(message);
    for (const member of this.members) {
      if (filter && !filter(member)) continue;
      if (member.socket.readyState === WebSocket.OPEN) member.socket.send(data);
    }
  }

  /** Send each member a message tailored to them (e.g. visibility-filtered). */
  broadcastEach(build: (m: RoomMember) => ServerMessage | null): void {
    for (const member of this.members) {
      if (member.socket.readyState !== WebSocket.OPEN) continue;
      const message = build(member);
      if (message) member.socket.send(JSON.stringify(message));
    }
  }

  /** Push a collection to the room, visibility-filtered per recipient. */
  broadcastCollection(collection: ScopedCollection, items: unknown[]): void {
    this.broadcastEach((m) => ({
      type: "entity:changed",
      collection,
      items: items.filter((it) =>
        isVisible(it, m.role, m.userId),
      ) as AnyScopedEntity[],
    }));
  }

  /** Full roster with an online flag, so the UI can show who's here now. */
  presence(): PresenceUser[] {
    const memberships = this.repos.memberships.listForCampaign(this.campaignId);
    const online = new Set<string>();
    const typing = new Map<string, string | null>();
    for (const member of this.members) {
      online.add(member.userId);
      if (member.typing) typing.set(member.userId, member.typing);
    }
    return memberships.map((ms) => {
      const user = this.repos.users.findById(ms.userId);
      return {
        userId: ms.userId,
        name: user?.displayName ?? "Unknown",
        role: ms.role,
        online: online.has(ms.userId),
        typing: typing.get(ms.userId) ?? null,
      };
    });
  }

  broadcastPresence(): void {
    this.broadcast({ type: "presence:state", users: this.presence() });
  }

  // --- player↔player trade sessions ---------------------------------------

  isOnline(userId: string): boolean {
    for (const m of this.members) if (m.userId === userId) return true;
    return false;
  }

  getTrade(id: string): TradeSession | undefined {
    return this.trades.get(id);
  }

  /** An open session the user is currently part of (one at a time). */
  openTradeFor(userId: string): TradeSession | undefined {
    for (const t of this.trades.values()) {
      if (
        t.status === "open" &&
        (t.from.userId === userId || t.to.userId === userId)
      ) {
        return t;
      }
    }
    return undefined;
  }

  setTrade(session: TradeSession): void {
    this.trades.set(session.id, session);
  }
  removeTrade(id: string): void {
    this.trades.delete(id);
  }

  /** Push a trade's state to just its two participants. */
  broadcastTrade(session: TradeSession): void {
    this.broadcast(
      { type: "p2ptrade:changed", session },
      (m) => m.userId === session.from.userId || m.userId === session.to.userId,
    );
  }

  /** Cancel any open trade involving a user (e.g. they disconnected). */
  cancelTradesFor(userId: string): void {
    for (const t of this.trades.values()) {
      if (
        t.status === "open" &&
        (t.from.userId === userId || t.to.userId === userId)
      ) {
        const cancelled = touchSession({
          ...t,
          status: "cancelled",
          error: "The other trader left.",
        });
        this.broadcastTrade(cancelled);
        this.trades.delete(t.id);
      }
    }
  }
}

export class RoomManager {
  private rooms = new Map<string, CampaignRoom>();

  constructor(private readonly repos: Repositories) {}

  get(campaignId: string): CampaignRoom {
    let room = this.rooms.get(campaignId);
    if (!room) {
      room = new CampaignRoom(campaignId, this.repos);
      this.rooms.set(campaignId, room);
    }
    return room;
  }

  /** The room for a campaign IF one exists (no creation). */
  peek(campaignId: string): CampaignRoom | undefined {
    return this.rooms.get(campaignId);
  }

  drop(campaignId: string): void {
    const room = this.rooms.get(campaignId);
    if (room && room.isEmpty()) this.rooms.delete(campaignId);
  }

  /** Send a message to every connected socket across all campaigns. */
  broadcastAll(message: ServerMessage): void {
    for (const room of this.rooms.values()) room.broadcast(message);
  }
}
