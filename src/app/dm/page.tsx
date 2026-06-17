"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import { SparkIcon, HelmIcon, BookIcon, ScrollIcon } from "@/components/ui/icons";
import { usePermissions } from "@/lib/data/hooks";
import { TreasureGenerator } from "@/components/dm/TreasureGenerator";
import { NpcGenerator } from "@/components/dm/NpcGenerator";
import { DmScreen } from "@/components/dm/DmScreen";
import { HandoutComposer } from "@/components/dm/HandoutComposer";

type Tab = "treasure" | "npcs" | "handouts" | "screen";

const TABS: { key: Tab; label: string; icon: typeof SparkIcon }[] = [
  { key: "treasure", label: "Treasure", icon: SparkIcon },
  { key: "npcs", label: "NPC Forge", icon: HelmIcon },
  { key: "handouts", label: "Handouts", icon: ScrollIcon },
  { key: "screen", label: "DM Screen", icon: BookIcon },
];

export default function DmPage() {
  const [tab, setTab] = useState<Tab>("treasure");
  const { isDM } = usePermissions();

  if (!isDM) {
    return (
      <div className="animate-fade-in space-y-6">
        <PageHeader
          eyebrow="The DM's Lectern"
          title="Dungeon Master Tools"
          description="Tools for running the table."
        />
        <Panel tone="flat">
          <EmptyState
            icon={<SparkIcon />}
            title="For the Dungeon Master"
            description="This area is reserved for the campaign's DM."
          />
        </Panel>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        eyebrow="The DM's Lectern"
        title="Dungeon Master Tools"
        description="Roll hoards, conjure NPCs on the fly, and keep the rules you reach for most within arm's reach."
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

      {tab === "treasure" && <TreasureGenerator />}
      {tab === "npcs" && <NpcGenerator />}
      {tab === "handouts" && <HandoutComposer />}
      {tab === "screen" && <DmScreen />}
    </div>
  );
}
