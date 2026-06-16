"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { DataProvider } from "./provider";
import { createLocalDataProvider } from "./local-provider";
import { createRealtimeDataProvider } from "./realtime-provider";

/**
 * React entry point to the data layer. Feature code calls `useDataProvider()`
 * (and the hooks in ./hooks.ts) and never imports a concrete provider.
 *
 * THE SWAP POINT: if `NEXT_PUBLIC_MULTIPLAYER_WS_URL` is set we use the
 * WebSocket-backed realtime provider (which still falls back to local/solo when
 * the server is unreachable); otherwise the pure local provider (Phase 1).
 */

let clientSingleton: DataProvider | null = null;

function getProvider(): DataProvider {
  // On the server, return a throwaway local instance per call (memory-backed)
  // so no state is shared across requests. On the client, memoize one instance.
  if (typeof window === "undefined") {
    return createLocalDataProvider();
  }
  if (!clientSingleton) {
    const wsUrl = process.env.NEXT_PUBLIC_MULTIPLAYER_WS_URL;
    clientSingleton = wsUrl
      ? createRealtimeDataProvider(wsUrl)
      : createLocalDataProvider();
  }
  return clientSingleton;
}

const DataProviderContext = createContext<DataProvider | null>(null);

export function DataProviderProvider({ children }: { children: ReactNode }) {
  const [provider] = useState(getProvider);

  useEffect(() => {
    void provider.init();
  }, [provider]);

  return (
    <DataProviderContext.Provider value={provider}>
      {children}
    </DataProviderContext.Provider>
  );
}

export function useDataProvider(): DataProvider {
  const ctx = useContext(DataProviderContext);
  if (!ctx) {
    throw new Error(
      "useDataProvider must be used within a <DataProviderProvider>",
    );
  }
  return ctx;
}
