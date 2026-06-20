"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import type { EconomyState, Service } from "@/lib/domain/types";

const inputClass =
  "w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40";
const selectClass =
  "h-8 rounded-md border border-parchment-400 bg-parchment-50 px-1 text-xs text-ink focus:border-brass focus:outline-none";

const SERVICE_CATEGORIES = ["lodging", "healing", "passage", "labor", "training", "other"];

export function ServicesEditor({
  economy,
  update,
}: {
  economy: EconomyState;
  update: (patch: Partial<EconomyState>) => void;
}) {
  const markets = economy.markets ?? [];
  const services = economy.services ?? [];

  const setServices = (next: Service[]) => update({ services: next });
  const updateService = (id: string, patch: Partial<Service>) =>
    setServices(services.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const addService = () =>
    setServices([
      ...services,
      {
        id: newId(),
        name: "New service",
        price: 5,
        category: "lodging",
        marketId: markets[0]?.id ?? "",
      },
    ]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-ink-faint">
          A night&apos;s lodging, a healer&apos;s touch, passage downriver — flat-price
          offerings players can hire at a market.
        </p>
        <Button size="sm" variant="secondary" onClick={addService} disabled={markets.length === 0}>
          <PlusIcon className="h-4 w-4" /> Add
        </Button>
      </div>

      {markets.length === 0 ? (
        <p className="text-sm text-ink-faint">Add a market first — services are offered at one.</p>
      ) : services.length === 0 ? (
        <p className="text-sm text-ink-faint">No services yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="text-left text-[0.65rem] uppercase tracking-wide text-ink-faint">
                <th className="px-1 pb-1 font-semibold">Name</th>
                <th className="px-1 pb-1 font-semibold">Kind</th>
                <th className="px-1 pb-1 font-semibold">Price</th>
                <th className="px-1 pb-1 font-semibold">At market</th>
                <th className="px-1 pb-1 font-semibold">Min rep</th>
                <th className="px-1 pb-1 font-semibold">Hidden</th>
                <th className="px-1 pb-1 font-semibold">Description</th>
                <th className="pb-1" />
              </tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className="border-t border-parchment-400/40">
                  <td className="px-1 py-1">
                    <input
                      defaultValue={s.name}
                      key={`sn-${s.id}`}
                      onBlur={(e) => updateService(s.id, { name: e.target.value })}
                      className={cn(inputClass, "min-w-28 font-semibold")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      value={s.category ?? "other"}
                      onChange={(e) => updateService(s.id, { category: e.target.value })}
                      className={selectClass}
                    >
                      {SERVICE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      defaultValue={s.price}
                      key={`sp-${s.id}-${s.price}`}
                      onBlur={(e) => updateService(s.id, { price: Math.max(0, Number(e.target.value) || 0) })}
                      className={cn(inputClass, "w-20")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      value={s.marketId}
                      onChange={(e) => updateService(s.id, { marketId: e.target.value })}
                      className={selectClass}
                    >
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
                      step={1}
                      defaultValue={s.minRep ?? 0}
                      key={`sr-${s.id}-${s.minRep}`}
                      onBlur={(e) => updateService(s.id, { minRep: Number(e.target.value) || undefined })}
                      className={cn(inputClass, "w-14")}
                    />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={!!s.hidden}
                      onChange={(e) => updateService(s.id, { hidden: e.target.checked })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <input
                      defaultValue={s.description ?? ""}
                      key={`sd-${s.id}`}
                      onBlur={(e) => updateService(s.id, { description: e.target.value || undefined })}
                      className={cn(inputClass, "min-w-32")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <button
                      type="button"
                      onClick={() => setServices(services.filter((x) => x.id !== s.id))}
                      aria-label="Remove service"
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
    </div>
  );
}
