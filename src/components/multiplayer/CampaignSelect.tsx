"use client";

import { useState } from "react";
import {
  useAuth,
  useCampaignList,
  useCurrentUser,
  useRealtime,
} from "@/lib/data/hooks";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TextField, TextArea } from "@/components/ui/Field";
import { ChevronRightIcon, PlusIcon, ScrollIcon } from "@/components/ui/icons";
import { ConnectionPill } from "./ConnectionPill";

export function CampaignSelect() {
  const realtime = useRealtime();
  const auth = useAuth();
  const user = useCurrentUser();
  const campaigns = useCampaignList();

  const [name, setName] = useState("");
  const [setting, setSetting] = useState("High Fantasy");
  const [description, setDescription] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function guard(fn: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.3em] text-brass-dark">
            Welcome{user ? `, ${user.name}` : ""}
          </p>
          <h1 className="font-display text-4xl font-bold tracking-title text-ink">
            Choose your table
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionPill />
          <Button variant="ghost" size="sm" onClick={() => auth.logout()}>
            Sign out
          </Button>
        </div>
      </div>

      {error && (
        <p className="mb-5 rounded-md border border-oxblood/40 bg-oxblood/10 px-3 py-2 text-sm text-oxblood">
          {error}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Your Campaigns" eyebrow="Tables you've joined">
            {campaigns.length === 0 ? (
              <p className="text-sm text-ink-soft">
                You&apos;re not in any campaigns yet. Create one, or join with an
                invite code.
              </p>
            ) : (
              <ul className="space-y-2">
                {campaigns.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-card border border-parchment-400/60 bg-parchment-100/70 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-display text-lg font-bold text-ink">
                          {c.name}
                        </h3>
                        <Badge tone={c.role === "dm" ? "oxblood" : "arcane"}>
                          {c.role === "dm" ? "DM" : "Player"}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-ink-faint">
                        {c.setting}
                        {c.role === "dm" && c.joinCode ? (
                          <>
                            {" · invite code "}
                            <span className="numerals font-semibold text-brass-dark">
                              {c.joinCode}
                            </span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => guard(() => realtime.openCampaign(c.id))}
                    >
                      Enter <ChevronRightIcon className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Join a Table" eyebrow="Have an invite code?">
            <div className="flex gap-2">
              <TextField
                aria-label="Invite code"
                placeholder="e.g. AB12CD"
                className="flex-1 uppercase"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              />
              <Button
                variant="secondary"
                disabled={busy || !joinCode.trim()}
                onClick={() =>
                  guard(async () => {
                    await realtime.joinByCode(joinCode.trim());
                    setJoinCode("");
                  })
                }
              >
                Join
              </Button>
            </div>
          </Panel>

          <Panel title="New Campaign" eyebrow="Start a table as DM">
            <div className="space-y-3">
              <TextField
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                label="Setting"
                value={setting}
                onChange={(e) => setSetting(e.target.value)}
              />
              <TextArea
                label="Description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <Button
                className="w-full"
                disabled={busy || !name.trim()}
                onClick={() =>
                  guard(() =>
                    realtime.createCampaign({
                      name: name.trim(),
                      setting: setting.trim() || undefined,
                      description: description.trim() || undefined,
                    }),
                  )
                }
              >
                <PlusIcon className="h-4 w-4" /> Create &amp; Enter
              </Button>
            </div>
          </Panel>

          <p className="flex items-center gap-2 px-1 text-xs text-ink-faint">
            <ScrollIcon className="h-4 w-4" />
            As DM you get an invite code to share. Players join with it.
          </p>
        </div>
      </div>
    </main>
  );
}
