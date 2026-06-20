"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/components/ui/cn";
import { ScrollIcon, HelmIcon, MapIcon, ChevronRightIcon, CoinIcon, MoonIcon } from "@/components/ui/icons";
import { QuestLog } from "@/components/world/QuestLog";
import { FactionRoster } from "@/components/world/FactionRoster";
import { Timeline } from "@/components/world/Timeline";
import { WorldAtlas } from "@/components/world/WorldAtlas";
import { WorldEconomyOverview } from "@/components/world/WorldEconomyOverview";
import { CalendarView } from "@/components/world/CalendarView";

type Tab = "quests" | "factions" | "timeline" | "atlas" | "economy" | "calendar";

const TABS: { key: Tab; label: string; icon: typeof ScrollIcon }[] = [
  { key: "quests", label: "Quests", icon: ScrollIcon },
  { key: "factions", label: "Factions & NPCs", icon: HelmIcon },
  { key: "timeline", label: "Timeline", icon: ChevronRightIcon },
  { key: "atlas", label: "Atlas", icon: MapIcon },
  { key: "calendar", label: "Calendar", icon: MoonIcon },
  { key: "economy", label: "Economy", icon: CoinIcon },
];

export default function WorldPage() {
  const [tab, setTab] = useState<Tab>("quests");

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="The Chronicle"
        title="Campaign & World"
        description="Quests, the powers that move your world, its unfolding history, and an atlas of the places your party has been."
      />

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

      {tab === "quests" && <QuestLog />}
      {tab === "factions" && <FactionRoster />}
      {tab === "timeline" && <Timeline />}
      {tab === "atlas" && <WorldAtlas />}
      {tab === "calendar" && <CalendarView />}
      {tab === "economy" && <WorldEconomyOverview />}
    </div>
  );
}
