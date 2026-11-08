"use server";

import { loadLeaderboard, type Leaderboard } from "@/server/dal/leaderboard";
import { getActiveEvent } from "@/server/dal/viewer";

/** Public leaderboard for live updates. */
export async function fetchLeaderboard(): Promise<Leaderboard | null> {
  const event = await getActiveEvent();
  return event ? loadLeaderboard(event.id) : null;
}
