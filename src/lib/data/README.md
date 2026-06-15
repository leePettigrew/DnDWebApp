# The Data Layer — Phase 1 → Phase 2 seam

Everything the app stores or reads goes through **one interface**: `DataProvider`
(in [`provider.ts`](./provider.ts)). UI and feature code import only:

- the **types** in `provider.ts` (`DataProvider`, `Repository<T>`, …), and
- the **hooks** in [`hooks.ts`](./hooks.ts) (`useCharacters()`, `useCombat()`, …).

No component imports `localStorage`, `fetch`, a socket, or a concrete provider.
That single rule is what makes Phase 2 a drop-in.

```
            ┌─────────────────────────────────────────────┐
  UI /      │  useCharacters(), useCombat(), useCollection │   ← hooks.ts
  features  └───────────────────────┬─────────────────────┘
                                    │  (only ever this)
            ┌───────────────────────▼─────────────────────┐
  SEAM      │   interface DataProvider / Repository<T>     │   ← provider.ts
            └───────────────────────┬─────────────────────┘
                    ┌───────────────┴───────────────┐
   Phase 1 ►  createLocalDataProvider()      createRealtimeDataProvider()  ◄ Phase 2
              (in-memory + persistence)       (WebSocket / Supabase / …)
                    │
            ┌───────▼────────┐
            │ PersistenceAdapter │  localStorage today, IndexedDB/etc. tomorrow
            └────────────────┘
```

## Why the swap is free

Two decisions in `provider.ts` do all the work:

1. **Async everywhere.** `list/get/create/update/remove` already return
   `Promise`s. Locally they resolve immediately; over a network they resolve
   later — but every call site is already written for that.

2. **Observation built in.** `Repository.subscribe(listener)` calls back with the
   full collection now and after every change. Locally that fires on this tab's
   own writes. In Phase 2 it *also* fires when another player changes something,
   because the realtime provider pushes server events through the same callback.
   The UI already re-renders on subscription — it never asked *who* caused the change.

## What Phase 2 plugs in

| Need | Where it goes | Phase 1 stand-in |
|------|---------------|------------------|
| Realtime backend | a new `createRealtimeDataProvider()` implementing `DataProvider` | `createLocalDataProvider()` |
| Wire it up | one line in [`context.tsx`](./context.tsx) `getProvider()` | returns the local provider |
| Auth / users | `DataProvider.session` (`SessionController`) — add `signIn/signOut`, emit user changes | fixed `{ id: "local-dm", name: "Dungeon Master" }` |
| Feature flags | `DataProvider.capabilities` (`realtime`/`auth`/`multiUser`) | all `false` |
| Secrets / URLs | `.env.local` (see `.env.example`) | none needed |

### Concretely, to add multiplayer you would:

1. Write `src/lib/data/realtime-provider.ts` exporting
   `createRealtimeDataProvider(opts): DataProvider`. Each `Repository` method
   sends a request to the server; `subscribe` registers for server push and
   re-emits the collection on every broadcast.
2. Implement `SessionController` against your auth (sign-in returns a real user;
   `subscribe` emits on login/logout).
3. Set `capabilities` to `{ realtime: true, auth: true, multiUser: true }`.
4. Change `getProvider()` in `context.tsx` to construct it (reading config from
   `process.env.NEXT_PUBLIC_*`).

No feature component, no hook caller, and no domain type changes. The combat
tracker, character sheets, and dice history start updating live across clients
because they already render off `subscribe`.

## Persistence boundary (a smaller, inner seam)

The local provider keeps canonical state in memory and delegates *saving* to a
[`PersistenceAdapter`](./persistence.ts) (`load/save/remove`). Today that's
`LocalStoragePersistence`; tests use `MemoryPersistence`. Swapping it (e.g. to
IndexedDB for larger maps) doesn't touch the provider or the UI.
