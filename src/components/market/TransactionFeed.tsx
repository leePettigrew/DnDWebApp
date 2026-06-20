"use client";

import { useMemo, useState } from "react";
import { cn } from "@/components/ui/cn";
import type { EconomyTransaction } from "@/lib/domain/types";

type Cat = "buy" | "sell" | "service" | "trade" | "revert";

const CATS: { key: Cat; label: string }[] = [
  { key: "buy", label: "Buys" },
  { key: "sell", label: "Sells" },
  { key: "service", label: "Services" },
  { key: "trade", label: "Trades" },
  { key: "revert", label: "Reverts" },
];

const TONE: Record<Cat, string> = {
  buy: "text-forest",
  sell: "text-oxblood",
  service: "text-brass-dark",
  trade: "text-arcane",
  revert: "text-ink-faint",
};

function categoryOf(t: EconomyTransaction): Cat {
  if (t.action === "revert") return "revert";
  if (t.action === "trade") return "trade";
  if (t.note === "service") return "service";
  return t.action === "sell" ? "sell" : "buy";
}

function verbOf(c: Cat): string {
  return c === "service" ? "hired" : c === "trade" ? "traded" : c === "revert" ? "reverted" : c;
}

/**
 * A categorized, scrollable feed of economy transactions. Used by the DM ledger
 * and the player Activity tab. Pass `onRevert` (DM only) to enable undo buttons.
 */
export function TransactionFeed({
  transactions,
  onRevert,
  maxHeight = "max-h-80",
}: {
  transactions: EconomyTransaction[];
  onRevert?: (txId: string) => void;
  maxHeight?: string;
}) {
  const [filter, setFilter] = useState<Cat | "all">("all");

  const present = useMemo(() => {
    const set = new Set(transactions.map(categoryOf));
    return CATS.filter((c) => set.has(c.key));
  }, [transactions]);

  const rows = useMemo(
    () => (filter === "all" ? transactions : transactions.filter((t) => categoryOf(t) === filter)),
    [transactions, filter],
  );

  if (transactions.length === 0) {
    return <p className="text-sm text-ink-faint">No activity yet.</p>;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1">
        {[{ key: "all" as const, label: "All" }, ...present].map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
              filter === c.key
                ? "border-brass-dark bg-brass/20 text-brass-dark"
                : "border-parchment-400 text-ink-soft hover:bg-parchment-300/50",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className={cn("overflow-y-auto rounded-lg border border-parchment-400/50", maxHeight)}>
        <table className="w-full text-xs">
          <tbody>
            {rows.map((t) => {
              const cat = categoryOf(t);
              return (
                <tr key={t.id} className={cn("border-b border-parchment-400/30 last:border-0", t.reverted && "opacity-50")}>
                  <td className="whitespace-nowrap px-2 py-1.5 text-ink-faint">
                    {new Date(t.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className={cn("px-2 py-1.5 font-semibold capitalize", TONE[cat])}>{verbOf(cat)}</td>
                  <td className="px-2 py-1.5 text-ink">
                    <span className={cn(t.reverted && "line-through")}>
                      {t.qty ? `${t.qty}× ` : ""}
                      {t.goodName}
                    </span>
                    {t.actorName && <span className="text-ink-faint"> · {t.actorName}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-ink-soft">{t.marketName}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{t.total}gp</td>
                  <td className="px-2 py-1.5 text-right">
                    {onRevert && (t.action === "buy" || t.action === "sell") && !t.reverted ? (
                      <button
                        type="button"
                        onClick={() => onRevert(t.id)}
                        className="rounded-md border border-oxblood/40 px-2 py-0.5 text-[0.7rem] font-semibold text-oxblood hover:bg-oxblood hover:text-parchment-50"
                      >
                        Revert
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
