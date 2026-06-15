"use client";

import {
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { cn } from "./cn";
import { CloseIcon } from "./icons";

/**
 * Accessible modal dialog: ESC + backdrop to close, focus moved in on open and
 * restored on close, body scroll locked, labelled by its title. Animations use
 * the theme keyframes, which respect prefers-reduced-motion globally.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const { body } = document;
    const prevOverflow = body.style.overflow;
    body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // Move focus into the dialog.
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
  } as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-leather/60 p-4 backdrop-blur-sm animate-fade-in sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={cn(
          "surface-raised my-8 w-full outline-none animate-fade-in-up",
          sizes[size],
        )}
      >
        <header className="flex items-center justify-between gap-4 border-b border-parchment-400/60 bg-parchment-200/60 px-5 py-3.5">
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-md p-1 text-ink-faint transition-colors hover:bg-parchment-300/60 hover:text-oxblood"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-3 border-t border-parchment-400/60 bg-parchment-200/40 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
