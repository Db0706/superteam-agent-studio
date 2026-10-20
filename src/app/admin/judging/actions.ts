"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { callRpc, type ActionResult } from "@/server/actions/rpc";
import { getActiveEvent } from "@/server/dal/viewer";
import { createSupabaseServer } from "@/lib/supabase/server";
import { planAssignments, rubricIssues, type RubricCriterion } from "@/core/judging/results";

const track = z.enum(["build", "policy"]);

const criterion = z.object({
  key: z.string().trim(),
  name: z.string().trim().max(80),
  description: z.string().trim().max(400),
  weight: z.number(),
  max: z.number(),
});

async function eventId() {
  const event = await getActiveEvent();
  if (!event) throw new Error("No active event.");
  return event.id;
}

export async function saveRubric(t: "build" | "policy", name: string, criteria: RubricCriterion[], confirm: boolean): Promise<ActionResult<null>> {
  const parsed = z.array(criterion).max(12).safeParse(criteria);
  if (!track.safeParse(t).success || !parsed.success) return { ok: false, error: "Check the criteria and try again." };
  const issues = rubricIssues(parsed.data);
  if (issues.length) return { ok: false, error: issues[0] };
  const r = await callRpc<null>("save_rubric", { p_event: await eventId(), p_track: t, p_name: name.slice(0, 120), p_criteria: parsed.data, p_confirm: confirm });
  if (r.ok) refresh();
  return r;
}

export async function assignJudge(judgeId: string, submissionId: string): Promise<ActionResult<string>> {
  const r = await callRpc<string>("assign_judge", { p_event: await eventId(), p_judge: judgeId, p_submission: submissionId });
  if (r.ok) refresh();
  return r;
}

/** Gives every submission in a track `perSubmission` judges, balancing load. Returns how many were added. */
export async function autoAssign(t: "build" | "policy", perSubmission: number): Promise<ActionResult<number>> {
  if (!track.safeParse(t).success || !(perSubmission >= 1 && perSubmission <= 10)) return { ok: false, error: "Pick between 1 and 10 judges." };
  const id = await eventId();
  const s = await createSupabaseServer();
  const [{ data: subs }, { data: judges }, { data: existing }] = await Promise.all([
    s.from("submissions").select("id").eq("event_id", id).eq("track", t).order("submitted_at"),
    s.from("event_roles").select("user_id").eq("event_id", id).eq("role", "judge"),
    s.from("judge_assignments").select("submission_id, judge_id").eq("event_id", id),
  ]);
  if (!judges?.length) return { ok: false, error: "Add judges on the Participants page first." };
  const plan = planAssignments(
    (subs ?? []).map((x) => x.id),
    judges.map((j) => j.user_id),
    (existing ?? []).map((e) => ({ submissionId: e.submission_id, judgeId: e.judge_id })),
    perSubmission,
  );
  for (const p of plan) {
    const r = await callRpc("assign_judge", { p_event: id, p_judge: p.judgeId, p_submission: p.submissionId });
    if (!r.ok) {
      refresh();
      return r;
    }
  }
  refresh();
  return { ok: true, data: plan.length };
}

export async function unassign(assignmentId: string): Promise<ActionResult<null>> {
  const r = await callRpc<null>("unassign_judge", { p_assignment: assignmentId });
  if (r.ok) refresh();
  return r;
}

export async function resolveFlag(assignmentId: string, action: "answer" | "reopen" | "clear_conflict", note: string): Promise<ActionResult<null>> {
  const r = await callRpc<null>("resolve_judging", { p_assignment: assignmentId, p_action: action, p_note: note.slice(0, 1000) });
  if (r.ok) refresh();
  return r;
}

export async function publishWinner(t: "build" | "policy", submissionId: string, place: number, title: string): Promise<ActionResult<null>> {
  if (!track.safeParse(t).success || !(place >= 1 && place <= 10)) return { ok: false, error: "Pick a place between 1 and 10." };
  const r = await callRpc<null>("publish_winner", { p_event: await eventId(), p_track: t, p_submission: submissionId, p_place: place, p_title: title.slice(0, 140) });
  if (r.ok) refresh();
  return r;
}

export async function unpublishWinner(t: "build" | "policy", place: number): Promise<ActionResult<null>> {
  const r = await callRpc<null>("unpublish_winner", { p_event: await eventId(), p_track: t, p_place: place });
  if (r.ok) refresh();
  return r;
}
