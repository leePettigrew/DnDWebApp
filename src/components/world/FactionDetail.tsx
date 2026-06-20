"use client";

import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Portrait } from "@/components/ui/Portrait";
import { TextField, TextArea, SelectField } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { ChevronLeftIcon, TrashIcon } from "@/components/ui/icons";
import { VisibilityControl } from "@/components/dm/VisibilityControl";
import { FactionReputation } from "./FactionReputation";
import { FactionRelationships } from "./FactionRelationships";
import { FactionMembers } from "./FactionMembers";
import { FactionAgendas } from "./FactionAgendas";
import { FactionQuestsHistory } from "./FactionQuestsHistory";
import { FactionReadView } from "./FactionReadView";
import { FactionEconomySummary } from "./FactionEconomySummary";
import { usePermissions } from "@/lib/data/hooks";
import {
  FACTION_STANDINGS,
  FACTION_TYPES,
  type Faction,
  type FactionStanding,
} from "@/lib/domain/types";

export const STANDING_TONE: Record<FactionStanding, string> = {
  ally: "border-l-forest",
  friendly: "border-l-brass",
  neutral: "border-l-parchment-400",
  suspicious: "border-l-leather",
  hostile: "border-l-oxblood",
};

function Tiers({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <p className="mb-1 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
        {label}
      </p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            aria-label={`${label} ${i}`}
            onClick={() => onChange(value === i ? i - 1 : i)}
            className={cn(
              "h-5 w-5 rounded-full border-2 transition-colors",
              i <= value
                ? "border-brass-dark bg-brass"
                : "border-parchment-400 bg-transparent hover:bg-brass/20",
            )}
          />
        ))}
        <span className="numerals ml-1 text-xs text-ink-faint">{value}/5</span>
      </div>
    </div>
  );
}

export function FactionDetail({
  faction: f,
  onUpdate,
  onDelete,
  onBack,
}: {
  faction: Faction;
  onUpdate: (patch: Partial<Faction>) => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  const isDM = usePermissions().isDM;

  // Players get a clean read-only dossier; the DM gets the full editor.
  if (!isDM) return <FactionReadView faction={f} onBack={onBack} />;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-oxblood"
      >
        <ChevronLeftIcon className="h-4 w-4" /> All factions
      </button>

      {/* Header */}
      <div
        className={cn("surface-raised border-l-4 p-4", STANDING_TONE[f.standing])}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Portrait
            src={f.symbolUrl}
            name={f.name}
            className="h-20 w-20 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <input
                defaultValue={f.name}
                key={`name-${f.id}`}
                onBlur={(e) =>
                  e.target.value !== f.name &&
                  onUpdate({ name: e.target.value })
                }
                className="min-w-48 flex-1 border-b border-transparent bg-transparent font-display text-2xl font-bold text-ink hover:border-parchment-400 focus:border-brass focus:outline-none"
                aria-label="Faction name"
              />
              <button
                type="button"
                onClick={onDelete}
                aria-label="Delete faction"
                className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {f.type && (
                <Badge tone="brass">
                  {FACTION_TYPES.find((t) => t.key === f.type)?.label ?? f.type}
                </Badge>
              )}
              {f.hidden && <Badge tone="oxblood">Hidden</Badge>}
              <select
                aria-label="Standing"
                value={f.standing}
                onChange={(e) =>
                  onUpdate({ standing: e.target.value as FactionStanding })
                }
                className="rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-xs font-semibold text-ink focus:border-brass focus:outline-none"
              >
                {FACTION_STANDINGS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Profile */}
      <Panel title="Profile" eyebrow="Who they are">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Type"
            value={f.type ?? ""}
            onChange={(e) =>
              onUpdate({ type: (e.target.value || undefined) as Faction["type"] })
            }
          >
            <option value="">—</option>
            {FACTION_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Headquarters"
            placeholder="e.g. Sea Ward, Waterdeep"
            defaultValue={f.hq ?? ""}
            key={`hq-${f.id}`}
            onBlur={(e) =>
              e.target.value !== (f.hq ?? "") && onUpdate({ hq: e.target.value })
            }
          />
          <TextField
            label="Symbol / banner image URL"
            placeholder="https://…"
            defaultValue={f.symbolUrl ?? ""}
            key={`sym-${f.id}`}
            onBlur={(e) =>
              e.target.value !== (f.symbolUrl ?? "") &&
              onUpdate({ symbolUrl: e.target.value })
            }
          />
          <label className="text-xs">
            <span className="mb-0.5 block font-semibold uppercase tracking-wide text-ink-faint">
              Accent color
            </span>
            <input
              type="color"
              value={f.color ?? "#8a6d3b"}
              onChange={(e) => onUpdate({ color: e.target.value })}
              className="h-9 w-16 cursor-pointer rounded-md border border-parchment-400 bg-parchment-50"
              aria-label="Accent color"
            />
          </label>
          <Tiers
            label="Power"
            value={f.power ?? 0}
            onChange={(v) => onUpdate({ power: v })}
          />
          <Tiers
            label="Wealth"
            value={f.wealth ?? 0}
            onChange={(v) => onUpdate({ wealth: v })}
          />
        </div>
        <div className="mt-4 space-y-4">
          <TextArea
            label="Description"
            rows={3}
            placeholder="Who are they, and what's their reputation?"
            defaultValue={f.description ?? ""}
            key={`desc-${f.id}`}
            onBlur={(e) =>
              e.target.value !== (f.description ?? "") &&
              onUpdate({ description: e.target.value })
            }
          />
          <TextField
            label="Goals"
            placeholder="What do they want?"
            defaultValue={f.goals ?? ""}
            key={`goals-${f.id}`}
            onBlur={(e) =>
              e.target.value !== (f.goals ?? "") &&
              onUpdate({ goals: e.target.value })
            }
          />
        </div>
      </Panel>

      <FactionReputation faction={f} onUpdate={onUpdate} />

      <FactionMembers faction={f} onUpdate={onUpdate} />

      <FactionRelationships faction={f} />

      <FactionEconomySummary faction={f} />

      <FactionAgendas faction={f} onUpdate={onUpdate} />

      <FactionQuestsHistory faction={f} onUpdate={onUpdate} />

      {/* Notes */}
      <Panel title="Notes">
        <TextArea
          label="Table notes"
          rows={3}
          defaultValue={f.notes ?? ""}
          key={`notes-${f.id}`}
          onBlur={(e) =>
            e.target.value !== (f.notes ?? "") &&
            onUpdate({ notes: e.target.value })
          }
        />
      </Panel>

      {/* DM-only: secrets + visibility */}
      {isDM && (
        <Panel title="DM Only" eyebrow="Secrets &amp; visibility">
          <TextArea
            label="Secret intel (players never see this)"
            rows={3}
            defaultValue={f.secrets ?? ""}
            key={`sec-${f.id}`}
            onBlur={(e) =>
              e.target.value !== (f.secrets ?? "") &&
              onUpdate({ secrets: e.target.value })
            }
          />
          <div className="mt-4">
            <VisibilityControl
              hidden={f.hidden}
              visibleTo={f.visibleTo}
              onChange={(p) => onUpdate(p)}
            />
          </div>
        </Panel>
      )}
    </div>
  );
}
