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

/**
 * React entry point to the data layer. Feature code calls `useDataProvider()`
 * (and the hooks in ./hooks.ts) and never imports a concrete provider.
 *
 * PHASE 2: swap the one line in `getProvider()` below for
 * `createRealtimeDataProvider({ url, auth })`. Nothing else in the app changes.
 */

let clientSingleton: DataProvider | null = null;

function getProvider(): DataProvider {
  // On the server, return a throwaway instance per call (memory-backed) so no
  // state is shared across requests. On the client, memoize a single instance.
  if (typeof window === "undefined") {
    return createLocalDataProvider();
  }
  if (!clientSingleton) {
    clientSingleton = createLocalDataProvider();
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
