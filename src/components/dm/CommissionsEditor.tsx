"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import { useFactions } from "@/lib/data/hooks";
import type { Commission, EconomyState } from "@/lib/domain/types";

const inputClass =
  "w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40";
const selectClass =
  "h-8 rounded-md border border-parchment-400 bg-parchment-50 px-1 text-xs text-ink focus:border-brass focus:outline-none";

export function CommissionsEditor({
  economy,
  update,
}: {
  economy: EconomyState;
  update: (patch: Partial<EconomyState>) => void;
}) {
  const { items: factions } = useFactions();
  const commodities = economy.commodities ?? [];
  const markets = economy.markets ?? [];
  const commissions = economy.commissions ?? [];

  const setCommissions = (next: Commission[]) => update({ commissions: next });
  const updateCommission = (id: string, patch: Partial<Commission>) =>
    setCommissions(commissions.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const addCommission = () =>
    setCommissions([
      ...commissions,
      {
        id: newId(),
        kind: "buy",
        factionId: factions[0]?.id,
        commodityId: commodities[0]?.id ?? "",
        qty: 10,
        filled: 0,
        unitPrice: Math.max(1, Math.round(commodities[0]?.baseValue ?? 1)),
        repReward: true,
        active: true,
      },
    ]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-ink-faint">
          Standing orders a faction posts: <b>buy</b> = it pays the party for a
          commodity; <b>sell</b> = it offers one at a fixed price. Fulfilling a
          rep order warms the party&apos;s standing.
        </p>
        <Button size="sm" variant="secondary" onClick={addCommission} disabled={commodities.length === 0}>
          <PlusIcon className="h-4 w-4" /> Add
        </Button>
      </div>

      {commissions.length === 0 ? (
        <p className="text-sm text-ink-faint">No commissions posted.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-xs">
            <thead>
              <tr className="text-left uppercase tracking-wide text-ink-faint">
                <th className="px-1 pb-1 font-semibold">Order</th>
                <th className="px-1 pb-1 font-semibold">Faction</th>
                <th className="px-1 pb-1 font-semibold">Commodity</th>
                <th className="px-1 pb-1 font-semibold">Qty</th>
                <th className="px-1 pb-1 font-semibold">gp/unit</th>
                <th className="px-1 pb-1 font-semibold">At market</th>
                <th className="px-1 pb-1 font-semibold" title="min reputation">Rep</th>
                <th className="px-1 pb-1 font-semibold" title="raise standing when filled">Reward</th>
                <th className="px-1 pb-1 font-semibold">Hide</th>
                <th className="px-1 pb-1 font-semibold">On</th>
                <th className="pb-1" />
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => {
                const filled = c.filled ?? 0;
                const done = filled >= c.qty;
                return (
                  <tr key={c.id} className={cn("border-t border-parchment-400/40", done && "opacity-60")}>
                    <td className="px-1 py-1">
                      <select
                        value={c.kind}
                        onChange={(e) => updateCommission(c.id, { kind: e.target.value as Commission["kind"] })}
                        className={selectClass}
                      >
                        <option value="buy">Wants to buy</option>
                        <option value="sell">Offers to sell</option>
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={c.factionId ?? ""}
                        onChange={(e) => updateCommission(c.id, { factionId: e.target.value || undefined })}
                        className={selectClass}
                      >
                        <option value="">—</option>
                        {factions.map((f) => (
                          <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={c.commodityId}
                        onChange={(e) => updateCommission(c.id, { commodityId: e.target.value })}
                        className={selectClass}
                      >
                        {commodities.map((x) => (
                          <option key={x.id} value={x.id}>{x.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1 whitespace-nowrap">
                      <input
                        type="number"
                        min={1}
                        defaultValue={c.qty}
                        key={`cq-${c.id}-${c.qty}`}
                        onBlur={(e) => updateCommission(c.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                        className={cn(inputClass, "w-14")}
                      />
                      <span className="ml-1 text-[0.6rem] text-ink-faint">{filled}✓</span>
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        defaultValue={c.unitPrice}
                        key={`cp-${c.id}-${c.unitPrice}`}
                        onBlur={(e) => updateCommission(c.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                        className={cn(inputClass, "w-16")}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={c.marketId ?? ""}
                        onChange={(e) => updateCommission(c.id, { marketId: e.target.value || undefined })}
                        className={selectClass}
                      >
                        <option value="">Anywhere</option>
                        {markets.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        min={0}
                        max={5}
                        defaultValue={c.minRep ?? 0}
                        key={`cr-${c.id}-${c.minRep}`}
                        onBlur={(e) => updateCommission(c.id, { minRep: Number(e.target.value) || undefined })}
                        className={cn(inputClass, "w-12")}
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={c.repReward !== false}
                        onChange={(e) => updateCommission(c.id, { repReward: e.target.checked })}
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={!!c.hidden}
                        onChange={(e) => updateCommission(c.id, { hidden: e.target.checked })}
                      />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={c.active !== false}
                        onChange={(e) => updateCommission(c.id, { active: e.target.checked })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <button
                        type="button"
                        onClick={() => setCommissions(commissions.filter((x) => x.id !== c.id))}
                        aria-label="Remove commission"
                        className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
