"use client";

import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import type { Faction, FactionAgenda } from "@/lib/domain/types";

export function FactionAgendas({
  faction: f,
  onUpdate,
}: {
  faction: Faction;
  onUpdate: (patch: Partial<Faction>) => void;
}) {
  const agendas = f.agendas ?? [];
  const setAgendas = (next: FactionAgenda[]) => onUpdate({ agendas: next });
  const patch = (id: string, p: Partial<FactionAgenda>) =>
    setAgendas(agendas.map((a) => (a.id === id ? { ...a, ...p } : a)));

  function setFilled(a: FactionAgenda, filled: number) {
    const clamped = Math.max(0, Math.min(a.segments, filled));
    patch(a.id, { filled: clamped, done: clamped >= a.segments });
  }

  return (
    <Panel
      title="Agendas"
      eyebrow="What they're scheming"
      action={
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            setAgendas([
              ...agendas,
              { id: newId(), title: "New agenda", segments: 6, filled: 0 },
            ])
          }
        >
          <PlusIcon className="h-4 w-4" /> Add agenda
        </Button>
      }
    >
      {agendas.length === 0 ? (
        <p className="text-sm text-ink-faint">
          No agendas. Add a progress clock for a scheme the faction pursues
          between sessions.
        </p>
      ) : (
        <ul className="space-y-3">
          {agendas.map((a) => (
            <li
              key={a.id}
              className={cn(
                "rounded-card border p-3",
                a.done
                  ? "border-oxblood/50 bg-oxblood/5"
                  : "border-parchment-400/50 bg-parchment-100/60",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  defaultValue={a.title}
                  key={`t-${a.id}`}
                  onBlur={(e) => patch(a.id, { title: e.target.value })}
                  className="min-w-40 flex-1 border-b border-transparent bg-transparent font-display font-semibold text-ink hover:border-parchment-400 focus:border-brass focus:outline-none"
                  aria-label="Agenda title"
                />
                {a.done && <Badge tone="oxblood">Complete</Badge>}
                <select
                  value={a.segments}
                  onChange={(e) => {
                    const seg = Number(e.target.value);
                    patch(a.id, {
                      segments: seg,
                      filled: Math.min(a.filled, seg),
                      done: a.filled >= seg,
                    });
                  }}
                  aria-label="Clock size"
                  className="h-8 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-xs font-semibold text-ink focus:border-brass focus:outline-none"
                >
                  {[4, 6, 8, 10, 12].map((s) => (
                    <option key={s} value={s}>
                      {s}-segment
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setAgendas(agendas.filter((x) => x.id !== a.id))}
                  aria-label="Remove agenda"
                  className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  {Array.from({ length: a.segments }).map((_, i) => {
                    const filled = i < a.filled;
                    return (
                      <button
                        key={i}
                        aria-label={`Segment ${i + 1}`}
                        onClick={() =>
                          setFilled(a, filled && i + 1 === a.filled ? i : i + 1)
                        }
                        className={cn(
                          "h-5 w-5 rounded-full border-2 transition-colors",
                          filled
                            ? "border-oxblood bg-oxblood"
                            : "border-parchment-400 bg-transparent hover:bg-oxblood/20",
                        )}
                      />
                    );
                  })}
                </div>
                <span className="numerals text-xs text-ink-faint">
                  {a.filled}/{a.segments}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilled(a, a.filled + 1)}
                  disabled={a.filled >= a.segments}
                >
                  Advance
                </Button>
                {a.filled > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => patch(a.id, { filled: 0, done: false })}
                  >
                    Reset
                  </Button>
                )}
              </div>

              <input
                defaultValue={a.note ?? ""}
                key={`n-${a.id}`}
                onBlur={(e) => patch(a.id, { note: e.target.value })}
                placeholder="What happens when it fills?"
                className="mt-2 w-full rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none"
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
