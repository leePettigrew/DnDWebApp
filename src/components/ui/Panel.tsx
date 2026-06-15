import type { ReactNode } from "react";
import { cn } from "./cn";

interface PanelProps {
  title?: ReactNode;
  /** Small caption above the title (e.g. a section eyebrow). */
  eyebrow?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Visual weight: parchment (default raised card) or plain inset. */
  tone?: "raised" | "flat";
}

/** The signature aged-paper card with an optional gilt-flourished header. */
export function Panel({
  title,
  eyebrow,
  action,
  children,
  className,
  bodyClassName,
  tone = "raised",
}: PanelProps) {
  return (
    <section
      className={cn(
        tone === "raised" ? "surface-raised" : "surface-parchment",
        "overflow-hidden",
        className,
      )}
    >
      {(title || action || eyebrow) && (
        <header className="flex items-start justify-between gap-4 border-b border-parchment-400/60 bg-parchment-200/50 px-5 py-3.5">
          <div className="min-w-0">
            {eyebrow && (
              <p className="font-display text-[0.65rem] uppercase tracking-[0.25em] text-brass-dark">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="heading-flourish font-display text-lg font-semibold text-ink">
                {title}
              </h2>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
