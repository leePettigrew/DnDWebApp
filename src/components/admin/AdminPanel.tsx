"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { ChevronLeftIcon, TrashIcon } from "@/components/ui/icons";
import {
  adminApi,
  type AdminAnalytics,
  type AdminCampaignDump,
  type AdminEntity,
  type AdminOverview,
} from "@/lib/admin/api";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

function StatTile({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: ReactNode;
  tone?: "ink" | "brass" | "oxblood" | "forest" | "arcane";
}) {
  const color =
    tone === "brass"
      ? "text-brass-dark"
      : tone === "oxblood"
        ? "text-oxblood"
        : tone === "forest"
          ? "text-forest"
          : tone === "arcane"
            ? "text-arcane"
            : "text-ink";
  return (
    <div className="rounded-card border border-parchment-400/60 bg-parchment-100/70 px-3 py-3 text-center">
      <div className={cn("numerals font-display text-2xl font-bold", color)}>
        {value}
      </div>
      <div className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {label}
      </div>
    </div>
  );
}

function AnalyticsView({ a }: { a: AdminAnalytics }) {
  const maxD20 = Math.max(1, ...a.dice.d20.slice(1));
  const maxAct = Math.max(1, ...a.activity.map((x) => x.count));
  const maxTop = Math.max(1, ...a.topPlayers.map((x) => x.count));
  const pct = (n: number) =>
    a.dice.totalD20 ? ((n / a.dice.totalD20) * 100).toFixed(1) : "0.0";

  return (
    <Panel title="Server Analytics" eyebrow="At a glance">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Players" value={a.totals.users} />
        <StatTile label="Campaigns" value={a.totals.campaigns} tone="brass" />
        <StatTile label="Total rolls" value={a.totals.rolls} tone="arcane" />
        <StatTile label="Records" value={a.totals.entities} />
        <StatTile label="Nat 20s" value={a.dice.crits} tone="forest" />
        <StatTile label="Nat 1s" value={a.dice.fumbles} tone="oxblood" />
      </div>

      {/* d20 distribution */}
      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
            d20 distribution
          </p>
          <p className="text-xs text-ink-faint">
            {a.dice.totalD20.toLocaleString()} d20s · {pct(a.dice.crits)}% crit ·{" "}
            {pct(a.dice.fumbles)}% fumble{" "}
            <span className="text-ink-faint/70">(fair ≈ 5%)</span>
          </p>
        </div>
        <div className="flex h-32 items-end gap-1">
          {Array.from({ length: 20 }, (_, i) => i + 1).map((face) => {
            const n = a.dice.d20[face] ?? 0;
            const h = Math.max(2, (n / maxD20) * 100);
            const color =
              face === 20
                ? "bg-forest"
                : face === 1
                  ? "bg-oxblood"
                  : "bg-brass/70";
            return (
              <div
                key={face}
                className="flex flex-1 flex-col items-center justify-end"
                title={`${face}: ${n} (${pct(n)}%)`}
              >
                <div
                  className={cn("w-full rounded-t-sm transition-all", color)}
                  style={{ height: `${h}%` }}
                />
                <span className="numerals mt-1 text-[0.55rem] text-ink-faint">
                  {face}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Activity timeline */}
        <div>
          <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
            Rolls · last 14 days
          </p>
          <div className="flex h-24 items-end gap-1">
            {a.activity.map((d) => (
              <div
                key={d.day}
                className="flex flex-1 flex-col items-center justify-end"
                title={`${d.day}: ${d.count}`}
              >
                <div
                  className="w-full rounded-t-sm bg-arcane/70"
                  style={{ height: `${Math.max(2, (d.count / maxAct) * 100)}%` }}
                />
                <span className="text-[0.5rem] text-ink-faint">
                  {d.day.slice(5)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top rollers */}
        <div>
          <p className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
            Most active rollers
          </p>
          {a.topPlayers.length === 0 ? (
            <p className="text-sm text-ink-faint">No rolls yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {a.topPlayers.map((p) => (
                <li key={p.name} className="flex items-center gap-2 text-sm">
                  <span className="w-24 shrink-0 truncate text-ink-soft">
                    {p.name}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-parchment-300/60">
                    <div
                      className="h-full rounded-full bg-brass"
                      style={{ width: `${(p.count / maxTop) * 100}%` }}
                    />
                  </div>
                  <span className="numerals w-10 shrink-0 text-right font-semibold text-ink">
                    {p.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

export function AdminPanel() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await adminApi.overview());
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  if (loading && !overview) {
    return <p className="text-sm text-ink-soft">Loading server data…</p>;
  }
  if (error && !overview) {
    return (
      <Panel tone="flat">
        <p className="text-sm text-oxblood">{error}</p>
        <Button className="mt-3" variant="secondary" size="sm" onClick={loadOverview}>
          Retry
        </Button>
      </Panel>
    );
  }
  if (!overview) return null;

  if (selected) {
    return (
      <CampaignAdmin
        campaignId={selected}
        onBack={() => {
          setSelected(null);
          void loadOverview();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">
          Live from the server database. Edits and deletes are immediate.
        </p>
        <Button variant="secondary" size="sm" onClick={loadOverview}>
          Refresh
        </Button>
      </div>

      {error && <p className="text-sm text-oxblood">{error}</p>}

      <AnalyticsView a={overview.analytics} />

      <Panel title="Users" eyebrow={`${overview.users.length} total`}>
        <ul className="divide-y divide-parchment-400/40">
          {overview.users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <span className="font-display font-semibold text-ink">
                  {u.displayName}
                </span>{" "}
                <span className="text-sm text-ink-faint">@{u.username}</span>
                {u.isAdmin && (
                  <Badge tone="brass" className="ml-2">
                    Admin
                  </Badge>
                )}
                <div className="numerals text-xs text-ink-faint">
                  joined {u.createdAt.slice(0, 10)} · {u.id}
                </div>
              </div>
              {!u.isAdmin && (
                <button
                  onClick={async () => {
                    if (!confirm(`Delete user ${u.username}? This frees the name but leaves their campaigns.`))
                      return;
                    try {
                      await adminApi.deleteUser(u.id);
                      void loadOverview();
                    } catch (e) {
                      setError(errMsg(e));
                    }
                  }}
                  aria-label={`Delete ${u.username}`}
                  className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Campaigns" eyebrow={`${overview.campaigns.length} total`}>
        {overview.campaigns.length === 0 ? (
          <p className="text-sm text-ink-faint">No campaigns yet.</p>
        ) : (
          <ul className="space-y-2">
            {overview.campaigns.map((c) => {
              const total = Object.values(c.counts).reduce((n, x) => n + x, 0);
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 rounded-card border border-parchment-400/50 bg-parchment-100/60 p-3"
                >
                  <button
                    onClick={() => setSelected(c.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="font-display text-lg font-bold text-ink">
                      {c.name}
                    </span>
                    {c.setting && (
                      <span className="ml-2 text-xs italic text-ink-soft">
                        {c.setting}
                      </span>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-ink-faint">
                      <Badge>{c.members.length} members</Badge>
                      <Badge tone="arcane">{c.counts.rolls ?? 0} rolls</Badge>
                      <span className="numerals self-center">
                        {total} records · join {c.joinCode}
                      </span>
                    </div>
                  </button>
                  <Button size="sm" variant="secondary" onClick={() => setSelected(c.id)}>
                    Open
                  </Button>
                  <button
                    onClick={async () => {
                      if (!confirm(`Delete campaign "${c.name}" and ALL its data? This cannot be undone.`))
                        return;
                      try {
                        await adminApi.deleteCampaign(c.id);
                        void loadOverview();
                      } catch (e) {
                        setError(errMsg(e));
                      }
                    }}
                    aria-label={`Delete ${c.name}`}
                    className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function CampaignAdmin({
  campaignId,
  onBack,
}: {
  campaignId: string;
  onBack: () => void;
}) {
  const [dump, setDump] = useState<AdminCampaignDump | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState({ name: "", setting: "", description: "" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await adminApi.campaign(campaignId);
      setDump(d);
      setMeta({
        name: d.campaign.name,
        setting: d.campaign.setting ?? "",
        description: d.campaign.description ?? "",
      });
    } catch (e) {
      setError(errMsg(e));
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !dump) {
    return (
      <Panel tone="flat">
        <Button variant="secondary" size="sm" onClick={onBack}>
          <ChevronLeftIcon className="h-4 w-4" /> Back
        </Button>
        <p className="mt-3 text-sm text-oxblood">{error}</p>
      </Panel>
    );
  }
  if (!dump) return <p className="text-sm text-ink-soft">Loading campaign…</p>;

  const inputCls =
    "h-9 w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none";

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-oxblood"
      >
        <ChevronLeftIcon className="h-4 w-4" /> All campaigns
      </button>

      {error && <p className="text-sm text-oxblood">{error}</p>}

      <Panel title="Campaign" eyebrow={dump.campaign.id}>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs">
            <span className="mb-0.5 block font-semibold uppercase tracking-wide text-ink-faint">
              Name
            </span>
            <input
              className={inputCls}
              value={meta.name}
              onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))}
            />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block font-semibold uppercase tracking-wide text-ink-faint">
              Setting / genre
            </span>
            <input
              className={inputCls}
              value={meta.setting}
              onChange={(e) => setMeta((m) => ({ ...m, setting: e.target.value }))}
            />
          </label>
          <label className="text-xs">
            <span className="mb-0.5 block font-semibold uppercase tracking-wide text-ink-faint">
              Description
            </span>
            <input
              className={inputCls}
              value={meta.description}
              onChange={(e) =>
                setMeta((m) => ({ ...m, description: e.target.value }))
              }
            />
          </label>
        </div>
        <Button
          size="sm"
          className="mt-3"
          onClick={async () => {
            try {
              await adminApi.patchCampaign(campaignId, meta);
              void load();
            } catch (e) {
              setError(errMsg(e));
            }
          }}
        >
          Save campaign
        </Button>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {dump.members.map((m) => (
            <Badge key={m.userId} tone={m.role === "dm" ? "oxblood" : "arcane"}>
              {m.displayName} · {m.role}
            </Badge>
          ))}
        </div>
      </Panel>

      {Object.entries(dump.entities)
        .filter(([, items]) => items.length > 0)
        .map(([collection, items]) => (
          <Panel
            key={collection}
            title={collection}
            eyebrow={`${items.length} record${items.length === 1 ? "" : "s"}`}
            bodyClassName="p-3"
          >
            <ul className="space-y-2">
              {items.map((entity) => (
                <EntityCard
                  key={entity.id}
                  collection={collection}
                  campaignId={campaignId}
                  entity={entity}
                  onChanged={load}
                />
              ))}
            </ul>
          </Panel>
        ))}

      <Panel title="Roll log" eyebrow={`${dump.rolls.length} actions`}>
        {dump.rolls.length === 0 ? (
          <p className="text-sm text-ink-faint">No rolls.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
            {dump.rolls.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-ink-soft">
                  <span className="font-semibold text-brass-dark">
                    {String(r.rolledByName ?? "—")}
                  </span>{" "}
                  {String(r.label ?? r.notation ?? "")}
                  {r.hidden ? " (hidden)" : ""}
                </span>
                <span className="numerals shrink-0 font-bold text-ink">
                  {String(r.total ?? "")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {dump.chat.length > 0 && (
        <Panel title="Chat" eyebrow={`${dump.chat.length} messages`}>
          <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
            {dump.chat.map((m) => (
              <li key={m.id} className="text-ink-soft">
                <span className="font-semibold text-ink">
                  {String((m as Record<string, unknown>).userName ?? "—")}:
                </span>{" "}
                {String((m as Record<string, unknown>).body ?? "")}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function EntityCard({
  collection,
  campaignId,
  entity,
  onChanged,
}: {
  collection: string;
  campaignId: string;
  entity: AdminEntity;
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => JSON.stringify(entity, null, 2));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const label = String(entity.name ?? entity.title ?? entity.id);

  async function save() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setErr("Invalid JSON.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await adminApi.putEntity(collection, campaignId, entity.id, parsed);
      await onChanged();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-md border border-parchment-400/50 bg-parchment-100/50">
      <div className="flex items-center gap-2 p-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="font-semibold text-ink">{label}</span>{" "}
          <span className="numerals text-xs text-ink-faint">{entity.id}</span>
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-md px-2 py-1 text-xs font-semibold text-brass-dark hover:bg-parchment-300/60"
        >
          {open ? "Close" : "Edit JSON"}
        </button>
        <button
          onClick={async () => {
            if (!confirm(`Delete ${label}?`)) return;
            setBusy(true);
            try {
              await adminApi.deleteEntity(collection, campaignId, entity.id);
              await onChanged();
            } catch (e) {
              setErr(errMsg(e));
              setBusy(false);
            }
          }}
          aria-label={`Delete ${label}`}
          className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-parchment-400/40 p-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            rows={Math.min(20, text.split("\n").length + 1)}
            className="w-full rounded-md border border-parchment-400 bg-parchment-50 p-2 font-mono text-xs text-ink focus:border-brass focus:outline-none"
          />
          {err && <p className="text-xs text-oxblood">{err}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}>
              Save changes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setText(JSON.stringify(entity, null, 2))}
              disabled={busy}
            >
              Reset
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
