"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/data/hooks";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { D20Icon } from "@/components/ui/icons";
import { ConnectionPill } from "./ConnectionPill";
import { cn } from "@/components/ui/cn";

/** Full-screen login / register gate shown before a campaign is chosen. */
export function AuthScreen({ onPlayOffline }: { onPlayOffline: () => void }) {
  const auth = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await auth.login({ username: username.trim(), password });
      } else {
        await auth.register({
          username: username.trim(),
          password,
          displayName: displayName.trim() || undefined,
        });
      }
      // The gate re-renders once the current user is set.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-card border border-brass/50 bg-oxblood text-gilt shadow-gilt">
          <D20Icon className="h-8 w-8" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-bold tracking-title text-ink">
            Dragon&apos;s Ledger
          </h1>
          <p className="font-display text-[0.65rem] uppercase tracking-[0.3em] text-brass-dark">
            Gather your table
          </p>
        </div>
        <ConnectionPill />
      </div>

      <div className="surface-raised w-full max-w-md p-6">
        <div className="mb-5 inline-flex w-full gap-1 rounded-card border border-parchment-400/70 bg-parchment-100 p-1">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors",
                mode === m
                  ? "bg-oxblood text-parchment-50 shadow-card"
                  : "text-ink-soft hover:bg-parchment-300/60",
              )}
            >
              {m === "login" ? "Sign In" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <TextField
            label="Username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          {mode === "register" && (
            <TextField
              label="Display name"
              hint="how others see you"
              placeholder="e.g. Lee"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          )}
          <TextField
            label="Password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && (
            <p className="rounded-md border border-oxblood/40 bg-oxblood/10 px-3 py-2 text-sm text-oxblood">
              {error}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={busy || !username.trim() || !password}
          >
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign In"
                : "Create Account"}
          </Button>
        </form>
      </div>

      <button
        type="button"
        onClick={onPlayOffline}
        className="mt-6 text-sm font-semibold text-ink-faint underline-offset-2 hover:text-oxblood hover:underline"
      >
        Can&apos;t reach the server? Continue offline (solo)
      </button>
    </main>
  );
}
