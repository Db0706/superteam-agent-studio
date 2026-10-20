"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { callRpc, type ActionResult } from "@/server/actions/rpc";
import { getActiveEvent } from "@/server/dal/viewer";


export async function requestHelp(_: unknown, form: FormData): Promise<ActionResult<string>> {
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No active event." };
  const f = z
    .object({
      category: z.enum(["setup", "ai", "verification", "deployment", "debugging", "research", "other"]),
      description: z.string().trim().min(3, "Say a little about what you need.").max(2000),
      location: z.string().trim().max(120),
    })
    .safeParse({ category: form.get("category"), description: form.get("description") ?? "", location: form.get("location") ?? "" });
  if (!f.success) return { ok: false, error: f.error.issues[0].message };
  const r = await callRpc<string>("request_mentor", { p_event: event.id, p_category: f.data.category, p_description: f.data.description, p_location: f.data.location });
  if (r.ok) refresh();
  return r;
}

export async function updateRequest(id: string, action: "claim" | "release" | "resolve" | "escalate" | "cancel", note: string): Promise<ActionResult<null>> {
  const r = await callRpc<null>("update_mentor_request", { p_id: id, p_action: action, p_note: note.trim().slice(0, 1000) });
  if (r.ok) refresh();
  return r;
}
