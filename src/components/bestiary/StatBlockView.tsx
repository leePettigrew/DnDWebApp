"use client";

import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { Portrait } from "@/components/ui/Portrait";
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  type Feature,
  type StatBlock,
} from "@/lib/domain/types";
import { abilityMod, formatModifier } from "@/lib/domain/character";

function MetaLine({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <p className="text-sm text-ink-soft">
      <span className="font-semibold text-ink">{label}</span> {value}
    </p>
  );
}

function FeatureList({ title, items }: { title: string; items: Feature[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="heading-flourish mb-2 font-display text-base font-semibold text-oxblood">
        {title}
      </h3>
      <ul className="space-y-2">
        {items.map((f) => (
          <li key={f.id} className="text-sm">
            <span className="font-display font-semibold italic text-ink">
              {f.name}.
            </span>{" "}
            <span className="text-ink-soft">{f.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatBlockView({ statBlock: s }: { statBlock: StatBlock }) {
  return (
    <div className="space-y-6">
      <Panel tone="flat">
        <div className="flex flex-col gap-5 sm:flex-row">
          <Portrait
            src={s.portraitUrl}
            name={s.name}
            className="h-28 w-28 shrink-0 self-center sm:self-start"
          />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-3xl font-bold text-ink">{s.name}</h2>
              <Badge tone={s.kind === "npc" ? "arcane" : "oxblood"}>
                {s.kind.toUpperCase()}
              </Badge>
            </div>
            <p className="italic text-ink-soft">
              {[s.size, s.type, s.alignment].filter(Boolean).join(", ")}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-card border border-parchment-400/60 bg-parchment-100/70 px-3 py-2 text-center">
                <p className="text-[0.6rem] uppercase tracking-[0.15em] text-ink-faint">Armor Class</p>
                <p className="numerals font-display text-xl font-bold text-ink">{s.armorClass}</p>
                {s.armorNote && <p className="text-[0.65rem] text-ink-faint">{s.armorNote}</p>}
              </div>
              <div className="rounded-card border border-parchment-400/60 bg-parchment-100/70 px-3 py-2 text-center">
                <p className="text-[0.6rem] uppercase tracking-[0.15em] text-ink-faint">Hit Points</p>
                <p className="numerals font-display text-xl font-bold text-oxblood">{s.maxHp}</p>
                {s.hitDiceFormula && <p className="text-[0.65rem] text-ink-faint">{s.hitDiceFormula}</p>}
              </div>
              <div className="rounded-card border border-parchment-400/60 bg-parchment-100/70 px-3 py-2 text-center">
                <p className="text-[0.6rem] uppercase tracking-[0.15em] text-ink-faint">Speed</p>
                <p className="font-display text-sm font-bold text-ink">{s.speed ?? "—"}</p>
              </div>
              <div className="rounded-card border border-parchment-400/60 bg-parchment-100/70 px-3 py-2 text-center">
                <p className="text-[0.6rem] uppercase tracking-[0.15em] text-ink-faint">Challenge</p>
                <p className="numerals font-display text-xl font-bold text-brass-dark">{s.challengeRating ?? "—"}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Ability scores */}
        <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ABILITY_KEYS.map((key) => {
            const mod = abilityMod(s.abilityScores, key);
            return (
              <div
                key={key}
                className="rounded-card border border-parchment-400/60 bg-parchment-100/70 py-2 text-center"
              >
                <p className="text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                  {ABILITY_LABELS[key].slice(0, 3)}
                </p>
                <p className="numerals font-display text-lg font-bold text-ink">
                  {s.abilityScores[key]}
                </p>
                <p className="numerals text-xs text-ink-soft">
                  {formatModifier(mod)}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 space-y-1 rule-illuminated pt-3">
          <MetaLine label="Saving Throws" value={s.savingThrows} />
          <MetaLine label="Skills" value={s.skills} />
          <MetaLine label="Damage Vulnerabilities" value={s.damageVulnerabilities} />
          <MetaLine label="Damage Resistances" value={s.damageResistances} />
          <MetaLine label="Damage Immunities" value={s.damageImmunities} />
          <MetaLine label="Condition Immunities" value={s.conditionImmunities} />
          <MetaLine label="Senses" value={s.senses} />
          <MetaLine label="Languages" value={s.languages} />
        </div>
      </Panel>

      {(s.traits.length > 0 ||
        s.actions.length > 0 ||
        s.reactions.length > 0 ||
        s.legendaryActions.length > 0) && (
        <Panel>
          <div className="space-y-5">
            <FeatureList title="Traits" items={s.traits} />
            <FeatureList title="Actions" items={s.actions} />
            <FeatureList title="Reactions" items={s.reactions} />
            <FeatureList title="Legendary Actions" items={s.legendaryActions} />
          </div>
        </Panel>
      )}

      {s.notes && (
        <Panel title="DM Notes">
          <p className="whitespace-pre-line text-sm text-ink-soft">{s.notes}</p>
        </Panel>
      )}
    </div>
  );
}
