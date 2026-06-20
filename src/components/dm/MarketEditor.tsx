"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import { useFactions } from "@/lib/data/hooks";
import { quoteCommodityGood, standingToRep } from "@shared/economy-pricing";
import type {
  EconomyState,
  Market,
  MarketGood,
} from "@/lib/domain/types";

const inputClass =
  "w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40";
const selectClass =
  "h-8 rounded-md border border-parchment-400 bg-parchment-50 px-1 text-xs text-ink focus:border-brass focus:outline-none";

const KIND_LABEL: Record<Market["kind"], string> = {
  global: "Global",
  faction: "Faction",
  location: "Location",
};

export function MarketEditor({
  economy,
  update,
}: {
  economy: EconomyState;
  update: (patch: Partial<EconomyState>) => void;
}) {
  const { items: factions } = useFactions();
  const markets = economy.markets ?? [];
  const commodities = economy.commodities ?? [];

  const [newKind, setNewKind] = useState<Market["kind"]>("global");
  const [newFaction, setNewFaction] = useState("");
  const [newName, setNewName] = useState("");

  const setMarkets = (next: Market[]) => update({ markets: next });
  const updateMarket = (id: string, patch: Partial<Market>) =>
    setMarkets(markets.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const removeMarket = (id: string) => setMarkets(markets.filter((m) => m.id !== id));

  const updateGood = (mId: string, ref: string, patch: Partial<MarketGood>) => {
    const m = markets.find((x) => x.id === mId);
    if (!m) return;
    updateMarket(mId, {
      goods: m.goods.map((g) => (g.ref === ref ? { ...g, ...patch } : g)),
    });
  };
  const addGood = (mId: string, ref: string) => {
    const m = markets.find((x) => x.id === mId);
    if (!m || m.goods.some((g) => g.ref === ref)) return;
    updateMarket(mId, {
      goods: [...m.goods, { ref, kind: "commodity", stock: 20, baseStock: 20, priceMul: 1 }],
    });
  };
  const removeGood = (mId: string, ref: string) => {
    const m = markets.find((x) => x.id === mId);
    if (!m) return;
    updateMarket(mId, { goods: m.goods.filter((g) => g.ref !== ref) });
  };

  const addMarket = () => {
    const faction = factions.find((f) => f.id === newFaction);
    const name =
      newName.trim() ||
      (newKind === "faction" && faction ? `${faction.name} market` : `New ${newKind} market`);
    const market: Market = {
      id: newId(),
      name,
      kind: newKind,
      factionId: newKind === "faction" ? newFaction || undefined : undefined,
      buyMul: economy.config.defaultBuyMul,
      sellMul: economy.config.defaultSellMul,
      goods: [],
    };
    setMarkets([...markets, market]);
    setNewName("");
  };

  return (
    <div className="space-y-4">
      {/* Add market */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-parchment-400/60 bg-parchment-100/50 p-3">
        <label className="text-xs text-ink-soft">
          <span className="mb-1 block font-semibold text-ink">Kind</span>
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as Market["kind"])}
            className={selectClass}
          >
            <option value="global">Global</option>
            <option value="faction">Faction</option>
            <option value="location">Location</option>
          </select>
        </label>
        {newKind === "faction" && (
          <label className="text-xs text-ink-soft">
            <span className="mb-1 block font-semibold text-ink">Faction</span>
            <select
              value={newFaction}
              onChange={(e) => setNewFaction(e.target.value)}
              className={selectClass}
            >
              <option value="">— pick —</option>
              {factions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex-1 text-xs text-ink-soft">
          <span className="mb-1 block font-semibold text-ink">Name (optional)</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. The Ironhand Exchange"
            className={inputClass}
          />
        </label>
        <Button size="sm" variant="secondary" onClick={addMarket}>
          <PlusIcon className="h-4 w-4" /> Add market
        </Button>
      </div>

      {markets.length === 0 ? (
        <p className="text-sm text-ink-faint">
          No markets yet. Add a global market for a baseline, then faction and
          location markets with their own prices.
        </p>
      ) : (
        markets.map((m) => {
          const faction = factions.find((f) => f.id === m.factionId);
          const previewRep =
            m.kind === "faction" ? standingToRep(faction?.standing) : 2;
          const available = commodities.filter(
            (c) => !m.goods.some((g) => g.ref === c.id),
          );
          return (
            <div
              key={m.id}
              className="rounded-lg border border-parchment-400/70 bg-parchment-50/60 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={m.kind === "global" ? "brass" : m.kind === "faction" ? "arcane" : "forest"}>
                  {KIND_LABEL[m.kind]}
                </Badge>
                <input
                  defaultValue={m.name}
                  key={`mn-${m.id}`}
                  onBlur={(e) => updateMarket(m.id, { name: e.target.value })}
                  className={cn(inputClass, "max-w-xs flex-1 font-semibold")}
                />
                {faction && (
                  <span className="text-xs text-ink-faint">
                    {faction.name} · {faction.standing}
                  </span>
                )}
                <label className="ml-auto flex items-center gap-1 text-xs text-ink-soft">
                  <input
                    type="checkbox"
                    checked={!!m.hidden}
                    onChange={(e) => updateMarket(m.id, { hidden: e.target.checked })}
                  />
                  Hidden
                </label>
                <button
                  type="button"
                  onClick={() => removeMarket(m.id)}
                  aria-label="Remove market"
                  className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-2 sm:max-w-md">
                <label className="text-[0.7rem] text-ink-soft">
                  Buy ×
                  <input
                    type="number"
                    step={0.05}
                    defaultValue={m.buyMul}
                    key={`mb-${m.id}-${m.buyMul}`}
                    onBlur={(e) => updateMarket(m.id, { buyMul: Number(e.target.value) || 0 })}
                    className={cn(inputClass, "mt-0.5")}
                  />
                </label>
                <label className="text-[0.7rem] text-ink-soft">
                  Sell ×
                  <input
                    type="number"
                    step={0.05}
                    defaultValue={m.sellMul}
                    key={`ms-${m.id}-${m.sellMul}`}
                    onBlur={(e) => updateMarket(m.id, { sellMul: Number(e.target.value) || 0 })}
                    className={cn(inputClass, "mt-0.5")}
                  />
                </label>
                <label className="text-[0.7rem] text-ink-soft">
                  Min rep
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={1}
                    defaultValue={m.minRep ?? 0}
                    key={`mr-${m.id}-${m.minRep}`}
                    onBlur={(e) =>
                      updateMarket(m.id, { minRep: Number(e.target.value) || undefined })
                    }
                    className={cn(inputClass, "mt-0.5")}
                  />
                </label>
              </div>

              {/* Goods */}
              <div className="mt-3">
                {m.goods.length === 0 ? (
                  <p className="text-xs text-ink-faint">No stock yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[40rem] text-xs">
                      <thead>
                        <tr className="text-left uppercase tracking-wide text-ink-faint">
                          <th className="px-1 pb-1 font-semibold">Good</th>
                          <th className="px-1 pb-1 font-semibold">Stock</th>
                          <th className="px-1 pb-1 font-semibold">Baseline</th>
                          <th className="px-1 pb-1 font-semibold">Price ×</th>
                          <th className="px-1 pb-1 font-semibold">Min rep</th>
                          <th className="px-1 pb-1 font-semibold">Buy / Sell</th>
                          <th className="pb-1" />
                        </tr>
                      </thead>
                      <tbody>
                        {m.goods.map((g) => {
                          const c = commodities.find((x) => x.id === g.ref);
                          const q = quoteCommodityGood(economy, m, g, previewRep);
                          return (
                            <tr key={g.ref} className="border-t border-parchment-400/40">
                              <td className="px-1 py-1 font-semibold text-ink">
                                {c?.name ?? g.ref}
                                {c?.unit && (
                                  <span className="ml-1 font-normal text-ink-faint">/{c.unit}</span>
                                )}
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  type="number"
                                  step={1}
                                  min={0}
                                  defaultValue={g.stock}
                                  key={`gs-${m.id}-${g.ref}-${g.stock}`}
                                  onBlur={(e) =>
                                    updateGood(m.id, g.ref, { stock: Number(e.target.value) || 0 })
                                  }
                                  className={cn(inputClass, "w-16")}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  type="number"
                                  step={1}
                                  min={0}
                                  defaultValue={g.baseStock ?? g.stock}
                                  key={`gb-${m.id}-${g.ref}-${g.baseStock}`}
                                  onBlur={(e) =>
                                    updateGood(m.id, g.ref, { baseStock: Number(e.target.value) || 0 })
                                  }
                                  className={cn(inputClass, "w-16")}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  type="number"
                                  step={0.05}
                                  defaultValue={g.priceMul ?? 1}
                                  key={`gp-${m.id}-${g.ref}-${g.priceMul}`}
                                  onBlur={(e) =>
                                    updateGood(m.id, g.ref, { priceMul: Number(e.target.value) || 1 })
                                  }
                                  className={cn(inputClass, "w-16")}
                                />
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={5}
                                  step={1}
                                  defaultValue={g.minRep ?? 0}
                                  key={`gr-${m.id}-${g.ref}-${g.minRep}`}
                                  onBlur={(e) =>
                                    updateGood(m.id, g.ref, {
                                      minRep: Number(e.target.value) || undefined,
                                    })
                                  }
                                  className={cn(inputClass, "w-14")}
                                />
                              </td>
                              <td className="px-1 py-1 whitespace-nowrap font-mono text-ink-soft">
                                {q ? (
                                  <>
                                    <span className="text-forest">{q.buy}</span>
                                    {" / "}
                                    <span className="text-oxblood">{q.sell}</span>
                                    {q.supplyMul !== 1 && (
                                      <span className="ml-1 text-[0.65rem] text-ink-faint">
                                        ({q.supplyMul > 1 ? "▲" : "▼"}
                                        {Math.round(Math.abs(q.supplyMul - 1) * 100)}%)
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-1 py-1">
                                <button
                                  type="button"
                                  onClick={() => removeGood(m.id, g.ref)}
                                  aria-label="Remove good"
                                  className="rounded-md p-1 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                                >
                                  <TrashIcon className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {available.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) addGood(m.id, e.target.value);
                      }}
                      className={selectClass}
                    >
                      <option value="">+ Add a commodity…</option>
                      {available.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
