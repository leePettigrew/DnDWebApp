"use client";

import { useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import { useCharacters, useStatBlocks } from "@/lib/data/hooks";
import type { Faction, FactionMember } from "@/lib/domain/types";

export function FactionMembers({
  faction: f,
  onUpdate,
}: {
  faction: Faction;
  onUpdate: (patch: Partial<Faction>) => void;
}) {
  const { items: statBlocks } = useStatBlocks();
  const { items: characters } = useCharacters();
  const npcs = statBlocks.filter((s) => s.kind === "npc");
  const members = f.members ?? [];
  const [pick, setPick] = useState("");

  const setMembers = (next: FactionMember[]) => onUpdate({ members: next });
  const sorted = [...members].sort(
    (a, b) => (b.leader ? 1 : 0) - (a.leader ? 1 : 0),
  );

  function add() {
    if (!pick) return;
    if (pick === "custom") {
      const name = prompt("Member name:");
      if (!name) return;
      setMembers([...members, { id: newId(), name }]);
    } else if (pick.startsWith("npc:")) {
      const id = pick.slice(4);
      const n = npcs.find((x) => x.id === id);
      setMembers([
        ...members,
        { id: newId(), name: n?.name ?? "NPC", statBlockId: id },
      ]);
    } else if (pick.startsWith("pc:")) {
      const id = pick.slice(3);
      const c = characters.find((x) => x.id === id);
      setMembers([
        ...members,
        { id: newId(), name: c?.name ?? "PC", characterId: id },
      ]);
    }
    setPick("");
  }
  const patch = (id: string, p: Partial<FactionMember>) =>
    setMembers(members.map((m) => (m.id === id ? { ...m, ...p } : m)));

  return (
    <Panel title="Members" eyebrow="Who belongs">
      {members.length === 0 ? (
        <p className="text-sm text-ink-faint">
          No members yet. Link NPCs or heroes (or add a name) below.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((m) => {
            const href = m.statBlockId
              ? `/bestiary/${m.statBlockId}`
              : m.characterId
                ? `/characters/${m.characterId}`
                : null;
            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-2 rounded-card border border-parchment-400/50 bg-parchment-100/60 p-2"
              >
                <button
                  onClick={() => patch(m.id, { leader: !m.leader })}
                  title={m.leader ? "Leader" : "Mark as leader"}
                  className={cn(
                    "text-lg leading-none",
                    m.leader ? "text-brass-dark" : "text-ink-faint hover:text-brass-dark",
                  )}
                  aria-label="Toggle leader"
                >
                  {m.leader ? "★" : "☆"}
                </button>
                <span className="min-w-32 flex-1 truncate font-display font-semibold text-ink">
                  {href ? (
                    <Link href={href} className="hover:text-oxblood hover:underline">
                      {m.name}
                    </Link>
                  ) : (
                    m.name
                  )}
                </span>
                <input
                  defaultValue={m.role ?? ""}
                  key={`role-${m.id}`}
                  onBlur={(e) => patch(m.id, { role: e.target.value })}
                  placeholder="role / rank"
                  className="min-w-28 flex-1 rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none"
                />
                <button
                  onClick={() => setMembers(members.filter((x) => x.id !== m.id))}
                  aria-label="Remove member"
                  className="rounded-md p-1.5 text-ink-faint hover:bg-oxblood hover:text-parchment-50"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          aria-label="Add member"
          className="h-9 min-w-48 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none"
        >
          <option value="">Add a member…</option>
          {npcs.length > 0 && (
            <optgroup label="NPCs">
              {npcs.map((n) => (
                <option key={n.id} value={`npc:${n.id}`}>
                  {n.name}
                </option>
              ))}
            </optgroup>
          )}
          {characters.length > 0 && (
            <optgroup label="Heroes">
              {characters.map((c) => (
                <option key={c.id} value={`pc:${c.id}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
          <option value="custom">Custom name…</option>
        </select>
        <Button variant="secondary" size="sm" onClick={add} disabled={!pick}>
          <PlusIcon className="h-4 w-4" /> Add
        </Button>
      </div>
    </Panel>
  );
}
