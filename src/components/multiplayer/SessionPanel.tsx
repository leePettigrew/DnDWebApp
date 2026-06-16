"use client";

import {
  useActiveCampaign,
  useAuth,
  useDataProvider,
  useRealtime,
} from "@/lib/data/hooks";
import { Badge } from "@/components/ui/Badge";
import { ConnectionPill } from "./ConnectionPill";
import { PresenceStrip } from "./PresenceStrip";

/** Live session controls in the shell. Renders nothing in local/solo mode. */
export function SessionPanel() {
  const { capabilities } = useDataProvider();
  const { campaign, role } = useActiveCampaign();
  const auth = useAuth();
  const realtime = useRealtime();

  if (!capabilities.multiUser) return null;

  return (
    <div className="space-y-2 rounded-card border border-parchment-400/60 bg-parchment-100/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <ConnectionPill />
        {role && (
          <Badge tone={role === "dm" ? "oxblood" : "arcane"}>
            {role === "dm" ? "DM" : "Player"}
          </Badge>
        )}
      </div>
      <PresenceStrip />
      {campaign && (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => realtime.leaveCampaign()}
            className="text-xs font-semibold text-ink-faint hover:text-oxblood"
          >
            Leave table
          </button>
          <span className="text-ink-faint">·</span>
          <button
            type="button"
            onClick={() => auth.logout()}
            className="text-xs font-semibold text-ink-faint hover:text-oxblood"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
