"use client";

import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { CoinIcon } from "@/components/ui/icons";
import { useEconomy, useFactions, usePermissions } from "@/lib/data/hooks";

/**
 * A read-only "state of trade" for the world: where the markets are, and (for
 * the DM) the resource nodes and caravans that feed them. Players see only the
 * markets that aren't hidden — the visibility the DM set still holds here.
 */
export function WorldEconomyOverview() {
  const { value: economy } = useEconomy();
  const { items: factions } = useFactions();
  const { isDM } = usePermissions();

  if (!economy?.enabled) {
    return (
      <Panel tone="flat">
        <EmptyState
          icon={<CoinIcon />}
          title="No economy running"
          description={
            isDM
              ? "Open the economy from the DM tools to map your world's trade."
              : "Your DM hasn't opened the markets yet."
          }
        />
      </Panel>
    );
  }

  const factionName = (id?: string) => factions.find((f) => f.id === id)?.name;
  const commodityName = (id: string) => economy.commodities.find((c) => c.id === id)?.name ?? id;
  const marketName = (id?: string) => economy.markets.find((m) => m.id === id)?.name ?? "—";

  const markets = (economy.markets ?? []).filter((m) => isDM || !m.hidden);
  const nodes = (economy.nodes ?? []).filter((n) => n.active !== false);
  const routes = (economy.routes ?? []).filter((r) => r.active !== false);

  const marketKind = (m: (typeof markets)[number]) =>
    m.kind === "faction"
      ? (factionName(m.factionId) ?? "Faction")
      : m.kind === "location"
        ? (m.poiId ? "On the map" : "Location")
        : "Open market";

  return (
    <div className="space-y-6">
      <Panel title="The state of trade" eyebrow="Economy at a glance">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge tone={economy.sim === "live" ? "forest" : "neutral"}>
            {economy.sim === "live" ? "● Live" : "Paused"}
          </Badge>
          <span className="text-ink-soft">
            Day <span className="font-mono font-semibold">{economy.day ?? 1}</span>
          </span>
          <span className="text-ink-faint">
            {markets.length} market{markets.length === 1 ? "" : "s"}
          </span>
        </div>
      </Panel>

      <Panel title="Markets" eyebrow="Where coin changes hands">
        {markets.length === 0 ? (
          <p className="text-sm text-ink-faint">No markets you can see right now.</p>
        ) : (
          <ul className="divide-y divide-parchment-400/40">
            {markets.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <span className="font-semibold text-ink">{m.name}</span>
                <span className="text-xs text-ink-faint">{marketKind(m)}</span>
                <span className="ml-auto text-xs text-ink-faint">
                  {m.goods.length} good{m.goods.length === 1 ? "" : "s"}
                </span>
                {m.hidden && isDM && <Badge tone="arcane">Hidden</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {isDM && nodes.length > 0 && (
        <Panel title="Resource nodes" eyebrow="The world's production">
          <ul className="divide-y divide-parchment-400/40">
            {nodes.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-semibold text-ink">{n.name}</span>
                {n.location && <span className="text-xs text-ink-faint">@ {n.location}</span>}
                <span className="ml-auto text-xs text-ink-soft">
                  +{n.rate} {commodityName(n.commodityId)}/day → {marketName(n.marketId) === "—" ? "global" : marketName(n.marketId)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {isDM && routes.length > 0 && (
        <Panel title="Trade routes" eyebrow="Caravans on the road">
          <ul className="divide-y divide-parchment-400/40">
            {routes.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-semibold text-ink">{r.name || commodityName(r.commodityId)}</span>
                <span className="ml-auto text-xs text-ink-soft">
                  {r.volume} {commodityName(r.commodityId)}/day · {marketName(r.fromMarketId)} → {marketName(r.toMarketId)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
