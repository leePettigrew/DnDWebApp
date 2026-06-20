"use client";

import { useEffect, useState } from "react";
import { CloseIcon, CoinIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { useActiveTrade, useCharacters, usePermissions } from "@/lib/data/hooks";
import type { Character } from "@/lib/domain/types";
import type { TradeItemRef, TradeParty } from "@shared/trade";

const numClass =
  "mt-1 w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none";

interface Draft {
  gold: number;
  items: Record<string, number>;
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
function StakeView({ party }: { party: TradeParty }) {
  const { gold, items } = party.stake;
  const empty = gold === 0 && items.length === 0;
  return (
    <div className="mt-2 space-y-1 text-sm text-ink-soft">
      <div className="flex items-center gap-1.5">
        <CoinIcon className="h-4 w-4 text-brass-dark" /> {gold} gp
      </div>
      {empty ? (
        <p className="text-xs text-ink-faint">Offering nothing yet.</p>
      ) : (
        items.map((i) => (
          <div key={i.itemId} className="text-xs">
            {i.quantity}× {i.name}
          </div>
        ))
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

  const push = (next: Draft) => {
    setDraft(next);
    onOffer(next.gold, buildItems(next, character));
  };

  const gp = character?.currency?.gp ?? 0;
  const inv = character?.inventory ?? [];

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
        <StakeView party={party} />
      ) : (
        <>
          <label className="mt-2 block text-xs text-ink-soft">
            Gold <span className="text-ink-faint">(have {gp})</span>
            <input
              type="number"
              min={0}
              max={gp}
              value={draft.gold}
              onChange={(e) =>
                push({
                  ...draft,
                  gold: Math.max(0, Math.min(gp, Math.floor(Number(e.target.value) || 0))),
                })
              }
              className={numClass}
            />
          </label>

          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
            {inv.length === 0 ? (
              <p className="text-xs text-ink-faint">Nothing to offer.</p>
            ) : (
              inv.map((it) => {
                const q = draft.items[it.id] ?? 0;
                return (
                  <div key={it.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={q > 0}
                      onChange={(e) => {
                        const items = { ...draft.items };
                        if (e.target.checked) items[it.id] = 1;
                        else delete items[it.id];
                        push({ ...draft, items });
                      }}
                    />
                    <span className="flex-1 truncate text-ink">
                      {it.name}{" "}
                      <span className="text-ink-faint">×{it.quantity}</span>
                    </span>
                    {q > 0 && it.quantity > 1 && (
                      <input
                        type="number"
                        min={1}
                        max={it.quantity}
                        value={q}
                        onChange={(e) =>
                          push({
                            ...draft,
                            items: {
                              ...draft.items,
                              [it.id]: Math.max(
                                1,
                                Math.min(it.quantity, Math.floor(Number(e.target.value) || 1)),
                              ),
                            },
                          })
                        }
                        className="w-14 rounded-md border border-parchment-400 bg-parchment-50 px-1 py-0.5 text-xs text-ink focus:border-brass focus:outline-none"
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>

          <Button
            size="sm"
            variant={party.confirmed ? "secondary" : "primary"}
            className="mt-3 w-full"
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
