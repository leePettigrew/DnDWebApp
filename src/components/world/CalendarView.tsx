"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import { MoonIcon, SunIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { newId } from "@/lib/domain/ids";
import {
  useCalendar,
  useCharacters,
  useEconomy,
  usePermissions,
} from "@/lib/data/hooks";
import { emptyCalendar } from "@shared/calendar";
import { dateForDay, formatDate, moonPhase, resolveDate } from "@shared/calendar";
import { tickEconomy } from "@shared/economy-sim";
import type { CalendarEvent, DowntimeEntry, DowntimeKind } from "@/lib/domain/types";

const inputClass =
  "rounded-md border border-parchment-400 bg-parchment-50 px-2 py-1 text-sm text-ink focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/40";

const DOWNTIME_KINDS: DowntimeKind[] = ["craft", "train", "carouse", "recuperate", "trade", "research", "other"];
const MAX_ECON_TICKS = 60;

export function CalendarView() {
  const { value: cal, update, set, loading } = useCalendar();
  const { value: economy, set: setEconomy } = useEconomy();
  const { isDM } = usePermissions();
  const { items: characters } = useCharacters();

  const [advN, setAdvN] = useState(1);
  const [evTitle, setEvTitle] = useState("");
  const [evIn, setEvIn] = useState(1);
  const [dtChar, setDtChar] = useState("");
  const [dtKind, setDtKind] = useState<DowntimeKind>("craft");
  const [dtDays, setDtDays] = useState(1);
  const [dtNote, setDtNote] = useState("");
  const [showConfig, setShowConfig] = useState(false);

  if (!cal) {
    return (
      <Panel tone="flat">
        <p className="text-sm text-ink-faint">{loading ? "Reading the stars…" : "No calendar."}</p>
      </Panel>
    );
  }

  if (!cal.enabled) {
    return (
      <Panel title="Campaign Calendar" eyebrow="The turning of days">
        <p className="text-sm text-ink-soft">
          Track the date, seasons, and moons of your world — and the downtime your
          party spends between sessions.
        </p>
        {isDM ? (
          <Button className="mt-4" onClick={() => set({ ...emptyCalendar(), enabled: true })}>
            Start the calendar
          </Button>
        ) : (
          <p className="mt-3 text-sm text-ink-faint">Your DM hasn&apos;t opened the calendar yet.</p>
        )}
      </Panel>
    );
  }

  const config = cal.config;
  const date = resolveDate(cal);
  const events = cal.events ?? [];
  const downtime = cal.downtime ?? [];

  const advance = (n: number) => {
    if (!isDM || n === 0) return;
    const day = Math.max(1, (cal.day ?? 1) + n);
    update({ day });
    if (n > 0 && economy?.enabled) {
      let e = economy;
      for (let i = 0; i < Math.min(n, MAX_ECON_TICKS); i++) e = tickEconomy(e);
      void setEconomy(e);
    }
  };

  const addEvent = () => {
    if (!isDM || !evTitle.trim()) return;
    const ev: CalendarEvent = { id: newId(), day: cal.day + Math.max(0, evIn), title: evTitle.trim() };
    update({ events: [...events, ev] });
    setEvTitle("");
  };
  const removeEvent = (id: string) => update({ events: events.filter((e) => e.id !== id) });

  const logDowntime = () => {
    const char = characters.find((c) => c.id === dtChar);
    const entry: DowntimeEntry = {
      id: newId(),
      day: cal.day,
      characterId: char?.id,
      characterName: char?.name,
      kind: dtKind,
      days: Math.max(1, dtDays),
      note: dtNote.trim() || undefined,
    };
    update({ downtime: [entry, ...downtime].slice(0, 100) });
    setDtNote("");
    advance(Math.max(1, dtDays));
  };

  // Month grid geometry.
  const weekLen = config.weekdays.length || 7;
  const monthLen = config.months[date.monthIndex]?.days ?? 30;
  const firstAbsDay = cal.day - (date.dayOfMonth - 1);
  const firstWeekday = ((firstAbsDay - 1) % weekLen + weekLen) % weekLen;
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: monthLen }, (_, i) => i + 1),
  ];
  const eventsOn = (absDay: number) =>
    events.filter((e) => e.day === absDay && (isDM || !e.hidden));

  const upcoming = events
    .filter((e) => e.day >= cal.day && (isDM || !e.hidden))
    .sort((a, b) => a.day - b.day)
    .slice(0, 6);

  return (
    <div className="space-y-5">
      {/* Date header */}
      <Panel title="Today" eyebrow={config.yearLabel ? `Year ${date.year} ${config.yearLabel}` : `Year ${date.year}`}>
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="font-display text-2xl font-bold text-ink">
              {date.dayOfMonth} {date.monthName}
            </p>
            <p className="text-sm text-ink-soft">
              {date.weekdayName}
              {date.season && (
                <>
                  {" · "}
                  <span className="inline-flex items-center gap-1">
                    <SunIcon className="h-3.5 w-3.5" /> {date.season}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {(config.moons ?? []).map((m) => {
              const p = moonPhase(m, cal.day);
              return (
                <span key={m.name} className="inline-flex items-center gap-1.5 text-sm text-ink-soft" title={`${p.name} · ${Math.round(p.illumination * 100)}% lit`}>
                  <span className="text-lg leading-none">{p.glyph}</span>
                  <span>
                    <span className="block font-semibold text-ink">{m.name}</span>
                    <span className="block text-[0.65rem] text-ink-faint">{p.name}</span>
                  </span>
                </span>
              );
            })}
          </div>

          {isDM && (
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => advance(-1)} title="Back a day">−1d</Button>
              <Button size="sm" variant="secondary" onClick={() => advance(1)}>+1 day</Button>
              <Button size="sm" variant="secondary" onClick={() => advance(weekLen)}>+1 week</Button>
              <Button size="sm" variant="secondary" onClick={() => advance(monthLen)}>+1 month</Button>
              <span className="ml-1 inline-flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  value={advN}
                  onChange={(e) => setAdvN(Math.max(1, Number(e.target.value) || 1))}
                  className={cn(inputClass, "w-16")}
                />
                <Button size="sm" onClick={() => advance(advN)}>Advance</Button>
              </span>
            </div>
          )}
        </div>
        {isDM && economy?.enabled && (
          <p className="mt-2 text-[0.65rem] text-ink-faint">
            Advancing also ticks the market (up to {MAX_ECON_TICKS} days at once).
          </p>
        )}
      </Panel>

      {/* Month grid */}
      <Panel title={`${date.monthName}, ${date.year}${config.yearLabel ? " " + config.yearLabel : ""}`} eyebrow="The month">
        <div className="grid grid-cols-7 gap-1 text-center" style={{ gridTemplateColumns: `repeat(${weekLen}, minmax(0, 1fr))` }}>
          {config.weekdays.map((w) => (
            <div key={w} className="pb-1 text-[0.6rem] font-semibold uppercase tracking-wide text-ink-faint">{w}</div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={`b-${i}`} />;
            const abs = firstAbsDay + (d - 1);
            const isToday = abs === cal.day;
            const evs = eventsOn(abs);
            return (
              <div
                key={`d-${d}`}
                className={cn(
                  "aspect-square rounded-md border p-1 text-left",
                  isToday ? "border-brass bg-brass/15" : "border-parchment-400/50 bg-parchment-50",
                )}
                title={evs.map((e) => e.title).join(", ")}
              >
                <span className={cn("text-xs font-semibold", isToday ? "text-brass-dark" : "text-ink-soft")}>{d}</span>
                {evs.length > 0 && (
                  <span className="mt-0.5 flex flex-wrap gap-0.5">
                    {evs.slice(0, 3).map((e) => (
                      <span key={e.id} className="h-1.5 w-1.5 rounded-full bg-oxblood" />
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Events */}
      <Panel title="Events & reminders" eyebrow="On the horizon" action={<MoonIcon className="h-4 w-4 text-brass-dark" />}>
        {isDM && (
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <label className="text-xs text-ink-soft">
              <span className="mb-1 block font-semibold text-ink">Event</span>
              <input value={evTitle} onChange={(e) => setEvTitle(e.target.value)} placeholder="Midsummer festival" className={cn(inputClass, "w-56")} />
            </label>
            <label className="text-xs text-ink-soft">
              <span className="mb-1 block font-semibold text-ink">In … days</span>
              <input type="number" min={0} value={evIn} onChange={(e) => setEvIn(Math.max(0, Number(e.target.value) || 0))} className={cn(inputClass, "w-20")} />
            </label>
            <Button size="sm" variant="secondary" onClick={addEvent}><PlusIcon className="h-4 w-4" /> Add</Button>
          </div>
        )}
        {upcoming.length === 0 ? (
          <p className="text-sm text-ink-faint">Nothing scheduled.</p>
        ) : (
          <ul className="space-y-1.5">
            {upcoming.map((e) => {
              const ed = dateForDay(cal, e.day);
              const inDays = e.day - cal.day;
              return (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <Badge tone="brass">{inDays === 0 ? "today" : `in ${inDays}d`}</Badge>
                  <span className="font-semibold text-ink">{e.title}</span>
                  <span className="text-xs text-ink-faint">{ed.dayOfMonth} {ed.monthName}</span>
                  {isDM && (
                    <button type="button" onClick={() => removeEvent(e.id)} className="ml-auto rounded p-1 text-ink-faint hover:text-oxblood" aria-label="Remove">
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* Downtime */}
      <Panel title="Downtime" eyebrow="Between sessions">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink-soft">
            <span className="mb-1 block font-semibold text-ink">Who</span>
            <select value={dtChar} onChange={(e) => setDtChar(e.target.value)} className={cn(inputClass, "h-9")}>
              <option value="">The party</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-soft">
            <span className="mb-1 block font-semibold text-ink">Activity</span>
            <select value={dtKind} onChange={(e) => setDtKind(e.target.value as DowntimeKind)} className={cn(inputClass, "h-9 capitalize")}>
              {DOWNTIME_KINDS.map((k) => (
                <option key={k} value={k} className="capitalize">{k}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink-soft">
            <span className="mb-1 block font-semibold text-ink">Days</span>
            <input type="number" min={1} value={dtDays} onChange={(e) => setDtDays(Math.max(1, Number(e.target.value) || 1))} className={cn(inputClass, "w-16")} />
          </label>
          <label className="flex-1 text-xs text-ink-soft">
            <span className="mb-1 block font-semibold text-ink">Note</span>
            <input value={dtNote} onChange={(e) => setDtNote(e.target.value)} placeholder="Forged a blade, caroused at the Wyvern…" className={cn(inputClass, "w-full")} />
          </label>
          <Button size="sm" onClick={logDowntime} title={isDM ? "Logs the activity and advances the calendar" : "Logs the activity"}>
            Log{isDM ? " & advance" : ""}
          </Button>
        </div>
        {downtime.length === 0 ? (
          <p className="text-sm text-ink-faint">No downtime logged yet.</p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
            {downtime.map((d) => {
              const dd = dateForDay(cal, d.day);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-2 border-b border-parchment-400/30 pb-1 last:border-0">
                  <span className="text-ink-faint">{dd.dayOfMonth} {dd.monthName}</span>
                  <span className="font-semibold capitalize text-ink">{d.kind}</span>
                  <span className="text-ink-soft">{d.days}d</span>
                  {d.characterName && <span className="text-ink-faint">· {d.characterName}</span>}
                  {d.note && <span className="text-ink-faint">— {d.note}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* Config (DM) */}
      {isDM && (
        <Panel
          title="Calendar setup"
          eyebrow="The shape of the year"
          action={<Button size="sm" variant="ghost" onClick={() => setShowConfig((v) => !v)}>{showConfig ? "Hide" : "Edit"}</Button>}
        >
          {!showConfig ? (
            <p className="text-sm text-ink-faint">
              {config.months.length} months · {weekLen}-day weeks · {config.moons?.length ?? 0} moon{(config.moons?.length ?? 0) === 1 ? "" : "s"}.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <label className="text-xs text-ink-soft">
                  <span className="mb-1 block font-semibold text-ink">Year label</span>
                  <input defaultValue={config.yearLabel ?? ""} key={`yl-${config.yearLabel}`} onBlur={(e) => update({ config: { ...config, yearLabel: e.target.value || undefined } })} className={cn(inputClass, "w-24")} />
                </label>
                <label className="text-xs text-ink-soft">
                  <span className="mb-1 block font-semibold text-ink">Current year</span>
                  <input type="number" defaultValue={date.year} key={`yr-${cal.day}`} onBlur={(e) => update({ year0: (Number(e.target.value) || date.year) - (date.year - (cal.year0 ?? 0)) })} className={cn(inputClass, "w-24")} />
                </label>
                <label className="flex-1 text-xs text-ink-soft">
                  <span className="mb-1 block font-semibold text-ink">Weekdays (comma-separated)</span>
                  <input defaultValue={config.weekdays.join(", ")} key={`wd-${config.weekdays.join()}`} onBlur={(e) => update({ config: { ...config, weekdays: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })} className={cn(inputClass, "w-full")} />
                </label>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold text-ink">Months</p>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {config.months.map((m, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <input defaultValue={m.name} key={`mn-${i}-${m.name}`} onBlur={(e) => update({ config: { ...config, months: config.months.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) } })} className={cn(inputClass, "min-w-0 flex-1")} />
                      <input type="number" min={1} defaultValue={m.days} key={`md-${i}-${m.days}`} onBlur={(e) => update({ config: { ...config, months: config.months.map((x, j) => (j === i ? { ...x, days: Math.max(1, Number(e.target.value) || 1) } : x)) } })} className={cn(inputClass, "w-14")} />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold text-ink">Moons</p>
                {(config.moons ?? []).map((m, i) => (
                  <div key={i} className="mb-1 flex items-center gap-1">
                    <input defaultValue={m.name} key={`mon-${i}-${m.name}`} onBlur={(e) => update({ config: { ...config, moons: (config.moons ?? []).map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) } })} className={cn(inputClass, "flex-1")} />
                    <input type="number" min={1} defaultValue={m.cycle} key={`moc-${i}-${m.cycle}`} onBlur={(e) => update({ config: { ...config, moons: (config.moons ?? []).map((x, j) => (j === i ? { ...x, cycle: Math.max(1, Number(e.target.value) || 1) } : x)) } })} className={cn(inputClass, "w-16")} title="cycle (days)" />
                    <button type="button" onClick={() => update({ config: { ...config, moons: (config.moons ?? []).filter((_, j) => j !== i) } })} className="rounded p-1 text-ink-faint hover:text-oxblood" aria-label="Remove moon"><TrashIcon className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <Button size="sm" variant="secondary" onClick={() => update({ config: { ...config, moons: [...(config.moons ?? []), { name: "New moon", cycle: 28 }] } })}>
                  <PlusIcon className="h-4 w-4" /> Moon
                </Button>
              </div>
              <p className="text-[0.65rem] text-ink-faint">Today is {formatDate(date, config)}.</p>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
