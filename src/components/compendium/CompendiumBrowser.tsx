"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import {
  ChevronRightIcon,
  ClawIcon,
  EditIcon,
  HelmIcon,
  PlusIcon,
  SparkIcon,
  SwordIcon,
} from "@/components/ui/icons";
import {
  useCampaigns,
  useCharacters,
  useCurrentUser,
  usePermissions,
  useStatBlocks,
} from "@/lib/data/hooks";
import {
  ITEM_CATEGORIES,
  type SrdOverrideTargetKind,
} from "@/lib/domain/types";
import { SrdOverrideModal } from "./SrdOverrideModal";
import {
  COMPENDIUM_ITEMS,
  COMPENDIUM_MONSTERS,
  COMPENDIUM_SPELLS,
  itemToInventoryItem,
  monsterToStatBlockInput,
  spellToCharacterSpell,
  type CompendiumItem,
  type CompendiumSpell,
} from "@/lib/compendium";
import { useCustomContent } from "@/lib/content/context";

type Tab = "spells" | "items" | "monsters";

const TABS: { key: Tab; label: string; icon: typeof SparkIcon }[] = [
  { key: "spells", label: "Spells", icon: SparkIcon },
  { key: "items", label: "Items", icon: SwordIcon },
  { key: "monsters", label: "Monsters", icon: ClawIcon },
];

function crValue(cr: string): number {
  if (cr.includes("/")) {
    const [a, b] = cr.split("/").map(Number);
    return a / b;
  }
  return Number(cr);
}

const selectClass =
  "h-9 rounded-md border border-parchment-400 bg-parchment-50 px-2 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40";

export function CompendiumBrowser() {
  const { items: campaigns } = useCampaigns();
  const { items: allCharacters, update: updateCharacter } = useCharacters();
  const { create: createStatBlock } = useStatBlocks();
  const perms = usePermissions();
  // Only offer characters the user is actually allowed to edit.
  const characters = allCharacters.filter((c) => perms.canEdit("characters", c));
  const canAddMonsters = perms.canCreate("statBlocks");
  const content = useCustomContent();
  const me = useCurrentUser();
  // DM (per-campaign) or admin (global) may edit/hide SRD entries.
  const canOverride = content.enabled && (perms.isDM || !!me?.isAdmin);

  const [tab, setTab] = useState<Tab>("spells");
  const [override, setOverride] = useState<{
    kind: SrdOverrideTargetKind;
    name: string;
    base: Record<string, unknown>;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<string>("all");
  const [klass, setKlass] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [cr, setCr] = useState<string>("all");
  const [charId, setCharId] = useState<string>("");
  const [flash, setFlash] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const character =
    characters.find((c) => c.id === charId) ?? characters[0] ?? null;

  const isDM = perms.isDM;

  // Effective SRD overrides (campaign wins over global), keyed by kind:name.
  const overrideMaps = useMemo(() => {
    const g = new Map<string, { hidden?: boolean; data?: Record<string, unknown> }>();
    const c = new Map<string, { hidden?: boolean; data?: Record<string, unknown> }>();
    for (const r of content.overrides) {
      const o = r.data;
      if (!o?.targetKind || !o?.targetName) continue;
      const key = `${o.targetKind}:${o.targetName.toLowerCase()}`;
      (r.scope === "campaign" ? c : g).set(key, { hidden: o.hidden, data: o.data });
    }
    return { g, c };
  }, [content.overrides]);

  type Over = { hidden: boolean; edited: boolean; data: Record<string, unknown> };
  const applyOverride = useMemo(() => {
    return (kind: SrdOverrideTargetKind, name: string): Over => {
      const key = `${kind}:${name.toLowerCase()}`;
      const g = overrideMaps.g.get(key);
      const c = overrideMaps.c.get(key);
      const data = { ...(g?.data ?? {}), ...(c?.data ?? {}) };
      return {
        hidden: c?.hidden ?? g?.hidden ?? false,
        edited: Object.keys(data).length > 0,
        data,
      };
    };
  }, [overrideMaps]);

  type SpellRow = CompendiumSpell & {
    homebrew: boolean;
    hidden?: boolean;
    edited?: boolean;
  };
  type ItemRow = CompendiumItem & {
    homebrew: boolean;
    hidden?: boolean;
    edited?: boolean;
  };

  // SRD (with overrides applied) + homebrew, tagged for badges.
  const spellSource: SpellRow[] = useMemo(
    () => [
      ...COMPENDIUM_SPELLS.map((s) => {
        const o = applyOverride("spell", s.name);
        return { ...s, ...o.data, homebrew: false, hidden: o.hidden, edited: o.edited } as SpellRow;
      }).filter((s) => isDM || !s.hidden),
      ...content.spells.map((r) => ({
        name: r.data.name,
        level: r.data.level,
        school: r.data.school ?? "",
        classes: r.data.classes ?? [],
        castingTime: r.data.castingTime ?? "",
        range: r.data.range ?? "",
        components: r.data.components ?? "",
        duration: r.data.duration ?? "",
        concentration: r.data.concentration,
        description: r.data.description ?? "",
        homebrew: true,
      })),
    ],
    [content.spells, applyOverride, isDM],
  );
  const itemSource: ItemRow[] = useMemo(
    () => [
      ...COMPENDIUM_ITEMS.map((i) => {
        const o = applyOverride("item", i.name);
        return { ...i, ...o.data, homebrew: false, hidden: o.hidden, edited: o.edited } as ItemRow;
      }).filter((i) => isDM || !i.hidden),
      ...content.items.map((r) => ({ ...r.data, homebrew: true })),
    ],
    [content.items, applyOverride, isDM],
  );

  const allClasses = useMemo(
    () =>
      [...new Set(spellSource.flatMap((s) => s.classes))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [spellSource],
  );
  const allCrs = useMemo(
    () =>
      [...new Set(COMPENDIUM_MONSTERS.map((m) => m.challengeRating))].sort(
        (a, b) => crValue(a) - crValue(b),
      ),
    [],
  );

  const spells = spellSource.filter(
    (s) =>
      (level === "all" || s.level === Number(level)) &&
      (klass === "all" || s.classes.includes(klass)) &&
      (!q || `${s.name} ${s.school} ${s.description}`.toLowerCase().includes(q)),
  );
  const items = itemSource.filter(
    (i) =>
      (category === "all" || i.category === category) &&
      (!q ||
        `${i.name} ${i.properties ?? ""} ${i.description ?? ""}`
          .toLowerCase()
          .includes(q)),
  );
  const monsters = COMPENDIUM_MONSTERS.map((m) => {
    const o = applyOverride("monster", m.name);
    return { ...m, ...o.data, hidden: o.hidden, edited: o.edited };
  }).filter(
    (m) =>
      (isDM || !m.hidden) &&
      (cr === "all" || m.challengeRating === cr) &&
      (!q || `${m.name} ${m.type}`.toLowerCase().includes(q)),
  );

  function announce(msg: string) {
    setFlash(msg);
    window.setTimeout(() => setFlash((f) => (f === msg ? null : f)), 2600);
  }
  function addSpell(name: string) {
    const s = spellSource.find((x) => x.name === name);
    if (!s || !character) return;
    void updateCharacter(character.id, {
      spells: [...character.spells, spellToCharacterSpell(s)],
    });
    announce(`Added ${s.name} to ${character.name}.`);
  }
  function addItem(name: string) {
    const i = itemSource.find((x) => x.name === name);
    if (!i || !character) return;
    void updateCharacter(character.id, {
      inventory: [...character.inventory, itemToInventoryItem(i)],
    });
    announce(`Added ${i.name} to ${character.name}.`);
  }
  function addMonster(name: string) {
    const m = COMPENDIUM_MONSTERS.find((x) => x.name === name);
    if (!m) return;
    void createStatBlock(monsterToStatBlockInput(m, campaigns[0]?.id));
    announce(`Added ${m.name} to the bestiary.`);
  }

  const needChar = tab !== "monsters";

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="inline-flex flex-wrap gap-1 rounded-card border border-parchment-400/70 bg-parchment-100 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTab(t.key);
                setOpen(null);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                tab === t.key
                  ? "bg-oxblood text-parchment-50 shadow-card"
                  : "text-ink-soft hover:bg-parchment-300/60",
              )}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${tab}…`}
          aria-label={`Search ${tab}`}
          className="h-9 min-w-48 flex-1 rounded-md border border-parchment-400 bg-parchment-50 px-3 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40"
        />

        {tab === "spells" && (
          <>
            <select
              aria-label="Filter by level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className={selectClass}
            >
              <option value="all">All levels</option>
              <option value="0">Cantrip</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
                <option key={l} value={l}>
                  Level {l}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by class"
              value={klass}
              onChange={(e) => setKlass(e.target.value)}
              className={selectClass}
            >
              <option value="all">All classes</option>
              {allClasses.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </>
        )}

        {tab === "items" && (
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={selectClass}
          >
            <option value="all">All categories</option>
            {ITEM_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        )}

        {tab === "monsters" && (
          <select
            aria-label="Filter by challenge rating"
            value={cr}
            onChange={(e) => setCr(e.target.value)}
            className={selectClass}
          >
            <option value="all">All CR</option>
            {allCrs.map((c) => (
              <option key={c} value={c}>
                CR {c}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Target character for spells/items */}
      {needChar && (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-parchment-400/50 bg-parchment-100/50 px-3 py-2">
          <HelmIcon className="h-4 w-4 text-brass-dark" />
          {characters.length === 0 ? (
            <span className="text-sm text-ink-faint">
              Create a hero first to add {tab} to a sheet.
            </span>
          ) : (
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              Add to
              <select
                aria-label="Target character"
                value={character?.id ?? ""}
                onChange={(e) => setCharId(e.target.value)}
                className={selectClass}
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {flash && (
        <p className="animate-fade-in rounded-md border border-forest/40 bg-forest/10 px-3 py-2 text-sm font-semibold text-forest">
          {flash}
        </p>
      )}

      {/* Results */}
      <Panel
        title={
          tab === "spells"
            ? `Spells (${spells.length})`
            : tab === "items"
              ? `Items (${items.length})`
              : `Monsters (${monsters.length})`
        }
        eyebrow="SRD 5.1"
        bodyClassName="p-3"
      >
        {tab === "spells" && (
          <ul className="space-y-1.5">
            {spells.map((s) => {
              const id = `spell-${s.homebrew ? "hb-" : ""}${s.name}`;
              const isOpen = open === id;
              return (
                <li
                  key={id}
                  className="rounded-md border border-parchment-400/50 bg-parchment-100/60"
                >
                  <div className="flex items-center gap-2 p-2.5">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-expanded={isOpen}
                    >
                      <ChevronRightIcon
                        className={cn(
                          "h-4 w-4 shrink-0 text-ink-faint transition-transform",
                          isOpen && "rotate-90",
                        )}
                      />
                      <span className="truncate font-display text-sm font-semibold text-ink">
                        {s.name}
                      </span>
                      <Badge tone="arcane">
                        {s.level === 0 ? "Cantrip" : `Lvl ${s.level}`}
                      </Badge>
                      <span className="hidden truncate text-xs text-ink-faint sm:inline">
                        {s.school}
                      </span>
                      {s.concentration && (
                        <span className="hidden text-[0.6rem] font-bold uppercase tracking-wide text-arcane md:inline">
                          Conc.
                        </span>
                      )}
                      {s.homebrew && <Badge tone="forest">Homebrew</Badge>}
                      {s.hidden && <Badge tone="oxblood">Hidden</Badge>}
                      {s.edited && !s.homebrew && <Badge tone="brass">Edited</Badge>}
                    </button>
                    {canOverride && !s.homebrew && (
                      <button
                        type="button"
                        onClick={() =>
                          setOverride({
                            kind: "spell",
                            name: s.name,
                            base: s as unknown as Record<string, unknown>,
                          })
                        }
                        aria-label={`Edit ${s.name}`}
                        className="shrink-0 rounded-md p-1.5 text-ink-faint hover:bg-parchment-300/60 hover:text-ink"
                      >
                        <EditIcon className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => addSpell(s.name)}
                      disabled={!character}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-brass/50 px-2 py-1 text-xs font-semibold text-brass-dark hover:bg-brass hover:text-parchment-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-brass-dark"
                    >
                      <PlusIcon className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                  {isOpen && (
                    <div className="border-t border-parchment-400/40 px-3 py-2.5 text-sm text-ink-soft">
                      <p className="mb-1.5 text-xs text-ink-faint">
                        {s.castingTime} · {s.range} · {s.components} ·{" "}
                        {s.duration} · {s.classes.join(", ")}
                      </p>
                      {s.description}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {tab === "items" && (
          <ul className="space-y-1.5">
            {items.map((i) => {
              const id = `item-${i.homebrew ? "hb-" : ""}${i.name}`;
              const isOpen = open === id;
              const cat = ITEM_CATEGORIES.find((c) => c.key === i.category);
              return (
                <li
                  key={id}
                  className="rounded-md border border-parchment-400/50 bg-parchment-100/60"
                >
                  <div className="flex items-center gap-2 p-2.5">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-expanded={isOpen}
                    >
                      <ChevronRightIcon
                        className={cn(
                          "h-4 w-4 shrink-0 text-ink-faint transition-transform",
                          isOpen && "rotate-90",
                        )}
                      />
                      <span className="truncate font-display text-sm font-semibold text-ink">
                        {i.name}
                      </span>
                      {cat && <Badge>{cat.label}</Badge>}
                      {i.homebrew && <Badge tone="forest">Homebrew</Badge>}
                      {i.hidden && <Badge tone="oxblood">Hidden</Badge>}
                      {i.edited && !i.homebrew && <Badge tone="brass">Edited</Badge>}
                      {i.damage && (
                        <span className="numerals hidden text-xs text-ink-faint sm:inline">
                          {i.damage}
                        </span>
                      )}
                    </button>
                    {canOverride && !i.homebrew && (
                      <button
                        type="button"
                        onClick={() =>
                          setOverride({
                            kind: "item",
                            name: i.name,
                            base: i as unknown as Record<string, unknown>,
                          })
                        }
                        aria-label={`Edit ${i.name}`}
                        className="shrink-0 rounded-md p-1.5 text-ink-faint hover:bg-parchment-300/60 hover:text-ink"
                      >
                        <EditIcon className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => addItem(i.name)}
                      disabled={!character}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-brass/50 px-2 py-1 text-xs font-semibold text-brass-dark hover:bg-brass hover:text-parchment-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-brass-dark"
                    >
                      <PlusIcon className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                  {isOpen && (
                    <div className="border-t border-parchment-400/40 px-3 py-2.5 text-sm text-ink-soft">
                      <p className="mb-1 text-xs text-ink-faint">
                        {[
                          i.properties,
                          i.weight ? `${i.weight} lb` : null,
                          i.value ? `${i.value} gp` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {i.description}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {tab === "monsters" && (
          <ul className="space-y-1.5">
            {monsters.map((m) => {
              const id = `mon-${m.name}`;
              const isOpen = open === id;
              return (
                <li
                  key={m.name}
                  className="rounded-md border border-parchment-400/50 bg-parchment-100/60"
                >
                  <div className="flex items-center gap-2 p-2.5">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-expanded={isOpen}
                    >
                      <ChevronRightIcon
                        className={cn(
                          "h-4 w-4 shrink-0 text-ink-faint transition-transform",
                          isOpen && "rotate-90",
                        )}
                      />
                      <span className="truncate font-display text-sm font-semibold text-ink">
                        {m.name}
                      </span>
                      <Badge tone="oxblood">CR {m.challengeRating}</Badge>
                      {m.hidden && <Badge tone="oxblood">Hidden</Badge>}
                      {m.edited && <Badge tone="brass">Edited</Badge>}
                      <span className="hidden truncate text-xs text-ink-faint sm:inline">
                        {m.size} {m.type}
                      </span>
                    </button>
                    {canOverride && (
                      <button
                        type="button"
                        onClick={() =>
                          setOverride({
                            kind: "monster",
                            name: m.name,
                            base: m as unknown as Record<string, unknown>,
                          })
                        }
                        aria-label={`Edit ${m.name}`}
                        className="shrink-0 rounded-md p-1.5 text-ink-faint hover:bg-parchment-300/60 hover:text-ink"
                      >
                        <EditIcon className="h-4 w-4" />
                      </button>
                    )}
                    {canAddMonsters && (
                      <button
                        type="button"
                        onClick={() => addMonster(m.name)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-brass/50 px-2 py-1 text-xs font-semibold text-brass-dark hover:bg-brass hover:text-parchment-50"
                      >
                        <PlusIcon className="h-3.5 w-3.5" /> Bestiary
                      </button>
                    )}
                  </div>
                  {isOpen && (
                    <div className="space-y-2 border-t border-parchment-400/40 px-3 py-2.5 text-sm text-ink-soft">
                      <p className="numerals text-xs text-ink-faint">
                        AC {m.armorClass} · HP {m.maxHp} · {m.speed} · {m.alignment}
                      </p>
                      <div className="grid grid-cols-6 gap-1 text-center">
                        {(["str", "dex", "con", "int", "wis", "cha"] as const).map(
                          (k) => (
                            <div
                              key={k}
                              className="rounded border border-parchment-400/50 bg-parchment-50 py-1"
                            >
                              <div className="text-[0.55rem] uppercase text-ink-faint">
                                {k}
                              </div>
                              <div className="numerals text-sm font-bold text-ink">
                                {m.abilityScores[k]}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                      {m.traits?.map((t) => (
                        <p key={t.name}>
                          <span className="font-semibold text-ink">
                            {t.name}.
                          </span>{" "}
                          {t.description}
                        </p>
                      ))}
                      {m.actions?.map((a) => (
                        <p key={a.name}>
                          <span className="font-semibold text-oxblood">
                            {a.name}.
                          </span>{" "}
                          {a.description}
                        </p>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {override && (
        <SrdOverrideModal
          kind={override.kind}
          name={override.name}
          base={override.base}
          onClose={() => setOverride(null)}
        />
      )}
    </div>
  );
}
