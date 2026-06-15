import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { D20Icon } from "@/components/ui/icons";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
      <D20Icon className="h-16 w-16 text-brass/70" />
      <p className="font-display text-sm uppercase tracking-[0.3em] text-brass-dark">
        A natural 1
      </p>
      <h1 className="font-display text-4xl font-bold text-oxblood">
        Page not found
      </h1>
      <p className="max-w-md text-ink-soft">
        This passage of the scriptorium has crumbled to dust — or was never
        written. Return to the hearth and try another path.
      </p>
      <Link href="/" className={buttonClasses("primary", "md")}>
        Back to the Hearth
      </Link>
    </div>
  );
}
