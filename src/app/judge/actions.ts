"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { callRpc, type ActionResult } from "@/server/actions/rpc";

export async function saveScores(assignmentId: string, scores: Record<string, number>, comments: string, final: boolean): Promise<ActionResult<null>> {
  const parsed = z.record(z.string().max(40), z.number().min(0).max(100)).safeParse(scores);
  if (!parsed.success) return { ok: false, error: "Scores must be numbers." };
  const r = await callRpc<null>("save_judging_score", { p_assignment: assignmentId, p_scores: parsed.data, p_comments: comments.slice(0, 5000), p_final: final });
  if (r.ok) refresh();
  return r;
}

export async function flag(assignmentId: string, kind: "conflict" | "clarification", note: string): Promise<ActionResult<null>> {
  if (!note.trim()) return { ok: false, error: "Add a short note for the organisers." };
  const r = await callRpc<null>("flag_judging", { p_assignment: assignmentId, p_kind: kind, p_note: note.trim().slice(0, 1000) });
  if (r.ok) refresh();
  return r;
}
