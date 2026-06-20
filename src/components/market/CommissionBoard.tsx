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
import type { Commission } from "@/lib/domain/types";

type Feedback = { kind: "ok" | "err"; text: string } | null;

export function CommissionBoard() {
  const { value: economy } = useEconomy();
  const { items: factions } = useFactions();
  const { items: characters } = useCharacters();
  const { isDM, canEdit } = usePermissions();
  const realtime = useRealtime();

  const mine = useMemo(
    () => characters.filter((c) => canEdit("characters", c)),
    [characters, canEdit],
  );
  const [charId, setCharId] = useState("");
  const selected = mine.find((c) => c.id === charId) ?? mine[0] ?? null;

  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Feedback>(null);

  const repFor = (c: Commission) =>
    c.factionId ? standingToRep(factions.find((f) => f.id === c.factionId)?.standing) : 2;
  const factionName = (id?: string) => factions.find((f) => f.id === id)?.name ?? "A patron";
  const commodity = (id: string) => economy?.commodities.find((c) => c.id === id);

  const open = useMemo(() => {
    if (!economy?.enabled) return [];
    return (economy.commissions ?? []).filter(
      (c) =>
        c.active !== false &&
        (c.filled ?? 0) < c.qty &&
        (isDM || !c.hidden) &&
        repFor(c) >= (c.minRep ?? 0),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [economy, factions, isDM]);

  if (!economy?.enabled) {
    return (
      <Panel tone="flat">
        <EmptyState icon={<CoinIcon />} title="The board is bare" description="No economy is running yet." />
      </Panel>
    );
  }

  const gp = selected?.currency?.gp ?? 0;
  const ownedOf = (name: string) =>
    (selected?.inventory ?? []).filter((i) => i.name === name).reduce((n, i) => n + i.quantity, 0);

  const fulfill = async (c: Commission) => {
    if (!selected || busy) return;
    const q = Math.max(1, Math.floor(qty[c.id] || 1));
    setBusy(true);
    setMsg(null);
    try {
      const out = await realtime.executeCommission({
        commissionId: c.id,
        qty: q,
        characterId: selected.id,
        characterName: selected.name,
      });
      if (!out.ok) setMsg({ kind: "err", text: out.error ?? "Couldn't fulfil that." });
      else {
        const verb = c.kind === "buy" ? "Delivered" : "Bought";
        setMsg({ kind: "ok", text: `${verb} ${out.transaction?.qty}× ${out.transaction?.goodName} for ${out.total}gp.` });
      }
    } catch {
      setMsg({ kind: "err", text: "The deal didn't go through." });
    } finally {
      setBusy(false);
    }
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
            <CoinIcon className="h-4 w-4" /> {gp} gp
          </span>
        )}
        {msg && (
          <span className={cn("ml-auto rounded-md px-3 py-1 text-sm", msg.kind === "ok" ? "bg-forest/12 text-forest" : "bg-oxblood/12 text-oxblood")}>
            {msg.text}
          </span>
        )}
      </Panel>

      {open.length === 0 ? (
        <Panel tone="flat">
          <EmptyState
            icon={<CoinIcon />}
            title="No commissions on the board"
            description="No faction is buying or selling right now — check back after the world turns."
          />
        </Panel>
      ) : (
        <Panel title="Commissions" eyebrow="What the factions want">
          <ul className="space-y-3">
            {open.map((c) => {
              const com = commodity(c.commodityId);
              const name = com?.name ?? c.commodityId;
              const remaining = c.qty - (c.filled ?? 0);
              const owned = ownedOf(name);
              const q = Math.max(1, Math.floor(qty[c.id] || 1));
              const isBuy = c.kind === "buy";
              const canDo =
                !!selected && !busy && (isBuy ? owned > 0 : gp >= c.unitPrice * Math.min(q, remaining));
              return (
                <li key={c.id} className="rounded-lg border border-parchment-400/70 bg-parchment-50/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={isBuy ? "forest" : "brass"}>{isBuy ? "Buying" : "Selling"}</Badge>
                    <span className="font-semibold text-ink">{name}</span>
                    <span className="text-sm text-ink-soft">@ {c.unitPrice} gp each</span>
                    <span className="text-xs text-ink-faint">· {factionName(c.factionId)}</span>
                    {c.repReward !== false && (
                      <span className="text-xs text-forest" title="Improves standing when filled">+ standing</span>
                    )}
                    <span className="ml-auto text-xs text-ink-faint">
                      {c.filled ?? 0}/{c.qty} filled
                    </span>
                  </div>

                  {c.note && <p className="mt-1 text-xs text-ink-faint">{c.note}</p>}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-ink-faint">
                      {isBuy ? `You have ${owned}` : `Up to ${remaining} available`}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={isBuy ? Math.min(remaining, owned) || 1 : remaining}
                      value={q}
                      onChange={(e) => setQty((m) => ({ ...m, [c.id]: Number(e.target.value) || 1 }))}
                      className="w-16 rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none"
                    />
                    <span className="text-sm font-mono text-ink-soft">
                      = {c.unitPrice * Math.min(q, remaining, isBuy ? owned || q : remaining)} gp
                    </span>
                    <Button size="sm" className="ml-auto" disabled={!canDo} onClick={() => fulfill(c)}>
                      {isBuy ? "Deliver" : "Buy"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
