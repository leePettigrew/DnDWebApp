"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/components/ui/cn";
import { FeatherIcon, MapIcon, ScrollIcon } from "@/components/ui/icons";
import { CampaignBar } from "@/components/codex/CampaignBar";
import { NotesTab } from "@/components/codex/NotesTab";
import { MapsTab } from "@/components/codex/MapsTab";
import { ChronicleTab } from "@/components/codex/ChronicleTab";
import { useCampaigns } from "@/lib/data/hooks";

type Tab = "notes" | "maps" | "chronicle";

const TABS: { key: Tab; label: string; icon: typeof ScrollIcon }[] = [
  { key: "notes", label: "Notes", icon: ScrollIcon },
  { key: "maps", label: "Battle Maps", icon: MapIcon },
  { key: "chronicle", label: "Chronicle", icon: FeatherIcon },
];

export default function CodexPage() {
  const { items: campaigns } = useCampaigns();
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("notes");

  useEffect(() => {
    if (!activeId && campaigns[0]) setActiveId(campaigns[0].id);
  }, [campaigns, activeId]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="The Codex"
        title="Lore & Chronicle"
        description="Campaign notes, battle maps, and dated session logs — your living record of the tale."
      />

      <CampaignBar activeId={activeId ?? ""} onChange={setActiveId} />

      <div className="mb-6 inline-flex gap-1 rounded-card border border-parchment-400/70 bg-parchment-100 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold transition-colors",
                tab === t.key
                  ? "bg-oxblood text-parchment-50 shadow-card"
                  : "text-ink-soft hover:bg-parchment-300/60",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "notes" && <NotesTab campaignId={activeId} />}
      {tab === "maps" && <MapsTab campaignId={activeId} />}
      {tab === "chronicle" && <ChronicleTab campaignId={activeId} />}
    </div>
  );
}
