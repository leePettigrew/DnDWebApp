"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Portrait } from "@/components/ui/Portrait";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/components/ui/cn";
import { ClawIcon, HeartIcon, PlusIcon, ShieldIcon, TrashIcon } from "@/components/ui/icons";
import { useCampaigns, usePermissions, useStatBlocks } from "@/lib/data/hooks";
import { newStatBlockInput } from "@/lib/domain/factories";
import type { StatBlock } from "@/lib/domain/types";

type Filter = "all" | "monster" | "npc";

export default function BestiaryPage() {
  const router = useRouter();
  const { items: campaigns } = useCampaigns();
  const { items, create, remove } = useStatBlocks();
  const canManage = usePermissions().canEdit("statBlocks");
  const [filter, setFilter] = useState<Filter>("all");
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  async function createBlock(kind: StatBlock["kind"]) {
    const created = await create(newStatBlockInput(kind, campaigns[0]?.id));
    router.push(`/bestiary/${created.id}?edit=1`);
  }

  const filtered = items.filter((s) => filter === "all" || s.kind === filter);
  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "monster", label: "Monsters" },
    { key: "npc", label: "NPCs" },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="The Bestiary"
        title="Monsters & NPCs"
        description="Store stat blocks for every foe and friend, then drop them into encounters."
        actions={
          canManage ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => createBlock("npc")}>
                <PlusIcon className="h-4 w-4" /> NPC
              </Button>
              <Button onClick={() => createBlock("monster")}>
                <PlusIcon className="h-4 w-4" /> Monster
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="mb-5 inline-flex gap-1 rounded-card border border-parchment-400/70 bg-parchment-100 p-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
              filter === f.key
                ? "bg-oxblood text-parchment-50 shadow-card"
                : "text-ink-soft hover:bg-parchment-300/60",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ClawIcon />}
          title="The bestiary is empty"
          description={
            canManage
              ? "Add a monster or NPC stat block to begin your menagerie."
              : "Only the DM can add stat blocks to the bestiary."
          }
          action={
            canManage ? (
              <Button onClick={() => createBlock("monster")}>
                <PlusIcon className="h-4 w-4" /> New Monster
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="surface-parchment group relative flex gap-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised"
            >
              <Link href={`/bestiary/${s.id}`} className="flex flex-1 gap-4" aria-label={`Open ${s.name}`}>
                <Portrait src={s.portraitUrl} name={s.name} className="h-16 w-16 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-display text-lg font-bold text-ink">{s.name}</h3>
                  </div>
                  <p className="truncate text-xs italic text-ink-soft">{s.type}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                    <Badge tone={s.kind === "npc" ? "arcane" : "oxblood"}>
                      {s.kind === "npc" ? "NPC" : "Monster"}
                    </Badge>
                    <span className="numerals">CR {s.challengeRating ?? "—"}</span>
                    <span className="numerals inline-flex items-center gap-1">
                      <ShieldIcon className="h-3.5 w-3.5 text-ink-faint" /> {s.armorClass}
                    </span>
                    <span className="numerals inline-flex items-center gap-1">
                      <HeartIcon className="h-3.5 w-3.5 text-oxblood" /> {s.maxHp}
                    </span>
                  </div>
                </div>
              </Link>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setDeleting({ id: s.id, name: s.name })}
                  aria-label={`Delete ${s.name}`}
                  className="absolute right-2 top-2 rounded-md p-1.5 text-ink-faint opacity-0 transition-opacity hover:bg-oxblood hover:text-parchment-50 focus:opacity-100 group-hover:opacity-100"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove(deleting.id)}
        title="Delete stat block?"
        message={
          <>
            <strong>{deleting?.name}</strong> will be removed from the bestiary.
          </>
        }
      />
    </div>
  );
}
