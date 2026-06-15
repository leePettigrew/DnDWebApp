import { cn } from "./cn";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Art slot for character portraits and monster art. Renders the image when a
 * URL/data-URL is provided; otherwise a themed placeholder you can clearly tell
 * apart from real art. Pass sizing via className.
 */
export function Portrait({
  src,
  name,
  className,
  rounded = "card",
}: {
  src?: string;
  name: string;
  className?: string;
  rounded?: "card" | "full";
}) {
  const radius = rounded === "full" ? "rounded-full" : "rounded-card";
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={`Portrait of ${name}`}
        className={cn("object-cover", radius, className)}
      />
    );
  }
  return (
    <div
      role="img"
      aria-label={`${name} — no portrait set`}
      className={cn(
        "flex items-center justify-center border border-brass/40 bg-gradient-to-br from-parchment-200 to-parchment-300 text-brass-dark",
        radius,
        className,
      )}
    >
      <span className="font-display text-2xl font-bold tracking-title opacity-80">
        {initials(name)}
      </span>
    </div>
  );
}
