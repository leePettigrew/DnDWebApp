"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ChevronLeftIcon,
  EditIcon,
  HelmIcon,
  TrashIcon,
} from "@/components/ui/icons";
import { CharacterSheet } from "@/components/characters/CharacterSheet";
import { CharacterEditor } from "@/components/characters/CharacterEditor";
import { VisibilityControl } from "@/components/dm/VisibilityControl";
import { useCharacters, usePermissions } from "@/lib/data/hooks";
import type { Character } from "@/lib/domain/types";

export default function CharacterDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const { items, loading, update, remove } = useCharacters();
  const character = items.find((c) => c.id === id);
  const perms = usePermissions();
  const canEdit = perms.canEdit("characters", character);

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Newly-created heroes arrive with ?edit=1 — open straight into the editor.
  useEffect(() => {
    if (
      canEdit &&
      new URLSearchParams(window.location.search).get("edit") === "1"
    ) {
      setEditing(true);
    }
  }, [canEdit]);

  if (loading && !character) {
    return (
      <div className="animate-fade-in space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-parchment-300/70" />
        <div className="h-40 animate-pulse rounded-card bg-parchment-200/70" />
      </div>
    );
  }

  if (!character) {
    return (
      <EmptyState
        icon={<HelmIcon />}
        title="Hero not found"
        description="This character may have been deleted."
        action={
          <Link href="/characters">
            <Button variant="secondary">Back to Heroes</Button>
          </Link>
        }
      />
    );
  }

  async function save(next: Character) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...patch } = next;
    void _id;
    void _c;
    void _u;
    await update(character!.id, patch);
    setEditing(false);
    // Clear the ?edit=1 flag.
    router.replace(`/characters/${character!.id}`);
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href="/characters"
          className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-oxblood"
        >
          <ChevronLeftIcon className="h-4 w-4" /> All Heroes
        </Link>
        {!editing && canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <EditIcon className="h-4 w-4" /> Edit
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmDelete(true)}
            >
              <TrashIcon className="h-4 w-4" /> Delete
            </Button>
          </div>
        )}
      </div>

      {!editing && perms.isDM && (
        <div className="mb-4">
          <VisibilityControl
            hidden={character.hidden}
            visibleTo={character.visibleTo}
            onChange={(p) => update(character.id, p)}
          />
        </div>
      )}

      {editing && canEdit ? (
        <CharacterEditor
          character={character}
          onSave={save}
          onCancel={() => {
            setEditing(false);
            router.replace(`/characters/${character.id}`);
          }}
        />
      ) : (
        <CharacterSheet
          character={character}
          canEdit={canEdit}
          onUpdate={(patch) => update(character.id, patch)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await remove(character.id);
          router.push("/characters");
        }}
        title="Delete hero?"
        message={
          <>
            <strong>{character.name}</strong> will be removed permanently.
          </>
        }
      />
    </div>
  );
}
