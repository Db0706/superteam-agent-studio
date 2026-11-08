"use server";

import { refresh } from "next/cache";
import { callRpc, type ActionResult } from "@/server/actions/rpc";

export async function reopenSubmission(id: string, reason: string): Promise<ActionResult<null>> {
  if (!reason.trim()) return { ok: false, error: "Say why it's being reopened; this goes in the audit log." };
  const r = await callRpc<null>("reopen_submission", { p_submission: id, p_reason: reason.trim().slice(0, 500) });
  if (r.ok) refresh();
  return r;
}
