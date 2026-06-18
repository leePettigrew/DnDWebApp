"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import {
  TextField,
  TextArea,
  NumberField,
  SelectField,
} from "@/components/ui/Field";
import {
  ITEM_CATEGORIES,
  ITEM_RARITIES,
  type SrdOverrideTargetKind,
} from "@/lib/domain/types";
import { newId } from "@/lib/domain/ids";
import { useCurrentUser } from "@/lib/data/hooks";
import { useCustomContent } from "@/lib/content/context";
import { contentApi, type ContentScope } from "@/lib/content/api";

type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "csv"
  | "level"
  | "category"
  | "rarity"
  | "bool";

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
}

const FIELDS: Record<SrdOverrideTargetKind, FieldDef[]> = {
  spell: [
    { key: "name", label: "Name", type: "text" },
    { key: "level", label: "Level", type: "level" },
    { key: "school", label: "School", type: "text" },
    { key: "classes", label: "Classes", type: "csv" },
    { key: "castingTime", label: "Casting time", type: "text" },
    { key: "range", label: "Range", type: "text" },
    { key: "components", label: "Components", type: "text" },
    { key: "duration", label: "Duration", type: "text" },
    { key: "concentration", label: "Concentration", type: "bool" },
    { key: "description", label: "Description", type: "textarea" },
  ],
  item: [
    { key: "name", label: "Name", type: "text" },
    { key: "category", label: "Category", type: "category" },
    { key: "rarity", label: "Rarity", type: "rarity" },
    { key: "weight", label: "Weight (lb)", type: "number" },
    { key: "value", label: "Value (gp)", type: "number" },
    { key: "properties", label: "Properties", type: "text" },
    { key: "damage", label: "Damage", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
  ],
  monster: [
    { key: "name", label: "Name", type: "text" },
    { key: "type", label: "Type", type: "text" },
    { key: "armorClass", label: "Armor Class", type: "number" },
    { key: "maxHp", label: "Max HP", type: "number" },
    { key: "challengeRating", label: "Challenge Rating", type: "text" },
  ],
};

export function SrdOverrideModal({
  kind,
  name,
  base,
  onClose,
}: {
  kind: SrdOverrideTargetKind;
  name: string;
  /** The current (SRD-merged) values to pre-fill from. */
  base: Record<string, unknown>;
  onClose: () => void;
}) {
  const content = useCustomContent();
  const me = useCurrentUser();
  const isAdmin = !!me?.isAdmin;

  const [scope, setScope] = useState<ContentScope>("campaign");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The existing override record for the chosen scope, if any.
  const existing = useMemo(
    () =>
      content.overrides.find(
        (r) =>
          r.scope === scope &&
          r.data?.targetKind === kind &&
          (r.data?.targetName ?? "").toLowerCase() === name.toLowerCase(),
      ),
    [content.overrides, scope, kind, name],
  );

  const [hidden, setHidden] = useState<boolean>(!!existing?.data?.hidden);
  const [draft, setDraft] = useState<Record<string, unknown>>({
    ...base,
    ...(existing?.data?.data ?? {}),
  });

  // Reload when scope flips to a different existing override.
  const existingId = existing?.id ?? null;
  const [lastId, setLastId] = useState<string | null>(existingId);
  if (existingId !== lastId) {
    setLastId(existingId);
    setHidden(!!existing?.data?.hidden);
    setDraft({ ...base, ...(existing?.data?.data ?? {}) });
  }

  const set = (key: string, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function save() {
    if (!content.campaignId && scope === "campaign") {
      setErr("Open a campaign first to override for this table.");
      return;
    }
    setBusy(true);
    setErr(null);
    const id = existing?.id ?? newId();
    const override = {
      id,
      targetKind: kind,
      targetName: name,
      hidden,
      data: draft,
    };
    try {
      if (scope === "global") {
        await contentApi.putGlobal("override", id, override);
      } else {
        await contentApi.putCampaign(content.campaignId!, "override", id, override);
      }
      await content.refresh();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function revert() {
    if (!existing) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      if (scope === "global") await contentApi.deleteGlobal(existing.id);
      else await contentApi.deleteCampaign(content.campaignId!, existing.id);
      await content.refresh();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Revert failed.");
    } finally {
      setBusy(false);
    }
  }

  const seg = "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors";

  return (
    <Modal
      open
      onClose={onClose}
      title={`Override: ${name}`}
      size="lg"
      footer={
        <>
          {existing && (
            <Button variant="ghost" onClick={revert} disabled={busy}>
              Revert to SRD
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            Save override
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Scope */}
        <div className="inline-flex gap-1 rounded-card border border-parchment-400/70 bg-parchment-100 p-1">
          <button
            className={cn(
              seg,
              scope === "campaign"
                ? "bg-oxblood text-parchment-50 shadow-card"
                : "text-ink-soft hover:bg-parchment-300/60",
            )}
            onClick={() => setScope("campaign")}
          >
            This campaign
          </button>
          {isAdmin && (
            <button
              className={cn(
                seg,
                scope === "global"
                  ? "bg-oxblood text-parchment-50 shadow-card"
                  : "text-ink-soft hover:bg-parchment-300/60",
              )}
              onClick={() => setScope("global")}
            >
              Global
            </button>
          )}
        </div>

        <label className="flex items-center gap-2 rounded-card border border-oxblood/30 bg-oxblood/5 px-3 py-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
            className="h-4 w-4 accent-oxblood"
          />
          Hide this entry from the compendium{" "}
          {scope === "global" ? "(everywhere)" : "(this campaign)"}
        </label>

        {!hidden && (
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS[kind].map((f) => (
              <Field key={f.key} def={f} value={draft[f.key]} onChange={set} />
            ))}
          </div>
        )}

        {kind === "monster" && (
          <p className="text-xs text-ink-faint">
            For deeper monster edits, use the Compendium&apos;s &ldquo;Add to
            bestiary&rdquo; and edit the stat block there.
          </p>
        )}
        {err && <p className="text-sm text-oxblood">{err}</p>}
      </div>
    </Modal>
  );
}

function Field({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  const wide = def.type === "textarea";
  const cls = wide ? "sm:col-span-2" : "";
  if (def.type === "bool") {
    return (
      <label className="flex items-center gap-2 text-sm text-ink-soft sm:col-span-2">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(def.key, e.target.checked)}
          className="h-4 w-4 accent-arcane"
        />
        {def.label}
      </label>
    );
  }
  if (def.type === "textarea") {
    return (
      <div className={cls}>
        <TextArea
          label={def.label}
          rows={4}
          value={String(value ?? "")}
          onChange={(e) => onChange(def.key, e.target.value)}
        />
      </div>
    );
  }
  if (def.type === "number") {
    return (
      <NumberField
        label={def.label}
        value={Number(value ?? 0)}
        onChange={(e) => onChange(def.key, Number(e.target.value) || 0)}
      />
    );
  }
  if (def.type === "csv") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <TextField
        label={def.label}
        hint="comma-separated"
        value={arr.join(", ")}
        onChange={(e) =>
          onChange(
            def.key,
            e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
      />
    );
  }
  if (def.type === "level") {
    return (
      <SelectField
        label={def.label}
        value={Number(value ?? 0)}
        onChange={(e) => onChange(def.key, Number(e.target.value))}
      >
        <option value={0}>Cantrip</option>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
          <option key={l} value={l}>
            Level {l}
          </option>
        ))}
      </SelectField>
    );
  }
  if (def.type === "category") {
    return (
      <SelectField
        label={def.label}
        value={String(value ?? "gear")}
        onChange={(e) => onChange(def.key, e.target.value)}
      >
        {ITEM_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </SelectField>
    );
  }
  if (def.type === "rarity") {
    return (
      <SelectField
        label={def.label}
        value={String(value ?? "")}
        onChange={(e) => onChange(def.key, e.target.value || undefined)}
      >
        <option value="">—</option>
        {ITEM_RARITIES.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </SelectField>
    );
  }
  return (
    <TextField
      label={def.label}
      value={String(value ?? "")}
      onChange={(e) => onChange(def.key, e.target.value)}
    />
  );
}
