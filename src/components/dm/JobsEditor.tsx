"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import type { DeliveryJob, EconomyState } from "@/lib/domain/types";

const inputClass =
  "w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40";
const selectClass =
  "h-8 rounded-md border border-parchment-400 bg-parchment-50 px-1 text-xs text-ink focus:border-brass focus:outline-none";

export function JobsEditor({
  economy,
  update,
}: {
  economy: EconomyState;
  update: (patch: Partial<EconomyState>) => void;
}) {
  const commodities = economy.commodities ?? [];
  const markets = economy.markets ?? [];
  const jobs = economy.jobs ?? [];

  const setJobs = (next: DeliveryJob[]) => update({ jobs: next });
  const updateJob = (id: string, patch: Partial<DeliveryJob>) =>
    setJobs(jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  const addJob = () =>
    setJobs([
      ...jobs,
      {
        id: newId(),
        name: "New haul",
        commodityId: commodities[0]?.id ?? "",
        qty: 10,
        fromMarketId: markets[0]?.id ?? "",
        toMarketId: markets[1]?.id ?? markets[0]?.id ?? "",
        reward: 25,
        status: "open",
        active: true,
      },
    ]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-ink-faint">
          Haulage contracts: a courier picks the cargo up at one market (drawn
          from its stock) and is paid a flat reward on delivering it to another.
        </p>
        <Button size="sm" variant="secondary" onClick={addJob} disabled={markets.length < 2}>
          <PlusIcon className="h-4 w-4" /> Add
        </Button>
      </div>

      {markets.length < 2 ? (
        <p className="text-sm text-ink-faint">Add at least two markets to route a haul between them.</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-ink-faint">No jobs posted.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-xs">
            <thead>
              <tr className="text-left uppercase tracking-wide text-ink-faint">
                <th className="px-1 pb-1 font-semibold">Name</th>
                <th className="px-1 pb-1 font-semibold">Cargo</th>
                <th className="px-1 pb-1 font-semibold">Qty</th>
                <th className="px-1 pb-1 font-semibold">From</th>
                <th className="px-1 pb-1 font-semibold">To</th>
                <th className="px-1 pb-1 font-semibold">Reward</th>
                <th className="px-1 pb-1 font-semibold">Status</th>
                <th className="px-1 pb-1 font-semibold">Hide</th>
                <th className="px-1 pb-1 font-semibold">On</th>
                <th className="pb-1" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-parchment-400/40">
                  <td className="px-1 py-1">
                    <input
                      defaultValue={j.name ?? ""}
                      key={`jn-${j.id}`}
                      onBlur={(e) => updateJob(j.id, { name: e.target.value })}
                      className={cn(inputClass, "min-w-24")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select value={j.commodityId} onChange={(e) => updateJob(j.id, { commodityId: e.target.value })} className={selectClass}>
                      {commodities.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min={1}
                      defaultValue={j.qty}
                      key={`jq-${j.id}-${j.qty}`}
                      onBlur={(e) => updateJob(j.id, { qty: Math.max(1, Number(e.target.value) || 1) })}
                      className={cn(inputClass, "w-14")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select value={j.fromMarketId} onChange={(e) => updateJob(j.id, { fromMarketId: e.target.value })} className={selectClass}>
                      {markets.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <select value={j.toMarketId} onChange={(e) => updateJob(j.id, { toMarketId: e.target.value })} className={selectClass}>
                      {markets.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <input
                      type="number"
                      min={0}
                      defaultValue={j.reward}
                      key={`jr-${j.id}-${j.reward}`}
                      onBlur={(e) => updateJob(j.id, { reward: Math.max(0, Number(e.target.value) || 0) })}
                      className={cn(inputClass, "w-16")}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
                        (j.status ?? "open") === "done"
                          ? "bg-forest/15 text-forest"
                          : (j.status ?? "open") === "taken"
                            ? "bg-brass/15 text-brass-dark"
                            : "bg-parchment-300/60 text-ink-soft",
                      )}
                      title={j.takenByName ? `Courier: ${j.takenByName}` : undefined}
                    >
                      {j.status ?? "open"}
                    </span>
                    {(j.status === "taken" || j.status === "done") && (
                      <button
                        type="button"
                        onClick={() => updateJob(j.id, { status: "open", takenBy: undefined, takenByName: undefined })}
                        className="ml-1 text-[0.6rem] text-ink-faint underline hover:text-oxblood"
                        title="Reset to open"
                      >
                        reset
                      </button>
                    )}
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input type="checkbox" checked={!!j.hidden} onChange={(e) => updateJob(j.id, { hidden: e.target.checked })} />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <input type="checkbox" checked={j.active !== false} onChange={(e) => updateJob(j.id, { active: e.target.checked })} />
                  </td>
                  <td className="px-1 py-1">
                    <button
                      type="button"
                      onClick={() => setJobs(jobs.filter((x) => x.id !== j.id))}
                      aria-label="Remove job"
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
