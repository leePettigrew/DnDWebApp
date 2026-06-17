"use client";

import { Panel } from "@/components/ui/Panel";
import {
  COMBAT_ACTIONS,
  CONDITION_RULES,
  COVER_RULES,
  LIGHT_RULES,
  SKILL_DCS,
  TRAVEL_PACE,
  type RuleLine,
} from "@/lib/dm/reference";

function RuleList({ rules }: { rules: RuleLine[] }) {
  return (
    <ul className="space-y-2">
      {rules.map((r) => (
        <li key={r.name} className="text-sm">
          <span className="font-semibold text-ink">{r.name}.</span>{" "}
          <span className="text-ink-soft">{r.effect}</span>
        </li>
      ))}
    </ul>
  );
}

export function DmScreen() {
  return (
    <div className="space-y-6">
      <Panel title="Conditions" eyebrow="Quick rules">
        <RuleList rules={CONDITION_RULES} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Actions in Combat">
          <RuleList rules={COMBAT_ACTIONS} />
        </Panel>

        <div className="space-y-6">
          <Panel title="Typical Difficulty Classes">
            <ul className="grid grid-cols-2 gap-1.5">
              {SKILL_DCS.map((d) => (
                <li
                  key={d.label}
                  className="flex items-center justify-between rounded-md border border-parchment-400/50 bg-parchment-100/60 px-3 py-1.5 text-sm"
                >
                  <span className="text-ink-soft">{d.label}</span>
                  <span className="numerals font-display font-bold text-ink">
                    {d.dc}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Cover">
            <RuleList rules={COVER_RULES} />
          </Panel>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Travel Pace">
          <RuleList rules={TRAVEL_PACE} />
        </Panel>
        <Panel title="Vision &amp; Light">
          <RuleList rules={LIGHT_RULES} />
        </Panel>
      </div>
    </div>
  );
}
