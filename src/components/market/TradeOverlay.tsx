"use client";

import { useEffect, useMemo, useState } from "react";
import { CloseIcon, CoinIcon, PlusIcon, MinusIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useActiveTrade, useCharacters, usePermissions } from "@/lib/data/hooks";
import { ITEM_RARITIES } from "@/lib/domain/types";
import type { Character, InventoryItem, ItemRarity } from "@/lib/domain/types";
import type { TradeItemRef, TradeParty } from "@shared/trade";

interface Draft {
  gold: number;
  items: Record<string, number>;
}

const RARITY_ACCENT: Record<ItemRarity, string> = {
  common: "border-l-parchment-400",
  uncommon: "border-l-forest",
  rare: "border-l-arcane",
  "very-rare": "border-l-oxblood",
  legendary: "border-l-brass",
  artifact: "border-l-oxblood",
};
const RARITY_TEXT: Record<ItemRarity, string> = {
  common: "text-ink-soft",
  uncommon: "text-forest",
  rare: "text-arcane",
  "very-rare": "text-oxblood",
  legendary: "text-brass-dark",
  artifact: "text-oxblood",
};
const rarityLabel = (r: ItemRarity) => ITEM_RARITIES.find((x) => x.key === r)?.label ?? r;
const accent = (r?: ItemRarity) => RARITY_ACCENT[r ?? "common"];

/** Lower-case subtitle: category · rarity · value · flags. */
function itemMeta(it: InventoryItem): string {
  const bits: string[] = [];
  if (it.category) bits.push(it.category);
  if (it.rarity && it.rarity !== "common") bits.push(rarityLabel(it.rarity));
  if (it.value) bits.push(`${it.value} gp`);
  if (it.equipped) bits.push("equipped");
  if (it.attuned) bits.push("attuned");
  return bits.join(" · ");
}

/** Hover tooltip with the item's full detail. */
function itemTitle(it: InventoryItem): string {
  return [
    it.name,
    it.properties,
    it.value ? `${it.value} gp each` : "",
    it.weight ? `${it.weight} lb each` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Estimated gp value of a side: gold + each item's value × qty. */
function stakeValue(gold: number, items: TradeItemRef[], inv: InventoryItem[]): number {
  return items.reduce(
    (sum, ref) => sum + (inv.find((i) => i.id === ref.itemId)?.value ?? 0) * ref.quantity,
    gold,
  );
}

function draftFromParty(party: TradeParty): Draft {
  return {
    gold: party.stake.gold,
    items: Object.fromEntries(party.stake.items.map((i) => [i.itemId, i.quantity])),
  };
}

function buildItems(draft: Draft, character: Character | undefined): TradeItemRef[] {
  return Object.entries(draft.items)
    .filter(([, q]) => q > 0)
    .map(([itemId, q]) => {
      const it = (character?.inventory ?? []).find((i) => i.id === itemId);
      return {
        itemId,
        name: it?.name ?? "Item",
        quantity: Math.min(q, it?.quantity ?? q),
      };
    })
    .filter((r) => r.quantity > 0);
}

/** A read-only view of what a party is putting up. */
function StakeView({ party, character }: { party: TradeParty; character: Character | undefined }) {
  const { gold, items } = party.stake;
  const inv = character?.inventory ?? [];
  const empty = gold === 0 && items.length === 0;
  const value = stakeValue(gold, items, inv);

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-brass-dark">
        <CoinIcon className="h-4 w-4" /> {gold} gp
      </div>
      {empty ? (
        <p className="rounded-md border border-dashed border-parchment-400 px-3 py-4 text-center text-xs text-ink-faint">
          Offering nothing yet.
        </p>
      ) : (
        <>
          <ul className="space-y-1">
            {items.map((ref) => {
              const it = inv.find((i) => i.id === ref.itemId);
              return (
                <li
                  key={ref.itemId}
                  title={it ? itemTitle(it) : ref.name}
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-l-4 border-parchment-400/60 bg-parchment-50 px-2 py-1",
                    accent(it?.rarity),
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm font-semibold", it?.rarity ? RARITY_TEXT[it.rarity] : "text-ink")}>
                      {ref.name}
                    </span>
                    {it && itemMeta(it) && (
                      <span className="block truncate text-[0.65rem] text-ink-faint">{itemMeta(it)}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-ink-soft">×{ref.quantity}</span>
                </li>
              );
            })}
          </ul>
          <p className="text-right text-[0.65rem] text-ink-faint">≈ {value} gp total</p>
        </>
      )}
    </div>
  );
}

function TradeSidePanel({
  party,
  character,
  editable,
  onOffer,
  onConfirm,
}: {
  party: TradeParty;
  character: Character | undefined;
  editable: boolean;
  onOffer: (gold: number, items: TradeItemRef[]) => void;
  onConfirm: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFromParty(party));
  // Re-seed when the session's character changes (a fresh trade).
  useEffect(() => {
    setDraft(draftFromParty(party));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party.characterId]);

  const [query, setQuery] = useState("");

  const push = (next: Draft) => {
    setDraft(next);
    onOffer(next.gold, buildItems(next, character));
  };
  const setGold = (n: number) =>
    push({ ...draft, gold: Math.max(0, Math.min(gp, Math.floor(n || 0))) });
  const setQty = (it: InventoryItem, q: number) => {
    const items = { ...draft.items };
    if (q <= 0) delete items[it.id];
    else items[it.id] = Math.min(it.quantity, q);
    push({ ...draft, items });
  };

  const gp = character?.currency?.gp ?? 0;
  const inv = character?.inventory ?? [];

  const filtered = useMemo(
    () => (query ? inv.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())) : inv),
    [inv, query],
  );
  const selectedCount = Object.values(draft.items).filter((q) => q > 0).length;
  const offerValue = stakeValue(draft.gold, buildItems(draft, character), inv);

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        party.confirmed
          ? "border-forest/50 bg-forest/5"
          : "border-parchment-400/70 bg-parchment-50/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate font-display font-semibold text-ink">
          {party.characterName}
        </h3>
        {party.confirmed ? (
          <span className="shrink-0 text-xs font-semibold text-forest">✓ Confirmed</span>
        ) : (
          <span className="shrink-0 text-xs text-ink-faint">Negotiating…</span>
        )}
      </div>

      {!editable ? (
        <StakeView party={party} character={character} />
      ) : (
        <>
          {/* Gold */}
          <div className="mt-2 flex items-center gap-2 rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1.5">
            <CoinIcon className="h-4 w-4 shrink-0 text-brass-dark" />
            <input
              type="number"
              min={0}
              max={gp}
              value={draft.gold}
              onChange={(e) => setGold(Number(e.target.value))}
              className="w-full bg-transparent text-sm font-semibold text-ink focus:outline-none"
            />
            <span className="shrink-0 text-[0.65rem] text-ink-faint">of {gp}</span>
            <button
              type="button"
              onClick={() => setGold(gp)}
              className="shrink-0 rounded border border-brass/50 px-1.5 text-[0.65rem] font-semibold text-brass-dark hover:bg-brass/10"
            >
              All
            </button>
          </div>

          {/* Inventory */}
          {inv.length > 6 && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter items…"
              className="mt-2 w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-xs text-ink focus:border-brass focus:outline-none"
            />
          )}
          <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {inv.length === 0 ? (
              <p className="rounded-md border border-dashed border-parchment-400 px-3 py-4 text-center text-xs text-ink-faint">
                Nothing to offer.
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-1 py-2 text-center text-xs text-ink-faint">No items match.</p>
            ) : (
              filtered.map((it) => {
                const q = draft.items[it.id] ?? 0;
                const on = q > 0;
                return (
                  <div
                    key={it.id}
                    title={itemTitle(it)}
                    onClick={() => setQty(it, on ? 0 : 1)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setQty(it, on ? 0 : 1);
                      }
                    }}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border border-l-4 px-2 py-1.5 transition-colors",
                      accent(it.rarity),
                      on
                        ? "border-brass bg-brass/10"
                        : "border-parchment-400/60 bg-parchment-50 hover:bg-parchment-100",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm font-semibold", it.rarity ? RARITY_TEXT[it.rarity] : "text-ink")}>
                        {it.name}
                        {(it.equipped || it.attuned) && (
                          <span className="ml-1 align-middle text-[0.6rem] text-oxblood" title="Equipped or attuned">●</span>
                        )}
                      </span>
                      <span className="block truncate text-[0.65rem] text-ink-faint">
                        {itemMeta(it) || "item"} · {it.quantity} owned
                      </span>
                    </span>

                    {on && it.quantity > 1 ? (
                      <span className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setQty(it, q - 1)}
                          className="grid h-5 w-5 place-items-center rounded border border-parchment-400 text-ink-soft hover:bg-parchment-200"
                          aria-label="One fewer"
                        >
                          <MinusIcon className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center text-xs font-semibold tabular-nums text-ink">{q}</span>
                        <button
                          type="button"
                          onClick={() => setQty(it, q + 1)}
                          className="grid h-5 w-5 place-items-center rounded border border-parchment-400 text-ink-soft hover:bg-parchment-200"
                          aria-label="One more"
                        >
                          <PlusIcon className="h-3 w-3" />
                        </button>
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[0.6rem] font-bold",
                          on ? "border-brass bg-brass text-parchment-50" : "border-parchment-400 text-transparent",
                        )}
                      >
                        ✓
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Offer summary */}
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-ink-soft">
              {draft.gold} gp{selectedCount > 0 ? ` + ${selectedCount} item${selectedCount === 1 ? "" : "s"}` : ""}
            </span>
            <span className="text-ink-faint">≈ {offerValue} gp value</span>
          </div>

          <Button
            size="sm"
            variant={party.confirmed ? "secondary" : "primary"}
            className="mt-2 w-full"
            disabled={party.confirmed}
            onClick={onConfirm}
          >
            {party.confirmed ? "Confirmed" : "Confirm offer"}
          </Button>
        </>
      )}
    </div>
  );
}

/** A balance bar comparing the two sides' estimated value. */
function FairnessBar({
  fromName,
  fromVal,
  toName,
  toVal,
}: {
  fromName: string;
  fromVal: number;
  toName: string;
  toVal: number;
}) {
  const total = fromVal + toVal;
  const fromPct = total > 0 ? (fromVal / total) * 100 : 50;
  const diff = Math.abs(fromVal - toVal);
  const even = diff <= Math.max(1, total * 0.05);
  const richer = fromVal > toVal ? fromName : toName;

  return (
    <div className="mt-3">
      <div className="flex h-2 overflow-hidden rounded-full border border-parchment-400/60">
        <div className="bg-arcane/70" style={{ width: `${fromPct}%` }} />
        <div className="bg-brass/70" style={{ width: `${100 - fromPct}%` }} />
      </div>
      <p className="mt-1 text-center text-[0.7rem] text-ink-faint">
        {even ? (
          <span className="font-semibold text-forest">Even trade</span>
        ) : (
          <>
            <span className="font-semibold text-ink">{richer}</span> is giving ≈{diff} gp
            more value
          </>
        )}{" "}
        ({fromName} {fromVal} · {toName} {toVal})
      </p>
    </div>
  );
}

/**
 * Global overlay for a live player↔player trade. Mounted once in the app shell
 * so it pops for both traders on any page.
 */
export function TradeOverlay() {
  const { session, offer, confirm, cancel, dismiss } = useActiveTrade();
  const { items: characters } = useCharacters();
  const { userId, multiUser } = usePermissions();

  if (!session) return null;

  const charById = (id: string) => characters.find((c) => c.id === id);
  const open = session.status === "open";
  const editableSide = (party: TradeParty) => open && (!multiUser || party.userId === userId);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Player trade"
      onClick={() => {
        if (!open) dismiss();
      }}
    >
      <div
        className="surface-raised max-h-[90vh] w-full max-w-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-parchment-400/60 bg-parchment-200/50 px-5 py-3">
          <span className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.15em] text-brass-dark">
            <CoinIcon className="h-4 w-4" /> Player Trade
          </span>
          <button
            type="button"
            onClick={() => (open ? cancel(session.id) : dismiss())}
            aria-label={open ? "Cancel trade" : "Close"}
            className="rounded-md p-1 text-ink-faint hover:bg-parchment-300/60 hover:text-ink"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="p-5">
          {!open && (
            <div
              className={cn(
                "mb-3 rounded-md px-3 py-2 text-sm font-semibold",
                session.status === "completed"
                  ? "bg-forest/12 text-forest"
                  : "bg-oxblood/12 text-oxblood",
              )}
            >
              {session.status === "completed" ? "Trade complete — goods exchanged." : "Trade cancelled."}
            </div>
          )}
          {session.error && open && (
            <div className="mb-3 rounded-md bg-oxblood/12 px-3 py-2 text-sm text-oxblood">
              {session.error}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <TradeSidePanel
              party={session.from}
              character={charById(session.from.characterId)}
              editable={editableSide(session.from)}
              onOffer={(g, i) => offer(session.id, g, i, "from")}
              onConfirm={() => confirm(session.id, "from")}
            />
            <TradeSidePanel
              party={session.to}
              character={charById(session.to.characterId)}
              editable={editableSide(session.to)}
              onOffer={(g, i) => offer(session.id, g, i, "to")}
              onConfirm={() => confirm(session.id, "to")}
            />
          </div>

          <FairnessBar
            fromName={session.from.characterName}
            fromVal={stakeValue(
              session.from.stake.gold,
              session.from.stake.items,
              charById(session.from.characterId)?.inventory ?? [],
            )}
            toName={session.to.characterName}
            toVal={stakeValue(
              session.to.stake.gold,
              session.to.stake.items,
              charById(session.to.characterId)?.inventory ?? [],
            )}
          />

          <p className="mt-3 text-[0.7rem] text-ink-faint">
            Changing either offer clears both confirmations. The swap happens only
            once both sides confirm.
          </p>

          <div className="mt-4 flex justify-end gap-2">
            {open ? (
              <Button variant="danger" onClick={() => cancel(session.id)}>
                Cancel trade
              </Button>
            ) : (
              <Button onClick={dismiss}>Close</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
