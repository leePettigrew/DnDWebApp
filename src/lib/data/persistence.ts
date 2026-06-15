/**
 * The persistence boundary.
 *
 * The local DataProvider keeps the canonical state in memory and treats *saving*
 * as a side effect delegated to a PersistenceAdapter. This is a second, smaller
 * seam: we can swap localStorage for IndexedDB (or nothing, in tests) without
 * touching the provider — and in Phase 2 the whole provider is replaced anyway,
 * so persistence becomes the server's job.
 */
export interface PersistenceAdapter {
  load<T>(key: string): T | null;
  save<T>(key: string, value: T): void;
  remove(key: string): void;
}

const STORAGE_PREFIX = "dragons-ledger:v1:";

/** Browser localStorage adapter. JSON in/out, fault-tolerant. */
export class LocalStoragePersistence implements PersistenceAdapter {
  load<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  save<T>(key: string, value: T): void {
    try {
      window.localStorage.setItem(
        STORAGE_PREFIX + key,
        JSON.stringify(value),
      );
    } catch {
      // Quota exceeded or storage unavailable — fail soft. The in-memory copy
      // remains authoritative for this session.
    }
  }

  remove(key: string): void {
    try {
      window.localStorage.removeItem(STORAGE_PREFIX + key);
    } catch {
      /* no-op */
    }
  }
}

/** In-memory adapter for SSR and tests — never persists across reloads. */
export class MemoryPersistence implements PersistenceAdapter {
  private store = new Map<string, string>();

  load<T>(key: string): T | null {
    const raw = this.store.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  save<T>(key: string, value: T): void {
    this.store.set(key, JSON.stringify(value));
  }

  remove(key: string): void {
    this.store.delete(key);
  }
}

/** Pick the right adapter for the current runtime (browser vs server/test). */
export function createBrowserPersistence(): PersistenceAdapter {
  if (typeof window !== "undefined" && "localStorage" in window) {
    return new LocalStoragePersistence();
  }
  return new MemoryPersistence();
}
