"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { ImportRow } from "@/core/registrations/luma";
import { callRpc, type ActionResult } from "@/server/actions/rpc";
import { getActiveEvent } from "@/server/dal/viewer";

const row = z.object({
  email: z.email(),
  full_name: z.string().max(200),
  ticket: z.enum(["hackathon", "panel"]),
  status: z.enum(["approved", "pending", "declined", "checked_in"]),
  university: z.string().max(200),
  external_id: z.string().max(200),
  checked_in_at: z.string().max(40),
});

export async function importRegistrations(rows: ImportRow[]): Promise<ActionResult<{ inserted: number; updated: number; unchanged: number; linked: number }>> {
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No active event." };
  const parsed = z.array(row).min(1).max(5000).safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Some rows are invalid. Re-export the CSV from Luma and try again." };
  const r = await callRpc<{ inserted: number; updated: number; unchanged: number; linked: number }>("import_registrations", { p_event: event.id, p_rows: parsed.data });
  if (r.ok) refresh();
  return r;
}

export async function setRole(_: unknown, form: FormData): Promise<ActionResult<null>> {
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No active event." };
  const email = z.email().safeParse(String(form.get("email") ?? "").trim());
  if (!email.success) return { ok: false, error: "Enter a valid email." };
  const role = z.enum(["participant", "mentor", "judge", "organiser"]).safeParse(form.get("role"));
  if (!role.success) return { ok: false, error: "Choose a role." };
  const r = await callRpc<null>("set_event_role", { p_event: event.id, p_email: email.data, p_role: role.data, p_grant: form.get("grant") !== "revoke" });
  if (r.ok) refresh();
  return r;
}

export async function setCheckIn(registrationId: string, checkedIn: boolean): Promise<ActionResult<null>> {
  const r = await callRpc<null>("check_in", { p_registration: registrationId, p_checked_in: checkedIn });
  if (r.ok) refresh();
  return r;
}
