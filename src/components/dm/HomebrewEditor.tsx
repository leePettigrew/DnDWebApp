"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TextField, TextArea, SelectField, NumberField } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import {
  ITEM_CATEGORIES,
  ITEM_RARITIES,
  type CustomItem,
  type CustomSpell,
  type LootTable,
  type LootTableEntry,
} from "@/lib/domain/types";
import {
  useActiveCampaign,
  useCurrentUser,
  useDataProvider,
} from "@/lib/data/hooks";
import { useCustomContent } from "@/lib/content/context";
import { contentApi, type ContentKind, type ContentScope } from "@/lib/content/api";
import { VisibilityControl } from "@/components/dm/VisibilityControl";

type Draft = CustomSpell | CustomItem | LootTable;

const KIND_TABS: { key: ContentKind; label: string }[] = [
  { key: "spell", label: "Spells" },
  { key: "item", label: "Items" },
  { key: "loot", label: "Loot Tables" },
];

function blankFor(kind: ContentKind): Draft {
  if (kind === "spell")
    return { id: newId(), name: "", level: 0, classes: [], description: "" };
  if (kind === "item") return { id: newId(), name: "", category: "gear" };
  return {
    id: newId(),
    name: "",
    picks: 1,
    coins: { count: 2, sides: 6, multiplier: 10, denomination: "gp" },
    entries: [],
  };
}

const COIN_DENOMS = ["cp", "sp", "ep", "gp", "pp"] as const;

export function HomebrewEditor() {
  const content = useCustomContent();
  const user = useCurrentUser();
  const { role } = useActiveCampaign();
  const { capabilities } = useDataProvider();

  const [scope, setScope] = useState<ContentScope>("campaign");
  const [kind, setKind] = useState<ContentKind>("spell");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!content.enabled) {
    return (
      <Panel title="Homebrew" eyebrow="Custom content">
        <p className="text-sm text-ink-faint">
          Homebrew content is stored on the multiplayer server. Connect a backend
          (set NEXT_PUBLIC_MULTIPLAYER_WS_URL) to author custom spells, items, and
          loot tables.
        </p>
      </Panel>
    );
  }

  const isAdmin = !!user?.isAdmin;
  const isDM = !capabilities.multiUser || role === "dm";
  const canWrite =
    scope === "global" ? isAdmin : isDM && !!content.campaignId;

  const all =
    kind === "spell"
      ? content.spells
      : kind === "item"
        ? content.items
        : content.lootTables;
  const records = all.filter((r) => r.scope === scope);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setEditing((d) => (d ? ({ ...d, [key]: value } as Draft) : d));
  }

  async function save() {
    if (!editing || !canWrite) return;
    const data = { ...editing, name: (editing.name || "").trim() };
    if (!data.name) {
      setErr("A name is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (scope === "global") {
        await contentApi.putGlobal(kind, data.id, data);
      } else {
        await contentApi.putCampaign(content.campaignId!, kind, data.id, data);
      }
      await content.refresh();
      setEditing(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this homebrew entry?")) return;
    setErr(null);
    try {
      if (scope === "global") await contentApi.deleteGlobal(id);
      else await contentApi.deleteCampaign(content.campaignId!, id);
      await content.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  const segBtn =
    "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors";

  return (
    <Panel title="Homebrew" eyebrow="Custom content">
      {/* Scope + kind */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-card border border-parchment-400/70 bg-parchment-100 p-1">
          <button
            className={cn(
              segBtn,
              scope === "campaign"
                ? "bg-oxblood text-parchment-50 shadow-card"
                : "text-ink-soft hover:bg-parchment-300/60",
            )}
            onClick={() => {
              setScope("campaign");
              setEditing(null);
            }}
          >
            This campaign
          </button>
          {isAdmin && (
            <button
              className={cn(
                segBtn,
                scope === "global"
                  ? "bg-oxblood text-parchment-50 shadow-card"
                  : "text-ink-soft hover:bg-parchment-300/60",
              )}
              onClick={() => {
                setScope("global");
                setEditing(null);
              }}
            >
              Global library
            </button>
          )}
        </div>
        <div className="inline-flex gap-1 rounded-card border border-parchment-400/70 bg-parchment-100 p-1">
          {KIND_TABS.map((t) => (
            <button
              key={t.key}
              className={cn(
                segBtn,
                kind === t.key
                  ? "bg-brass/30 text-brass-dark"
                  : "text-ink-soft hover:bg-parchment-300/60",
              )}
              onClick={() => {
                setKind(t.key);
                setEditing(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {canWrite && (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setEditing(blankFor(kind))}
          >
            <PlusIcon className="h-4 w-4" /> New
          </Button>
        )}
      </div>

      {!canWrite && (
        <p className="mt-3 text-sm text-ink-faint">
          {scope === "global"
            ? "Only the server admin can edit the global library."
            : "Only this campaign's DM can add homebrew. (Open a campaign as DM.)"}
        </p>
      )}
      {err && <p className="mt-3 text-sm text-oxblood">{err}</p>}

      {/* Editor form */}
      {editing && canWrite && (
        <div className="mt-4 rounded-card border border-brass/40 bg-brass/5 p-4">
          {kind === "spell" && (
            <SpellForm draft={editing as CustomSpell} update={update} />
          )}
          {kind === "item" && (
            <ItemForm draft={editing as CustomItem} update={update} />
          )}
          {kind === "loot" && (
            <LootForm draft={editing as LootTable} setDraft={setEditing} />
          )}
          {scope === "campaign" && (
            <div className="mt-4">
              <VisibilityControl
                hidden={(editing as { hidden?: boolean }).hidden}
                visibleTo={(editing as { visibleTo?: string[] }).visibleTo}
                onChange={(p) =>
                  setEditing((d) =>
                    d
                      ? ({ ...d, hidden: p.hidden, visibleTo: p.visibleTo } as Draft)
                      : d,
                  )
                }
              />
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <Button onClick={save} disabled={busy}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      <ul className="mt-4 space-y-1.5">
        {records.length === 0 ? (
          <p className="text-sm text-ink-faint">No {kind} homebrew yet.</p>
        ) : (
          records.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-md border border-parchment-400/50 bg-parchment-100/60 px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate font-display font-semibold text-ink">
                {(r.data as { name?: string }).name || "Untitled"}
              </span>
              <Badge tone={scope === "global" ? "brass" : "arcane"}>
                {scope === "global" ? "Global" : "Campaign"}
              </Badge>
              {canWrite && (
                <>
                  <button
                    onClick={() => setEditing(r.data as Draft)}
                    className="rounded-md px-2 py-1 text-xs font-semibold text-brass-dark hover:bg-parchment-300/60"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(r.id)}
                    aria-label="Delete"
                    className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </>
              )}
            </li>
          ))
        )}
      </ul>
    </Panel>
  );

  // --- forms (closures over update/setEditing) ---

  function SpellForm({
    draft,
    update,
  }: {
    draft: CustomSpell;
    update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  }) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Name"
          value={draft.name}
          onChange={(e) => update("name" as keyof Draft, e.target.value as never)}
        />
        <SelectField
          label="Level"
          value={draft.level}
          onChange={(e) =>
            update("level" as keyof Draft, Number(e.target.value) as never)
          }
        >
          <option value={0}>Cantrip</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
            <option key={l} value={l}>
              Level {l}
            </option>
          ))}
        </SelectField>
        <TextField
          label="School"
          value={draft.school ?? ""}
          onChange={(e) => update("school" as keyof Draft, e.target.value as never)}
        />
        <TextField
          label="Classes"
          hint="comma-separated"
          value={draft.classes.join(", ")}
          onChange={(e) =>
            update(
              "classes" as keyof Draft,
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean) as never,
            )
          }
        />
        <TextField
          label="Casting time"
          value={draft.castingTime ?? ""}
          onChange={(e) =>
            update("castingTime" as keyof Draft, e.target.value as never)
          }
        />
        <TextField
          label="Range"
          value={draft.range ?? ""}
          onChange={(e) => update("range" as keyof Draft, e.target.value as never)}
        />
        <TextField
          label="Components"
          value={draft.components ?? ""}
          onChange={(e) =>
            update("components" as keyof Draft, e.target.value as never)
          }
        />
        <TextField
          label="Duration"
          value={draft.duration ?? ""}
          onChange={(e) =>
            update("duration" as keyof Draft, e.target.value as never)
          }
        />
        <label className="flex items-center gap-2 text-sm text-ink-soft sm:col-span-2">
          <input
            type="checkbox"
            checked={!!draft.concentration}
            onChange={(e) =>
              update("concentration" as keyof Draft, e.target.checked as never)
            }
            className="h-4 w-4 accent-arcane"
          />
          Concentration
        </label>
        <div className="sm:col-span-2">
          <TextArea
            label="Description"
            rows={4}
            value={draft.description ?? ""}
            onChange={(e) =>
              update("description" as keyof Draft, e.target.value as never)
            }
          />
        </div>
      </div>
    );
  }

  function ItemForm({
    draft,
    update,
  }: {
    draft: CustomItem;
    update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  }) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Name"
          value={draft.name}
          onChange={(e) => update("name" as keyof Draft, e.target.value as never)}
        />
        <SelectField
          label="Category"
          value={draft.category}
          onChange={(e) =>
            update("category" as keyof Draft, e.target.value as never)
          }
        >
          {ITEM_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Rarity"
          value={draft.rarity ?? ""}
          onChange={(e) =>
            update(
              "rarity" as keyof Draft,
              (e.target.value || undefined) as never,
            )
          }
        >
          <option value="">—</option>
          {ITEM_RARITIES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </SelectField>
        <NumberField
          label="Weight (lb)"
          value={draft.weight ?? 0}
          onChange={(e) =>
            update("weight" as keyof Draft, (Number(e.target.value) || 0) as never)
          }
        />
        <NumberField
          label="Value (gp)"
          value={draft.value ?? 0}
          onChange={(e) =>
            update("value" as keyof Draft, (Number(e.target.value) || 0) as never)
          }
        />
        <TextField
          label="Damage"
          placeholder="1d8+1 slashing"
          value={draft.damage ?? ""}
          onChange={(e) => update("damage" as keyof Draft, e.target.value as never)}
        />
        <div className="sm:col-span-2">
          <TextField
            label="Properties"
            value={draft.properties ?? ""}
            onChange={(e) =>
              update("properties" as keyof Draft, e.target.value as never)
            }
          />
        </div>
        <div className="sm:col-span-2">
          <TextArea
            label="Description"
            rows={3}
            value={draft.description ?? ""}
            onChange={(e) =>
              update("description" as keyof Draft, e.target.value as never)
            }
          />
        </div>
      </div>
    );
  }

  function LootForm({
    draft,
    setDraft,
  }: {
    draft: LootTable;
    setDraft: (d: Draft) => void;
  }) {
    const set = (patch: Partial<LootTable>) =>
      setDraft({ ...draft, ...patch } as Draft);
    const setEntry = (id: string, patch: Partial<LootTableEntry>) =>
      set({
        entries: draft.entries.map((en) =>
          en.id === id ? { ...en, ...patch } : en,
        ),
      });
    const addEntry = () =>
      set({
        entries: [
          ...draft.entries,
          { id: newId(), weight: 1, name: "", category: "gear" },
        ],
      });
    const coins = draft.coins ?? {
      count: 0,
      sides: 6,
      multiplier: 1,
      denomination: "gp" as const,
    };
    const setCoins = (patch: Partial<typeof coins>) =>
      set({ coins: { ...coins, ...patch } });

    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Table name"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <NumberField
            label="Item picks per roll"
            min={0}
            value={draft.picks}
            onChange={(e) => set({ picks: Math.max(0, Number(e.target.value) || 0) })}
          />
        </div>
        <TextField
          label="Description"
          value={draft.description ?? ""}
          onChange={(e) => set({ description: e.target.value })}
        />

        {/* Coins */}
        <div>
          <p className="mb-1 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
            Coins (dice × multiplier)
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <NumberField
              label="Count"
              className="w-20"
              value={coins.count}
              onChange={(e) => setCoins({ count: Number(e.target.value) || 0 })}
            />
            <span className="pb-2 text-ink-faint">d</span>
            <NumberField
              label="Sides"
              className="w-20"
              value={coins.sides}
              onChange={(e) => setCoins({ sides: Number(e.target.value) || 6 })}
            />
            <span className="pb-2 text-ink-faint">×</span>
            <NumberField
              label="Mult"
              className="w-20"
              value={coins.multiplier}
              onChange={(e) =>
                setCoins({ multiplier: Number(e.target.value) || 1 })
              }
            />
            <div className="w-24">
              <SelectField
                label="Coin"
                value={coins.denomination}
                onChange={(e) =>
                  setCoins({
                    denomination: e.target.value as (typeof COIN_DENOMS)[number],
                  })
                }
              >
                {COIN_DENOMS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
        </div>

        {/* Entries */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
              Weighted item entries
            </p>
            <Button variant="secondary" size="sm" onClick={addEntry}>
              <PlusIcon className="h-4 w-4" /> Add entry
            </Button>
          </div>
          {draft.entries.length === 0 ? (
            <p className="text-sm text-ink-faint">
              No entries — add items with weights (higher weight = more likely).
            </p>
          ) : (
            <ul className="space-y-2">
              {draft.entries.map((en) => (
                <li
                  key={en.id}
                  className="flex flex-wrap items-end gap-2 rounded-md border border-parchment-400/50 bg-parchment-100/50 p-2"
                >
                  <NumberField
                    label="Weight"
                    className="w-20"
                    value={en.weight}
                    onChange={(e) =>
                      setEntry(en.id, { weight: Number(e.target.value) || 1 })
                    }
                  />
                  <TextField
                    label="Item (blank = nothing)"
                    className="min-w-40 flex-1"
                    value={en.name}
                    onChange={(e) => setEntry(en.id, { name: e.target.value })}
                  />
                  <NumberField
                    label="Value (gp)"
                    className="w-24"
                    value={en.value ?? 0}
                    onChange={(e) =>
                      setEntry(en.id, { value: Number(e.target.value) || 0 })
                    }
                  />
                  <button
                    onClick={() =>
                      set({
                        entries: draft.entries.filter((x) => x.id !== en.id),
                      })
                    }
                    aria-label="Remove entry"
                    className="mb-1 rounded-md p-2 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }
}
