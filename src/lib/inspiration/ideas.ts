import rawIdeas from "@/data/ideas.json";
import { TRACK_LABEL } from "@/config/tracks";
import type { TrackId } from "@/config/schema";

/**
 * Offline idea library (286 ideas). #1-24 are the design's original samples;
 * the rest were written to the same schema. No network or AI calls.
 */

export type Difficulty = "Beginner" | "Intermediate" | "Advanced";
export type AppType = "Web app" | "Mobile app" | "Agent" | "API service";

export interface Idea {
  id: number;
  title: string;
  industry: string;
  track: TrackId;
  difficulty: Difficulty;
  type: AppType;
  problem: string;
  challenge: string;
  direction: string;
  angles: [string, string];
}

export const IDEAS = rawIdeas as Idea[];

export const ALL = "All";
/** Shown first in the industry filter: where AI meets the event's tracks. The rest follow A to Z. */
const PRIORITY = ["Research", "AI Governance", "University Life", "Science", "Healthcare", "Education", "Accessibility", "Climate", "Civic"];
const present = new Set(IDEAS.map((i) => i.industry));
export const INDUSTRIES = [ALL, ...PRIORITY.filter((p) => present.has(p)), ...[...present].filter((i) => !PRIORITY.includes(i)).sort()];
export const TRACK_OPTIONS = [ALL, ...Object.values(TRACK_LABEL)];
export const DIFFICULTIES = [ALL, "Beginner", "Intermediate", "Advanced"];
export const APP_TYPES = [ALL, "Web app", "Mobile app", "Agent", "API service"];

export interface IdeaFilters {
  industry: string;
  track: string;
  difficulty: string;
  type: string;
}

export const NO_FILTERS: IdeaFilters = { industry: ALL, track: ALL, difficulty: ALL, type: ALL };

export function hasFilters(f: IdeaFilters): boolean {
  return f.industry !== ALL || f.track !== ALL || f.difficulty !== ALL || f.type !== ALL;
}

export function filterIdeas(f: IdeaFilters, ideas: Idea[] = IDEAS): Idea[] {
  return ideas.filter(
    (i) =>
      (f.industry === ALL || i.industry === f.industry) &&
      (f.track === ALL || TRACK_LABEL[i.track] === f.track) &&
      (f.difficulty === ALL || i.difficulty === f.difficulty) &&
      (f.type === ALL || i.type === f.type),
  );
}

/**
 * Shuffle-bag pick: never repeats an idea this session while unseen matches
 * remain. When every match has been seen, the bag refills (still avoiding the
 * idea on screen). Returns null only if nothing else matches.
 */
export function pickNext(pool: Idea[], currentId: number | null, seen: ReadonlySet<number>, rng: () => number = Math.random): Idea | null {
  if (!pool.length) return null;
  let candidates = pool.filter((i) => i.id !== currentId && !seen.has(i.id));
  if (!candidates.length) candidates = pool.filter((i) => i.id !== currentId);
  if (!candidates.length) return null;
  return candidates[Math.floor(rng() * candidates.length)] ?? candidates[0];
}

export function getIdea(id: number): Idea | undefined {
  return IDEAS.find((i) => i.id === id);
}
