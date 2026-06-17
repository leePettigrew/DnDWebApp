"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { TextField, TextArea } from "@/components/ui/Field";
import { ScrollIcon } from "@/components/ui/icons";
import {
  useActiveCampaign,
  useDataProvider,
  useRealtime,
} from "@/lib/data/hooks";

/**
 * DM-only composer that pushes a handout (text and/or image) to every player
 * at the table. Solo previews locally so you can see exactly what lands.
 */
export function HandoutComposer() {
  const realtime = useRealtime();
  const { capabilities } = useDataProvider();
  const { role } = useActiveCampaign();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  // In solo you're always the DM; in multiplayer only the DM may push.
  const isDM = !capabilities.multiUser || role === "dm";
  const empty = !title.trim() && !body.trim() && !imageUrl.trim();

  function share() {
    if (empty || !isDM) return;
    realtime.shareHandout({
      title: title.trim() || undefined,
      body: body.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
    });
    setFlash(
      capabilities.multiUser
        ? "Handout shown to the table."
        : "Preview shown (solo mode — no players to receive it).",
    );
    window.setTimeout(() => setFlash(null), 2800);
  }

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
          <div className="flex items-center gap-3">
            <Button onClick={share} disabled={empty}>
              <ScrollIcon className="h-4 w-4" /> Show players
            </Button>
            <span className="text-xs text-ink-faint">
              Pops up full-screen for everyone at the table.
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
