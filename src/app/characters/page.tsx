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
import { HelmIcon, PlusIcon, ShieldIcon, HeartIcon, TrashIcon } from "@/components/ui/icons";
import { useCampaigns, useCharacters, usePermissions } from "@/lib/data/hooks";
import { newCharacterInput } from "@/lib/domain/factories";

export default function CharactersPage() {
  const router = useRouter();
  const { items: campaigns } = useCampaigns();
  const { items, create, remove } = useCharacters();
  const perms = usePermissions();
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(
    null,
  );

  async function createHero() {
    const created = await create(newCharacterInput(campaigns[0]?.id));
    router.push(`/characters/${created.id}?edit=1`);
  }

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow="The Company"
        title="Heroes"
        description="Full 5e character sheets — stats, skills, HP, inventory, and spells."
        actions={
          <Button onClick={createHero}>
            <PlusIcon className="h-4 w-4" /> New Hero
          </Button>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<HelmIcon />}
          title="No heroes yet"
          description="Create your first adventurer and their full character sheet."
          action={
            <Button onClick={createHero}>
              <PlusIcon className="h-4 w-4" /> New Hero
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <div
              key={c.id}
              className="surface-parchment group relative flex gap-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised"
            >
              <Link
                href={`/characters/${c.id}`}
                className="flex flex-1 gap-4"
                aria-label={`Open ${c.name}`}
              >
                <Portrait src={c.portraitUrl} name={c.name} className="h-16 w-16 shrink-0" />
                <div className="min-w-0">
                  <h3 className="truncate font-display text-lg font-bold text-ink">
                    {c.name}
                  </h3>
                  <p className="truncate text-sm text-ink-soft">
                    {[c.race, c.className].filter(Boolean).join(" · ") || "Unclassed"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                    <Badge tone="brass">Lvl {c.level}</Badge>
                    <span className="numerals inline-flex items-center gap-1">
                      <ShieldIcon className="h-3.5 w-3.5 text-ink-faint" /> {c.armorClass}
                    </span>
                    <span className="numerals inline-flex items-center gap-1">
                      <HeartIcon className="h-3.5 w-3.5 text-oxblood" /> {c.currentHp}/{c.maxHp}
                    </span>
                  </div>
                </div>
              </Link>
              {perms.canEdit("characters", c) && (
                <button
                  type="button"
                  onClick={() => setDeleting({ id: c.id, name: c.name })}
                  aria-label={`Delete ${c.name}`}
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
        title="Delete hero?"
        message={
          <>
            <strong>{deleting?.name}</strong> will be removed from your ledger.
            This cannot be undone.
          </>
        }
      />
    </div>
  );
}
