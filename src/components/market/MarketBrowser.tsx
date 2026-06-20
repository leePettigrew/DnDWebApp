"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import { CoinIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import { skillBonus } from "@/lib/domain/character";
import {
  useCharacters,
  useEconomy,
  useFactions,
  usePermissions,
  useRealtime,
} from "@/lib/data/hooks";
import { quoteCommodityGood, quoteService, standingToRep } from "@shared/economy-pricing";
import { canAccessMarket } from "@shared/economy-trade";
import { SKILLS } from "@shared/domain";
import type {
  Character,
  Currency,
  Market,
  MarketGood,
  Service,
} from "@/lib/domain/types";

const ZERO: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
const PERSUASION = SKILLS.find((s) => s.key === "persuasion")!;

type Feedback = { kind: "ok" | "err"; text: string } | null;

export function MarketBrowser() {
  const { value: economy } = useEconomy();
  const { items: factions } = useFactions();
  const { items: characters, update: updateCharacter } = useCharacters();
  const { isDM, userId, canEdit } = usePermissions();
  const realtime = useRealtime();

  // Characters this user may spend from (their own; all of them in solo).
  const mine = useMemo(
    () => characters.filter((c) => canEdit("characters", c)),
    [characters, canEdit],
  );
  const [charId, setCharId] = useState<string>("");
  const selected =
    mine.find((c) => c.id === charId) ?? mine[0] ?? null;

  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Feedback>(null);

  const repForMarket = (m: Market) =>
    m.kind === "faction"
      ? standingToRep(factions.find((f) => f.id === m.factionId)?.standing)
      : 2;

  const markets = useMemo(() => {
    if (!economy?.enabled) return [];
    return (economy.markets ?? []).filter((m) =>
      canAccessMarket(m, {
        rep: repForMarket(m),
        isDM,
        userId: userId ?? undefined,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [economy, factions, isDM, userId]);

  if (!economy?.enabled) {
    return (
      <Panel tone="flat">
        <EmptyState
          icon={<CoinIcon />}
          title="The markets are quiet"
          description="No economy is running yet. Your DM opens trade from the DM tools."
        />
      </Panel>
    );
  }

  const gp = selected?.currency?.gp ?? 0;
  const qtyOf = (ref: string) => Math.max(1, Math.floor(qty[ref] || 1));
  const ownedQty = (name: string) =>
    (selected?.inventory ?? [])
      .filter((i) => i.name === name)
      .reduce((n, i) => n + i.quantity, 0);

  async function applyBuy(char: Character, name: string, q: number, total: number, unitValue: number, weight?: number) {
    const inv = char.inventory ?? [];
    const existing = inv.find((i) => i.name === name);
    const nextInv = existing
      ? inv.map((i) => (i.id === existing.id ? { ...i, quantity: i.quantity + q } : i))
      : [...inv, { id: newId(), name, quantity: q, value: unitValue, weight }];
    await updateCharacter(char.id, {
      inventory: nextInv,
      currency: { ...ZERO, ...char.currency, gp: (char.currency?.gp ?? 0) - total },
    });
  }

  async function applySell(char: Character, name: string, q: number, total: number) {
    const inv = char.inventory ?? [];
    let remaining = q;
    const nextInv = inv
      .map((i) => {
        if (i.name !== name || remaining <= 0) return i;
        const take = Math.min(i.quantity, remaining);
        remaining -= take;
        return { ...i, quantity: i.quantity - take };
      })
      .filter((i) => i.quantity > 0);
    await updateCharacter(char.id, {
      inventory: nextInv,
      currency: { ...ZERO, ...char.currency, gp: (char.currency?.gp ?? 0) + total },
    });
  }

  async function buy(market: Market, good: MarketGood, haggle: boolean) {
    if (!selected || busy) return;
    const q = qtyOf(good.ref);
    const quote = quoteCommodityGood(economy!, market, good, repForMarket(market));
    if (!quote) return;
    if (good.stock < q) {
      setMsg({ kind: "err", text: `Only ${good.stock} in stock.` });
      return;
    }
    if (gp < quote.buy * q) {
      setMsg({ kind: "err", text: `Not enough gold (need ${quote.buy * q}gp).` });
      return;
    }
    setBusy(true);
    try {
      let haggleRoll: number | undefined;
      if (haggle) {
        const res = await realtime.roll({
          label: `Haggle · ${selected.name}`,
          groups: [{ count: 1, sides: 20 }],
          modifier: skillBonus(selected, PERSUASION),
          mode: "normal",
        });
        haggleRoll = res.total;
      }
      const out = await realtime.executeTrade({
        marketId: market.id,
        goodRef: good.ref,
        action: "buy",
        qty: q,
        haggleRoll,
        characterId: selected.id,
        characterName: selected.name,
      });
      if (!out.ok) {
        setMsg({ kind: "err", text: out.error ?? "Trade failed." });
        return;
      }
      const commodity = economy!.commodities.find((c) => c.id === good.ref);
      await applyBuy(selected, out.transaction?.goodName ?? good.ref, q, out.total ?? 0, commodity?.baseValue ?? 0, commodity?.weight);
      const saved = haggle ? ` (haggled, rolled ${haggleRoll})` : "";
      setMsg({ kind: "ok", text: `Bought ${q} ${out.transaction?.goodName} for ${out.total}gp${saved}.` });
    } finally {
      setBusy(false);
    }
  }

  async function sell(market: Market, good: MarketGood) {
    if (!selected || busy) return;
    const name = economy!.commodities.find((c) => c.id === good.ref)?.name ?? good.ref;
    const have = ownedQty(name);
    if (have < 1) {
      setMsg({ kind: "err", text: `You have no ${name} to sell.` });
      return;
    }
    const q = Math.min(qtyOf(good.ref), have);
    setBusy(true);
    try {
      const out = await realtime.executeTrade({
        marketId: market.id,
        goodRef: good.ref,
        action: "sell",
        qty: q,
        characterId: selected.id,
        characterName: selected.name,
      });
      if (!out.ok) {
        setMsg({ kind: "err", text: out.error ?? "Trade failed." });
        return;
      }
      await applySell(selected, name, q, out.total ?? 0);
      setMsg({ kind: "ok", text: `Sold ${q} ${name} for ${out.total}gp.` });
    } finally {
      setBusy(false);
    }
  }

  async function hire(market: Market, service: Service) {
    if (!selected || busy) return;
    const price = quoteService(economy!, market, service, repForMarket(market));
    if (gp < price) {
      setMsg({ kind: "err", text: `Not enough gold (need ${price}gp).` });
      return;
    }
    setBusy(true);
    try {
      const out = await realtime.executeService({
        marketId: market.id,
        serviceId: service.id,
        characterId: selected.id,
        characterName: selected.name,
      });
      if (!out.ok) {
        setMsg({ kind: "err", text: out.error ?? "Couldn't hire that." });
        return;
      }
      await updateCharacter(selected.id, {
        currency: { ...ZERO, ...selected.currency, gp: (selected.currency?.gp ?? 0) - (out.total ?? 0) },
      });
      setMsg({ kind: "ok", text: `Hired ${service.name} for ${out.total}gp.` });
    } catch {
      setMsg({ kind: "err", text: "The hire didn't go through." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Trader bar */}
      <Panel tone="flat" bodyClassName="flex flex-wrap items-center gap-3">
        <label className="text-sm text-ink-soft">
          <span className="mr-2 font-semibold text-ink">Trading as</span>
          {mine.length === 0 ? (
            <span className="text-ink-faint">— no character you can spend from —</span>
          ) : (
            <select
              value={selected?.id ?? ""}
              onChange={(e) => setCharId(e.target.value)}
              className="h-9 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none"
            >
              {mine.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </label>
        {selected && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brass/40 bg-brass/10 px-3 py-1 text-sm font-semibold text-brass-dark">
            <CoinIcon className="h-4 w-4" /> {gp} gp
          </span>
        )}
        {msg && (
          <span
            className={cn(
              "ml-auto rounded-md px-3 py-1 text-sm",
              msg.kind === "ok"
                ? "bg-forest/12 text-forest"
                : "bg-oxblood/12 text-oxblood",
            )}
          >
            {msg.text}
          </span>
        )}
      </Panel>

      {markets.length === 0 ? (
        <Panel tone="flat">
          <EmptyState
            icon={<CoinIcon />}
            title="No markets within reach"
            description="There are no markets you can trade at right now — your standing may be too low, or your DM hasn't opened any to you."
          />
        </Panel>
      ) : (
        markets.map((m) => {
          const faction = factions.find((f) => f.id === m.factionId);
          const rep = repForMarket(m);
          const goods = m.goods.filter((g) => rep >= (g.minRep ?? 0));
          const services = (economy!.services ?? []).filter(
            (s) => s.marketId === m.id && !s.hidden && rep >= (s.minRep ?? 0),
          );
          return (
            <Panel
              key={m.id}
              title={m.name}
              eyebrow={
                m.kind === "faction"
                  ? `${faction?.name ?? "Faction"} · ${faction?.standing ?? "neutral"}`
                  : m.kind === "location"
                    ? "Location market"
                    : "Open market"
              }
              action={
                m.hidden ? <Badge tone="arcane">Shown to you</Badge> : undefined
              }
            >
              {goods.length === 0 && services.length === 0 ? (
                <p className="text-sm text-ink-faint">Nothing here you can trade.</p>
              ) : goods.length === 0 ? null : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead>
                      <tr className="text-left text-[0.65rem] uppercase tracking-wide text-ink-faint">
                        <th className="px-1 pb-2 font-semibold">Good</th>
                        <th className="px-1 pb-2 font-semibold">Stock</th>
                        <th className="px-1 pb-2 font-semibold">Buy</th>
                        <th className="px-1 pb-2 font-semibold">Sell</th>
                        <th className="px-1 pb-2 font-semibold">Qty</th>
                        <th className="px-1 pb-2 font-semibold">You</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {goods.map((g) => {
                        const c = economy!.commodities.find((x) => x.id === g.ref);
                        if (!c || c.tradeable === false) return null;
                        const quote = quoteCommodityGood(economy!, m, g, rep);
                        const have = ownedQty(c.name);
                        const canBuy = !!selected && g.stock > 0 && !busy;
                        const canSell = !!selected && have > 0 && !busy;
                        return (
                          <tr key={g.ref} className="border-t border-parchment-400/40">
                            <td className="px-1 py-2 font-semibold text-ink">
                              {c.name}
                              {c.unit && (
                                <span className="ml-1 font-normal text-ink-faint">/{c.unit}</span>
                              )}
                            </td>
                            <td className="px-1 py-2 tabular-nums text-ink-soft">{g.stock}</td>
                            <td className="px-1 py-2 font-mono text-forest">{quote?.buy ?? "—"}</td>
                            <td className="px-1 py-2 font-mono text-oxblood">{quote?.sell ?? "—"}</td>
                            <td className="px-1 py-2">
                              <input
                                type="number"
                                min={1}
                                value={qtyOf(g.ref)}
                                onChange={(e) =>
                                  setQty((q) => ({ ...q, [g.ref]: Number(e.target.value) || 1 }))
                                }
                                className="w-16 rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none"
                              />
                            </td>
                            <td className="px-1 py-2 tabular-nums text-ink-faint">{have || "—"}</td>
                            <td className="px-1 py-2">
                              <div className="flex justify-end gap-1.5">
                                <Button size="sm" disabled={!canBuy} onClick={() => buy(m, g, false)}>
                                  Buy
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={!canBuy}
                                  onClick={() => buy(m, g, true)}
                                  title="Roll Persuasion to haggle the price down"
                                >
                                  Haggle
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={!canSell}
                                  onClick={() => sell(m, g)}
                                >
                                  Sell
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {services.length > 0 && (
                <div className={cn(goods.length > 0 && "mt-4 border-t border-parchment-400/40 pt-3")}>
                  <h4 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">
                    Services
                  </h4>
                  <ul className="space-y-1.5">
                    {services.map((s) => {
                      const price = quoteService(economy!, m, s, rep);
                      return (
                        <li key={s.id} className="flex items-center justify-between gap-3">
                          <span className="min-w-0">
                            <span className="font-semibold text-ink">{s.name}</span>
                            {s.category && (
                              <span className="ml-1 text-xs text-ink-faint">· {s.category}</span>
                            )}
                            {s.description && (
                              <span className="block text-xs text-ink-faint">{s.description}</span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="font-mono text-forest">{price}gp</span>
                            <Button
                              size="sm"
                              disabled={!selected || busy}
                              onClick={() => hire(m, s)}
                            >
                              Hire
                            </Button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </Panel>
          );
        })
      )}
    </div>
  );
}
