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
import { FeatureListEditor } from "./FeatureListEditor";
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  type Feature,
  type StatBlock,
} from "@/lib/domain/types";

export function StatBlockEditor({
  statBlock,
  onSave,
  onCancel,
}: {
  statBlock: StatBlock;
  onSave: (next: StatBlock) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<StatBlock>(statBlock);
  const set = <K extends keyof StatBlock>(key: K, value: StatBlock[K]) =>
    setD((prev) => ({ ...prev, [key]: value }));
  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <div className="space-y-6">
      <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-card border border-brass/50 bg-parchment-50/95 px-4 py-2.5 shadow-gilt backdrop-blur">
        <span className="font-display text-sm font-semibold text-ink">
          Editing {d.name || "creature"}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSave(d)}>
            Save stat block
          </Button>
        </div>
      </div>

      <Panel title="Identity">
        <div className="flex flex-col gap-4 sm:flex-row">
          <Portrait src={d.portraitUrl} name={d.name} className="h-24 w-24 shrink-0" />
          <div className="grid flex-1 gap-4 sm:grid-cols-2">
            <TextField label="Name" value={d.name} onChange={(e) => set("name", e.target.value)} />
            <SelectField label="Kind" value={d.kind} onChange={(e) => set("kind", e.target.value as StatBlock["kind"])}>
              <option value="monster">Monster</option>
              <option value="npc">NPC</option>
            </SelectField>
            <TextField label="Art URL" hint="art slot" placeholder="https://…" value={d.portraitUrl ?? ""} onChange={(e) => set("portraitUrl", e.target.value)} />
            <TextField label="Size" value={d.size ?? ""} onChange={(e) => set("size", e.target.value)} />
            <TextField label="Type" value={d.type ?? ""} onChange={(e) => set("type", e.target.value)} />
            <TextField label="Alignment" value={d.alignment ?? ""} onChange={(e) => set("alignment", e.target.value)} />
          </div>
        </div>
      </Panel>

      <Panel title="Defenses & Movement">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <NumberField label="Armor Class" value={d.armorClass} onChange={(e) => set("armorClass", num(e.target.value))} />
          <TextField label="AC note" value={d.armorNote ?? ""} onChange={(e) => set("armorNote", e.target.value)} />
          <NumberField label="Max HP" value={d.maxHp} onChange={(e) => set("maxHp", num(e.target.value))} />
          <TextField label="Hit Dice" placeholder="2d8+2" value={d.hitDiceFormula ?? ""} onChange={(e) => set("hitDiceFormula", e.target.value)} />
          <TextField label="Speed" value={d.speed ?? ""} onChange={(e) => set("speed", e.target.value)} />
          <TextField label="Challenge Rating" value={d.challengeRating ?? ""} onChange={(e) => set("challengeRating", e.target.value)} />
        </div>
      </Panel>

      <Panel title="Ability Scores">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
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

      <Panel title="Proficiencies & Resistances">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Saving Throws" value={d.savingThrows ?? ""} onChange={(e) => set("savingThrows", e.target.value)} />
          <TextField label="Skills" value={d.skills ?? ""} onChange={(e) => set("skills", e.target.value)} />
          <TextField label="Senses" value={d.senses ?? ""} onChange={(e) => set("senses", e.target.value)} />
          <TextField label="Languages" value={d.languages ?? ""} onChange={(e) => set("languages", e.target.value)} />
          <TextField label="Damage Vulnerabilities" value={d.damageVulnerabilities ?? ""} onChange={(e) => set("damageVulnerabilities", e.target.value)} />
          <TextField label="Damage Resistances" value={d.damageResistances ?? ""} onChange={(e) => set("damageResistances", e.target.value)} />
          <TextField label="Damage Immunities" value={d.damageImmunities ?? ""} onChange={(e) => set("damageImmunities", e.target.value)} />
          <TextField label="Condition Immunities" value={d.conditionImmunities ?? ""} onChange={(e) => set("conditionImmunities", e.target.value)} />
        </div>
      </Panel>

      <Panel title="Traits, Actions & More">
        <div className="space-y-6">
          <FeatureListEditor label="Traits" items={d.traits} onChange={(v: Feature[]) => set("traits", v)} />
          <FeatureListEditor label="Actions" items={d.actions} onChange={(v: Feature[]) => set("actions", v)} />
          <FeatureListEditor label="Reactions" items={d.reactions} onChange={(v: Feature[]) => set("reactions", v)} />
          <FeatureListEditor label="Legendary Actions" items={d.legendaryActions} onChange={(v: Feature[]) => set("legendaryActions", v)} />
        </div>
      </Panel>

      <Panel title="DM Notes">
        <TextArea rows={4} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </Panel>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSave(d)}>Save stat block</Button>
      </div>
    </div>
  );
}
