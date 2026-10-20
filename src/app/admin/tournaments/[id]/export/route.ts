import type { NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Results export (CSV): one row per participant per layer with the decision, best score,
 * attempts used and receipt id. Organisers only: RLS returns nothing to anyone else.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/admin/tournaments/[id]/export">) {
  const { id } = await ctx.params;
  const s = await createSupabaseServer();
  const { data: t } = await s.from("tournaments").select("id, name, event_id").eq("id", id).maybeSingle();
  if (!t) return new Response("Not found", { status: 404 });
  const { data: isOrg } = await s.rpc("is_organiser", { p_event: t.event_id });
  if (!isOrg) return new Response("Forbidden", { status: 403 });
  const [{ data: runs }, { data: ps }, { data: ds }, { data: atts }, { data: receipts }] = await Promise.all([
    s.from("layer_runs").select("id, layer_key, position").eq("tournament_id", id).order("position"),
    s.from("tournament_participants").select("id, display_name, state, eliminated_layer_key").eq("tournament_id", id).order("display_name"),
    s.from("advancement_decisions").select("layer_run_id, participant_id, decision, reason, score, rank, overridden_at, override_reason").eq("tournament_id", id),
    s.from("verification_attempts").select("id, layer_run_id, participant_id, status").eq("tournament_id", id),
    s.from("verification_receipts").select("id, attempt_id, participant_id, layer_key").eq("tournament_id", id),
  ]);
  const esc = (v: unknown) => {
    const str = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [["participant", "final_state", "eliminated_at", "layer_position", "layer", "decision", "rank", "score", "attempts", "receipt_id", "reason", "overridden", "override_reason"].join(",")];
  for (const p of ps ?? []) {
    for (const r of runs ?? []) {
      const d = ds?.find((x) => x.participant_id === p.id && x.layer_run_id === r.id);
      const n = atts?.filter((a) => a.participant_id === p.id && a.layer_run_id === r.id).length ?? 0;
      const rc = receipts?.find((x) => x.participant_id === p.id && x.layer_key === r.layer_key);
      if (!d && !n) continue;
      lines.push([p.display_name, p.state, p.eliminated_layer_key, r.position + 1, r.layer_key, d?.decision, d?.rank, d?.score, n, rc?.id, d?.reason, d?.overridden_at ? "yes" : "", d?.override_reason].map(esc).join(","));
    }
  }
  const file = `${t.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-results.csv`;
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${file}"`, "cache-control": "no-store" } });
}
