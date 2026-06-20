"use client";

import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import { useEconomy } from "@/lib/data/hooks";
import { emptyEconomy } from "@shared/economy";
import { MarketEditor } from "@/components/dm/MarketEditor";
import type { Commodity, EconomyConfig } from "@/lib/domain/types";

const CATEGORIES = [
  "metal",
  "ore",
  "wood",
  "cloth",
  "food",
  "gem",
  "reagent",
  "good",
  "other",
];

const inputClass =
  "w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40";

const CONFIG_FIELDS: { key: keyof EconomyConfig; label: string; hint: string; step: number }[] = [
  { key: "elasticity", label: "Elasticity", hint: "how hard supply moves price", step: 0.05 },
  { key: "volatility", label: "Volatility ×", hint: "global swing multiplier", step: 0.05 },
  { key: "priceClamp", label: "Price clamp", hint: "max ± fraction (0.6 = 0.4×–1.6×)", step: 0.05 },
  { key: "defaultBuyMul", label: "Buy ×", hint: "default markup players pay", step: 0.05 },
  { key: "defaultSellMul", label: "Sell ×", hint: "default markdown players get", step: 0.05 },
  { key: "repDiscount", label: "Rep discount", hint: "best discount at max reputation", step: 0.05 },
  { key: "haggleMax", label: "Haggle max", hint: "best fraction a perfect haggle saves", step: 0.05 },
  { key: "restockRate", label: "Restock rate", hint: "fraction toward baseline per tick", step: 0.05 },
];

export function EconomyConsole() {
  const { value: economy, update, loading } = useEconomy();

  if (!economy) {
    return (
      <Panel title="Trading Economy" eyebrow="The Ledger">
        <p className="text-sm text-ink-faint">
          {loading ? "Loading the ledger…" : "No economy data."}
        </p>
      </Panel>
    );
  }

  const config = economy.config;
  const commodities = economy.commodities ?? [];

  const setCommodities = (next: Commodity[]) => void update({ commodities: next });
  const updateCommodity = (id: string, patch: Partial<Commodity>) =>
    setCommodities(commodities.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const setConfig = (patch: Partial<EconomyConfig>) =>
    void update({ config: { ...config, ...patch } });

  const addCommodity = () =>
    setCommodities([
      ...commodities,
      { id: newId(), name: "New commodity", category: "good", baseValue: 1, tier: 1, volatility: 0.5 },
    ]);

  if (!economy.enabled) {
    return (
      <Panel title="Trading Economy" eyebrow="The Ledger">
        <p className="text-sm text-ink-soft">
          A configurable, dynamic supply &amp; demand economy: commodities, faction
          &amp; location markets, resource nodes, and player trading. Turn it on to
          start editing the catalog and rules.
        </p>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => update({ enabled: true })}>Enable the economy</Button>
          {commodities.length === 0 && (
            <Button
              variant="secondary"
              onClick={() => update({ ...emptyEconomy(), enabled: true })}
            >
              Enable &amp; seed catalog
            </Button>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <Panel title="Trading Economy" eyebrow="The Ledger">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="forest">Enabled</Badge>
          <span className="text-xs text-ink-faint">
            Day {economy.day ?? 1} · sim {economy.sim ?? "paused"}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              if (confirm("Turn the economy off? (config is kept)")) update({ enabled: false });
            }}
          >
            Disable
          </Button>
        </div>
      </Panel>

      {/* Global knobs */}
      <Panel title="Economy knobs" eyebrow="Global rules">
        <p className="mb-3 text-xs text-ink-faint">
          The model that turns supply, demand, reputation, and events into prices.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CONFIG_FIELDS.map((f) => (
            <label key={f.key} className="block text-xs text-ink-soft">
              <span className="font-semibold text-ink">{f.label}</span>
              <input
                type="number"
                step={f.step}
                defaultValue={config[f.key]}
                key={`${f.key}-${config[f.key]}`}
                onBlur={(e) => setConfig({ [f.key]: Number(e.target.value) } as Partial<EconomyConfig>)}
                className={cn(inputClass, "mt-1")}
              />
              <span className="mt-0.5 block text-[0.65rem] text-ink-faint">{f.hint}</span>
            </label>
          ))}
        </div>
      </Panel>

      {/* Markets */}
      <Panel title="Markets" eyebrow="Where trade happens">
        <p className="mb-3 text-xs text-ink-faint">
          A global market sets the baseline; faction and location markets layer
          their own buy/sell margins, stock, and reputation gates on top. Buy /
          sell previews use each market&apos;s standing.
        </p>
        <MarketEditor economy={economy} update={update} />
      </Panel>

      {/* Commodity catalog */}
      <Panel title="Commodity catalog" eyebrow="Materials & goods">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-ink-faint">
            Raw materials, metals, and trade goods — the things markets stock and
            resource nodes produce.
          </p>
          <Button size="sm" variant="secondary" onClick={addCommodity}>
            <PlusIcon className="h-4 w-4" /> Add
          </Button>
        </div>

        {commodities.length === 0 ? (
          <p className="text-sm text-ink-faint">No commodities yet — add some.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="text-left text-[0.65rem] uppercase tracking-wide text-ink-faint">
                  <th className="px-1 pb-1 font-semibold">Name</th>
                  <th className="px-1 pb-1 font-semibold">Category</th>
                  <th className="px-1 pb-1 font-semibold">Base (gp)</th>
                  <th className="px-1 pb-1 font-semibold">Tier</th>
                  <th className="px-1 pb-1 font-semibold">Weight</th>
                  <th className="px-1 pb-1 font-semibold">Volatility</th>
                  <th className="px-1 pb-1 font-semibold">Unit</th>
                  <th className="pb-1" />
                </tr>
              </thead>
              <tbody>
                {commodities.map((c) => (
                  <tr key={c.id} className="border-t border-parchment-400/40">
                    <td className="px-1 py-1">
                      <input
                        defaultValue={c.name}
                        key={`n-${c.id}`}
                        onBlur={(e) => updateCommodity(c.id, { name: e.target.value })}
                        className={cn(inputClass, "min-w-32 font-semibold")}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={c.category}
                        onChange={(e) => updateCommodity(c.id, { category: e.target.value })}
                        className="h-8 rounded-md border border-parchment-400 bg-parchment-50 px-1 text-xs text-ink focus:border-brass focus:outline-none"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        step={0.1}
                        defaultValue={c.baseValue}
                        key={`v-${c.id}-${c.baseValue}`}
                        onBlur={(e) => updateCommodity(c.id, { baseValue: Number(e.target.value) || 0 })}
                        className={cn(inputClass, "w-20")}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={c.tier ?? 1}
                        onChange={(e) =>
                          updateCommodity(c.id, { tier: Number(e.target.value) as Commodity["tier"] })
                        }
                        className="h-8 rounded-md border border-parchment-400 bg-parchment-50 px-1 text-xs text-ink focus:border-brass focus:outline-none"
                      >
                        {[0, 1, 2, 3, 4, 5].map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        step={0.5}
                        defaultValue={c.weight ?? 0}
                        key={`w-${c.id}-${c.weight}`}
                        onBlur={(e) => updateCommodity(c.id, { weight: Number(e.target.value) || 0 })}
                        className={cn(inputClass, "w-16")}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        step={0.05}
                        min={0}
                        max={1}
                        defaultValue={c.volatility ?? 0.5}
                        key={`vo-${c.id}-${c.volatility}`}
                        onBlur={(e) => updateCommodity(c.id, { volatility: Number(e.target.value) || 0 })}
                        className={cn(inputClass, "w-16")}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        defaultValue={c.unit ?? ""}
                        key={`u-${c.id}`}
                        onBlur={(e) => updateCommodity(c.id, { unit: e.target.value || undefined })}
                        className={cn(inputClass, "w-20")}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <button
                        type="button"
                        onClick={() => setCommodities(commodities.filter((x) => x.id !== c.id))}
                        aria-label="Remove"
                        className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
