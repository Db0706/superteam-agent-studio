import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { University } from "./leaderboard";

export interface Winner {
  track: "build" | "policy";
  place: number;
  title: string;
  project: string;
  summary: string;
  repo: string | null;
  demo: string | null;
  team: string;
  university: University;
  members: string[];
}

/** Winners an organiser has published, with team members' display names (never emails). */
export async function loadWinners(eventId: string): Promise<Winner[]> {
  const s = await createSupabaseServer();
  const { data } = await s.rpc("public_winners", { p_event: eventId });
  return ((data ?? []) as Winner[]).map((w) => ({ ...w, members: w.members ?? [] }));
}
