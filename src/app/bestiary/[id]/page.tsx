"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ChevronLeftIcon, ClawIcon, EditIcon, TrashIcon } from "@/components/ui/icons";
import { StatBlockView } from "@/components/bestiary/StatBlockView";
import { StatBlockEditor } from "@/components/bestiary/StatBlockEditor";
import { useStatBlocks } from "@/lib/data/hooks";
import type { StatBlock } from "@/lib/domain/types";

export default function StatBlockDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const { items, loading, update, remove } = useStatBlocks();
  const statBlock = items.find((s) => s.id === id);

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("edit") === "1") {
      setEditing(true);
    }
  }, []);

  if (loading && !statBlock) {
    return (
      <div className="animate-fade-in space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-parchment-300/70" />
        <div className="h-40 animate-pulse rounded-card bg-parchment-200/70" />
      </div>
    );
  }

  if (!statBlock) {
    return (
      <EmptyState
        icon={<ClawIcon />}
        title="Stat block not found"
        description="This creature may have been deleted."
        action={
          <Link href="/bestiary">
            <Button variant="secondary">Back to Bestiary</Button>
          </Link>
        }
      />
    );
  }

  async function save(next: StatBlock) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...patch } = next;
    void _id;
    void _c;
    void _u;
    await update(statBlock!.id, patch);
    setEditing(false);
    router.replace(`/bestiary/${statBlock!.id}`);
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href="/bestiary"
          className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-oxblood"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Bestiary
        </Link>
        {!editing && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <EditIcon className="h-4 w-4" /> Edit
            </Button>
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
              <TrashIcon className="h-4 w-4" /> Delete
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <StatBlockEditor
          statBlock={statBlock}
          onSave={save}
          onCancel={() => {
            setEditing(false);
            router.replace(`/bestiary/${statBlock.id}`);
          }}
        />
      ) : (
        <StatBlockView statBlock={statBlock} />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await remove(statBlock.id);
          router.push("/bestiary");
        }}
        title="Delete stat block?"
        message={
          <>
            <strong>{statBlock.name}</strong> will be removed permanently.
          </>
        }
      />
    </div>
  );
}
