"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { callRpc, type ActionResult } from "@/server/actions/rpc";
import { getActiveEvent } from "@/server/dal/viewer";

async function eventId() {
  const event = await getActiveEvent();
  if (!event) throw new Error("No active event.");
  return event.id;
}
const done = <T,>(r: ActionResult<T>) => {
  if (r.ok) refresh();
  return r;
};

export async function setLayerPoints(tournamentId: string, layerKey: string, points: number): Promise<ActionResult<null>> {
  if (!Number.isInteger(points) || points < 0 || points > 10000) return { ok: false, error: "Points are a whole number from 0 to 10000." };
  return done(await callRpc<null>("set_layer_points", { p_tournament: tournamentId, p_layer_key: layerKey, p_points: points }));
}

export async function awardPoints(_: unknown, form: FormData): Promise<ActionResult<string>> {
  const f = z
    .object({ team: z.uuid("Choose a team."), points: z.coerce.number().int().min(-10000).max(10000).refine((n) => n !== 0, "Points can't be zero."), label: z.string().trim().min(1, "Say what it's for.").max(80), reason: z.string().max(500) })
    .safeParse({ team: form.get("team"), points: form.get("points"), label: form.get("label") ?? "", reason: form.get("reason") ?? "" });
  if (!f.success) return { ok: false, error: f.error.issues[0].message };
  return done(await callRpc<string>("award_points", { p_event: await eventId(), p_team: f.data.team, p_points: f.data.points, p_label: f.data.label, p_reason: f.data.reason }));
}

export async function revokeAward(id: string, reason: string): Promise<ActionResult<null>> {
  return done(await callRpc<null>("revoke_award", { p_award: id, p_reason: reason.slice(0, 500) }));
}

export async function setTeamUniversity(teamId: string, university: string): Promise<ActionResult<null>> {
  const u = university === "auto" ? null : university;
  return done(await callRpc<null>("set_team_university", { p_team: teamId, p_university: u }));
}

export async function confirmFinalists(teamIds: string[]): Promise<ActionResult<null>> {
  if (!teamIds.length) return { ok: false, error: "Choose at least one team." };
  return done(await callRpc<null>("confirm_finalists", { p_event: await eventId(), p_teams: teamIds }));
}

export async function clearFinalists(): Promise<ActionResult<null>> {
  return done(await callRpc<null>("clear_finalists", { p_event: await eventId() }));
}
