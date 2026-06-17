import type { IncomingMessage, ServerResponse } from "node:http";
import { nowISO } from "../../shared/ids";
import { SCOPED_COLLECTIONS } from "../../shared/protocol";
import type { ScopedCollection } from "../../shared/protocol";
import type { Entity } from "../../shared/domain";
import { isAdminUser, requireAdmin } from "./auth";
import type { Repositories } from "./repositories";

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
        json(res, 200, { ok: true, entity });
        return true;
      }
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
