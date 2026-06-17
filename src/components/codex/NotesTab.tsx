"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextField } from "@/components/ui/Field";
import { Markdown } from "@/components/ui/Markdown";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/components/ui/cn";
import { PlusIcon, ScrollIcon, TrashIcon } from "@/components/ui/icons";
import { useNotes, usePermissions } from "@/lib/data/hooks";
import { newNoteInput } from "@/lib/domain/factories";

export function NotesTab({ campaignId }: { campaignId?: string }) {
  const { items, create, update, remove } = useNotes();
  const canManage = usePermissions().canEdit("notes");
  const notes = items
    .filter((n) => n.campaignId === campaignId)
    .sort((a, b) =>
      a.pinned === b.pinned
        ? b.updatedAt.localeCompare(a.updatedAt)
        : a.pinned
          ? -1
          : 1,
    );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = notes.find((n) => n.id === selectedId) ?? null;

  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Load the selected note into the draft.
  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setTags(selected.tags.join(", "));
      setBody(selected.body);
      setPinned(selected.pinned);
      setPreview(false);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createNote() {
    const created = await create(newNoteInput(campaignId));
    setSelectedId(created.id);
  }

  function save() {
    if (!selected) return;
    void update(selected.id, {
      title: title.trim() || "Untitled Note",
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      body,
      pinned,
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* List */}
      <div className="lg:col-span-1">
        <Panel
          title="Notes"
          action={
            canManage ? (
              <Button variant="secondary" size="sm" onClick={createNote}>
                <PlusIcon className="h-4 w-4" /> New
              </Button>
            ) : undefined
          }
        >
          {notes.length === 0 ? (
            <p className="text-sm text-ink-faint">No notes yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {notes.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => setSelectedId(n.id)}
                    className={cn(
                      "w-full rounded-card border px-3 py-2 text-left transition-colors",
                      selectedId === n.id
                        ? "border-brass bg-parchment-50 shadow-gilt"
                        : "border-parchment-400/50 bg-parchment-100/60 hover:border-brass/50",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {n.pinned && (
                        <span className="text-brass-dark" title="Pinned">
                          ★
                        </span>
                      )}
                      <span className="truncate font-display font-semibold text-ink">
                        {n.title}
                      </span>
                    </div>
                    {n.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {n.tags.map((t) => (
                          <Badge key={t} tone="brass">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Editor */}
      <div className="lg:col-span-2">
        {selected ? (
          <Panel
            title={preview || !canManage ? "Note" : "Edit Note"}
            action={
              canManage ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreview((v) => !v)}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-brass-dark hover:bg-parchment-300/60"
                  >
                    {preview ? "Edit" : "Preview"}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(true)}
                    aria-label="Delete note"
                    className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ) : undefined
            }
          >
            {preview || !canManage ? (
              <div>
                <h2 className="font-display text-2xl font-bold text-ink">{title}</h2>
                <div className="mt-3">
                  <Markdown source={body} />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <TextField
                  label="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={save}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Tags"
                    hint="comma-separated"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    onBlur={save}
                  />
                  <label className="flex items-end gap-2 pb-2">
                    <input
                      type="checkbox"
                      checked={pinned}
                      onChange={(e) => {
                        setPinned(e.target.checked);
                        if (selected)
                          update(selected.id, { pinned: e.target.checked });
                      }}
                      className="h-4 w-4 accent-brass"
                    />
                    <span className="text-sm text-ink-soft">Pin to top</span>
                  </label>
                </div>
                <div>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
                      Body
                    </span>
                    <span className="text-xs text-ink-faint">
                      Markdown: # heading, **bold**, *italic*, - list, &gt; quote
                    </span>
                  </div>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onBlur={save}
                    rows={16}
                    className="w-full rounded-md border border-parchment-400/80 bg-parchment-50/80 px-3 py-2 font-mono text-sm leading-relaxed text-ink shadow-inner focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40"
                  />
                </div>
                <p className="text-xs text-ink-faint">
                  Changes save automatically when you click away.
                </p>
              </div>
            )}
          </Panel>
        ) : (
          <EmptyState
            icon={<ScrollIcon />}
            title="Select a note"
            description="Choose a note to read or edit, or create a new one."
            action={
              canManage ? (
                <Button variant="secondary" onClick={createNote}>
                  <PlusIcon className="h-4 w-4" /> New Note
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (selected) remove(selected.id);
          setSelectedId(null);
        }}
        title="Delete note?"
        message={
          <>
            <strong>{selected?.title}</strong> will be removed.
          </>
        }
      />
    </div>
  );
}
