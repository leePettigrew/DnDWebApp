"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TextArea, TextField } from "@/components/ui/Field";
import { EditIcon, PlusIcon } from "@/components/ui/icons";
import { useCampaigns } from "@/lib/data/hooks";
import { newCampaignInput } from "@/lib/domain/factories";
import type { Campaign } from "@/lib/domain/types";

export function CampaignBar({
  activeId,
  onChange,
}: {
  activeId: string;
  onChange: (id: string) => void;
}) {
  const { items, create, update } = useCampaigns();
  const [editing, setEditing] = useState(false);
  const active = items.find((c) => c.id === activeId) ?? items[0];
  const [draft, setDraft] = useState<Campaign | null>(null);

  async function createCampaign() {
    const created = await create(newCampaignInput());
    onChange(created.id);
  }

  function openEdit() {
    if (active) {
      setDraft(active);
      setEditing(true);
    }
  }

  function save() {
    if (!draft) return;
    void update(draft.id, {
      name: draft.name,
      setting: draft.setting,
      description: draft.description,
      bannerUrl: draft.bannerUrl,
    });
    setEditing(false);
  }

  return (
    <Panel tone="flat" className="mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-display text-[0.65rem] uppercase tracking-[0.25em] text-brass-dark">
            {active?.setting ?? "Campaign"}
          </p>
          <h2 className="font-display text-2xl font-bold text-ink">
            {active?.name ?? "No campaign"}
          </h2>
          {active?.description && (
            <p className="mt-1 max-w-2xl text-sm text-ink-soft">
              {active.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {items.length > 1 && (
            <select
              value={activeId}
              onChange={(e) => onChange(e.target.value)}
              aria-label="Active campaign"
              className="rounded-md border border-parchment-400 bg-parchment-50 px-3 py-2 text-sm text-ink focus:border-brass focus:outline-none"
            >
              {items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <Button variant="secondary" size="sm" onClick={openEdit} disabled={!active}>
            <EditIcon className="h-4 w-4" /> Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={createCampaign}>
            <PlusIcon className="h-4 w-4" /> New
          </Button>
        </div>
      </div>

      <Modal
        open={editing && draft !== null}
        onClose={() => setEditing(false)}
        title="Edit campaign"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button onClick={save}>Save</Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <TextField
              label="Name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <TextField
              label="Setting"
              value={draft.setting ?? ""}
              onChange={(e) => setDraft({ ...draft, setting: e.target.value })}
            />
            <TextArea
              label="Description"
              rows={4}
              value={draft.description ?? ""}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
            <TextField
              label="Banner image URL"
              hint="art slot"
              placeholder="https://…"
              value={draft.bannerUrl ?? ""}
              onChange={(e) => setDraft({ ...draft, bannerUrl: e.target.value })}
            />
          </div>
        )}
      </Modal>
    </Panel>
  );
}
