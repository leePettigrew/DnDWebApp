"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { TextField } from "@/components/ui/Field";
import { Markdown } from "@/components/ui/Markdown";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EditIcon, FeatherIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { useSessionLogs } from "@/lib/data/hooks";
import { newSessionLogInput } from "@/lib/domain/factories";
import type { SessionLog } from "@/lib/domain/types";

export function ChronicleTab({ campaignId }: { campaignId?: string }) {
  const { items, create, update, remove } = useSessionLogs();
  const logs = items
    .filter((l) => l.campaignId === campaignId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const [editing, setEditing] = useState<SessionLog | null>(null);
  const [deleting, setDeleting] = useState<SessionLog | null>(null);

  async function createLog() {
    const created = await create(newSessionLogInput(campaignId));
    setEditing(created);
  }

  function save() {
    if (!editing) return;
    void update(editing.id, {
      title: editing.title.trim() || "Untitled Session",
      date: editing.date,
      body: editing.body,
    });
    setEditing(null);
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="secondary" size="sm" onClick={createLog}>
          <PlusIcon className="h-4 w-4" /> New Entry
        </Button>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={<FeatherIcon />}
          title="The chronicle is blank"
          description="Record what happened each session — the tale starts here."
          action={
            <Button variant="secondary" onClick={createLog}>
              <PlusIcon className="h-4 w-4" /> New Entry
            </Button>
          }
        />
      ) : (
        <ol className="relative space-y-5 border-l-2 border-parchment-400/60 pl-6">
          {logs.map((l) => (
            <li key={l.id} className="relative">
              <span className="absolute -left-[1.95rem] top-1.5 h-3 w-3 rounded-full border-2 border-brass bg-parchment-100" />
              <Panel tone="flat">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="numerals font-display text-xs uppercase tracking-[0.15em] text-brass-dark">
                      {l.date}
                    </p>
                    <h3 className="font-display text-xl font-bold text-ink">
                      {l.title}
                    </h3>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => setEditing(l)}
                      aria-label={`Edit ${l.title}`}
                      className="rounded-md p-1.5 text-ink-faint hover:bg-parchment-300/60 hover:text-ink"
                    >
                      <EditIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setDeleting(l)}
                      aria-label={`Delete ${l.title}`}
                      className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {l.body && (
                  <div className="mt-2">
                    <Markdown source={l.body} />
                  </div>
                )}
              </Panel>
            </li>
          ))}
        </ol>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Edit session entry"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save}>Save entry</Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Title"
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
              <TextField
                label="Date"
                type="date"
                value={editing.date}
                onChange={(e) => setEditing({ ...editing, date: e.target.value })}
              />
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
                  What happened
                </span>
                <span className="text-xs text-ink-faint">Markdown supported</span>
              </div>
              <textarea
                value={editing.body}
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                rows={12}
                className="w-full rounded-md border border-parchment-400/80 bg-parchment-50/80 px-3 py-2 font-mono text-sm leading-relaxed text-ink shadow-inner focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40"
              />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove(deleting.id)}
        title="Delete session entry?"
        message={
          <>
            <strong>{deleting?.title}</strong> will be removed from the chronicle.
          </>
        }
      />
    </div>
  );
}
