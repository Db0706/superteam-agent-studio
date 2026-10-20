"use server";

import { refresh } from "next/cache";
import { callRpc, type ActionResult } from "@/server/actions/rpc";
import { loadRaceState, type RaceState } from "@/server/dal/race";
import { getActiveEvent, getViewer } from "@/server/dal/viewer";

/** Latest race state for live updates (polling and Realtime nudges). */
export async function fetchRaceState(tournamentId: string): Promise<RaceState | null> {
  const event = await getActiveEvent();
  const viewer = event ? await getViewer(event.id) : null;
  return loadRaceState(tournamentId, viewer ? { userId: viewer.userId, teamId: viewer.team?.id ?? null } : null);
}

export async function joinTournament(tournamentId: string): Promise<ActionResult<string>> {
  const r = await callRpc<string>("join_tournament", { p_id: tournamentId });
  if (r.ok) refresh();
  return r;
}

/**
 * Starts a verification attempt. The request id makes a double click (or a retried request)
 * idempotent; the database records the server time of the attempt.
 */
export async function runVerification(tournamentId: string, layerKey: string, requestId: string): Promise<ActionResult<string>> {
  if (!/^[a-z0-9-]{8,64}$/i.test(requestId)) return { ok: false, error: "Invalid request." };
  return callRpc<string>("submit_attempt", { p_id: tournamentId, p_layer_key: layerKey, p_request_id: requestId });
}
