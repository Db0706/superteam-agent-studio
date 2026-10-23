"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { cleanFields, missingForFinal, type Track } from "@/core/submissions/fields";
import { callRpc, type ActionResult } from "@/server/actions/rpc";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getActiveEvent } from "@/server/dal/viewer";

const track = z.enum(["build", "policy"]);

/** Autosave: drafts can be incomplete. */
export async function saveDraft(t: Track, title: string, fields: Record<string, unknown>): Promise<ActionResult<{ id: string; savedAt: string }>> {
  const event = await getActiveEvent();
  if (!event || !track.safeParse(t).success) return { ok: false, error: "Unknown track." };
  const r = await callRpc<string>("save_submission", { p_event: event.id, p_track: t, p_title: title.slice(0, 160), p_fields: cleanFields(t, fields) });
  if (!r.ok) return r;
  return { ok: true, data: { id: r.data, savedAt: new Date().toISOString() } };
}

export async function submitFinal(t: Track, title: string, fields: Record<string, unknown>): Promise<ActionResult<string>> {
  const missing = missingForFinal(t, title, fields);
  if (missing.length) return { ok: false, error: `Before submitting, fill in: ${missing.join(", ")}.` };
  const saved = await saveDraft(t, title, fields);
  if (!saved.ok) return saved;
  const r = await callRpc<string>("finalise_submission", { p_submission: saved.data.id });
  if (r.ok) refresh();
  return r;
}

export async function addLink(submissionId: string, kind: "screenshot" | "document" | "slides" | "link", label: string, url: string): Promise<ActionResult<string>> {
  if (!/^https:\/\/\S+$/.test(url)) return { ok: false, error: "Links must start with https://" };
  const r = await callRpc<string>("add_submission_link", { p_submission: submissionId, p_kind: kind, p_label: label.slice(0, 120), p_url: url.slice(0, 500) });
  if (r.ok) refresh();
  return r;
}

/** Team-only read of the submission's material (RLS). */
export async function listArtifacts(submissionId: string) {
  const s = await createSupabaseServer();
  const { data } = await s.from("submission_artifacts").select("id, kind, label, url").eq("submission_id", submissionId).order("created_at");
  return data ?? [];
}
