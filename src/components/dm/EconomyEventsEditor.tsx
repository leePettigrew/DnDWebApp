"use client";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import type { EconomyEvent, EconomyState } from "@/lib/domain/types";

const inputClass =
  "w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40";
const selectClass =
  "h-8 rounded-md border border-parchment-400 bg-parchment-50 px-1 text-xs text-ink focus:border-brass focus:outline-none";

const CATEGORIES = ["metal", "ore", "wood", "cloth", "food", "gem", "reagent", "good", "other"];

const PRESETS: { name: string; scope?: string; priceMul: number; days: number; note: string }[] = [
  { name: "Famine", scope: "food", priceMul: 1.6, days: 14, note: "Crops fail; food grows scarce." },
  { name: "Bumper harvest", scope: "food", priceMul: 0.6, days: 14, note: "A glut of grain floods the markets." },
  { name: "War", scope: "metal", priceMul: 1.5, days: 21, note: "Demand for arms and steel soars." },
  { name: "Boom", scope: "all", priceMul: 0.85, days: 10, note: "Prosperous times; coin flows freely." },
  { name: "Recession", scope: "all", priceMul: 1.25, days: 10, note: "Coin runs thin everywhere." },
  { name: "Plague", scope: "all", priceMul: 1.4, days: 14, note: "Quarantine throttles all trade." },
  { name: "Gem rush", scope: "gem", priceMul: 1.5, days: 14, note: "Speculators drive gemstone prices up." },
];

export function EconomyEventsEditor({
  economy,
  update,
}: {
  economy: EconomyState;
  update: (patch: Partial<EconomyState>) => void;
}) {
  const day = economy.day ?? 1;
  const events = economy.events ?? [];
  const commodities = economy.commodities ?? [];

  const setEvents = (next: EconomyEvent[]) => update({ events: next });
  const updateEvent = (id: string, patch: Partial<EconomyEvent>) =>
    setEvents(events.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const addPreset = (p: (typeof PRESETS)[number]) =>
    setEvents([
      ...events,
      { id: newId(), name: p.name, scope: p.scope, priceMul: p.priceMul, note: p.note, until: day + p.days },
    ]);
  const addCustom = () =>
    setEvents([
      ...events,
      { id: newId(), name: "New event", priceMul: 1.2, until: day + 7 },
    ]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => addPreset(p)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              p.priceMul > 1
                ? "border-oxblood/40 text-oxblood hover:bg-oxblood hover:text-parchment-50"
                : "border-forest/40 text-forest hover:bg-forest hover:text-parchment-50",
            )}
            title={p.note}
          >
            {p.name} {p.priceMul > 1 ? "▲" : "▼"}
          </button>
        ))}
        <Button size="sm" variant="secondary" onClick={addCustom}>
          + Custom
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-ink-faint">
          No active events. Fire a lever above to shock prices for a span of days.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] text-xs">
            <thead>
              <tr className="text-left uppercase tracking-wide text-ink-faint">
                <th className="px-1 pb-1 font-semibold">Event</th>
                <th className="px-1 pb-1 font-semibold">Affects</th>
                <th className="px-1 pb-1 font-semibold">Price ×</th>
                <th className="px-1 pb-1 font-semibold">Ends</th>
                <th className="px-1 pb-1 font-semibold">Note</th>
                <th className="pb-1" />
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const left = e.until == null ? null : e.until - day;
                return (
                  <tr key={e.id} className="border-t border-parchment-400/40">
                    <td className="px-1 py-1">
                      <input
                        defaultValue={e.name}
                        key={`en-${e.id}`}
                        onBlur={(ev) => updateEvent(e.id, { name: ev.target.value })}
                        className={cn(inputClass, "min-w-24 font-semibold")}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <select
                        value={e.scope ?? ""}
                        onChange={(ev) => updateEvent(e.id, { scope: ev.target.value || undefined })}
                        className={selectClass}
                      >
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
                        defaultValue={e.priceMul}
                        key={`em-${e.id}-${e.priceMul}`}
                        onBlur={(ev) => updateEvent(e.id, { priceMul: Number(ev.target.value) || 1 })}
                        className={cn(inputClass, "w-16")}
                      />
                    </td>
                    <td className="px-1 py-1 whitespace-nowrap">
                      <input
                        type="number"
                        min={day}
                        step={1}
                        defaultValue={e.until ?? ""}
                        key={`eu-${e.id}-${e.until}`}
                        placeholder="∞"
                        onBlur={(ev) =>
                          updateEvent(e.id, {
                            until: ev.target.value === "" ? null : Number(ev.target.value),
                          })
                        }
                        className={cn(inputClass, "w-16")}
                      />
                      {left != null && (
                        <span className="ml-1 text-[0.65rem] text-ink-faint">
                          {left > 0 ? `${left}d` : "ending"}
                        </span>
                      )}
                    </td>
                    <td className="px-1 py-1">
                      <input
                        defaultValue={e.note ?? ""}
                        key={`et-${e.id}`}
                        onBlur={(ev) => updateEvent(e.id, { note: ev.target.value || undefined })}
                        className={cn(inputClass, "min-w-32")}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <button
                        type="button"
                        onClick={() => setEvents(events.filter((x) => x.id !== e.id))}
                        aria-label="Remove event"
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

      {events.length > 0 && (
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{events.length} active</Badge>
          <span className="text-[0.65rem] text-ink-faint">
            Events expire automatically as the simulation passes their end day.
          </span>
        </div>
      )}
    </div>
  );
}
