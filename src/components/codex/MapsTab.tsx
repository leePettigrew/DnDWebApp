"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TextArea, TextField } from "@/components/ui/Field";
import { EditIcon, MapIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { useMaps, usePermissions } from "@/lib/data/hooks";
import { newMapInput } from "@/lib/domain/factories";
import type { BattleMap } from "@/lib/domain/types";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function MapsTab({ campaignId }: { campaignId?: string }) {
  const { items, create, update, remove } = useMaps();
  const canManage = usePermissions().canEdit("maps");
  const maps = items.filter((m) => m.campaignId === campaignId);

  const [editing, setEditing] = useState<BattleMap | null>(null);
  const [viewing, setViewing] = useState<BattleMap | null>(null);
  const [deleting, setDeleting] = useState<BattleMap | null>(null);

  async function createMap() {
    const created = await create(newMapInput(campaignId));
    setEditing(created);
  }

  function save() {
    if (!editing) return;
    void update(editing.id, {
      name: editing.name,
      imageUrl: editing.imageUrl,
      notes: editing.notes,
    });
    setEditing(null);
  }

  async function onPickFile(file: File) {
    if (!editing) return;
    const dataUrl = await readFileAsDataUrl(file);
    setEditing({ ...editing, imageUrl: dataUrl });
  }

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button variant="secondary" size="sm" onClick={createMap}>
            <PlusIcon className="h-4 w-4" /> New Map
          </Button>
        </div>
      )}

      {maps.length === 0 ? (
        <EmptyState
          icon={<MapIcon />}
          title="No battle maps yet"
          description="Add a map and drop in an image — or leave the slot empty for now."
          action={
            canManage ? (
              <Button variant="secondary" onClick={createMap}>
                <PlusIcon className="h-4 w-4" /> New Map
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {maps.map((m) => (
            <div key={m.id} className="surface-parchment group overflow-hidden">
              <button
                onClick={() => (m.imageUrl ? setViewing(m) : setEditing(m))}
                className="block w-full"
                aria-label={`Open ${m.name}`}
              >
                <div className="relative aspect-video w-full overflow-hidden bg-parchment-300/50">
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.imageUrl}
                      alt={m.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-parchment-400 text-ink-faint">
                      <MapIcon className="h-8 w-8" />
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        Map slot — add image
                      </span>
                    </div>
                  )}
                </div>
              </button>
              <div className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <h3 className="truncate font-display font-bold text-ink">{m.name}</h3>
                  {m.notes && (
                    <p className="line-clamp-2 text-xs text-ink-soft">{m.notes}</p>
                  )}
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => setEditing(m)}
                      aria-label={`Edit ${m.name}`}
                      className="rounded-md p-1.5 text-ink-faint hover:bg-parchment-300/60 hover:text-ink"
                    >
                      <EditIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleting(m)}
                      aria-label={`Delete ${m.name}`}
                      className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit map"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save}>Save map</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <TextField
              label="Name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <TextField
              label="Image URL"
              hint="art slot"
              placeholder="https://… or upload below"
              value={editing.imageUrl}
              onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })}
            />
            <div>
              <p className="mb-1 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
                Or upload an image
              </p>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onPickFile(file);
                }}
                className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-md file:border file:border-parchment-400 file:bg-parchment-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink hover:file:bg-parchment-50"
              />
              <p className="mt-1 text-xs text-ink-faint">
                Stored locally in your browser — keep uploads modest in size.
              </p>
            </div>
            {editing.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={editing.imageUrl}
                alt="Map preview"
                className="max-h-48 w-full rounded-card border border-parchment-400 object-cover"
              />
            )}
            <TextArea
              label="Notes"
              rows={3}
              value={editing.notes ?? ""}
              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
            />
          </div>
        )}
      </Modal>

      {/* Viewer */}
      <Modal
        open={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? "Map"}
        size="xl"
      >
        {viewing && (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewing.imageUrl}
              alt={viewing.name}
              className="w-full rounded-card border border-parchment-400"
            />
            {viewing.notes && (
              <p className="mt-3 text-sm text-ink-soft">{viewing.notes}</p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove(deleting.id)}
        title="Delete map?"
        message={
          <>
            <strong>{deleting?.name}</strong> will be removed.
          </>
        }
      />
    </div>
  );
}
