"use client";

import { useEffect } from "react";
import { buttonClasses } from "@/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error for debugging; a Phase 2 backend could report it.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
      <p className="font-display text-sm uppercase tracking-[0.3em] text-brass-dark">
        A spell misfired
      </p>
      <h1 className="font-display text-4xl font-bold text-oxblood">
        Something went awry
      </h1>
      <p className="max-w-md text-ink-soft">
        The scriptorium hit an unexpected snag. Your saved data is safe in this
        browser — try again.
      </p>
      <button onClick={reset} className={buttonClasses("primary", "md")}>
        Try again
      </button>
    </div>
  );
}
