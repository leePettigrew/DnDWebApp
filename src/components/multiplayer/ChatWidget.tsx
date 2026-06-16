"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useChat, useCurrentUser, useDataProvider } from "@/lib/data/hooks";
import { ChatIcon, CloseIcon } from "@/components/ui/icons";
import { cn } from "@/components/ui/cn";

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Floating bottom-right campaign chat. Renders nothing in solo/local mode. */
export function ChatWidget() {
  const { capabilities } = useDataProvider();
  const { messages, send } = useChat();
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [seen, setSeen] = useState(0);
  const initialized = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest messages in view; track unread while collapsed.
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    if (!initialized.current) {
      initialized.current = true;
      setSeen(messages.length);
    } else if (open) {
      setSeen(messages.length);
    }
  }, [messages, open]);

  if (!capabilities.multiUser) return null;

  const unread = Math.max(0, messages.length - seen);

  function submit(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    send(body);
    setDraft("");
  }

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {open ? (
        <div className="surface-raised flex h-[26rem] w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden animate-fade-in-up">
          <header className="flex items-center justify-between border-b border-parchment-400/60 bg-parchment-200/60 px-4 py-2.5">
            <span className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
              <ChatIcon className="h-4 w-4 text-brass-dark" /> Table Chat
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-md p-1 text-ink-faint hover:bg-parchment-300/60 hover:text-oxblood"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {messages.length === 0 ? (
              <p className="mt-6 text-center text-sm text-ink-faint">
                No messages yet. Say hello to the table.
              </p>
            ) : (
              messages.map((m) => {
                const mine = m.userId === user?.id;
                return (
                  <div
                    key={m.id}
                    className={cn("flex flex-col", mine ? "items-end" : "items-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-card border px-3 py-1.5 text-sm",
                        mine
                          ? "border-oxblood/40 bg-oxblood/10 text-ink"
                          : "border-parchment-400/60 bg-parchment-100/70 text-ink",
                      )}
                    >
                      {!mine && (
                        <span className="block text-[0.65rem] font-semibold text-brass-dark">
                          {m.name}
                        </span>
                      )}
                      <span className="whitespace-pre-wrap break-words">
                        {m.body}
                      </span>
                    </div>
                    <span className="numerals mt-0.5 px-1 text-[0.6rem] text-ink-faint">
                      {timeOf(m.createdAt)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={submit}
            className="flex items-center gap-2 border-t border-parchment-400/60 bg-parchment-200/40 p-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message the table…"
              maxLength={2000}
              aria-label="Chat message"
              className="flex-1 rounded-md border border-parchment-400/80 bg-parchment-50/80 px-3 py-2 text-sm text-ink placeholder:text-ink-faint/70 focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="rounded-md bg-oxblood px-3 py-2 text-sm font-semibold text-parchment-50 disabled:opacity-50 hover:bg-oxblood-light"
            >
              Send
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open table chat"
          className="relative flex h-12 w-12 items-center justify-center rounded-full border border-brass/50 bg-oxblood text-parchment-50 shadow-raised transition-transform hover:scale-105"
        >
          <ChatIcon className="h-6 w-6" />
          {unread > 0 && (
            <span className="numerals absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brass px-1 text-xs font-bold text-leather">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
