import { nowISO } from "./ids";
import type { CalendarConfig, CalendarState, MoonConfig } from "./domain";

/**
 * The campaign calendar. A configurable fantasy calendar over an absolute day
 * counter, with helpers to resolve a day into a readable date, season, and moon
 * phases. Pure + shared so the DM console and the player view agree.
 */

export const DEFAULT_CALENDAR_CONFIG: CalendarConfig = {
  yearLabel: "AE",
  months: [
    { name: "Deepwinter", days: 30 },
    { name: "Frostwane", days: 30 },
    { name: "Thawmoon", days: 30 },
    { name: "Seedfall", days: 30 },
    { name: "Bloomtide", days: 30 },
    { name: "Highsun", days: 30 },
    { name: "Sunpeak", days: 30 },
    { name: "Harvestmoon", days: 30 },
    { name: "Emberfall", days: 30 },
    { name: "Duskwane", days: 30 },
    { name: "Mistfall", days: 30 },
    { name: "Longnight", days: 30 },
  ],
  weekdays: ["Sul", "Mol", "Zol", "Wol", "Tol", "Fal", "Sar"],
  moons: [{ name: "Selûra", cycle: 30, offset: 0, color: "#cdd7e6" }],
  seasons: [
    { name: "Winter", startMonth: 11 },
    { name: "Spring", startMonth: 2 },
    { name: "Summer", startMonth: 5 },
    { name: "Autumn", startMonth: 8 },
  ],
};

export function emptyCalendar(): CalendarState {
  return {
    id: "calendar",
    enabled: false,
    day: 1,
    year0: 1492,
    config: {
      ...DEFAULT_CALENDAR_CONFIG,
      months: DEFAULT_CALENDAR_CONFIG.months.map((m) => ({ ...m })),
      weekdays: [...DEFAULT_CALENDAR_CONFIG.weekdays],
      moons: DEFAULT_CALENDAR_CONFIG.moons?.map((m) => ({ ...m })),
      seasons: DEFAULT_CALENDAR_CONFIG.seasons?.map((s) => ({ ...s })),
    },
    events: [],
    downtime: [],
    updatedAt: nowISO(),
  };
}

export function daysPerYear(config: CalendarConfig): number {
  return config.months.reduce((n, m) => n + Math.max(1, m.days), 0) || 360;
}

export interface CalendarDate {
  /** Absolute day (1-based). */
  day: number;
  year: number;
  monthIndex: number;
  monthName: string;
  /** 1-based day within the month. */
  dayOfMonth: number;
  /** 1-based day within the year. */
  dayOfYear: number;
  weekdayIndex: number;
  weekdayName: string;
  season?: string;
}

/** Resolve an absolute day into a calendar date. */
export function resolveDate(state: CalendarState): CalendarDate {
  return dateForDay(state, state.day);
}

export function dateForDay(state: CalendarState, absDay: number): CalendarDate {
  const config = state.config;
  const months = config.months.length ? config.months : DEFAULT_CALENDAR_CONFIG.months;
  const perYear = daysPerYear(config);
  const year0 = state.year0 ?? 1;

  const d = Math.max(1, Math.floor(absDay));
  const zero = d - 1;
  const year = year0 + Math.floor(zero / perYear);
  let rem = zero % perYear; // 0-based day of year
  const dayOfYear = rem + 1;

  let monthIndex = 0;
  for (let i = 0; i < months.length; i++) {
    const len = Math.max(1, months[i].days);
    if (rem < len) {
      monthIndex = i;
      break;
    }
    rem -= len;
  }
  const dayOfMonth = rem + 1;

  const weekdays = config.weekdays.length ? config.weekdays : DEFAULT_CALENDAR_CONFIG.weekdays;
  const weekdayIndex = zero % weekdays.length;

  return {
    day: d,
    year,
    monthIndex,
    monthName: months[monthIndex]?.name ?? `Month ${monthIndex + 1}`,
    dayOfMonth,
    dayOfYear,
    weekdayIndex,
    weekdayName: weekdays[weekdayIndex] ?? `Day ${weekdayIndex + 1}`,
    season: seasonFor(config, monthIndex),
  };
}

function seasonFor(config: CalendarConfig, monthIndex: number): string | undefined {
  const seasons = config.seasons;
  if (!seasons || seasons.length === 0) return undefined;
  // The active season is the one whose startMonth is the closest at or before
  // this month, wrapping around the year.
  const sorted = [...seasons].sort((a, b) => a.startMonth - b.startMonth);
  let active = sorted[sorted.length - 1]?.name; // wrap: last season carries over
  for (const s of sorted) {
    if (monthIndex >= s.startMonth) active = s.name;
  }
  return active;
}

export interface MoonPhase {
  name: string;
  /** 0..1 around the cycle (0 = new, 0.5 = full). */
  fraction: number;
  /** 0..1 illuminated. */
  illumination: number;
  glyph: string;
}

const PHASE_NAMES = [
  "New",
  "Waxing crescent",
  "First quarter",
  "Waxing gibbous",
  "Full",
  "Waning gibbous",
  "Last quarter",
  "Waning crescent",
];
const PHASE_GLYPHS = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];

export function moonPhase(moon: MoonConfig, absDay: number): MoonPhase {
  const cycle = Math.max(1, moon.cycle);
  const pos = (((absDay - 1 + (moon.offset ?? 0)) % cycle) + cycle) % cycle;
  const fraction = pos / cycle;
  const idx = Math.round(fraction * 8) % 8;
  const illumination = (1 - Math.cos(fraction * 2 * Math.PI)) / 2;
  return {
    name: PHASE_NAMES[idx],
    fraction,
    illumination: Math.round(illumination * 100) / 100,
    glyph: PHASE_GLYPHS[idx],
  };
}

/** A compact human label, e.g. "12 Bloomtide, 1492 AE (Tol)". */
export function formatDate(date: CalendarDate, config: CalendarConfig): string {
  const label = config.yearLabel ? ` ${config.yearLabel}` : "";
  return `${date.dayOfMonth} ${date.monthName}, ${date.year}${label} (${date.weekdayName})`;
}
