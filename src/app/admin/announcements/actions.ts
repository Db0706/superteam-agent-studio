"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { callRpc, type ActionResult } from "@/server/actions/rpc";
import { getActiveEvent } from "@/server/dal/viewer";

export async function publishAnnouncement(_: unknown, form: FormData): Promise<ActionResult<string>> {
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No active event." };
  const parsed = z
    .object({ title: z.string().trim().min(1, "Add a title.").max(140), body: z.string().max(2000), audience: z.enum(["everyone", "participants", "mentors", "judges", "organisers"]) })
    .safeParse({ title: form.get("title") ?? "", body: form.get("body") ?? "", audience: form.get("audience") ?? "everyone" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const r = await callRpc<string>("publish_announcement", { p_event: event.id, p_title: parsed.data.title, p_body: parsed.data.body, p_audience: parsed.data.audience });
  if (r.ok) refresh();
  return r;
}
