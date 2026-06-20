"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import {
  useActiveTrade,
  useCharacters,
  usePermissions,
  usePresence,
} from "@/lib/data/hooks";

/**
 * Start a player↔player trade. In multiplayer you propose to another online
 * player's character; in solo it moves goods between two of your own characters.
 * The live negotiation itself happens in the global TradeOverlay.
 */
export function PlayerTradePanel() {
  const { items: characters } = useCharacters();
  const presence = usePresence();
  const { userId, multiUser, canEdit } = usePermissions();
  const { session, propose } = useActiveTrade();

  const [fromId, setFromId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const mine = useMemo(
    () => characters.filter((c) => canEdit("characters", c)),
    [characters, canEdit],
  );
  const from = mine.find((c) => c.id === fromId) ?? mine[0] ?? null;

  const onlineUsers = useMemo(
    () => new Set(presence.filter((p) => p.online).map((p) => p.userId)),
    [presence],
  );
  const ownerName = (uid?: string) =>
    presence.find((p) => p.userId === uid)?.name ?? "Player";

  const targets = useMemo(() => {
    if (!multiUser) return mine.filter((c) => c.id !== from?.id);
    return characters.filter(
      (c) => c.ownerId && c.ownerId !== userId && onlineUsers.has(c.ownerId),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters, mine, from, multiUser, userId, onlineUsers]);

  const doPropose = async (toCharId: string, toUserId: string) => {
    if (!from || busy) return;
    setBusy(true);
    setMsg(null);
    const r = await propose({
      toUserId,
      fromCharacterId: from.id,
      toCharacterId: toCharId,
    });
    if (!r.ok) setMsg(r.error ?? "Couldn't start the trade.");
    setBusy(false);
  };

  return (
    <Panel title="Player Trade" eyebrow="Deal with another adventurer">
      {session ? (
        <p className="text-sm text-ink-soft">
          A trade is in progress — see the trade window.
        </p>
      ) : mine.length === 0 ? (
        <p className="text-sm text-ink-faint">
          You need a character before you can trade.
        </p>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm text-ink-soft">
            <span className="mr-2 font-semibold text-ink">Trade as</span>
            <select
              value={from?.id ?? ""}
              onChange={(e) => setFromId(e.target.value)}
              className="h-9 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none"
            >
              {mine.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {targets.length === 0 ? (
            <p className="text-sm text-ink-faint">
              {multiUser
                ? "No other players are online to trade with."
                : "Create another character to trade between them."}
            </p>
          ) : (
            <ul className="divide-y divide-parchment-400/40 rounded-lg border border-parchment-400/60">
              {targets.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 truncate text-sm text-ink">
                    <span className="font-semibold">{t.name}</span>
                    {multiUser && (
                      <span className="text-ink-faint"> · {ownerName(t.ownerId)}</span>
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || !from}
                    onClick={() => doPropose(t.id, t.ownerId ?? "local-dm")}
                  >
                    Propose
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {msg && <p className="text-sm text-oxblood">{msg}</p>}
        </div>
      )}
    </Panel>
  );
}
