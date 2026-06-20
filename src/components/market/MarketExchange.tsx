"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import { CoinIcon } from "@/components/ui/icons";
import { useEconomy, useFactions, usePermissions } from "@/lib/data/hooks";
import { quoteCommodityGood, standingToRep } from "@shared/economy-pricing";
import { canAccessMarket } from "@shared/economy-trade";
import type { Market } from "@/lib/domain/types";

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="text-ink-faint">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 64;
  const h = 18;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.3}
        className={up ? "text-forest" : "text-oxblood"}
      />
    </svg>
  );
}

type Sort = "spread" | "name" | "gain" | "loss";

export function MarketExchange({ onJump }: { onJump?: (marketId: string) => void }) {
  const { value: economy } = useEconomy();
  const { items: factions } = useFactions();
  const { isDM, userId, multiUser } = usePermissions();
  const [cat, setCat] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("spread");

  const repForMarket = (m: Market) =>
    m.kind === "faction"
      ? standingToRep(factions.find((f) => f.id === m.factionId)?.standing)
      : 2;

  const reachable = useMemo(() => {
    if (!economy?.enabled) return [];
    return (economy.markets ?? []).filter((m) =>
      canAccessMarket(m, { rep: repForMarket(m), isDM, userId: userId ?? undefined }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [economy, factions, isDM, userId, multiUser]);

  const rows = useMemo(() => {
    if (!economy?.enabled) return [];
    const history = economy.priceHistory ?? [];
    const out = (economy.commodities ?? [])
      .map((c) => {
        const entries = reachable
          .map((m) => {
            const rep = repForMarket(m);
            const g = m.goods.find((x) => x.ref === c.id);
            if (!g || rep < (g.minRep ?? 0)) return null;
            const q = quoteCommodityGood(economy, m, g, rep);
            return q ? { market: m, q } : null;
          })
          .filter((x): x is { market: Market; q: NonNullable<ReturnType<typeof quoteCommodityGood>> } => !!x);
        if (entries.length === 0) return null;

        const bestBuy = entries.reduce((a, b) => (b.q.buy < a.q.buy ? b : a));
        const bestSell = entries.reduce((a, b) => (b.q.sell > a.q.sell ? b : a));
        const series = history
          .map((s) => s.prices[c.id])
          .filter((v): v is number => typeof v === "number");
        const cur = series.length ? series[series.length - 1] : bestBuy.q.mid;
        const prev = series.length >= 2 ? series[series.length - 2] : cur;
        const change = prev > 0 ? (cur - prev) / prev : 0;

        return {
          c,
          price: Math.round(cur * 100) / 100,
          change,
          buy: bestBuy.q.buy,
          buyAt: bestBuy.market.name,
          buyAtId: bestBuy.market.id,
          sell: bestSell.q.sell,
          sellAt: bestSell.market.name,
          sellAtId: bestSell.market.id,
          spread: Math.round((bestSell.q.sell - bestBuy.q.buy) * 100) / 100,
          series,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    const filtered = cat === "all" ? out : out.filter((r) => r.c.category === cat);
    filtered.sort((a, b) => {
      if (sort === "name") return a.c.name.localeCompare(b.c.name);
      if (sort === "gain") return b.change - a.change;
      if (sort === "loss") return a.change - b.change;
      return b.spread - a.spread;
    });
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [economy, reachable, cat, sort]);

  if (!economy?.enabled) {
    return (
      <Panel tone="flat">
        <EmptyState
          icon={<CoinIcon />}
          title="The exchange is dark"
          description="No economy is running yet."
        />
      </Panel>
    );
  }

  const cats = Array.from(new Set(rows.map((r) => r.c.category))).sort();

  return (
    <Panel
      title="The Exchange"
      eyebrow="Live prices · where to buy & sell"
      action={
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="h-8 rounded-md border border-parchment-400 bg-parchment-50 px-1 text-xs text-ink focus:border-brass focus:outline-none"
        >
          <option value="spread">Widest spread</option>
          <option value="gain">Biggest gain</option>
          <option value="loss">Biggest drop</option>
          <option value="name">A–Z</option>
        </select>
      }
    >
      {rows.length === 0 ? (
        <p className="text-sm text-ink-faint">No commodities trade in markets you can reach.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1">
            {["all", ...cats].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize transition-colors",
                  cat === c
                    ? "border-brass-dark bg-brass/20 text-brass-dark"
                    : "border-parchment-400 text-ink-soft hover:bg-parchment-300/50",
                )}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="text-left text-[0.65rem] uppercase tracking-wide text-ink-faint">
                  <th className="px-2 pb-2 font-semibold">Commodity</th>
                  <th className="px-2 pb-2 font-semibold">Price</th>
                  <th className="px-2 pb-2 font-semibold">Δ day</th>
                  <th className="px-2 pb-2 font-semibold">Buy cheapest at</th>
                  <th className="px-2 pb-2 font-semibold">Sell dearest at</th>
                  <th className="px-2 pb-2 font-semibold">Spread</th>
                  <th className="px-2 pb-2 font-semibold">30-day</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.c.id} className="border-t border-parchment-400/40">
                    <td className="px-2 py-1.5 font-semibold text-ink">
                      {r.c.name}
                      <span className="ml-1 text-[0.65rem] font-normal text-ink-faint">{r.c.category}</span>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-ink-soft">{r.price}</td>
                    <td
                      className={cn(
                        "px-2 py-1.5 font-mono",
                        r.change > 0.001 ? "text-forest" : r.change < -0.001 ? "text-oxblood" : "text-ink-faint",
                      )}
                    >
                      {r.change > 0 ? "▲" : r.change < 0 ? "▼" : ""}
                      {Math.abs(r.change * 100).toFixed(1)}%
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="font-mono text-forest">{r.buy}</span>{" "}
                      {onJump ? (
                        <button
                          type="button"
                          onClick={() => onJump(r.buyAtId)}
                          className="text-xs text-ink-faint underline decoration-dotted underline-offset-2 hover:text-brass-dark"
                          title={`Go to ${r.buyAt}`}
                        >
                          {r.buyAt}
                        </button>
                      ) : (
                        <span className="text-xs text-ink-faint">{r.buyAt}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="font-mono text-oxblood">{r.sell}</span>{" "}
                      {onJump ? (
                        <button
                          type="button"
                          onClick={() => onJump(r.sellAtId)}
                          className="text-xs text-ink-faint underline decoration-dotted underline-offset-2 hover:text-brass-dark"
                          title={`Go to ${r.sellAt}`}
                        >
                          {r.sellAt}
                        </button>
                      ) : (
                        <span className="text-xs text-ink-faint">{r.sellAt}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-brass-dark">{r.spread}</td>
                    <td className="px-2 py-1.5">
                      <Sparkline values={r.series} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[0.65rem] text-ink-faint">
            “Buy cheapest” and “Sell dearest” span only the markets you can reach, at
            your standing. Spread is the gross margin of hauling between them.
          </p>
        </>
      )}
    </Panel>
  );
}
