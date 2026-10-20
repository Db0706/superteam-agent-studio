/**
 * Converting between an event's wall-clock time ("25 Oct 2026, 11:30 in Europe/London") and UTC,
 * without a date library. Correct across daylight-saving changes because the offset is measured
 * for the instant itself.
 */
function offsetMs(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(instant))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant;
}

/** "2026-10-25T11:30" in `timeZone` → ISO UTC. */
export function zonedLocalToIso(local: string, timeZone: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return "";
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  let guess = asUtc - offsetMs(asUtc, timeZone);
  guess = asUtc - offsetMs(guess, timeZone);
  return new Date(guess).toISOString();
}

/** ISO → "2026-10-25T11:30" in `timeZone` (for datetime-local inputs). */
export function isoToZonedLocal(iso: string, timeZone: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const local = new Date(t + offsetMs(t, timeZone));
  return local.toISOString().slice(0, 16);
}

export function formatZoned(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
