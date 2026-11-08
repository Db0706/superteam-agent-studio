import type { SiteConfig } from "./schema";

/**
 * Site-wide settings. `githubUrl` is this site's source. Event facts live in the database
 * (see supabase/seed.sql), with a static fallback in active-event.ts.
 */
export const SITE: SiteConfig = {
  githubUrl: "https://github.com/Db0706/superteam-agent-studio",
};

export const SITE_NAME = "Superteam Agent Studio";
