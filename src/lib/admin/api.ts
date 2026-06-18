/**
 * Thin client for the server's /admin/* API. Auth is the same JWT the app
 * already stored at login (the server checks it's the admin on every call).
 * Only works in multiplayer mode (a configured backend URL).
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

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
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
      /* non-JSON error */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
  isAdmin: boolean;
}
export interface AdminMember {
  userId: string;
  role: "dm" | "player";
  username: string;
  displayName: string;
}
export interface AdminCampaign {
  id: string;
  name: string;
  setting?: string;
  description?: string;
  joinCode: string;
  createdAt: string;
  updatedAt: string;
}
export interface AdminCampaignSummary extends AdminCampaign {
  members: AdminMember[];
  counts: Record<string, number>;
}
export interface AdminAnalytics {
  totals: {
    users: number;
    campaigns: number;
    rolls: number;
    chat: number;
    entities: number;
  };
  entitiesByCollection: Record<string, number>;
  /** d20 face counts; index 1..20 (index 0 unused). */
  dice: { d20: number[]; crits: number; fumbles: number; totalD20: number };
  topPlayers: { name: string; count: number }[];
  activity: { day: string; count: number }[];
}
export interface AdminOverview {
  users: AdminUser[];
  campaigns: AdminCampaignSummary[];
  collections: string[];
  analytics: AdminAnalytics;
}
export interface AdminEntity {
  id: string;
  [key: string]: unknown;
}
export interface AdminCampaignDump {
  campaign: AdminCampaign;
  members: AdminMember[];
  entities: Record<string, AdminEntity[]>;
  combat: unknown;
  rolls: AdminEntity[];
  chat: AdminEntity[];
}

export const adminApi = {
  overview: () => req<AdminOverview>("GET", "/admin/overview"),
  campaign: (id: string) =>
    req<AdminCampaignDump>("GET", `/admin/campaign/${id}`),
  patchCampaign: (
    id: string,
    patch: { name?: string; setting?: string; description?: string },
  ) => req<{ ok: true; campaign: AdminCampaign }>("PATCH", `/admin/campaign/${id}`, patch),
  deleteCampaign: (id: string) =>
    req<{ ok: true }>("DELETE", `/admin/campaign/${id}`),
  putEntity: (collection: string, campaignId: string, id: string, entity: unknown) =>
    req<{ ok: true }>(
      "PUT",
      `/admin/entity/${collection}/${campaignId}/${id}`,
      entity,
    ),
  deleteEntity: (collection: string, campaignId: string, id: string) =>
    req<{ ok: true }>(
      "DELETE",
      `/admin/entity/${collection}/${campaignId}/${id}`,
    ),
  deleteUser: (id: string) => req<{ ok: true }>("DELETE", `/admin/user/${id}`),
  setPassword: (id: string, password: string) =>
    req<{ ok: true }>("PATCH", `/admin/user/${id}/password`, { password }),
  setRole: (campaignId: string, userId: string, role: "dm" | "player") =>
    req<{ ok: true }>("PATCH", `/admin/membership/${campaignId}/${userId}`, {
      role,
    }),
};
