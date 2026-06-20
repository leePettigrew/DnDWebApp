"use client";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import { useFactions } from "@/lib/data/hooks";
import type {
  EconomyState,
  FactionEconomy,
  FactionPolicy,
  FactionPolicyKind,
  TradeRoute,
} from "@/lib/domain/types";

const inputClass =
  "w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40";
const selectClass =
  "h-8 rounded-md border border-parchment-400 bg-parchment-50 px-1 text-xs text-ink focus:border-brass focus:outline-none";

const CATEGORIES = ["metal", "ore", "wood", "cloth", "food", "gem", "reagent", "good", "other"];

const POLICY_KINDS: { kind: FactionPolicyKind; label: string; mul: number; tone: "forest" | "brass" | "oxblood" }[] = [
  { kind: "pact", label: "Pact", mul: 0.9, tone: "forest" },
  { kind: "tariff", label: "Tariff", mul: 1.2, tone: "brass" },
  { kind: "embargo", label: "Embargo", mul: 1.5, tone: "oxblood" },
];

export function FactionEconomyEditor({
  economy,
  update,
}: {
  economy: EconomyState;
  update: (patch: Partial<EconomyState>) => void;
}) {
  const { items: factions } = useFactions();
  const markets = economy.markets ?? [];
  const commodities = economy.commodities ?? [];
  const routes = economy.routes ?? [];
  const policies = economy.policies ?? [];
  const stockpiles = economy.stockpiles ?? [];

  const factionName = (id?: string) => factions.find((f) => f.id === id)?.name ?? "—";
  const commodityName = (id: string) => commodities.find((c) => c.id === id)?.name ?? id;

  // --- routes ---
  const setRoutes = (next: TradeRoute[]) => update({ routes: next });
  const updateRoute = (id: string, patch: Partial<TradeRoute>) =>
    setRoutes(routes.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRoute = () =>
    setRoutes([
      ...routes,
      {
        id: newId(),
        name: "New route",
        commodityId: commodities[0]?.id ?? "",
        fromMarketId: markets[0]?.id ?? "",
        toMarketId: markets[1]?.id ?? markets[0]?.id ?? "",
        volume: 5,
        active: true,
      },
    ]);

  // --- policies ---
  const setPolicies = (next: FactionPolicy[]) => update({ policies: next });
  const updatePolicy = (id: string, patch: Partial<FactionPolicy>) =>
    setPolicies(policies.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const addPolicy = () =>
    setPolicies([
      ...policies,
      {
        id: newId(),
        kind: "tariff",
        factionId: factions[0]?.id ?? "",
        priceMul: 1.2,
        active: true,
      },
    ]);

  // --- stockpiles ---
  const setStockpiles = (next: FactionEconomy[]) => update({ stockpiles: next });
  const updateStockpile = (factionId: string, patch: Partial<FactionEconomy>) =>
    setStockpiles(stockpiles.map((s) => (s.factionId === factionId ? { ...s, ...patch } : s)));
  const addStockpileFaction = (factionId: string) => {
    if (!factionId || stockpiles.some((s) => s.factionId === factionId)) return;
    setStockpiles([...stockpiles, { factionId, stockpile: [], treasury: 0, bufferRate: 0.25 }]);
  };
  const ungrouped = factions.filter((f) => !stockpiles.some((s) => s.factionId === f.id));

  return (
    <div className="space-y-6">
      {/* Trade routes */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-ink">Trade routes</h3>
          <Button size="sm" variant="secondary" onClick={addRoute} disabled={markets.length < 2}>
            <PlusIcon className="h-4 w-4" /> Route
          </Button>
        </div>
        {markets.length < 2 ? (
          <p className="text-xs text-ink-faint">Add at least two markets to run caravans between them.</p>
        ) : routes.length === 0 ? (
          <p className="text-xs text-ink-faint">No routes. A caravan moves a commodity from one market to another each day.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-ink-faint">
                  <th className="px-1 pb-1 font-semibold">Name</th>
                  <th className="px-1 pb-1 font-semibold">Carries</th>
                  <th className="px-1 pb-1 font-semibold">From</th>
                  <th className="px-1 pb-1 font-semibold">To</th>
                  <th className="px-1 pb-1 font-semibold">/ day</th>
                  <th className="px-1 pb-1 font-semibold">On</th>
                  <th className="pb-1" />
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={r.id} className="border-t border-parchment-400/40">
                    <td className="px-1 py-1">
                      <input
                        defaultValue={r.name ?? ""}
                        key={`rn-${r.id}`}
                        onBlur={(e) => updateRoute(r.id, { name: e.target.value })}
                        className={cn(inputClass, "min-w-24")}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <select value={r.commodityId} onChange={(e) => updateRoute(r.id, { commodityId: e.target.value })} className={selectClass}>
                        {commodities.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <select value={r.fromMarketId} onChange={(e) => updateRoute(r.id, { fromMarketId: e.target.value })} className={selectClass}>
                        {markets.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <select value={r.toMarketId} onChange={(e) => updateRoute(r.id, { toMarketId: e.target.value })} className={selectClass}>
                        {markets.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        defaultValue={r.volume}
                        key={`rv-${r.id}-${r.volume}`}
                        onBlur={(e) => updateRoute(r.id, { volume: Math.max(0, Number(e.target.value) || 0) })}
                        className={cn(inputClass, "w-16")}
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <input type="checkbox" checked={r.active !== false} onChange={(e) => updateRoute(r.id, { active: e.target.checked })} />
                    </td>
                    <td className="px-1 py-1">
                      <button type="button" onClick={() => setRoutes(routes.filter((x) => x.id !== r.id))} aria-label="Remove route" className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Policies */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-ink">Pacts, tariffs &amp; embargoes</h3>
          <Button size="sm" variant="secondary" onClick={addPolicy} disabled={factions.length === 0}>
            <PlusIcon className="h-4 w-4" /> Policy
          </Button>
        </div>
        {factions.length === 0 ? (
          <p className="text-xs text-ink-faint">Create factions (in the World) to set economic policy.</p>
        ) : policies.length === 0 ? (
          <p className="text-xs text-ink-faint">
            No policies. A pact discounts a faction&apos;s markets, a tariff surcharges them, an embargo blocks caravans with another faction and bumps scarcity.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-xs">
              <thead>
                <tr className="text-left uppercase tracking-wide text-ink-faint">
                  <th className="px-1 pb-1 font-semibold">Kind</th>
                  <th className="px-1 pb-1 font-semibold">Faction</th>
                  <th className="px-1 pb-1 font-semibold">With</th>
                  <th className="px-1 pb-1 font-semibold">Scope</th>
                  <th className="px-1 pb-1 font-semibold">Price ×</th>
                  <th className="px-1 pb-1 font-semibold">On</th>
                  <th className="pb-1" />
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id} className="border-t border-parchment-400/40">
                    <td className="px-1 py-1">
                      <select
                        value={p.kind}
                        onChange={(e) => {
                          const kind = e.target.value as FactionPolicyKind;
                          const def = POLICY_KINDS.find((k) => k.kind === kind)!;
                          updatePolicy(p.id, { kind, priceMul: def.mul });
                        }}
                        className={selectClass}
                      >
                        {POLICY_KINDS.map((k) => (
                          <option key={k.kind} value={k.kind}>{k.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <select value={p.factionId} onChange={(e) => updatePolicy(p.id, { factionId: e.target.value })} className={selectClass}>
                        {factions.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <select value={p.targetFactionId ?? ""} onChange={(e) => updatePolicy(p.id, { targetFactionId: e.target.value || undefined })} className={selectClass}>
                        <option value="">—</option>
                        {factions.filter((f) => f.id !== p.factionId).map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <select value={p.scope ?? ""} onChange={(e) => updatePolicy(p.id, { scope: e.target.value || undefined })} className={selectClass}>
                        <option value="">All goods</option>
                        <optgroup label="Category">
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Commodity">
                          {commodities.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </optgroup>
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        step={0.05}
                        min={0}
                        defaultValue={p.priceMul ?? 1}
                        key={`pm-${p.id}-${p.priceMul}`}
                        onBlur={(e) => updatePolicy(p.id, { priceMul: Number(e.target.value) || 1 })}
                        className={cn(inputClass, "w-16")}
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <input type="checkbox" checked={p.active !== false} onChange={(e) => updatePolicy(p.id, { active: e.target.checked })} />
                    </td>
                    <td className="px-1 py-1">
                      <button type="button" onClick={() => setPolicies(policies.filter((x) => x.id !== p.id))} aria-label="Remove policy" className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stockpiles */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold text-ink">Faction stockpiles</h3>
          {ungrouped.length > 0 && (
            <select
              value=""
              onChange={(e) => e.target.value && addStockpileFaction(e.target.value)}
              className={selectClass}
            >
              <option value="">+ Track a faction…</option>
              {ungrouped.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          )}
        </div>
        {stockpiles.length === 0 ? (
          <p className="text-xs text-ink-faint">
            No faction reserves yet. A tracked faction skims its markets&apos; surplus into a stockpile and releases it in shortage.
          </p>
        ) : (
          <div className="space-y-3">
            {stockpiles.map((fe) => {
              const available = commodities.filter((c) => !fe.stockpile.some((s) => s.commodityId === c.id));
              return (
                <div key={fe.factionId} className="rounded-lg border border-parchment-400/70 bg-parchment-50/60 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone="arcane">{factionName(fe.factionId)}</Badge>
                    <label className="text-xs text-ink-soft">
                      Treasury (gp)
                      <input
                        type="number"
                        min={0}
                        defaultValue={fe.treasury ?? 0}
                        key={`tr-${fe.factionId}-${fe.treasury}`}
                        onBlur={(e) => updateStockpile(fe.factionId, { treasury: Math.max(0, Number(e.target.value) || 0) })}
                        className={cn(inputClass, "mt-0.5 w-24")}
                      />
                    </label>
                    <label className="text-xs text-ink-soft">
                      Buffer rate
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        defaultValue={fe.bufferRate ?? 0.25}
                        key={`br-${fe.factionId}-${fe.bufferRate}`}
                        onBlur={(e) => updateStockpile(fe.factionId, { bufferRate: Math.max(0, Math.min(1, Number(e.target.value) || 0)) })}
                        className={cn(inputClass, "mt-0.5 w-20")}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setStockpiles(stockpiles.filter((s) => s.factionId !== fe.factionId))}
                      aria-label="Stop tracking faction"
                      className="ml-auto rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {fe.stockpile.length === 0 ? (
                      <span className="text-xs text-ink-faint">Empty reserve.</span>
                    ) : (
                      fe.stockpile.map((s) => (
                        <span key={s.commodityId} className="inline-flex items-center gap-1 rounded-full border border-parchment-400 bg-parchment-100 px-2 py-0.5 text-xs">
                          {commodityName(s.commodityId)}
                          <input
                            type="number"
                            min={0}
                            defaultValue={s.qty}
                            key={`sq-${fe.factionId}-${s.commodityId}-${s.qty}`}
                            onBlur={(e) =>
                              updateStockpile(fe.factionId, {
                                stockpile: fe.stockpile.map((x) =>
                                  x.commodityId === s.commodityId
                                    ? { ...x, qty: Math.max(0, Number(e.target.value) || 0) }
                                    : x,
                                ),
                              })
                            }
                            className="w-14 rounded border border-parchment-400 bg-parchment-50 px-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateStockpile(fe.factionId, {
                                stockpile: fe.stockpile.filter((x) => x.commodityId !== s.commodityId),
                              })
                            }
                            aria-label="Remove"
                            className="text-ink-faint hover:text-oxblood"
                          >
                            ×
                          </button>
                        </span>
                      ))
                    )}
                    {available.length > 0 && (
                      <select
                        value=""
                        onChange={(e) =>
                          e.target.value &&
                          updateStockpile(fe.factionId, {
                            stockpile: [...fe.stockpile, { commodityId: e.target.value, qty: 0 }],
                          })
                        }
                        className={selectClass}
                      >
                        <option value="">+ reserve…</option>
                        {available.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
