"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { TextField, TextArea } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { ScrollIcon } from "@/components/ui/icons";
import {
  useActiveCampaign,
  useCurrentUser,
  useDataProvider,
  usePresence,
  useRealtime,
} from "@/lib/data/hooks";

/**
 * DM-only composer that pushes a handout (text and/or image) to the table —
 * either to everyone, or privately to specific connected players. Solo previews
 * locally so you can see exactly what lands.
 */
export function HandoutComposer() {
  const realtime = useRealtime();
  const { capabilities } = useDataProvider();
  const { role } = useActiveCampaign();
  const me = useCurrentUser();
  const presence = usePresence();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [targets, setTargets] = useState<string[]>([]); // empty = everyone
  const [flash, setFlash] = useState<string | null>(null);

  // In solo you're always the DM; in multiplayer only the DM may push.
  const isDM = !capabilities.multiUser || role === "dm";
  const empty = !title.trim() && !body.trim() && !imageUrl.trim();

  // Other players currently connected — the only ones who can receive a live pop-up.
  const players = presence.filter((p) => p.online && p.userId !== me?.id);

  function toggle(id: string) {
    setTargets((t) =>
      t.includes(id) ? t.filter((x) => x !== id) : [...t, id],
    );
  }

  function share() {
    if (empty || !isDM) return;
    const recipients = targets.length ? targets : undefined;
    realtime.shareHandout(
      {
        title: title.trim() || undefined,
        body: body.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
      },
      recipients,
    );
    if (!capabilities.multiUser) {
      setFlash("Preview shown (solo mode — no players to receive it).");
    } else if (recipients) {
      const names = players
        .filter((p) => recipients.includes(p.userId))
        .map((p) => p.name)
        .join(", ");
      setFlash(`Sent privately to ${names || "the selected players"}.`);
    } else {
      setFlash("Handout shown to the whole table.");
    }
    window.setTimeout(() => setFlash(null), 3200);
  }

  const chipBase =
    "rounded-full border px-3 py-1 text-sm font-semibold transition-colors";

  return (
    <Panel title="Share a Handout" eyebrow="Show players">
      {!isDM ? (
        <p className="text-sm text-ink-faint">
          Only the Dungeon Master can push handouts to the table.
        </p>
      ) : (
        <div className="space-y-4">
          <TextField
            label="Title"
            placeholder="e.g. The Mysterious Letter"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <TextField
            label="Image URL"
            hint="optional — a map, portrait, or prop"
            placeholder="https://…"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />
          <TextArea
            label="Text"
            rows={4}
            placeholder="Read-aloud text, a riddle, an overheard rumor…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          {/* Recipients */}
          <div>
            <p className="mb-1.5 font-display text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
              Send to
            </p>
            {capabilities.multiUser && players.length === 0 ? (
              <p className="text-sm text-ink-faint">
                No other players are connected — this will show for the whole
                table.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTargets([])}
                  className={cn(
                    chipBase,
                    targets.length === 0
                      ? "border-oxblood bg-oxblood text-parchment-50"
                      : "border-parchment-400 bg-parchment-100 text-ink-soft hover:border-oxblood/50",
                  )}
                >
                  Everyone
                </button>
                {players.map((p) => {
                  const on = targets.includes(p.userId);
                  return (
                    <button
                      key={p.userId}
                      type="button"
                      onClick={() => toggle(p.userId)}
                      className={cn(
                        chipBase,
                        on
                          ? "border-arcane bg-arcane/15 text-arcane ring-1 ring-arcane"
                          : "border-parchment-400 bg-parchment-100 text-ink-soft hover:border-arcane/50",
                      )}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={share} disabled={empty}>
              <ScrollIcon className="h-4 w-4" />
              {targets.length ? "Send privately" : "Show everyone"}
            </Button>
            <span className="text-xs text-ink-faint">
              {targets.length
                ? `Pops up only for ${targets.length} player${targets.length === 1 ? "" : "s"}.`
                : "Pops up full-screen for everyone at the table."}
            </span>
          </div>
          {flash && (
            <p className="animate-fade-in rounded-md border border-forest/40 bg-forest/10 px-3 py-2 text-sm font-semibold text-forest">
              {flash}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
