"use client";

import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { SparkIcon, SwordIcon } from "@/components/ui/icons";
import {
  ITEM_CATEGORIES,
  ITEM_RARITIES,
  type Character,
  type Currency,
  type ItemRarity,
  type RollSpec,
} from "@/lib/domain/types";
import {
  ATTUNEMENT_LIMIT,
  attunedCount,
  encumbrance,
  itemWeight,
  totalWealthGp,
} from "@/lib/domain/character";
import { parseRollSpec, spec } from "@/lib/domain/dice";

const RARITY_TONE: Record<ItemRarity, Parameters<typeof Badge>[0]["tone"]> = {
  common: "neutral",
  uncommon: "forest",
  rare: "arcane",
  "very-rare": "oxblood",
  legendary: "brass",
  artifact: "oxblood",
};
const rarityLabel = (r: ItemRarity) =>
  ITEM_RARITIES.find((x) => x.key === r)?.label ?? r;

const COINS: { key: keyof Currency; label: string }[] = [
  { key: "pp", label: "PP" },
  { key: "gp", label: "GP" },
  { key: "ep", label: "EP" },
  { key: "sp", label: "SP" },
  { key: "cp", label: "CP" },
];

const fmtNum = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");

export function EquipmentPanel({
  character: c,
  onRoll,
}: {
  character: Character;
  /** Roll a spec through the provider (broadcasts in multiplayer). */
  onRoll: (s: RollSpec) => void;
}) {
  const enc = encumbrance(c);
  const wealth = totalWealthGp(c);
  const attuned = attunedCount(c);
  const pct = Math.max(
    0,
    Math.min(100, (enc.weight / Math.max(1, enc.capacity)) * 100),
  );

  const barColor =
    enc.level === "unencumbered"
      ? "bg-forest"
      : enc.level === "encumbered"
        ? "bg-brass"
        : "bg-oxblood";

  const weapons = c.inventory.filter(
    (i) => i.category === "weapon" && (i.attackBonus !== undefined || i.damage),
  );

  const groups = ITEM_CATEGORIES.map((cat) => ({
    cat,
    items: c.inventory.filter((i) => (i.category ?? "other") === cat.key),
  })).filter((g) => g.items.length > 0);

  return (
    <Panel
      title="Equipment & Inventory"
      eyebrow="Carried goods"
      action={
        <span
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            enc.level === "unencumbered"
              ? "border-forest/40 bg-forest/10 text-forest"
              : enc.level === "encumbered"
                ? "border-brass/40 bg-brass/10 text-brass-dark"
                : "border-oxblood/40 bg-oxblood/10 text-oxblood",
          )}
        >
          {enc.label}
        </span>
      }
    >
      {/* Summary: weight + wealth + attunement */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-ink-faint">
              Weight
            </span>
            <span className="numerals text-sm font-bold text-ink">
              {fmtNum(enc.weight)}
              <span className="text-ink-faint"> / {enc.capacity} lb</span>
            </span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full border border-parchment-400/60 bg-parchment-300/50">
            <div
              className={cn("h-full rounded-full transition-all", barColor)}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="rounded-card border border-parchment-400/60 bg-parchment-100/60 px-3 py-2">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-ink-faint">
            Total Wealth
          </p>
          <p className="numerals font-display text-lg font-bold text-brass-dark">
            {fmtNum(wealth)}{" "}
            <span className="text-xs font-normal text-ink-faint">gp</span>
          </p>
        </div>
        <div className="rounded-card border border-parchment-400/60 bg-parchment-100/60 px-3 py-2">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-ink-faint">
            Attunement
          </p>
          <p
            className={cn(
              "numerals font-display text-lg font-bold",
              attuned > ATTUNEMENT_LIMIT ? "text-oxblood" : "text-ink",
            )}
          >
            {attuned}{" "}
            <span className="text-xs font-normal text-ink-faint">
              / {ATTUNEMENT_LIMIT}
            </span>
          </p>
        </div>
      </div>

      {/* Currency */}
      <div className="mt-4 flex flex-wrap gap-2">
        {COINS.map(({ key, label }) => (
          <span
            key={key}
            className="numerals inline-flex items-center gap-1 rounded-full border border-parchment-400/60 bg-parchment-100/70 px-2.5 py-0.5 text-sm text-ink"
          >
            <span className="font-bold">{c.currency?.[key] ?? 0}</span>
            <span className="text-[0.6rem] font-semibold text-ink-faint">
              {label}
            </span>
          </span>
        ))}
      </div>

      {/* Attacks */}
      {weapons.length > 0 && (
        <div className="mt-5">
          <h3 className="heading-flourish mb-2 inline-flex items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-[0.12em] text-oxblood">
            <SwordIcon className="h-4 w-4" /> Attacks
          </h3>
          <div className="overflow-hidden rounded-card border border-parchment-400/60">
            {weapons.map((w) => {
              const dmg = w.damage ? parseRollSpec(w.damage) : null;
              return (
                <div
                  key={w.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-parchment-400/40 bg-parchment-100/50 px-3 py-2 last:border-0"
                >
                  <span className="min-w-32 flex-1 text-sm font-semibold text-ink">
                    {w.name}
                    {w.properties && (
                      <span className="block text-[0.65rem] font-normal text-ink-faint">
                        {w.properties}
                      </span>
                    )}
                  </span>
                  {w.attackBonus !== undefined && (
                    <button
                      onClick={() =>
                        onRoll(
                          spec(1, 20, w.attackBonus ?? 0, "normal", `${w.name} — attack`),
                        )
                      }
                      className="numerals rounded-md border border-brass/50 px-2.5 py-1 text-sm font-bold text-ink hover:bg-brass hover:text-leather"
                      title="Roll to hit"
                    >
                      {w.attackBonus >= 0 ? `+${w.attackBonus}` : w.attackBonus} to hit
                    </button>
                  )}
                  {w.damage && (
                    <button
                      onClick={() => {
                        const s = parseRollSpec(w.damage!, `${w.name} — damage`);
                        if (s) onRoll(s);
                      }}
                      disabled={!dmg}
                      className="numerals rounded-md border border-oxblood/40 px-2.5 py-1 text-sm font-semibold text-oxblood hover:bg-oxblood hover:text-parchment-50 disabled:opacity-50"
                      title="Roll damage"
                    >
                      {w.damage}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Inventory grouped by category */}
      <div className="mt-5">
        {c.inventory.length === 0 ? (
          <p className="text-sm text-ink-faint">No items recorded.</p>
        ) : (
          <div className="space-y-4">
            {groups.map(({ cat, items }) => (
              <div key={cat.key}>
                <p className="mb-1.5 font-display text-xs font-semibold uppercase tracking-[0.15em] text-brass-dark">
                  {cat.label}
                </p>
                <ul className="space-y-1">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start justify-between gap-3 rounded-md border border-parchment-400/40 bg-parchment-100/40 px-3 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-ink">
                            {item.name}
                          </span>
                          {item.quantity > 1 && (
                            <span className="numerals text-xs text-ink-soft">
                              ×{item.quantity}
                            </span>
                          )}
                          {item.equipped && (
                            <Badge tone="forest">equipped</Badge>
                          )}
                          {item.attuned && (
                            <Badge tone="arcane">
                              <SparkIcon className="h-3 w-3" /> attuned
                            </Badge>
                          )}
                          {item.rarity && (
                            <Badge tone={RARITY_TONE[item.rarity]}>
                              {rarityLabel(item.rarity)}
                            </Badge>
                          )}
                        </div>
                        {item.properties && (
                          <p className="text-[0.7rem] italic text-ink-faint">
                            {item.properties}
                          </p>
                        )}
                        {item.description && (
                          <p className="text-xs text-ink-soft">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right text-xs text-ink-faint">
                        {(item.weight ?? 0) > 0 && (
                          <div className="numerals">
                            {fmtNum(itemWeight(item))} lb
                          </div>
                        )}
                        {(item.value ?? 0) > 0 && (
                          <div className="numerals text-brass-dark">
                            {fmtNum((item.value ?? 0) * item.quantity)} gp
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
