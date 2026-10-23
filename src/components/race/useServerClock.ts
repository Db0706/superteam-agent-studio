"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The server's clock in the browser: offset from the last server timestamp, ticking every
 * second. Countdowns use this, so a participant's wrong laptop clock can't mislead them.
 */
export function useServerClock(serverNowIso: string): number {
  const offset = useRef(0);
  const [now, setNow] = useState(() => Date.parse(serverNowIso));
  useEffect(() => {
    offset.current = Date.parse(serverNowIso) - Date.now();
  }, [serverNowIso]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatTime(iso: string, timeZone = "Europe/London"): string {
  if (!iso) return "TBC";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}
