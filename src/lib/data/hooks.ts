"use client";

import { useCallback, useEffect, useState } from "react";
import type { Entity } from "@/lib/domain/types";
import type { CampaignSummary, PresenceUser, Role } from "@shared/protocol";
import type {
  AuthController,
  ConnectionStatus,
  CreateInput,
  CurrentUser,
  RealtimeController,
  Repository,
  SingletonRepository,
  UpdateInput,
} from "./provider";
import { useDataProvider } from "./context";

export { useDataProvider } from "./context";

/**
 * Subscription hooks. Every component reads data through these — they wire a
 * collection's `subscribe` to React state, so any change (this tab now, another
 * player in Phase 2) re-renders automatically. The mutators are thin pass-throughs.
 */

export interface CollectionApi<T extends Entity> {
  items: T[];
  loading: boolean;
  create: (input: CreateInput<T>) => Promise<T>;
  update: (id: string, patch: UpdateInput<T>) => Promise<T>;
  remove: (id: string) => Promise<void>;
}

export function useCollection<T extends Entity>(
  repo: Repository<T>,
): CollectionApi<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = repo.subscribe((next) => {
      setItems(next);
      setLoading(false);
    });
    return unsubscribe;
  }, [repo]);

  const create = useCallback(
    (input: CreateInput<T>) => repo.create(input),
    [repo],
  );
  const update = useCallback(
    (id: string, patch: UpdateInput<T>) => repo.update(id, patch),
    [repo],
  );
  const remove = useCallback((id: string) => repo.remove(id), [repo]);

  return { items, loading, create, update, remove };
}

/** A single entity by id, derived reactively from its collection. */
export function useEntity<T extends Entity>(
  repo: Repository<T>,
  id: string | undefined,
): { entity: T | null; loading: boolean } {
  const { items, loading } = useCollection(repo);
  const entity = id ? (items.find((item) => item.id === id) ?? null) : null;
  return { entity, loading };
}

export interface SingletonApi<T> {
  value: T | null;
  loading: boolean;
  set: (value: T) => Promise<T>;
  update: (patch: Partial<T>) => Promise<T>;
}

export function useSingleton<T>(repo: SingletonRepository<T>): SingletonApi<T> {
  const [value, setValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = repo.subscribe((next) => {
      setValue(next);
      setLoading(false);
    });
    return unsubscribe;
  }, [repo]);

  const set = useCallback((next: T) => repo.set(next), [repo]);
  const update = useCallback((patch: Partial<T>) => repo.update(patch), [repo]);

  return { value, loading, set, update };
}

// --- Convenience hooks, one per collection ---------------------------------

export const useCampaigns = () => useCollection(useDataProvider().campaigns);
export const useCharacters = () => useCollection(useDataProvider().characters);
export const useStatBlocks = () => useCollection(useDataProvider().statBlocks);
export const useEncounters = () => useCollection(useDataProvider().encounters);
export const useNotes = () => useCollection(useDataProvider().notes);
export const useSessionLogs = () => useCollection(useDataProvider().sessionLogs);
export const useMaps = () => useCollection(useDataProvider().maps);
export const useRollPresets = () => useCollection(useDataProvider().rollPresets);
export const useRollHistory = () => useCollection(useDataProvider().rollHistory);
export const useCombat = () => useSingleton(useDataProvider().combat);

/** The current user (a fixed local DM in Phase 1; real auth in Phase 2). */
export function useCurrentUser(): CurrentUser | null {
  const provider = useDataProvider();
  const [user, setUser] = useState<CurrentUser | null>(null);
  useEffect(() => provider.session.subscribe(setUser), [provider]);
  return user;
}

// --- Multiplayer surfaces (inert in local mode) ----------------------------

export const useAuth = (): AuthController => useDataProvider().auth;
export const useRealtime = (): RealtimeController => useDataProvider().realtime;

export function useConnectionStatus(): ConnectionStatus {
  const provider = useDataProvider();
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    provider.realtime.getStatus(),
  );
  useEffect(
    () => provider.realtime.subscribeStatus(setStatus),
    [provider],
  );
  return status;
}

export function useActiveCampaign(): {
  campaign: CampaignSummary | null;
  role: Role | null;
} {
  const provider = useDataProvider();
  const [state, setState] = useState<{
    campaign: CampaignSummary | null;
    role: Role | null;
  }>(() => ({
    campaign: provider.realtime.getActiveCampaign(),
    role: provider.realtime.getRole(),
  }));
  useEffect(
    () =>
      provider.realtime.subscribeActiveCampaign((campaign, role) =>
        setState({ campaign, role }),
      ),
    [provider],
  );
  return state;
}

export function usePresence(): PresenceUser[] {
  const provider = useDataProvider();
  const [users, setUsers] = useState<PresenceUser[]>([]);
  useEffect(() => provider.realtime.subscribePresence(setUsers), [provider]);
  return users;
}

/** The campaigns the current user is a member of (with role + DM join code). */
export function useCampaignList(): CampaignSummary[] {
  const provider = useDataProvider();
  const [list, setList] = useState<CampaignSummary[]>(() =>
    provider.realtime.getCampaigns(),
  );
  useEffect(
    () => provider.realtime.subscribeCampaigns(setList),
    [provider],
  );
  return list;
}
