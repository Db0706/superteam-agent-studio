import { z } from "zod";
import { EVENTS } from "./events";
import { siteSchema, eventSchema, trackSchema } from "./schema";
import { SITE } from "./site";
import { TRACKS } from "./tracks";

/**
 * Validates every config file. Called from the root layout (server only), so
 * an invalid edit fails `next build` with a readable message rather than
 * shipping a broken page. Zod never reaches the client bundle.
 */
export function validateAllConfig(): void {
  const problems: string[] = [];
  const check = (label: string, schema: z.ZodType, value: unknown) => {
    const r = schema.safeParse(value);
    if (!r.success) problems.push(`${label}: ${z.prettifyError(r.error)}`);
  };
  check("site", siteSchema, SITE);
  TRACKS.forEach((t, i) => check(`tracks[${i}]`, trackSchema, t));
  EVENTS.forEach((e, i) => check(`events[${i}] (${e.id})`, eventSchema, e));

  const ids = EVENTS.map((e) => e.id);
  if (new Set(ids).size !== ids.length) problems.push("events: ids must be unique");
  if (!ids.includes(SITE.defaultEventId)) problems.push(`site.defaultEventId "${SITE.defaultEventId}" is not an event id`);
  const trackIds = new Set(TRACKS.map((t) => t.id));
  EVENTS.forEach((e) => e.tracks.forEach((t) => !trackIds.has(t.id) && problems.push(`events.${e.id}: unknown track ${t.id}`)));

  if (problems.length) throw new Error(`Invalid Agent Studio configuration:\n${problems.join("\n")}`);
}
