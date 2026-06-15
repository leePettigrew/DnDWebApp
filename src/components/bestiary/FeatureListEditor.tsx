"use client";

import { Button } from "@/components/ui/Button";
import { TextField, TextArea } from "@/components/ui/Field";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import type { Feature } from "@/lib/domain/types";
import { newId } from "@/lib/domain/ids";

/** Editable list of named entries with descriptions (traits, actions, etc.). */
export function FeatureListEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: Feature[];
  onChange: (items: Feature[]) => void;
}) {
  const update = (id: string, patch: Partial<Feature>) =>
    onChange(items.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-ink-soft">
          {label}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            onChange([...items, { id: newId(), name: "", description: "" }])
          }
        >
          <PlusIcon className="h-4 w-4" /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-ink-faint">None.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((f) => (
            <li key={f.id} className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <TextField
                  label="Name"
                  value={f.name}
                  onChange={(e) => update(f.id, { name: e.target.value })}
                />
                <TextArea
                  label="Description"
                  rows={2}
                  value={f.description ?? ""}
                  onChange={(e) => update(f.id, { description: e.target.value })}
                />
              </div>
              <button
                type="button"
                onClick={() => onChange(items.filter((x) => x.id !== f.id))}
                aria-label={`Remove ${f.name || "entry"}`}
                className="mt-7 rounded-md p-2 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
