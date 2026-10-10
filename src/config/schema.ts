import { z } from "zod";

/**
 * Zod schemas for every hand-edited configuration file.
 *
 * Config modules import only the inferred *types* from here (`import type`),
 * so Zod never ships to the browser. Validation runs on the server in the root
 * layout (see `validateAllConfig`) and in the unit tests, so a broken edit
 * fails the build instead of the page.
 */

/** Honesty labels: every unconfirmed fact must carry one. */
export const confirmationSchema = z.enum(["CONFIRMED", "PROPOSED", "SAMPLE", "TBC"]);

export const trackIdSchema = z.enum(["web", "mobile", "agents", "services"]);
export const frameworkIdSchema = z.enum(["next", "expo", "python", "node"]);

export const trackSchema = z.object({
  id: trackIdSchema,
  abbr: z.string().min(1).max(3),
  name: z.string().min(1),
  tech: z.string().min(1),
  short: z.string().min(1),
  framework: frameworkIdSchema,
  command: z.string().min(1),
  description: z.string().min(1),
  judgedOn: z.array(z.string().min(1)).length(3),
  note: z.string().optional(),
});

const urlOrNull = z.union([z.url(), z.null()]);

export const eventFieldSchema = z.object({
  value: z.string().min(1),
  sub: z.string(),
  status: confirmationSchema,
});

export const eventSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  code: z.string().min(2).max(4),
  shortName: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(["proposed", "confirmed", "live", "closed"]),
  host: z.object({ name: z.string(), role: z.string(), initials: z.string().max(3) }),
  university: eventFieldSchema.extend({ name: z.string() }),
  month: z.string(),
  dates: eventFieldSchema,
  deadline: eventFieldSchema,
  prizePool: eventFieldSchema,
  format: eventFieldSchema,
  venue: eventFieldSchema,
  tracks: z
    .array(
      z.object({
        id: trackIdSchema,
        prize: z.string(),
        prizeStatus: confirmationSchema,
      }),
    )
    .min(1),
  judging: z.object({
    status: confirmationSchema,
    criteria: z
      .array(z.object({ name: z.string(), weight: z.number().int().min(0).max(100), detail: z.string() }))
      .min(1)
      .refine((c) => c.reduce((a, x) => a + x.weight, 0) === 100, "Judging weights must total 100"),
  }),
  rules: z.object({ status: confirmationSchema, items: z.array(z.string().min(1)) }),
  bounties: z.array(z.object({ title: z.string(), reward: z.string(), status: confirmationSchema })),
  mentors: z.array(z.object({ name: z.string(), affiliation: z.string() })),
  sponsors: z.array(z.object({ name: z.string(), tier: z.string() })),
  sponsorDisclaimer: z.string(),
  links: z.array(z.object({ label: z.string(), meta: z.string(), href: urlOrNull })),
});

export const siteSchema = z.object({
  githubUrl: z.url(),
  defaultEventId: z.string(),
});

export type Confirmation = z.infer<typeof confirmationSchema>;
export type TrackId = z.infer<typeof trackIdSchema>;
export type FrameworkId = z.infer<typeof frameworkIdSchema>;
export type TrackConfig = z.infer<typeof trackSchema>;
export type EventConfig = z.infer<typeof eventSchema>;
export type SiteConfig = z.infer<typeof siteSchema>;
