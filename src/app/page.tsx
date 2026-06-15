export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="font-display text-sm uppercase tracking-[0.3em] text-brass-dark">
        Candlelit Scriptorium
      </p>
      <h1 className="font-display text-5xl font-bold text-oxblood sm:text-6xl">
        Dragon&apos;s Ledger
      </h1>
      <p className="max-w-xl text-lg text-ink-soft">
        A campaign companion for Dungeons &amp; Dragons. The scriptorium is being
        illuminated — dice, sheets, encounters, and lore are on their way.
      </p>
      <div className="rule-illuminated w-40" />
      <p className="numerals text-sm text-ink-faint">Phase 1 · local-first</p>
    </main>
  );
}
