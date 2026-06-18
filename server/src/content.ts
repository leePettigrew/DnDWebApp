import type { IncomingMessage, ServerResponse } from "node:http";
import { newId, nowISO } from "../../shared/ids";
import { isAdminUser, verifyToken } from "./auth";
import type { ContentRecord, Repositories, UserRecord } from "./repositories";
import type { RoomManager } from "./rooms";

/**
 * Homebrew / custom-content API. Anyone signed in can READ the global library
 * and (if a member) a campaign's content. WRITES are gated server-side: global
 * content needs the admin; a campaign's content needs that campaign's DM.
 */

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage, limit = 2_000_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        reject(new Error("Body too large"));
        return;
      }
      chunks.push(c);
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

function userFrom(
  repos: Repositories,
  authHeader: string | undefined,
): UserRecord | null {
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) return null;
  const v = verifyToken(token);
  return v ? repos.users.findById(v.userId) : null;
}

const KINDS = new Set(["spell", "item", "loot", "override", "lootconfig"]);
const HOMEBREW_KINDS = new Set(["spell", "item", "loot"]);

export async function handleContentRequest(
  req: IncomingMessage,
  res: ServerResponse,
  repos: Repositories,
  rooms: RoomManager,
): Promise<boolean> {
  const url = (req.url ?? "").split("?")[0];
  if (!url.startsWith("/content/")) return false;

  const user = userFrom(repos, req.headers.authorization);
  if (!user) {
    json(res, 401, { error: "Sign in required." });
    return true;
  }

  const seg = url.split("/").filter(Boolean); // ["content", scope, ...]
  const method = req.method ?? "GET";
  const scope = seg[1];

  // Tell connected clients to refetch content after a global/campaign change.
  const notify = (campaignId?: string) => {
    const msg = { type: "content:changed" as const };
    if (campaignId) rooms.peek(campaignId)?.broadcast(msg);
    else rooms.broadcastAll(msg);
  };

  try {
    if (scope === "global") {
      if (method === "GET") {
        json(res, 200, { records: repos.content.listGlobal() });
        return true;
      }
      if (!isAdminUser(user)) {
        json(res, 403, { error: "Only the admin can edit the global library." });
        return true;
      }
      if (method === "PUT" && seg[2] && seg[3]) {
        if (!KINDS.has(seg[2])) {
          json(res, 400, { error: "Unknown content kind." });
          return true;
        }
        const data = await readJson(req);
        const existing = repos.content.get(seg[3]);
        const record: ContentRecord = {
          id: seg[3] || newId(),
          scope: "global",
          kind: seg[2],
          data,
          ownerId: existing?.ownerId ?? user.id,
          createdAt: existing?.createdAt ?? nowISO(),
          updatedAt: nowISO(),
        };
        repos.content.upsert(record);
        notify();
        json(res, 200, { ok: true, record });
        return true;
      }
      if (method === "DELETE" && seg[2]) {
        const ex = repos.content.get(seg[2]);
        if (ex && ex.scope === "global") repos.content.remove(seg[2]);
        notify();
        json(res, 200, { ok: true });
        return true;
      }
    }

    if (scope === "campaign" && seg[2]) {
      const cid = seg[2];
      const membership = repos.memberships.find(user.id, cid);
      if (!membership) {
        json(res, 403, { error: "Not a member of that campaign." });
        return true;
      }
      if (method === "GET") {
        let records = repos.content.listForCampaign(cid);
        // Players don't get hidden HOMEBREW (overrides/configs always apply).
        if (membership.role !== "dm") {
          records = records.filter((r) => {
            if (!HOMEBREW_KINDS.has(r.kind)) return true;
            const d = r.data as { hidden?: boolean; visibleTo?: string[] };
            return !d?.hidden || (d.visibleTo?.includes(user.id) ?? false);
          });
        }
        json(res, 200, { records });
        return true;
      }
      if (membership.role !== "dm") {
        json(res, 403, { error: "Only the DM can edit this campaign's content." });
        return true;
      }
      if (method === "PUT" && seg[3] && seg[4]) {
        if (!KINDS.has(seg[3])) {
          json(res, 400, { error: "Unknown content kind." });
          return true;
        }
        const data = await readJson(req);
        const existing = repos.content.get(seg[4]);
        const record: ContentRecord = {
          id: seg[4] || newId(),
          scope: "campaign",
          campaignId: cid,
          kind: seg[3],
          data,
          ownerId: existing?.ownerId ?? user.id,
          createdAt: existing?.createdAt ?? nowISO(),
          updatedAt: nowISO(),
        };
        repos.content.upsert(record);
        notify(cid);
        json(res, 200, { ok: true, record });
        return true;
      }
      if (method === "DELETE" && seg[3]) {
        const ex = repos.content.get(seg[3]);
        if (ex && ex.scope === "campaign" && ex.campaignId === cid) {
          repos.content.remove(seg[3]);
        }
        notify(cid);
        json(res, 200, { ok: true });
        return true;
      }
    }

    json(res, 404, { error: "Unknown content route." });
    return true;
  } catch (e) {
    console.error("[content] error", e);
    json(res, 500, { error: "Server error." });
    return true;
  }
}
