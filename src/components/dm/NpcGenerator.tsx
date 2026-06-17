"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SparkIcon, PlusIcon } from "@/components/ui/icons";
import { useCampaigns, usePermissions, useStatBlocks } from "@/lib/data/hooks";
import {
  ANCESTRIES,
  generateNpc,
  npcToStatBlockInput,
  type Ancestry,
  type GeneratedNpc,
} from "@/lib/dm/npc";

const selectClass =
  "h-9 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40";

export function NpcGenerator() {
  const { items: campaigns } = useCampaigns();
  const { create } = useStatBlocks();
  const canSave = usePermissions().canCreate("statBlocks");
  const [anc, setAnc] = useState<"random" | Ancestry>("random");
  const [npc, setNpc] = useState<GeneratedNpc | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  function save() {
    if (!npc) return;
    void create(npcToStatBlockInput(npc, campaigns[0]?.id));
    setFlash(`Saved ${npc.name} to the bestiary.`);
    window.setTimeout(() => setFlash(null), 2400);
  }

  const lines: { label: string; value: string }[] = npc
    ? [
        { label: "Occupation", value: npc.occupation },
        { label: "Appearance", value: npc.appearance },
        { label: "Trait", value: npc.trait },
        { label: "Bond", value: npc.bond },
        { label: "Voice", value: npc.voice },
        { label: "Secret (DM)", value: npc.secret },
      ]
    : [];

  return (
    <Panel title="NPC Forge" eyebrow="Random NPC generator">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Ancestry"
          value={anc}
          onChange={(e) => setAnc(e.target.value as "random" | Ancestry)}
          className={selectClass}
        >
          <option value="random">Random ancestry</option>
          {ANCESTRIES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          onClick={() =>
            setNpc(generateNpc(anc === "random" ? undefined : anc))
          }
        >
          <SparkIcon className="h-4 w-4" /> Conjure NPC
        </Button>
        {npc && canSave && (
          <Button variant="secondary" size="sm" onClick={save}>
            <PlusIcon className="h-4 w-4" /> Save to bestiary
          </Button>
        )}
      </div>

      {flash && (
        <p className="mt-3 animate-fade-in rounded-md border border-forest/40 bg-forest/10 px-3 py-2 text-sm font-semibold text-forest">
          {flash}
        </p>
      )}

      {npc && (
        <div className="mt-4 rounded-card border border-parchment-400/60 bg-parchment-100/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-bold text-ink">{npc.name}</h3>
            <Badge tone="arcane">{npc.ancestry}</Badge>
          </div>
          <dl className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {lines.map((l) => (
              <div key={l.label} className="text-sm">
                <dt className="inline font-semibold text-brass-dark">
                  {l.label}:{" "}
                </dt>
                <dd className="inline text-ink-soft">{l.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Panel>
  );
}
