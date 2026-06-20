"use client";

import { useEffect, useRef } from "react";
import { useEconomy, usePermissions } from "@/lib/data/hooks";
import { tickEconomy } from "@shared/economy-sim";

/**
 * Headless driver for the "live" market. Mounted once in the app shell; only the
 * DM's client ticks, so there's a single authoritative clock. It advances one
 * day every `tickSeconds`, reading the latest economy via a ref so trades and
 * edits don't reset the timer.
 */
export function EconomySimDriver() {
  const { value: economy, set } = useEconomy();
  const { isDM } = usePermissions();

  const ref = useRef(economy);
  ref.current = economy;

  const live = Boolean(isDM && economy?.enabled && economy?.sim === "live");
  const secs = Math.max(2, economy?.tickSeconds ?? 60);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      const e = ref.current;
      if (e && e.enabled && e.sim === "live") void set(tickEconomy(e));
    }, secs * 1000);
    return () => window.clearInterval(id);
  }, [live, secs, set]);

  return null;
}
