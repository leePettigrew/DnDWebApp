import type { ReactNode } from "react";
import { cn } from "./cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-parchment-400/80 bg-parchment-100/60 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && <div className="text-brass/70 [&>svg]:h-10 [&>svg]:w-10">{icon}</div>}
      <h3 className="font-display text-lg text-ink">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-ink-soft">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
