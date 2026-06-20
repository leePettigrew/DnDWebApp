"use client";

import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { CoinIcon } from "@/components/ui/icons";
import { useEconomy, useFactions, usePermissions } from "@/lib/data/hooks";
import type { Faction } from "@/lib/domain/types";

const POLICY_TONE = {
  pact: "forest",
  tariff: "brass",
  embargo: "oxblood",
} as const;

/**
 * Read-only economic posture of a faction, shown on its dossier: the markets it
 * runs, the pacts/tariffs/embargoes it holds, and its strategic reserves.
 * Players see only what isn't hidden; renders nothing if the faction has no
 * economic presence.
 */
export function FactionEconomySummary({ faction }: { faction: Faction }) {
  const { value: economy } = useEconomy();
  const { items: factions } = useFactions();
  const { isDM } = usePermissions();

  if (!economy?.enabled) return null;

  const factionName = (id?: string) => factions.find((f) => f.id === id)?.name ?? "another faction";

  const markets = (economy.markets ?? []).filter(
    (m) => m.factionId === faction.id && (isDM || !m.hidden),
  );
  const policies = (economy.policies ?? []).filter(
    (p) => p.factionId === faction.id && p.active !== false,
  );
  const reserve = (economy.stockpiles ?? []).find((s) => s.factionId === faction.id);
  const services = (economy.services ?? []).filter(
    (s) => markets.some((m) => m.id === s.marketId) && (isDM || !s.hidden),
  );

  if (markets.length === 0 && policies.length === 0 && !reserve) return null;

  return (
    <Panel title="Economy" eyebrow="Trade & treasury">
      <div className="space-y-4 text-sm">
        {markets.length > 0 && (
          <div>
            <h4 className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">
              Markets
            </h4>
            <ul className="space-y-1">
              {markets.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span className="font-semibold text-ink">{m.name}</span>
                  <span className="text-xs text-ink-faint">
                    {m.goods.length} good{m.goods.length === 1 ? "" : "s"}
                  </span>
                  {m.hidden && isDM && <Badge tone="arcane">Hidden</Badge>}
                </li>
              ))}
            </ul>
            {services.length > 0 && (
              <p className="mt-1 text-xs text-ink-faint">
                Services: {services.map((s) => s.name).join(", ")}
              </p>
            )}
          </div>
        )}

        {policies.length > 0 && (
          <div>
            <h4 className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">
              Standing policies
            </h4>
            <ul className="flex flex-wrap gap-1.5">
              {policies.map((p) => (
                <li key={p.id}>
                  <Badge tone={POLICY_TONE[p.kind]}>
                    {p.kind}
                    {p.targetFactionId ? ` · ${factionName(p.targetFactionId)}` : ""}
                    {p.priceMul ? ` ×${p.priceMul}` : ""}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {reserve && (isDM || (reserve.treasury ?? 0) > 0 || reserve.stockpile.length > 0) && (
          <div>
            <h4 className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">
              Reserves
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-brass-dark">
                <CoinIcon className="h-4 w-4" /> {reserve.treasury ?? 0} gp
              </span>
              {reserve.stockpile.map((s) => {
                const name = economy.commodities.find((c) => c.id === s.commodityId)?.name ?? s.commodityId;
                return (
                  <span
                    key={s.commodityId}
                    className="rounded-full border border-parchment-400 bg-parchment-100 px-2 py-0.5 text-xs text-ink-soft"
                  >
                    {name} ×{s.qty}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
