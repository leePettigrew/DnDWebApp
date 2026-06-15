"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ChevronRightIcon, PlusIcon, SwordsIcon, TrashIcon } from "@/components/ui/icons";
import { useCampaigns, useEncounters } from "@/lib/data/hooks";
import { newEncounterInput } from "@/lib/domain/factories";

export default function EncountersPage() {
  const router = useRouter();
  const { items: campaigns } = useCampaigns();
  const { items, create, remove } = useEncounters();
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);

  async function createEncounter() {
    const created = await create(newEncounterInput(campaigns[0]?.id));
    router.push(`/encounters/${created.id}`);
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="The War Plans"
        title="Encounters"
        description="Assemble monsters and NPCs into named battles, ready to send to the War Table."
        actions={
          <Button onClick={createEncounter}>
            <PlusIcon className="h-4 w-4" /> New Encounter
          </Button>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<SwordsIcon />}
          title="No encounters yet"
          description="Build your first encounter from your bestiary."
          action={
            <Button onClick={createEncounter}>
              <PlusIcon className="h-4 w-4" /> New Encounter
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((e) => {
            const total = e.entries.reduce((n, x) => n + x.count, 0);
            return (
              <div
                key={e.id}
                className="surface-parchment group relative p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised"
              >
                <button
                  type="button"
                  onClick={() => setDeleting({ id: e.id, name: e.name })}
                  aria-label={`Delete ${e.name}`}
                  className="absolute right-3 top-3 rounded-md p-1.5 text-ink-faint opacity-0 transition-opacity hover:bg-oxblood hover:text-parchment-50 focus:opacity-100 group-hover:opacity-100"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
                <Link href={`/encounters/${e.id}`} className="block">
                  <h3 className="font-display text-xl font-bold text-ink">{e.name}</h3>
                  {e.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
                      {e.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge tone="oxblood">
                      <SwordsIcon className="h-3.5 w-3.5" /> {total} combatants
                    </Badge>
                    {e.entries.slice(0, 3).map((entry) => (
                      <Badge key={entry.id}>
                        {entry.count}× {entry.label}
                      </Badge>
                    ))}
                    {e.entries.length > 3 && (
                      <span className="text-xs text-ink-faint">
                        +{e.entries.length - 3} more
                      </span>
                    )}
                  </div>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-oxblood">
                    Open <ChevronRightIcon className="h-4 w-4" />
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove(deleting.id)}
        title="Delete encounter?"
        message={
          <>
            <strong>{deleting?.name}</strong> will be removed.
          </>
        }
      />
    </div>
  );
}
