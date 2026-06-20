"use client";

import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import { useEconomy } from "@/lib/data/hooks";
import { emptyEconomy } from "@shared/economy";
import { revertTransaction } from "@shared/economy-trade";
import { tickEconomy } from "@shared/economy-sim";
import { MarketEditor } from "@/components/dm/MarketEditor";
import type { Commodity, EconomyConfig, ResourceNode } from "@/lib/domain/types";

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
  const { value: economy, update, set, loading } = useEconomy();

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
  const markets = economy.markets ?? [];
  const nodes = economy.nodes ?? [];

  const setCommodities = (next: Commodity[]) => void update({ commodities: next });
  const updateCommodity = (id: string, patch: Partial<Commodity>) =>
    setCommodities(commodities.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const setConfig = (patch: Partial<EconomyConfig>) =>
    void update({ config: { ...config, ...patch } });

  const setNodes = (next: ResourceNode[]) => void update({ nodes: next });
  const updateNode = (id: string, patch: Partial<ResourceNode>) =>
    setNodes(nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  const addNode = () =>
    setNodes([
      ...nodes,
      {
        id: newId(),
        name: "New node",
        commodityId: commodities[0]?.id ?? "",
        rate: 5,
        active: true,
      },
    ]);

  const step = () => void set(tickEconomy(economy));

  const addCommodity = () =>
    setCommodities([
      ...commodities,
      { id: newId(), name: "New commodity", category: "good", baseValue: 1, tier: 1, volatility: 0.5 },
    ]);

  const log = economy.log ?? [];
  const trades = log.filter((t) => t.action === "buy" || t.action === "sell");
  const latest = trades.find((t) => !t.reverted);
  const revert = (txId: string) => {
    const next = revertTransaction(economy, txId, { actorName: "the DM" });
    if ("error" in next) return;
    update({ markets: next.markets, log: next.log });
  };

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

      {/* Simulation */}
      <Panel title="Simulation" eyebrow="Play the market">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={economy.sim === "live" ? "forest" : "neutral"}>
            {economy.sim === "live" ? "● Live" : "Paused"}
          </Badge>
          <span className="text-sm text-ink">
            Day <span className="font-mono font-semibold">{economy.day ?? 1}</span>
          </span>
          {economy.sim === "live" ? (
            <Button size="sm" variant="secondary" onClick={() => update({ sim: "paused" })}>
              Pause
            </Button>
          ) : (
            <Button size="sm" onClick={() => update({ sim: "live" })}>
              Play
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={step}>
            Step a day
          </Button>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-soft">
            Seconds / day
            <input
              type="number"
              min={2}
              step={1}
              defaultValue={economy.tickSeconds ?? 60}
              key={`ts-${economy.tickSeconds}`}
              onBlur={(e) =>
                update({ tickSeconds: Math.max(2, Math.floor(Number(e.target.value) || 60)) })
              }
              className={cn(inputClass, "w-20")}
            />
          </label>
        </div>
        <p className="mt-2 text-[0.65rem] text-ink-faint">
          Each day, markets restock toward their baseline and resource nodes add
          production. “Live” advances automatically while your DM window is open.
        </p>
      </Panel>

      {/* Ledger / activity */}
      <Panel
        title="The Ledger"
        eyebrow="Trade activity"
        action={trades.length > 0 ? <Badge tone="brass">{trades.length}</Badge> : undefined}
      >
        {latest && (
          <div className="mb-3 rounded-lg border border-brass/40 bg-brass/10 px-3 py-2 text-sm text-ink">
            <span className="font-semibold">Latest:</span>{" "}
            {latest.actorName ?? "Someone"} {latest.action === "buy" ? "bought" : "sold"}{" "}
            {latest.qty} {latest.goodName} {latest.action === "buy" ? "from" : "to"}{" "}
            {latest.marketName} for {latest.total}gp.
          </div>
        )}
        {trades.length === 0 ? (
          <p className="text-sm text-ink-faint">
            No trades yet. Player buys and sells appear here — each one revertible.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-ink-faint">
                  <th className="px-1 pb-1 font-semibold">When</th>
                  <th className="px-1 pb-1 font-semibold">Who</th>
                  <th className="px-1 pb-1 font-semibold">Action</th>
                  <th className="px-1 pb-1 font-semibold">Good</th>
                  <th className="px-1 pb-1 font-semibold">Market</th>
                  <th className="px-1 pb-1 font-semibold">Total</th>
                  <th className="pb-1" />
                </tr>
              </thead>
              <tbody>
                {log.slice(0, 60).map((t) => (
                  <tr
                    key={t.id}
                    className={cn(
                      "border-t border-parchment-400/40",
                      t.action === "revert" && "text-ink-faint",
                      t.reverted && "line-through opacity-60",
                    )}
                  >
                    <td className="whitespace-nowrap px-1 py-1 text-ink-faint">
                      {new Date(t.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-1 py-1">{t.actorName ?? "—"}</td>
                    <td className="px-1 py-1">
                      {t.action === "revert" ? (
                        <span className="text-arcane">revert</span>
                      ) : (
                        <span className={t.action === "buy" ? "text-forest" : "text-oxblood"}>
                          {t.action}
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-1">
                      {t.qty ?? ""} {t.goodName}
                    </td>
                    <td className="px-1 py-1 text-ink-soft">{t.marketName}</td>
                    <td className="px-1 py-1 font-mono">{t.total}gp</td>
                    <td className="px-1 py-1 text-right">
                      {(t.action === "buy" || t.action === "sell") && !t.reverted && (
                        <button
                          type="button"
                          onClick={() => revert(t.id)}
                          className="rounded-md border border-oxblood/40 px-2 py-0.5 text-[0.7rem] font-semibold text-oxblood hover:bg-oxblood hover:text-parchment-50"
                        >
                          Revert
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[0.65rem] text-ink-faint">
              Reverting restores the market&apos;s stock and flags the sale. Settle any
              coin or goods with the player on their sheet.
            </p>
          </div>
        )}
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

      {/* Resource nodes */}
      <Panel title="Resource nodes" eyebrow="Where supply is made">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-ink-faint">
            Mines, farms, and forests that add a commodity to a market every
            simulated day — the supply side of the world.
          </p>
          <Button size="sm" variant="secondary" onClick={addNode}>
            <PlusIcon className="h-4 w-4" /> Add
          </Button>
        </div>
        {nodes.length === 0 ? (
          <p className="text-sm text-ink-faint">
            No resource nodes yet. Add a mine or farm to feed a market.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead>
                <tr className="text-left text-[0.65rem] uppercase tracking-wide text-ink-faint">
                  <th className="px-1 pb-1 font-semibold">Name</th>
                  <th className="px-1 pb-1 font-semibold">Produces</th>
                  <th className="px-1 pb-1 font-semibold">/ day</th>
                  <th className="px-1 pb-1 font-semibold">Into market</th>
                  <th className="px-1 pb-1 font-semibold">Location</th>
                  <th className="px-1 pb-1 font-semibold">On</th>
                  <th className="pb-1" />
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => (
                  <tr key={n.id} className="border-t border-parchment-400/40">
                    <td className="px-1 py-1">
                      <input
                        defaultValue={n.name}
                        key={`nn-${n.id}`}
                        onBlur={(e) => updateNode(n.id, { name: e.target.value })}
                        className={cn(inputClass, "min-w-28 font-semibold")}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={n.commodityId}
                        onChange={(e) => updateNode(n.id, { commodityId: e.target.value })}
                        className="h-8 rounded-md border border-parchment-400 bg-parchment-50 px-1 text-xs text-ink focus:border-brass focus:outline-none"
                      >
                        {commodities.length === 0 && <option value="">—</option>}
                        {commodities.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        defaultValue={n.rate}
                        key={`nr-${n.id}-${n.rate}`}
                        onBlur={(e) => updateNode(n.id, { rate: Math.max(0, Number(e.target.value) || 0) })}
                        className={cn(inputClass, "w-16")}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={n.marketId ?? ""}
                        onChange={(e) => updateNode(n.id, { marketId: e.target.value || undefined })}
                        className="h-8 rounded-md border border-parchment-400 bg-parchment-50 px-1 text-xs text-ink focus:border-brass focus:outline-none"
                      >
                        <option value="">Global market</option>
                        {markets.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input
                        defaultValue={n.location ?? ""}
                        key={`nl-${n.id}`}
                        placeholder="e.g. Ironreach Hills"
                        onBlur={(e) => updateNode(n.id, { location: e.target.value || undefined })}
                        className={cn(inputClass, "min-w-28")}
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={n.active !== false}
                        onChange={(e) => updateNode(n.id, { active: e.target.checked })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <button
                        type="button"
                        onClick={() => setNodes(nodes.filter((x) => x.id !== n.id))}
                        aria-label="Remove node"
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
