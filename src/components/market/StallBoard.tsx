"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import { CoinIcon } from "@/components/ui/icons";
import {
  useCharacters,
  useEconomy,
  useFactions,
  usePermissions,
  useRealtime,
} from "@/lib/data/hooks";
import { standingToRep } from "@shared/economy-pricing";
import { canAccessMarket } from "@shared/economy-trade";
import type { Consignment, Market } from "@/lib/domain/types";

type Feedback = { kind: "ok" | "err"; text: string } | null;

export function StallBoard() {
  const { value: economy } = useEconomy();
  const { items: factions } = useFactions();
  const { items: characters } = useCharacters();
  const { isDM, userId, canEdit } = usePermissions();
  const realtime = useRealtime();

  const mine = useMemo(() => characters.filter((c) => canEdit("characters", c)), [characters, canEdit]);
  const [charId, setCharId] = useState("");
  const selected = mine.find((c) => c.id === charId) ?? mine[0] ?? null;

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Feedback>(null);
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(10);
  const [marketId, setMarketId] = useState("");
  const [buyQty, setBuyQty] = useState<Record<string, number>>({});

  const repForMarket = (m: Market) =>
    m.kind === "faction" ? standingToRep(factions.find((f) => f.id === m.factionId)?.standing) : 2;
  const marketName = (id?: string) => economy?.markets.find((m) => m.id === id)?.name ?? "a market";

  const reachable = useMemo(() => {
    if (!economy?.enabled) return [] as Market[];
    return (economy.markets ?? []).filter((m) =>
      canAccessMarket(m, { rep: repForMarket(m), isDM, userId: userId ?? undefined }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [economy, factions, isDM, userId]);

  if (!economy?.enabled) {
    return (
      <Panel tone="flat">
        <EmptyState icon={<CoinIcon />} title="No stalls" description="No economy is running yet." />
      </Panel>
    );
  }

  const reachableIds = new Set(reachable.map((m) => m.id));
  const consignments = economy.consignments ?? [];
  const myStalls = consignments.filter((c) => c.sellerId === selected?.id);
  const others = consignments.filter(
    (c) => c.sellerId !== selected?.id && c.qty > 0 && reachableIds.has(c.marketId),
  );
  const inv = selected?.inventory ?? [];
  const listItem = inv.find((i) => i.id === itemId) ?? inv[0] ?? null;

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; total?: number }>, ok: string) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const out = await fn();
      setMsg(out.ok ? { kind: "ok", text: ok } : { kind: "err", text: out.error ?? "Couldn't do that." });
    } catch {
      setMsg({ kind: "err", text: "That didn't go through." });
    } finally {
      setBusy(false);
    }
  };

  const list = () => {
    if (!selected || !listItem) return;
    act(
      () =>
        realtime.consignList({
          marketId: marketId || reachable[0]?.id || "",
          itemId: listItem.id,
          qty: Math.min(qty, listItem.quantity),
          price,
          characterId: selected.id,
          characterName: selected.name,
        }),
      `Listed ${Math.min(qty, listItem.quantity)}× ${listItem.name}.`,
    );
  };

  return (
    <div className="space-y-5">
      <Panel tone="flat" bodyClassName="flex flex-wrap items-center gap-3">
        <label className="text-sm text-ink-soft">
          <span className="mr-2 font-semibold text-ink">As</span>
          {mine.length === 0 ? (
            <span className="text-ink-faint">— no character —</span>
          ) : (
            <select
              value={selected?.id ?? ""}
              onChange={(e) => setCharId(e.target.value)}
              className="h-9 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none"
            >
              {mine.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </label>
        {selected && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brass/40 bg-brass/10 px-3 py-1 text-sm font-semibold text-brass-dark">
            <CoinIcon className="h-4 w-4" /> {selected.currency?.gp ?? 0} gp
          </span>
        )}
        {msg && (
          <span className={cn("ml-auto rounded-md px-3 py-1 text-sm", msg.kind === "ok" ? "bg-forest/12 text-forest" : "bg-oxblood/12 text-oxblood")}>
            {msg.text}
          </span>
        )}
      </Panel>

      {/* List an item */}
      {selected && reachable.length > 0 && (
        <Panel title="Open a stall" eyebrow="Sell your own goods">
          {inv.length === 0 ? (
            <p className="text-sm text-ink-faint">Your pack is empty — nothing to sell.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-ink-soft">
                <span className="mb-1 block font-semibold text-ink">Item</span>
                <select
                  value={listItem?.id ?? ""}
                  onChange={(e) => setItemId(e.target.value)}
                  className="h-9 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none"
                >
                  {inv.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} (×{i.quantity})</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-soft">
                <span className="mb-1 block font-semibold text-ink">Qty</span>
                <input
                  type="number"
                  min={1}
                  max={listItem?.quantity ?? 1}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                  className="h-9 w-20 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none"
                />
              </label>
              <label className="text-xs text-ink-soft">
                <span className="mb-1 block font-semibold text-ink">gp each</span>
                <input
                  type="number"
                  min={0}
                  max={listItem?.value ? listItem.value * 2 : undefined}
                  value={price}
                  onChange={(e) => {
                    const cap = listItem?.value ? listItem.value * 2 : Infinity;
                    setPrice(Math.min(cap, Math.max(0, Number(e.target.value) || 0)));
                  }}
                  className="h-9 w-24 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none"
                />
                {listItem?.value ? (
                  <span className="mt-0.5 block text-[0.6rem] text-ink-faint">
                    max {listItem.value * 2} gp · cheaper sells faster
                  </span>
                ) : null}
              </label>
              <label className="text-xs text-ink-soft">
                <span className="mb-1 block font-semibold text-ink">At</span>
                <select
                  value={marketId || reachable[0]?.id}
                  onChange={(e) => setMarketId(e.target.value)}
                  className="h-9 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none"
                >
                  {reachable.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
              <Button disabled={busy || !listItem} onClick={list}>List for sale</Button>
            </div>
          )}
        </Panel>
      )}

      {/* My stalls */}
      {myStalls.length > 0 && (
        <Panel title="Your stalls" eyebrow="Listed & earning">
          <ul className="space-y-2">
            {myStalls.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-parchment-400/70 bg-parchment-50/60 p-2.5">
                <span className="font-semibold text-ink">{c.itemName}</span>
                <span className="text-sm text-ink-soft">{c.qty} left @ {c.price} gp</span>
                <span className="text-xs text-ink-faint">at {marketName(c.marketId)}</span>
                {(c.escrow ?? 0) > 0 && (
                  <Badge tone="forest">{c.escrow} gp earned</Badge>
                )}
                <span className="ml-auto flex gap-1.5">
                  {(c.escrow ?? 0) > 0 && (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() =>
                      act(() => realtime.consignAct({ consignmentId: c.id, action: "collect", characterId: selected!.id, characterName: selected!.name }), `Collected ${c.escrow}gp.`)
                    }>
                      Collect
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() =>
                    act(() => realtime.consignAct({ consignmentId: c.id, action: "cancel", characterId: selected!.id, characterName: selected!.name }), "Stall closed; goods reclaimed.")
                  }>
                    Close
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Browse others' stalls */}
      <Panel title="The bazaar" eyebrow="What others are selling">
        {others.length === 0 ? (
          <p className="text-sm text-ink-faint">No stalls from other traders within reach.</p>
        ) : (
          <ul className="space-y-2">
            {others.map((c) => {
              const q = Math.max(1, Math.min(c.qty, Math.floor(buyQty[c.id] || 1)));
              const cost = c.price * q;
              const afford = (selected?.currency?.gp ?? 0) >= cost;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-parchment-400/70 bg-parchment-50/60 p-2.5">
                  <span className="font-semibold text-ink">{c.itemName}</span>
                  <span className="text-sm text-ink-soft">{c.price} gp each · {c.qty} left</span>
                  <span className="text-xs text-ink-faint">{c.sellerName} · {marketName(c.marketId)}</span>
                  <span className="ml-auto flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={c.qty}
                      value={q}
                      onChange={(e) => setBuyQty((m) => ({ ...m, [c.id]: Number(e.target.value) || 1 }))}
                      className="w-16 rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none"
                    />
                    <span className="font-mono text-sm text-ink-soft">{cost} gp</span>
                    <Button size="sm" disabled={busy || !selected || !afford} onClick={() =>
                      act(() => realtime.consignAct({ consignmentId: c.id, action: "buy", qty: q, characterId: selected!.id, characterName: selected!.name }), `Bought ${q}× ${c.itemName}.`)
                    }>
                      Buy
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
