"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { NumberField, SelectField, TextArea } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { newId } from "@/lib/domain/ids";
import {
  useActiveCampaign,
  useCurrentUser,
  useDataProvider,
} from "@/lib/data/hooks";
import { useCustomContent } from "@/lib/content/context";
import { contentApi, type ContentScope } from "@/lib/content/api";
import {
  LOOT_TIERS,
  defaultLootConfig,
  type LootConfig,
  type LootTier,
  type LootTierConfig,
} from "@/lib/dm/loot";

const COINS = ["cp", "sp", "ep", "gp", "pp"] as const;

export function LootConfigEditor() {
  const content = useCustomContent();
  const me = useCurrentUser();
  const { role } = useActiveCampaign();
  const { capabilities } = useDataProvider();

  const isAdmin = !!me?.isAdmin;
  const isDM = !capabilities.multiUser || role === "dm";

  const [scope, setScope] = useState<ContentScope>("campaign");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LootConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      return;
    }
    const rec = content.lootConfigs.find((r) => r.scope === scope);
    setDraft(
      JSON.parse(
        JSON.stringify((rec?.data as LootConfig) ?? defaultLootConfig()),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope]);

  if (!content.enabled) return null;

  const canWrite = scope === "global" ? isAdmin : isDM && !!content.campaignId;
  const customised = content.lootConfigs.some((r) => r.scope === scope);

  const setTier = (tier: LootTier, patch: Partial<LootTierConfig>) =>
    setDraft((d) =>
      d
        ? { ...d, tiers: { ...d.tiers, [tier]: { ...d.tiers[tier], ...patch } } }
        : d,
    );
  const setCoins = (tier: LootTier, patch: Partial<LootTierConfig["coins"]>) =>
    setDraft((d) =>
      d
        ? {
            ...d,
            tiers: {
              ...d.tiers,
              [tier]: { ...d.tiers[tier], coins: { ...d.tiers[tier].coins, ...patch } },
            },
          }
        : d,
    );

  async function save() {
    if (!draft || !canWrite) return;
    setBusy(true);
    setErr(null);
    const rec = content.lootConfigs.find((r) => r.scope === scope);
    const id = rec?.id ?? newId();
    try {
      if (scope === "global") await contentApi.putGlobal("lootconfig", id, draft);
      else await contentApi.putCampaign(content.campaignId!, "lootconfig", id, draft);
      await content.refresh();
      setFlash("Loot config saved.");
      window.setTimeout(() => setFlash(null), 2400);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    const rec = content.lootConfigs.find((r) => r.scope === scope);
    if (!rec) return;
    if (!confirm("Reset this loot config back to the built-in defaults?")) return;
    setBusy(true);
    try {
      if (scope === "global") await contentApi.deleteGlobal(rec.id);
      else await contentApi.deleteCampaign(content.campaignId!, rec.id);
      await content.refresh();
      setDraft(JSON.parse(JSON.stringify(defaultLootConfig())));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  const seg = "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors";

  return (
    <Panel
      title="Loot Config"
      eyebrow="Customise the standard tables"
      action={
        <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "Customise"}
        </Button>
      }
    >
      {!open ? (
        <p className="text-sm text-ink-faint">
          Tune the coins, gem/art odds, and magic-item odds for the standard
          CR-tier hoards — per campaign, or globally as admin. Click Customise.
        </p>
      ) : !draft ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex gap-1 rounded-card border border-parchment-400/70 bg-parchment-100 p-1">
              <button
                className={cn(
                  seg,
                  scope === "campaign"
                    ? "bg-oxblood text-parchment-50 shadow-card"
                    : "text-ink-soft hover:bg-parchment-300/60",
                )}
                onClick={() => setScope("campaign")}
              >
                This campaign
              </button>
              {isAdmin && (
                <button
                  className={cn(
                    seg,
                    scope === "global"
                      ? "bg-oxblood text-parchment-50 shadow-card"
                      : "text-ink-soft hover:bg-parchment-300/60",
                  )}
                  onClick={() => setScope("global")}
                >
                  Global
                </button>
              )}
            </div>
            {customised && (
              <span className="text-xs font-semibold text-brass-dark">
                Customised
              </span>
            )}
          </div>

          {!canWrite && (
            <p className="text-sm text-ink-faint">
              {scope === "global"
                ? "Only the admin can edit the global loot config."
                : "Only this campaign's DM can edit its loot config."}
            </p>
          )}

          {LOOT_TIERS.map((t) => {
            const tc = draft.tiers[t.key];
            return (
              <div
                key={t.key}
                className="rounded-card border border-parchment-400/50 bg-parchment-100/50 p-3"
              >
                <p className="mb-2 font-display text-sm font-bold text-ink">
                  {t.label}
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <NumberField
                    label="Coins"
                    className="w-16"
                    value={tc.coins.count}
                    onChange={(e) =>
                      setCoins(t.key, { count: Number(e.target.value) || 0 })
                    }
                  />
                  <span className="pb-2 text-ink-faint">d</span>
                  <NumberField
                    label="Sides"
                    className="w-16"
                    value={tc.coins.sides}
                    onChange={(e) =>
                      setCoins(t.key, { sides: Number(e.target.value) || 6 })
                    }
                  />
                  <span className="pb-2 text-ink-faint">×</span>
                  <NumberField
                    label="Mult"
                    className="w-20"
                    value={tc.coins.multiplier}
                    onChange={(e) =>
                      setCoins(t.key, { multiplier: Number(e.target.value) || 1 })
                    }
                  />
                  <div className="w-20">
                    <SelectField
                      label="Coin"
                      value={tc.coins.denomination}
                      onChange={(e) =>
                        setCoins(t.key, {
                          denomination: e.target.value as (typeof COINS)[number],
                        })
                      }
                    >
                      {COINS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <NumberField
                    label="Gem/art %"
                    className="w-24"
                    value={tc.valuableChance}
                    onChange={(e) =>
                      setTier(t.key, { valuableChance: Number(e.target.value) || 0 })
                    }
                  />
                  <NumberField
                    label="max"
                    className="w-16"
                    value={tc.valuableCount}
                    onChange={(e) =>
                      setTier(t.key, { valuableCount: Number(e.target.value) || 1 })
                    }
                  />
                  <NumberField
                    label="Magic %"
                    className="w-24"
                    value={tc.magicChance}
                    onChange={(e) =>
                      setTier(t.key, { magicChance: Number(e.target.value) || 0 })
                    }
                  />
                  <NumberField
                    label="max"
                    className="w-16"
                    value={tc.magicCount}
                    onChange={(e) =>
                      setTier(t.key, { magicCount: Number(e.target.value) || 1 })
                    }
                  />
                  <label className="flex items-center gap-1.5 pb-2 text-xs text-ink-soft">
                    <input
                      type="checkbox"
                      checked={tc.magicRare}
                      onChange={(e) =>
                        setTier(t.key, { magicRare: e.target.checked })
                      }
                      className="h-4 w-4 accent-arcane"
                    />
                    rare+
                  </label>
                </div>
              </div>
            );
          })}

          <div className="grid gap-3 sm:grid-cols-2">
            <TextArea
              label="Gems & art — gems (one per line)"
              rows={4}
              value={draft.gems.join("\n")}
              onChange={(e) =>
                setDraft((d) =>
                  d
                    ? { ...d, gems: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) }
                    : d,
                )
              }
            />
            <TextArea
              label="Art objects (one per line)"
              rows={4}
              value={draft.art.join("\n")}
              onChange={(e) =>
                setDraft((d) =>
                  d
                    ? { ...d, art: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) }
                    : d,
                )
              }
            />
          </div>

          {flash && (
            <p className="rounded-md border border-forest/40 bg-forest/10 px-3 py-2 text-sm font-semibold text-forest">
              {flash}
            </p>
          )}
          {err && <p className="text-sm text-oxblood">{err}</p>}

          {canWrite && (
            <div className="flex gap-2">
              <Button onClick={save} disabled={busy}>
                Save loot config
              </Button>
              {customised && (
                <Button variant="ghost" onClick={reset} disabled={busy}>
                  Reset to defaults
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
