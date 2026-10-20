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
  strengths: z.array(z.string().min(1)).length(3),
  note: z.string().optional(),
});

export const siteSchema = z.object({
  githubUrl: z.url(),
});

export type Confirmation = z.infer<typeof confirmationSchema>;
export type TrackId = z.infer<typeof trackIdSchema>;
export type FrameworkId = z.infer<typeof frameworkIdSchema>;
export type TrackConfig = z.infer<typeof trackSchema>;
export type SiteConfig = z.infer<typeof siteSchema>;
