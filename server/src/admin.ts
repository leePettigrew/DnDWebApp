import type { IncomingMessage, ServerResponse } from "node:http";
import { nowISO } from "../../shared/ids";
import { SCOPED_COLLECTIONS } from "../../shared/protocol";
import type { ScopedCollection } from "../../shared/protocol";
import type { Entity } from "../../shared/domain";
import { hashPassword, isAdminUser, requireAdmin } from "./auth";
import type { Repositories } from "./repositories";
import type { RoomManager } from "./rooms";

/**
 * Admin panel HTTP API. Every route requires a Bearer token belonging to the
 * configured ADMIN_USERNAME — verified here server-side, never trusting the
 * client. It can read across all campaigns/users and edit or delete anything.
 */

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage, limit = 4_000_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(new Error("Body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function isCollection(c: string): c is ScopedCollection {
  return (SCOPED_COLLECTIONS as string[]).includes(c);
}

export async function handleAdminRequest(
  req: IncomingMessage,
  res: ServerResponse,
  repos: Repositories,
  rooms: RoomManager,
): Promise<boolean> {
  const url = (req.url ?? "").split("?")[0];
  if (!url.startsWith("/admin/")) return false;

  const admin = requireAdmin(repos, req.headers.authorization);
  if (!admin) {
    json(res, 401, { error: "Admin access required." });
    return true;
  }

  const seg = url.split("/").filter(Boolean); // ["admin", ...]
  const method = req.method ?? "GET";

  try {
    // POST /admin/announce — push a message to everyone online.
    if (method === "POST" && seg[1] === "announce") {
      const body = (await readJson(req)) as { message?: unknown };
      const text = typeof body.message === "string" ? body.message.trim() : "";
      if (!text) {
        json(res, 400, { error: "Message is required." });
        return true;
      }
      rooms.broadcastAll({
        type: "dm:handout:shown",
        handout: { title: "Server Announcement", body: text, fromName: admin.displayName },
      });
      json(res, 200, { ok: true });
      return true;
    }

    // GET /admin/export — full JSON backup of the database.
    if (method === "GET" && seg[1] === "export") {
      const users = repos.admin.listUsers().map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        createdAt: u.createdAt,
      }));
      const campaigns = repos.admin.listCampaigns().map((c) => {
        const entities: Record<string, unknown[]> = {};
        for (const col of SCOPED_COLLECTIONS) {
          entities[col] = repos.entities[col].list(c.id);
        }
        return {
          ...c,
          members: repos.memberships.listForCampaign(c.id),
          entities,
          combat: repos.combat.get(c.id),
          rolls: repos.rollLog.list(c.id, { includeHidden: true, limit: 100000 }),
          chat: repos.chat.list(c.id, 100000),
          content: repos.content.listForCampaign(c.id),
        };
      });
      json(res, 200, {
        exportedAt: nowISO(),
        users,
        campaigns,
        globalContent: repos.content.listGlobal(),
      });
      return true;
    }

    // GET /admin/overview — users + campaign summaries.
    if (method === "GET" && seg[1] === "overview") {
      const users = repos.admin.listUsers();
      const userById = new Map(users.map((u) => [u.id, u]));
      const campaigns = repos.admin.listCampaigns().map((c) => {
        const members = repos.memberships.listForCampaign(c.id).map((m) => ({
          userId: m.userId,
          role: m.role,
          username: userById.get(m.userId)?.username ?? "(deleted)",
          displayName: userById.get(m.userId)?.displayName ?? "(deleted)",
        }));
        const counts: Record<string, number> = {
          rolls: repos.rollLog.list(c.id, { includeHidden: true }).length,
          chat: repos.chat.list(c.id).length,
        };
        for (const col of SCOPED_COLLECTIONS) {
          counts[col] = repos.entities[col].list(c.id).length;
        }
        return { ...c, members, counts };
      });

      // --- server-wide analytics ---
      const entitiesByCollection: Record<string, number> = {};
      let totalRolls = 0;
      let totalChat = 0;
      let totalEntities = 0;
      for (const c of campaigns) {
        for (const [k, v] of Object.entries(c.counts)) {
          if (k === "rolls") totalRolls += v;
          else if (k === "chat") totalChat += v;
          else {
            entitiesByCollection[k] = (entitiesByCollection[k] ?? 0) + v;
            totalEntities += v;
          }
        }
      }

      const rolls = repos.admin.listAllRolls(5000);
      const d20 = new Array<number>(21).fill(0);
      let crits = 0;
      let fumbles = 0;
      let totalD20 = 0;
      const byPlayer = new Map<string, number>();
      const byDay = new Map<string, number>();
      for (const r of rolls) {
        if (r.isCrit) crits++;
        if (r.isFumble) fumbles++;
        const name = (r.rolledByName ?? "Unknown").trim() || "Unknown";
        byPlayer.set(name, (byPlayer.get(name) ?? 0) + 1);
        const day = String(r.timestamp ?? r.createdAt ?? "").slice(0, 10);
        if (day) byDay.set(day, (byDay.get(day) ?? 0) + 1);
        for (const die of r.rolls ?? []) {
          if (die.sides === 20 && die.value >= 1 && die.value <= 20) {
            d20[die.value]++;
            totalD20++;
          }
        }
      }
      const topPlayers = [...byPlayer.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
      const activity: { day: string; count: number }[] = [];
      const today = new Date();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setUTCDate(d.getUTCDate() - i);
        const key = d.toISOString().slice(0, 10);
        activity.push({ day: key, count: byDay.get(key) ?? 0 });
      }

      json(res, 200, {
        users: users.map((u) => ({
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          createdAt: u.createdAt,
          isAdmin: isAdminUser(u),
        })),
        campaigns,
        collections: SCOPED_COLLECTIONS,
        analytics: {
          totals: {
            users: users.length,
            campaigns: campaigns.length,
            rolls: totalRolls,
            chat: totalChat,
            entities: totalEntities,
          },
          entitiesByCollection,
          dice: { d20, crits, fumbles, totalD20 },
          topPlayers,
          activity,
        },
      });
      return true;
    }

    // /admin/campaign/<id>
    if (seg[1] === "campaign" && seg[2]) {
      const id = seg[2];
      if (method === "GET") {
        const campaign = repos.campaigns.findById(id);
        if (!campaign) {
          json(res, 404, { error: "Campaign not found." });
          return true;
        }
        const users = new Map(repos.admin.listUsers().map((u) => [u.id, u]));
        const members = repos.memberships.listForCampaign(id).map((m) => ({
          userId: m.userId,
          role: m.role,
          username: users.get(m.userId)?.username ?? "(deleted)",
          displayName: users.get(m.userId)?.displayName ?? "(deleted)",
        }));
        const entities: Record<string, Entity[]> = {};
        for (const col of SCOPED_COLLECTIONS) {
          entities[col] = repos.entities[col].list(id);
        }
        json(res, 200, {
          campaign,
          members,
          entities,
          combat: repos.combat.get(id),
          rolls: repos.rollLog.list(id, { includeHidden: true, limit: 500 }),
          chat: repos.chat.list(id, 500),
        });
        return true;
      }
      if (method === "PATCH") {
        const body = (await readJson(req)) as Record<string, unknown>;
        const patch: {
          name?: string;
          setting?: string;
          description?: string;
          updatedAt: string;
        } = { updatedAt: nowISO() };
        if (typeof body.name === "string") patch.name = body.name;
        if (typeof body.setting === "string") patch.setting = body.setting;
        if (typeof body.description === "string")
          patch.description = body.description;
        repos.campaigns.update(id, patch);
        json(res, 200, { ok: true, campaign: repos.campaigns.findById(id) });
        return true;
      }
      if (method === "DELETE") {
        repos.admin.deleteCampaign(id);
        json(res, 200, { ok: true });
        return true;
      }
    }

    // /admin/entity/<collection>/<campaignId>/<id>
    if (seg[1] === "entity" && seg[2] && seg[3] && seg[4]) {
      const col = seg[2];
      const cid = seg[3];
      const id = seg[4];
      if (!isCollection(col)) {
        json(res, 400, { error: "Unknown collection." });
        return true;
      }
      const repo = repos.entities[col];
      if (method === "DELETE") {
        repo.remove(cid, id);
        rooms.peek(cid)?.broadcastCollection(col, repo.list(cid));
        json(res, 200, { ok: true });
        return true;
      }
      if (method === "PUT") {
        const body = (await readJson(req)) as Record<string, unknown> & {
          ownerId?: string;
        };
        const existing = repo.get(cid, id) as (Entity & { ownerId?: string }) | null;
        const ownerId =
          col === "characters"
            ? ((body.ownerId as string | undefined) ??
              existing?.ownerId ??
              null)
            : null;
        const entity = {
          ...body,
          id,
          campaignId: cid,
          createdAt:
            (typeof body.createdAt === "string" && body.createdAt) ||
            existing?.createdAt ||
            nowISO(),
          updatedAt: nowISO(),
        } as unknown as Entity;
        repo.upsert(cid, entity, ownerId);
        rooms.peek(cid)?.broadcastCollection(col, repo.list(cid));
        json(res, 200, { ok: true, entity });
        return true;
      }
    }

    // PATCH /admin/user/<id>/password — reset a password.
    if (method === "PATCH" && seg[1] === "user" && seg[2] && seg[3] === "password") {
      const body = (await readJson(req)) as { password?: unknown };
      const password = typeof body.password === "string" ? body.password : "";
      if (password.length < 6) {
        json(res, 400, { error: "Password must be at least 6 characters." });
        return true;
      }
      if (!repos.users.findById(seg[2])) {
        json(res, 404, { error: "User not found." });
        return true;
      }
      repos.admin.setUserPassword(seg[2], await hashPassword(password));
      json(res, 200, { ok: true });
      return true;
    }

    // PATCH /admin/membership/<campaignId>/<userId> — set DM/player role.
    if (
      method === "PATCH" &&
      seg[1] === "membership" &&
      seg[2] &&
      seg[3]
    ) {
      const body = (await readJson(req)) as { role?: unknown };
      const role = body.role === "dm" ? "dm" : "player";
      if (!repos.memberships.find(seg[3], seg[2])) {
        json(res, 404, { error: "Not a member of that campaign." });
        return true;
      }
      repos.admin.setMembershipRole(seg[3], seg[2], role);
      json(res, 200, { ok: true });
      return true;
    }

    // DELETE /admin/user/<id>
    if (method === "DELETE" && seg[1] === "user" && seg[2]) {
      if (seg[2] === admin.id) {
        json(res, 400, { error: "You can't delete your own admin account here." });
        return true;
      }
      repos.admin.deleteUser(seg[2]);
      json(res, 200, { ok: true });
      return true;
    }

    json(res, 404, { error: "Unknown admin route." });
    return true;
  } catch (err) {
    console.error("[admin] error", err);
    json(res, 500, { error: "Server error." });
    return true;
  }
}
