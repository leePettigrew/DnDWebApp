# Dragon's Ledger

A Dungeons & Dragons campaign companion for the table — dice, character sheets,
a bestiary, encounters, a live combat tracker, and a campaign codex — wrapped in
a committed **Candlelit Scriptorium** theme (aged parchment, oxblood & brass‑gold,
Cinzel over EB Garamond).

> **Phase 1 — local‑first.** Everything runs in your browser with no backend and
> no accounts. All data lives in `localStorage`. The whole app is architected so
> that **Phase 2 (real‑time multiplayer + auth) drops in behind a single data
> seam without rewriting any UI or feature code** — see
> [Architecture](#architecture--the-phase-2-seam).

---

## Features

| Area | What it does |
|------|--------------|
| **Dice Tower** | Build any pool (d4–d100), modifiers, advantage/disadvantage on the first d20, satisfying tumble animation, crit/fumble highlighting, saved presets, and persisted roll history. |
| **Heroes** | Full 5e character sheets: abilities & modifiers, proficiency bonus, skills (proficiency + expertise), saving throws, HP with live damage/heal/temp, AC, initiative, spellcasting (save DC / attack), inventory, features, and lore. Tap any stat to roll it. Create, edit, and view many characters. |
| **Bestiary** | Monster & NPC stat blocks (AC, HP, speed, CR, abilities, saves/skills/senses, resistances, traits, actions, reactions, legendary actions). |
| **Encounters** | Assemble monsters/NPCs into named encounters with counts, then send them to the War Table. |
| **War Table** | Initiative & combat tracker: ordered turn list, round counter, next/previous turn, per‑combatant HP/AC, conditions, and reinforcements mid‑fight. Built to stay legible during a busy round. |
| **Codex** | Campaign notes (Markdown + tags + pinning), battle‑map slots (image URL or upload), and a dated session‑log chronicle. |

The app ships with a **classic high‑fantasy starter campaign** ("The Sunken Crown
of Eldermoor") so every screen has something to show. It's all clearly‑marked
placeholder content you can edit or delete, with obvious **art slots** for
character portraits, monster art, and battle maps.

---

## Tech stack

- **Next.js (App Router)** + **React 19** + **TypeScript (strict)**
- **Tailwind CSS v3** with a bespoke token system (see `tailwind.config.ts`)
- **Cinzel** + **EB Garamond** via Google Fonts (graceful serif fallback offline)
- No backend, no database, no environment variables in Phase 1.

---

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts: `npm run build` (production build), `npm run start` (serve the
build), `npm run lint`.

> **Windows note:** if `node`/`npm` aren't on your PATH in a given shell, this
> repo was developed with Node installed at `C:\Program Files\nodejs`. Add it to
> PATH, or prefix commands accordingly.

---

## Architecture — the Phase 2 seam

The single most important design decision: **all data access goes through one
interface, `DataProvider`** (in [`src/lib/data/provider.ts`](src/lib/data/provider.ts)).
UI and feature code only ever touch:

- the **types** in `provider.ts`, and
- the **hooks** in [`src/lib/data/hooks.ts`](src/lib/data/hooks.ts)
  (`useCharacters()`, `useCombat()`, `useCollection()`, …).

No component imports `localStorage`, `fetch`, or a socket.

```
        UI / features ── useCharacters(), useCombat(), useCollection()   (hooks.ts)
                                     │  only ever this
        ──────────────── interface DataProvider / Repository<T> ─────────  (provider.ts)  ◄ THE SEAM
                    ┌────────────────┴────────────────┐
   Phase 1 ►  createLocalDataProvider()        createRealtimeDataProvider()  ◄ Phase 2
              in‑memory + persistence           WebSocket / Supabase / Firebase
                    │
              PersistenceAdapter  ── localStorage today, IndexedDB/etc. tomorrow
```

Two decisions make the swap free:

1. **Async everywhere.** Every read/write returns a `Promise`. Local resolves
   instantly; a network resolves later — but the call sites are identical.
2. **Observation built in.** `Repository.subscribe()` re‑emits the collection on
   every change. Locally that's this tab's own edits; in Phase 2 it's **pushes
   from other players** through the same callback. The UI already re‑renders on
   subscription, so live multiplayer needs no UI changes.

### What Phase 2 plugs in

1. Write `createRealtimeDataProvider()` implementing the same `DataProvider`
   interface (each method talks to the server; `subscribe` registers for push).
2. Implement the `SessionController` (`provider.ts`) against real auth — Phase 1
   returns a fixed local `Dungeon Master`.
3. Flip `capabilities` to `{ realtime: true, auth: true, multiUser: true }`.
4. Change **one line** in [`src/lib/data/context.tsx`](src/lib/data/context.tsx)
   (`getProvider()`) to construct it, reading config from `.env.local`.

The combat tracker, character sheets, and dice history start syncing live across
clients with **zero feature‑code changes**. Full detail:
[`src/lib/data/README.md`](src/lib/data/README.md).

---

## Project structure

```
src/
  app/                  # routes (App Router): /, /dice, /characters, /bestiary,
                        #   /encounters, /combat, /codex (+ [id] detail pages)
  components/
    ui/                 # design-system primitives (Button, Panel, Modal, …)
    shell/              # AppShell + navigation
    dice/ characters/ bestiary/ combat/ codex/   # feature components
  lib/
    domain/             # framework-free model + engines (types, dice, 5e math)
    data/               # THE SEAM: provider interface, local impl, persistence,
                        #   React context + hooks, seed data, README
    combat/             # pure combat-state reducers + combatant factories
    hooks/              # small client hooks (useReducedMotion)
```

---

## Design notes

- **One type pairing:** Cinzel (engraved display) for headings, EB Garamond
  (warm serif) for body. Numerals use tabular figures.
- **Motion with purpose:** dice tumble, card lifts, dialog transitions — all
  disabled under `prefers-reduced-motion`.
- **Accessibility:** semantic HTML, visible focus rings, labelled controls,
  alt text on art, a skip‑to‑content link, and AA‑contrast ink on parchment.
- **Responsive:** sticky sidebar on desktop, drawer nav on mobile; the combat
  tracker stays legible from phone to laptop.

---

## Deploying (free)

Phase 1 is a static‑friendly Next app and deploys to **Vercel** (or Netlify) on
a free tier with no configuration and no secrets. Push to GitHub and import the
repo; the default build (`npm run build`) just works.

---

## What to customize first

1. **The campaign.** Codex → edit "The Sunken Crown of Eldermoor", or create your
   own and delete the sample.
2. **Your party.** Heroes → create your real PCs (or edit the three samples).
3. **Art slots.** Drop portrait/monster image URLs and battle‑map images into the
   clearly‑marked slots.
4. **Roll presets.** Dice Tower → save your characters' common attacks and saves.

> This is **Phase 1**. Multiplayer and accounts are intentionally not built yet —
> the codebase is architected for them behind the data seam above.
