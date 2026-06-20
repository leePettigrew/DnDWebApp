"use client";

import { useEffect, useRef } from "react";
import { useCalendar, useEconomy, usePermissions } from "@/lib/data/hooks";
import { tickEconomy } from "@shared/economy-sim";

/**
 * Headless driver for the "live" market clock. Mounted once in the app shell;
 * only the DM's client ticks, so there's a single authoritative clock. Each
 * `tickSeconds` it advances the economy one day AND moves the calendar to match,
 * keeping the date and the market in lockstep. Reads the latest state via refs
 * so trades and edits don't reset the timer.
 */
export function EconomySimDriver() {
  const { value: economy, set } = useEconomy();
  const { value: calendar, update: updateCalendar } = useCalendar();
  const { isDM } = usePermissions();

  const ecoRef = useRef(economy);
  ecoRef.current = economy;
  const calRef = useRef(calendar);
  calRef.current = calendar;

  const live = Boolean(isDM && economy?.enabled && economy?.sim === "live");
  const secs = Math.max(2, economy?.tickSeconds ?? 60);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      const e = ecoRef.current;
      if (!e || !e.enabled || e.sim !== "live") return;
      const next = tickEconomy(e);
      void set(next);
      const cal = calRef.current;
      if (cal?.enabled && cal.day !== next.day) updateCalendar({ day: next.day });
    }, secs * 1000);
    return () => window.clearInterval(id);
  }, [live, secs, set, updateCalendar]);

  return null;
}
