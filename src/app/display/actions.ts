"use server";

import { loadSpectatorState, type SpectatorState } from "@/server/dal/spectator";
import { getActiveEvent } from "@/server/dal/viewer";

/** Public race state for the venue screen's polling. */
export async function fetchSpectatorState(tournamentId: string): Promise<SpectatorState | null> {
  const event = await getActiveEvent();
  return event ? loadSpectatorState(tournamentId, event.name) : null;
}
