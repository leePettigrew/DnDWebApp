"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { PlusIcon, SparkIcon } from "@/components/ui/icons";
import { useCharacters, usePermissions } from "@/lib/data/hooks";
import { itemToInventoryItem } from "@/lib/compendium";
import { useCustomContent } from "@/lib/content/context";
import { emptyCurrency } from "@/lib/domain/character";
import { newId } from "@/lib/domain/ids";
import type { InventoryItem } from "@/lib/domain/types";
import {
  LOOT_TIERS,
  coinsToString,
  generateLoot,
  rollCustomTable,
  type LootResult,
  type LootTier,
} from "@/lib/dm/loot";

const selectClass =
  "h-9 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40";

export function TreasureGenerator() {
  const { items: allCharacters, update } = useCharacters();
  const perms = usePermissions();
  const characters = allCharacters.filter((c) => perms.canEdit("characters", c));
  const content = useCustomContent();
  const customTables = content.lootTables;
  const [source, setSource] = useState<string>("tier:1-4");
  const [loot, setLoot] = useState<LootResult | null>(null);
  const [charId, setCharId] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const character =
    characters.find((c) => c.id === charId) ?? characters[0] ?? null;

  function rollSource() {
    if (source.startsWith("custom:")) {
      const rec = customTables.find((r) => r.id === source.slice(7));
      if (rec) setLoot(rollCustomTable(rec.data));
    } else {
      setLoot(generateLoot(source.slice(5) as LootTier));
    }
  }

  function announce(msg: string) {
    setFlash(msg);
    window.setTimeout(() => setFlash((f) => (f === msg ? null : f)), 2400);
  }
  function addItem(idx: number) {
    if (!loot || !character) return;
    const it = loot.magicItems[idx];
    void update(character.id, {
      inventory: [...character.inventory, itemToInventoryItem(it)],
    });
    announce(`Added ${it.name} to ${character.name}.`);
  }
  function addCoins() {
    if (!loot || !character) return;
    const cur = character.currency ?? emptyCurrency();
    void update(character.id, {
      currency: {
        cp: cur.cp + loot.coins.cp,
        sp: cur.sp + loot.coins.sp,
        ep: cur.ep + loot.coins.ep,
        gp: cur.gp + loot.coins.gp,
        pp: cur.pp + loot.coins.pp,
      },
    });
    announce(`Added coins to ${character.name}.`);
  }
  function valuableToItem(v: string): InventoryItem {
    const m = v.match(/\(([\d,]+)\s*gp\)/i);
    const value = m ? Number(m[1].replace(/,/g, "")) : undefined;
    const name = v.replace(/\s*\([\d,]+\s*gp\)\s*$/i, "").trim() || v;
    return { id: newId(), name, quantity: 1, category: "treasure", value };
  }
  function addValuable(idx: number) {
    if (!loot || !character) return;
    const item = valuableToItem(loot.valuables[idx]);
    void update(character.id, {
      inventory: [...character.inventory, item],
    });
    announce(`Added ${item.name} to ${character.name}.`);
  }

  return (
    <Panel title="Treasure &amp; Loot" eyebrow="Hoard generator">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Loot source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className={selectClass}
        >
          <optgroup label="Standard (by CR)">
            {LOOT_TIERS.map((t) => (
              <option key={t.key} value={`tier:${t.key}`}>
                {t.label}
              </option>
            ))}
          </optgroup>
          {customTables.length > 0 && (
            <optgroup label="Homebrew tables">
              {customTables.map((r) => (
                <option key={r.id} value={`custom:${r.id}`}>
                  {r.data.name || "Untitled table"}
                  {r.scope === "global" ? " (global)" : ""}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <Button size="sm" onClick={rollSource}>
          <SparkIcon className="h-4 w-4" /> Roll hoard
        </Button>
        {characters.length > 0 && (
          <label className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
            Add items to
            <select
              aria-label="Target character"
              value={character?.id ?? ""}
              onChange={(e) => setCharId(e.target.value)}
              className={selectClass}
            >
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {flash && (
        <p className="mt-3 animate-fade-in rounded-md border border-forest/40 bg-forest/10 px-3 py-2 text-sm font-semibold text-forest">
          {flash}
        </p>
      )}

      {loot && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-card border border-brass/40 bg-brass/5 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-brass-dark">
                Coins
              </p>
              <p className="numerals mt-1 text-lg font-bold text-ink">
                {coinsToString(loot.coins)}
              </p>
            </div>
            <button
              type="button"
              onClick={addCoins}
              disabled={!character}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-md border border-brass/50 px-2.5 py-1 text-xs font-semibold text-brass-dark hover:bg-brass hover:text-parchment-50",
                !character &&
                  "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-brass-dark",
              )}
            >
              <PlusIcon className="h-3.5 w-3.5" /> Add to purse
            </button>
          </div>

          <div>
            <p className="mb-1.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
              Gems &amp; Art
            </p>
            {loot.valuables.length === 0 ? (
              <p className="text-sm text-ink-faint">None this time.</p>
            ) : (
              <ul className="space-y-1.5">
                {loot.valuables.map((v, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-md border border-brass/30 bg-brass/5 px-3 py-2"
                  >
                    <Badge tone="brass">{v}</Badge>
                    <button
                      type="button"
                      onClick={() => addValuable(i)}
                      disabled={!character}
                      className={cn(
                        "ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border border-brass/50 px-2 py-1 text-xs font-semibold text-brass-dark hover:bg-brass hover:text-parchment-50",
                        !character &&
                          "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-brass-dark",
                      )}
                    >
                      <PlusIcon className="h-3.5 w-3.5" /> Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
              Magic Items
            </p>
            {loot.magicItems.length === 0 ? (
              <p className="text-sm text-ink-faint">None this time.</p>
            ) : (
              <ul className="space-y-1.5">
                {loot.magicItems.map((it, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded-md border border-arcane/30 bg-arcane/5 px-3 py-2"
                  >
                    <SparkIcon className="h-4 w-4 shrink-0 text-arcane" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">
                        {it.name}
                        {it.rarity && (
                          <span className="ml-2 text-xs font-normal capitalize text-ink-faint">
                            {it.rarity.replace("-", " ")}
                          </span>
                        )}
                      </span>
                      {it.description && (
                        <span className="block text-xs text-ink-soft">
                          {it.description}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => addItem(i)}
                      disabled={!character}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-md border border-brass/50 px-2 py-1 text-xs font-semibold text-brass-dark hover:bg-brass hover:text-parchment-50",
                        !character &&
                          "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-brass-dark",
                      )}
                    >
                      <PlusIcon className="h-3.5 w-3.5" /> Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
