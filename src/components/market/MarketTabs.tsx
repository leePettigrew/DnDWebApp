"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { cn } from "@/components/ui/cn";
import { CoinIcon, SparkIcon, ChatIcon } from "@/components/ui/icons";
import { useEconomy } from "@/lib/data/hooks";
import { PlayerTradePanel } from "./PlayerTradePanel";
import { MarketBrowser } from "./MarketBrowser";
import { MarketExchange } from "./MarketExchange";
import { TransactionFeed } from "./TransactionFeed";

type Tab = "shops" | "exchange" | "activity";

const TABS: { key: Tab; label: string; icon: typeof CoinIcon }[] = [
  { key: "shops", label: "Shops", icon: CoinIcon },
  { key: "exchange", label: "Exchange", icon: SparkIcon },
  { key: "activity", label: "Activity", icon: ChatIcon },
];

export function MarketTabs() {
  const [tab, setTab] = useState<Tab>("shops");
  const { value: economy } = useEconomy();
  const log = economy?.log ?? [];

  return (
    <div className="space-y-5">
      <div className="inline-flex flex-wrap gap-1 rounded-card border border-parchment-400/70 bg-parchment-100 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                tab === t.key
                  ? "bg-oxblood text-parchment-50 shadow-card"
                  : "text-ink-soft hover:bg-parchment-300/60",
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "shops" && (
        <div className="space-y-5">
          <PlayerTradePanel />
          <MarketBrowser />
        </div>
      )}
      {tab === "exchange" && <MarketExchange />}
      {tab === "activity" && (
        <Panel title="Market activity" eyebrow="Who's trading what">
          <TransactionFeed transactions={log} maxHeight="max-h-[32rem]" />
        </Panel>
      )}
    </div>
  );
}
