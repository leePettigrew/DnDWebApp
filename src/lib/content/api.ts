/**
 * Client for the server's /content API (homebrew spells, items, loot tables).
 * Reuses the JWT the app stored at login. Only works in multiplayer mode.
 */

const WS_URL = process.env.NEXT_PUBLIC_MULTIPLAYER_WS_URL ?? "";
const TOKEN_KEY = "dragons-ledger:v1:auth-token";

function httpBase(): string {
  try {
    const u = new URL(WS_URL);
    u.protocol = u.protocol === "wss:" ? "https:" : "http:";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function token(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_KEY) ?? "";
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${httpBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) message = j.error;
    } catch {
      /* non-JSON */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export type ContentScope = "global" | "campaign";
export type ContentKind = "spell" | "item" | "loot";

export interface ContentRecord<T = unknown> {
  id: string;
  scope: ContentScope;
  campaignId?: string;
  kind: ContentKind;
  data: T;
  createdAt: string;
  updatedAt: string;
}

export const contentApi = {
  enabled: () => httpBase() !== "",
  global: () => req<{ records: ContentRecord[] }>("GET", "/content/global"),
  campaign: (cid: string) =>
    req<{ records: ContentRecord[] }>("GET", `/content/campaign/${cid}`),
  putGlobal: (kind: ContentKind, id: string, data: unknown) =>
    req("PUT", `/content/global/${kind}/${id}`, data),
  deleteGlobal: (id: string) => req("DELETE", `/content/global/${id}`),
  putCampaign: (cid: string, kind: ContentKind, id: string, data: unknown) =>
    req("PUT", `/content/campaign/${cid}/${kind}/${id}`, data),
  deleteCampaign: (cid: string, id: string) =>
    req("DELETE", `/content/campaign/${cid}/${id}`),
};
