import { z } from "zod";
import { siteSchema, trackSchema } from "./schema";
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

  const ids = TRACKS.map((t) => t.id);
  if (new Set(ids).size !== ids.length) problems.push("tracks: ids must be unique");

  if (problems.length) throw new Error(`Invalid Agent Studio configuration:\n${problems.join("\n")}`);
}
