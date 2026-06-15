import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 font-display font-semibold tracking-title rounded-card border transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none select-none active:translate-y-px";

const variants: Record<Variant, string> = {
  primary:
    "bg-oxblood text-parchment-50 border-oxblood-dark shadow-card hover:bg-oxblood-light hover:shadow-raised",
  secondary:
    "bg-parchment-100 text-ink border-brass/60 hover:border-brass hover:bg-parchment-50 hover:shadow-gilt",
  ghost:
    "bg-transparent text-ink-soft border-transparent hover:bg-parchment-300/50 hover:text-ink",
  danger:
    "bg-transparent text-oxblood border-oxblood/40 hover:bg-oxblood hover:text-parchment-50",
};

const sizes: Record<Size, string> = {
  sm: "text-xs px-2.5 py-1.5",
  md: "text-sm px-4 py-2",
  lg: "text-base px-6 py-3",
};

/** Reusable class string so <Link>s can look like buttons too. */
export function buttonClasses(
  variant: Variant = "primary",
  size: Size = "md",
  className?: string,
): string {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? "button"}
      className={buttonClasses(variant, size, className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
