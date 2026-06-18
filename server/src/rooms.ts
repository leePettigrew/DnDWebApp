import { WebSocket } from "ws";
import type { PresenceUser, Role, ServerMessage } from "../../shared/protocol";
import type { Repositories } from "./repositories";

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

  drop(campaignId: string): void {
    const room = this.rooms.get(campaignId);
    if (room && room.isEmpty()) this.rooms.delete(campaignId);
  }

  /** Send a message to every connected socket across all campaigns. */
  broadcastAll(message: ServerMessage): void {
    for (const room of this.rooms.values()) room.broadcast(message);
  }
}
