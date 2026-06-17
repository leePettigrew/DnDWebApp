"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Portrait } from "@/components/ui/Portrait";
import {
  NumberField,
  SelectField,
  TextArea,
  TextField,
} from "@/components/ui/Field";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  ITEM_CATEGORIES,
  ITEM_RARITIES,
  SKILLS,
  type AbilityKey,
  type Character,
  type Currency,
  type InventoryItem,
  type ItemCategory,
  type ItemRarity,
  type ProficiencyLevel,
  type SkillKey,
} from "@/lib/domain/types";
import { emptyCurrency } from "@/lib/domain/character";
import { newId } from "@/lib/domain/ids";

const COIN_KEYS: { key: keyof Currency; label: string }[] = [
  { key: "pp", label: "Platinum" },
  { key: "gp", label: "Gold" },
  { key: "ep", label: "Electrum" },
  { key: "sp", label: "Silver" },
  { key: "cp", label: "Copper" },
];

export function CharacterEditor({
  character,
  onSave,
  onCancel,
}: {
  character: Character;
  onSave: (next: Character) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Character>(character);

  function set<K extends keyof Character>(key: K, value: Character[K]) {
    setD((prev) => ({ ...prev, [key]: value }));
  }
  const num = (v: string) => (v === "" ? 0 : Number(v));

  const updateItem = (id: string, patch: Partial<InventoryItem>) =>
    set(
      "inventory",
      d.inventory.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  const removeItem = (id: string) =>
    set("inventory", d.inventory.filter((it) => it.id !== id));
  const currency = d.currency ?? emptyCurrency();
  const setCoin = (key: keyof Currency, value: number) =>
    set("currency", { ...currency, [key]: value });

  const slotMax = (level: number) =>
    d.spellSlots?.find((s) => s.level === level)?.max ?? 0;
  function setSlotMax(level: number, max: number) {
    const existing = d.spellSlots?.find((s) => s.level === level);
    const slots = (d.spellSlots ?? []).filter((s) => s.level !== level);
    if (max > 0) {
      slots.push({ level, max, used: Math.min(existing?.used ?? 0, max) });
    }
    slots.sort((a, b) => a.level - b.level);
    set("spellSlots", slots);
  }

  return (
    <div className="space-y-6">
      {/* Sticky save bar */}
      <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-card border border-brass/50 bg-parchment-50/95 px-4 py-2.5 shadow-gilt backdrop-blur">
        <span className="font-display text-sm font-semibold text-ink">
          Editing {d.name || "hero"}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSave(d)}>
            Save sheet
          </Button>
        </div>
      </div>

      <Panel title="Identity">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-col items-center gap-2">
            <Portrait src={d.portraitUrl} name={d.name} className="h-24 w-24" />
          </div>
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            <TextField label="Name" value={d.name} onChange={(e) => set("name", e.target.value)} />
            <TextField label="Portrait URL" hint="art slot" placeholder="https://…" value={d.portraitUrl ?? ""} onChange={(e) => set("portraitUrl", e.target.value)} />
            <TextField label="Race" value={d.race} onChange={(e) => set("race", e.target.value)} />
            <TextField label="Class" value={d.className} onChange={(e) => set("className", e.target.value)} />
            <TextField label="Subclass" value={d.subclass ?? ""} onChange={(e) => set("subclass", e.target.value)} />
            <NumberField label="Level" min={1} max={20} value={d.level} onChange={(e) => set("level", Math.max(1, Math.min(20, num(e.target.value))))} />
            <TextField label="Background" value={d.background ?? ""} onChange={(e) => set("background", e.target.value)} />
            <TextField label="Alignment" value={d.alignment ?? ""} onChange={(e) => set("alignment", e.target.value)} />
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Combat">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumberField label="Armor Class" value={d.armorClass} onChange={(e) => set("armorClass", num(e.target.value))} />
            <NumberField label="Speed" value={d.speed} onChange={(e) => set("speed", num(e.target.value))} />
            <NumberField label="Init bonus" value={d.initiativeBonus ?? 0} onChange={(e) => set("initiativeBonus", num(e.target.value))} />
            <NumberField label="Max HP" value={d.maxHp} onChange={(e) => set("maxHp", num(e.target.value))} />
            <NumberField label="Current HP" value={d.currentHp} onChange={(e) => set("currentHp", num(e.target.value))} />
            <NumberField label="Temp HP" value={d.tempHp} onChange={(e) => set("tempHp", num(e.target.value))} />
            <TextField label="Hit Dice" value={d.hitDice ?? ""} onChange={(e) => set("hitDice", e.target.value)} />
            <SelectField
              label="Hit die"
              value={d.hitDieSize ?? 8}
              onChange={(e) => set("hitDieSize", num(e.target.value))}
            >
              {[6, 8, 10, 12].map((s) => (
                <option key={s} value={s}>
                  d{s}
                </option>
              ))}
            </SelectField>
          </div>
        </Panel>

        <Panel title="Ability Scores">
          <div className="grid grid-cols-3 gap-3">
            {ABILITY_KEYS.map((key) => (
              <NumberField
                key={key}
                label={ABILITY_LABELS[key].slice(0, 3)}
                value={d.abilityScores[key]}
                onChange={(e) =>
                  set("abilityScores", {
                    ...d.abilityScores,
                    [key]: num(e.target.value),
                  })
                }
              />
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Saving Throw Proficiencies">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ABILITY_KEYS.map((key) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-parchment-400/60 bg-parchment-100/60 px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={!!d.savingThrowProficiencies[key]}
                  onChange={(e) =>
                    set("savingThrowProficiencies", {
                      ...d.savingThrowProficiencies,
                      [key]: e.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-oxblood"
                />
                <span className="text-sm text-ink">{ABILITY_LABELS[key]}</span>
              </label>
            ))}
          </div>
        </Panel>

        <Panel title="Spellcasting">
          <SelectField
            label="Spellcasting ability"
            value={d.spellcastingAbility ?? ""}
            onChange={(e) =>
              set(
                "spellcastingAbility",
                (e.target.value || undefined) as AbilityKey | undefined,
              )
            }
          >
            <option value="">None</option>
            {ABILITY_KEYS.map((key) => (
              <option key={key} value={key}>
                {ABILITY_LABELS[key]}
              </option>
            ))}
          </SelectField>

          <div className="mt-4">
            <p className="mb-1.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
              Spell slots — max per level
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
                <NumberField
                  key={lvl}
                  label={`Lvl ${lvl}`}
                  min={0}
                  max={9}
                  value={slotMax(lvl)}
                  onChange={(e) =>
                    setSlotMax(lvl, Math.max(0, Math.min(9, num(e.target.value))))
                  }
                />
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Skill Proficiencies">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SKILLS.map((skill) => (
            <div
              key={skill.key}
              className="flex items-center gap-2 rounded-md border border-parchment-400/50 bg-parchment-100/50 px-2 py-1.5"
            >
              <span className="flex-1 text-sm text-ink">{skill.label}</span>
              <select
                aria-label={`${skill.label} proficiency`}
                value={d.skillProficiencies[skill.key as SkillKey] ?? "none"}
                onChange={(e) =>
                  set("skillProficiencies", {
                    ...d.skillProficiencies,
                    [skill.key]: e.target.value as ProficiencyLevel,
                  })
                }
                className="rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-xs text-ink focus:border-brass focus:outline-none"
              >
                <option value="none">—</option>
                <option value="proficient">Prof</option>
                <option value="expertise">Expert</option>
              </select>
            </div>
          ))}
        </div>
      </Panel>

      {/* Inventory editor */}
      <Panel
        title="Inventory & Equipment"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              set("inventory", [
                ...d.inventory,
                { id: newId(), name: "", quantity: 1, category: "gear" },
              ])
            }
          >
            <PlusIcon className="h-4 w-4" /> Add item
          </Button>
        }
      >
        {d.inventory.length === 0 ? (
          <p className="text-sm text-ink-faint">No items yet.</p>
        ) : (
          <ul className="space-y-3">
            {d.inventory.map((item) => (
              <li
                key={item.id}
                className="space-y-2 rounded-card border border-parchment-400/50 bg-parchment-100/40 p-3"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <TextField
                    label="Item"
                    className="min-w-40 flex-1"
                    value={item.name}
                    onChange={(e) => updateItem(item.id, { name: e.target.value })}
                  />
                  <div className="w-36">
                    <SelectField
                      label="Category"
                      value={item.category ?? "gear"}
                      onChange={(e) =>
                        updateItem(item.id, {
                          category: e.target.value as ItemCategory,
                        })
                      }
                    >
                      {ITEM_CATEGORIES.map((cat) => (
                        <option key={cat.key} value={cat.key}>
                          {cat.label}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <NumberField
                    label="Qty"
                    className="w-16"
                    value={item.quantity}
                    onChange={(e) =>
                      updateItem(item.id, { quantity: num(e.target.value) })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label="Remove item"
                    className="mb-0.5 rounded-md p-2 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <NumberField
                    label="Weight (lb)"
                    value={item.weight ?? 0}
                    onChange={(e) =>
                      updateItem(item.id, { weight: num(e.target.value) })
                    }
                  />
                  <NumberField
                    label="Value (gp)"
                    value={item.value ?? 0}
                    onChange={(e) =>
                      updateItem(item.id, { value: num(e.target.value) })
                    }
                  />
                  <SelectField
                    label="Rarity"
                    value={item.rarity ?? ""}
                    onChange={(e) =>
                      updateItem(item.id, {
                        rarity: (e.target.value || undefined) as
                          | ItemRarity
                          | undefined,
                      })
                    }
                  >
                    <option value="">—</option>
                    {ITEM_RARITIES.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                  </SelectField>
                  <div className="flex items-end gap-3 pb-2">
                    <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                      <input
                        type="checkbox"
                        checked={!!item.equipped}
                        onChange={(e) =>
                          updateItem(item.id, { equipped: e.target.checked })
                        }
                        className="h-4 w-4 accent-forest"
                      />
                      Equipped
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                      <input
                        type="checkbox"
                        checked={!!item.attuned}
                        onChange={(e) =>
                          updateItem(item.id, { attuned: e.target.checked })
                        }
                        className="h-4 w-4 accent-arcane"
                      />
                      Attuned
                    </label>
                  </div>
                </div>

                {item.category === "weapon" && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <NumberField
                      label="Atk bonus"
                      value={item.attackBonus ?? 0}
                      onChange={(e) =>
                        updateItem(item.id, { attackBonus: num(e.target.value) })
                      }
                    />
                    <div className="sm:col-span-3">
                      <TextField
                        label="Damage"
                        placeholder="1d8+3 slashing"
                        value={item.damage ?? ""}
                        onChange={(e) =>
                          updateItem(item.id, { damage: e.target.value })
                        }
                      />
                    </div>
                  </div>
                )}

                <TextField
                  label="Properties"
                  placeholder="Finesse, Versatile (1d10), AC 16…"
                  value={item.properties ?? ""}
                  onChange={(e) =>
                    updateItem(item.id, { properties: e.target.value })
                  }
                />
                <TextField
                  label="Description"
                  value={item.description ?? ""}
                  onChange={(e) =>
                    updateItem(item.id, { description: e.target.value })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Coin purse editor */}
      <Panel title="Coin Purse">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {COIN_KEYS.map(({ key, label }) => (
            <NumberField
              key={key}
              label={label}
              value={currency[key]}
              onChange={(e) => setCoin(key, num(e.target.value))}
            />
          ))}
        </div>
      </Panel>

      {/* Spells editor */}
      <Panel
        title="Spells"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              set("spells", [
                ...d.spells,
                { id: newId(), name: "", level: 0 },
              ])
            }
          >
            <PlusIcon className="h-4 w-4" /> Add spell
          </Button>
        }
      >
        {d.spells.length === 0 ? (
          <p className="text-sm text-ink-faint">No spells yet.</p>
        ) : (
          <ul className="space-y-2">
            {d.spells.map((sp) => (
              <li key={sp.id} className="flex flex-wrap items-end gap-2">
                <TextField
                  label="Spell"
                  className="min-w-40 flex-1"
                  value={sp.name}
                  onChange={(e) =>
                    set(
                      "spells",
                      d.spells.map((s) =>
                        s.id === sp.id ? { ...s, name: e.target.value } : s,
                      ),
                    )
                  }
                />
                <div className="w-20">
                  <SelectField
                    label="Level"
                    value={sp.level}
                    onChange={(e) =>
                      set(
                        "spells",
                        d.spells.map((s) =>
                          s.id === sp.id
                            ? { ...s, level: num(e.target.value) }
                            : s,
                        ),
                      )
                    }
                  >
                    <option value={0}>Cantrip</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <label className="flex h-10 items-center gap-1.5 px-1 text-xs text-ink-soft">
                  <input
                    type="checkbox"
                    checked={!!sp.prepared}
                    onChange={(e) =>
                      set(
                        "spells",
                        d.spells.map((s) =>
                          s.id === sp.id
                            ? { ...s, prepared: e.target.checked }
                            : s,
                        ),
                      )
                    }
                    className="h-4 w-4 accent-arcane"
                  />
                  Prepared
                </label>
                <button
                  type="button"
                  onClick={() =>
                    set("spells", d.spells.filter((s) => s.id !== sp.id))
                  }
                  aria-label="Remove spell"
                  className="mb-0.5 rounded-md p-2 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Features editor */}
      <Panel
        title="Features & Traits"
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              set("features", [
                ...d.features,
                { id: newId(), name: "", description: "" },
              ])
            }
          >
            <PlusIcon className="h-4 w-4" /> Add feature
          </Button>
        }
      >
        {d.features.length === 0 ? (
          <p className="text-sm text-ink-faint">No features yet.</p>
        ) : (
          <ul className="space-y-3">
            {d.features.map((f) => (
              <li key={f.id} className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <TextField
                    label="Feature"
                    value={f.name}
                    onChange={(e) =>
                      set(
                        "features",
                        d.features.map((x) =>
                          x.id === f.id ? { ...x, name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <TextArea
                    label="Description"
                    rows={2}
                    value={f.description ?? ""}
                    onChange={(e) =>
                      set(
                        "features",
                        d.features.map((x) =>
                          x.id === f.id
                            ? { ...x, description: e.target.value }
                            : x,
                        ),
                      )
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    set("features", d.features.filter((x) => x.id !== f.id))
                  }
                  aria-label="Remove feature"
                  className="mt-7 rounded-md p-2 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Lore & Notes">
        <div className="space-y-4">
          <TextField label="Languages" value={d.languages ?? ""} onChange={(e) => set("languages", e.target.value)} />
          <TextArea label="Notes" rows={4} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </Panel>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSave(d)}>Save sheet</Button>
      </div>
    </div>
  );
}
