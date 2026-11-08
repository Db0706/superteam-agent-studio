import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Calls a database function as the signed-in user. All permission checks happen inside the
 * function (auth.uid(), roles, team membership); this helper only maps the result into a shape
 * forms can show. Error messages from the functions are written to be shown as they are.
 */
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export async function callRpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: friendly(error.message, error.code) };
  return { ok: true, data: data as T };
}

function friendly(message: string, code?: string): string {
  if (code === "PGRST202") return "That action isn't available. Refresh the page and try again.";
  if (/JWT|not authenticated|Please sign in/i.test(message)) return "Please sign in again.";
  return message;
}
