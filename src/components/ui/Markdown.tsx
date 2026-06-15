import { Fragment, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * A tiny, safe Markdown subset renderer — headings, bold/italic/code, blockquotes,
 * and ordered/unordered lists. It parses text into React elements (no
 * dangerouslySetInnerHTML), so user notes can never inject HTML.
 */

function parseInline(text: string, keyBase: string): ReactNode[] {
  // Order matters: bold (**), then italic (*), then code (`).
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return tokens.filter(Boolean).map((tok, i) => {
    const key = `${keyBase}-${i}`;
    if (tok.startsWith("**") && tok.endsWith("**")) {
      return (
        <strong key={key} className="font-semibold text-ink">
          {tok.slice(2, -2)}
        </strong>
      );
    }
    if (tok.startsWith("*") && tok.endsWith("*")) {
      return (
        <em key={key} className="italic">
          {tok.slice(1, -1)}
        </em>
      );
    }
    if (tok.startsWith("`") && tok.endsWith("`")) {
      return (
        <code
          key={key}
          className="rounded bg-parchment-300/70 px-1 py-0.5 font-mono text-[0.85em] text-oxblood"
        >
          {tok.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={key}>{tok}</Fragment>;
  });
}

export function Markdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((it, i) => (
      <li key={i} className="ml-1">
        {parseInline(it, `li-${key}-${i}`)}
      </li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={key++} className="my-2 list-decimal space-y-1 pl-5 text-ink-soft">
          {items}
        </ol>
      ) : (
        <ul key={key++} className="my-2 list-disc space-y-1 pl-5 text-ink-soft">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushList();
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul) {
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }
    if (ol) {
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ol[1]);
      continue;
    }
    flushList();

    if (line.startsWith("### ")) {
      blocks.push(
        <h3 key={key++} className="mt-3 font-display text-base font-semibold text-oxblood">
          {parseInline(line.slice(4), `h3-${key}`)}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h2 key={key++} className="mt-4 font-display text-lg font-bold text-ink">
          {parseInline(line.slice(3), `h2-${key}`)}
        </h2>,
      );
    } else if (line.startsWith("# ")) {
      blocks.push(
        <h1 key={key++} className="mt-2 font-display text-xl font-bold text-ink">
          {parseInline(line.slice(2), `h1-${key}`)}
        </h1>,
      );
    } else if (line.startsWith("> ")) {
      blocks.push(
        <blockquote
          key={key++}
          className="my-2 border-l-2 border-brass pl-3 italic text-ink-soft"
        >
          {parseInline(line.slice(2), `bq-${key}`)}
        </blockquote>,
      );
    } else {
      blocks.push(
        <p key={key++} className="my-1.5 leading-relaxed text-ink-soft">
          {parseInline(line, `p-${key}`)}
        </p>,
      );
    }
  }
  flushList();

  return <div className={cn("text-sm", className)}>{blocks}</div>;
}
