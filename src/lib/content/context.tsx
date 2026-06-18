"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  CustomItem,
  CustomSpell,
  LootTable,
  SrdOverride,
} from "@/lib/domain/types";
import {
  useActiveCampaign,
  useCurrentUser,
  useDataProvider,
} from "@/lib/data/hooks";
import { contentApi, type ContentRecord } from "./api";

export interface CustomContent {
  /** True when a multiplayer server is configured (homebrew is server-backed). */
  enabled: boolean;
  loading: boolean;
  campaignId: string | null;
  spells: ContentRecord<CustomSpell>[];
  items: ContentRecord<CustomItem>[];
  lootTables: ContentRecord<LootTable>[];
  /** SRD edit/hide overrides (global + campaign). */
  overrides: ContentRecord<SrdOverride>[];
  /** Loot-config override records (global + campaign). */
  lootConfigs: ContentRecord[];
  refresh: () => Promise<void>;
}

const empty: CustomContent = {
  enabled: false,
  loading: false,
  campaignId: null,
  spells: [],
  items: [],
  lootTables: [],
  overrides: [],
  lootConfigs: [],
  refresh: async () => {},
};

const Ctx = createContext<CustomContent>(empty);

export function CustomContentProvider({ children }: { children: ReactNode }) {
  const { campaign } = useActiveCampaign();
  const user = useCurrentUser();
  const campaignId = campaign?.id ?? null;
  const enabled = contentApi.enabled();

  const [records, setRecords] = useState<ContentRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled || !user) {
      setRecords([]);
      return;
    }
    setLoading(true);
    try {
      const [g, c] = await Promise.all([
        contentApi.global().catch(() => ({ records: [] as ContentRecord[] })),
        campaignId
          ? contentApi
              .campaign(campaignId)
              .catch(() => ({ records: [] as ContentRecord[] }))
          : Promise.resolve({ records: [] as ContentRecord[] }),
      ]);
      setRecords([...g.records, ...c.records]);
    } finally {
      setLoading(false);
    }
  }, [enabled, user, campaignId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live-push: refetch when the server says content changed.
  const provider = useDataProvider();
  useEffect(
    () => provider.realtime.subscribeContentChanged(() => void refresh()),
    [provider, refresh],
  );

  const value = useMemo<CustomContent>(
    () => ({
      enabled,
      loading,
      campaignId,
      spells: records.filter(
        (r) => r.kind === "spell",
      ) as ContentRecord<CustomSpell>[],
      items: records.filter(
        (r) => r.kind === "item",
      ) as ContentRecord<CustomItem>[],
      lootTables: records.filter(
        (r) => r.kind === "loot",
      ) as ContentRecord<LootTable>[],
      overrides: records.filter(
        (r) => r.kind === "override",
      ) as ContentRecord<SrdOverride>[],
      lootConfigs: records.filter((r) => r.kind === "lootconfig"),
      refresh,
    }),
    [records, loading, enabled, campaignId, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCustomContent = () => useContext(Ctx);
