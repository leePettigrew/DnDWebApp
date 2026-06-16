"use client";

import { useState, type ReactNode } from "react";
import {
  useActiveCampaign,
  useCurrentUser,
  useDataProvider,
} from "@/lib/data/hooks";
import { AuthScreen } from "./AuthScreen";
import { CampaignSelect } from "./CampaignSelect";

/**
 * Decides what to show in multiplayer mode:
 *   not signed in           -> AuthScreen (with a "continue offline" escape)
 *   signed in, no campaign  -> CampaignSelect
 *   in a campaign           -> the app (children)
 *
 * In local mode (no server configured) it renders the app directly, so Phase 1
 * is completely unaffected.
 */
export function MultiplayerGate({ children }: { children: ReactNode }) {
  const provider = useDataProvider();
  const user = useCurrentUser();
  const { campaign } = useActiveCampaign();
  const [forceOffline, setForceOffline] = useState(false);

  const multiUser = provider.capabilities.multiUser;

  if (!multiUser || forceOffline) return <>{children}</>;
  if (!user) return <AuthScreen onPlayOffline={() => setForceOffline(true)} />;
  if (!campaign) return <CampaignSelect />;
  return <>{children}</>;
}
