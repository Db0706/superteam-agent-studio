import "server-only";
import { tournamentConfigSchema } from "@/core/tournament/config";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Spectator-safe race state for the venue screen. Only reads what RLS exposes to anyone:
 * published tournaments, layer windows, team names and states, decisions, public activity.
 * Never attempts, feedback, evidence or contact details.
 */
export interface SpectatorState {
  serverNow: string;
  eventName: string;
  tournament: { id: string; name: string; status: string; mode: string };
  layers: { key: string; title: string; position: number; state: string; opensAt: string; deadlineAt: string }[];
  teams: { name: string; state: string; eliminatedLayerKey: string | null }[];
  verifications: { passed: number; failed: number };
  recent: { id: string; kind: string; name?: string; layer?: string; title?: string; at: string }[];
}

export async function loadSpectatorState(tournamentId: string, eventName: string): Promise<SpectatorState | null> {
  const supabase = await createSupabaseServer();
  const { data: t } = await supabase.from("tournaments").select("id, name, status, current_version, simulation").eq("id", tournamentId).maybeSingle();
  if (!t || t.simulation || t.current_version === null) return null;
  const [{ data: v }, { data: runs }, { data: ps }, { data: feed }, { count: passed }, { count: failed }, { data: now }] = await Promise.all([
    supabase.from("tournament_versions").select("config").eq("tournament_id", t.id).eq("version", t.current_version).maybeSingle(),
    supabase.from("layer_runs").select("layer_key, position, state, opens_at, deadline_at").eq("tournament_id", t.id).order("position"),
    supabase.from("tournament_participants").select("display_name, state, eliminated_layer_key").eq("tournament_id", t.id).order("display_name"),
    supabase.from("activity_events").select("id, kind, payload, created_at").eq("tournament_id", t.id).eq("is_public", true).in("kind", ["participant.qualified", "participant.eliminated", "participant.reinstated", "attempt.passed", "layer.opened", "layer.closed", "tournament.paused", "tournament.resumed", "layer.extended"]).order("id", { ascending: false }).limit(30),
    supabase.from("activity_events").select("id", { count: "exact", head: true }).eq("tournament_id", t.id).eq("is_public", true).eq("kind", "attempt.passed"),
    supabase.from("activity_events").select("id", { count: "exact", head: true }).eq("tournament_id", t.id).eq("is_public", true).eq("kind", "attempt.failed"),
    supabase.rpc("server_now"),
  ]);
  const cfg = tournamentConfigSchema.parse(v?.config);
  const titles = new Map(cfg.layers.map((l) => [l.key, l.title]));
  return {
    serverNow: typeof now === "string" ? now : new Date().toISOString(),
    eventName,
    tournament: { id: t.id, name: t.name, status: t.status, mode: cfg.mode },
    layers: (runs ?? []).map((r) => ({ key: r.layer_key, title: titles.get(r.layer_key) ?? r.layer_key, position: r.position, state: r.state, opensAt: r.opens_at, deadlineAt: r.deadline_at })),
    teams: (ps ?? []).map((p) => ({ name: p.display_name, state: p.state, eliminatedLayerKey: p.eliminated_layer_key })),
    verifications: { passed: passed ?? 0, failed: failed ?? 0 },
    recent: (feed ?? []).map((e) => {
      const p = e.payload as { name?: string; layer?: string; title?: string };
      return { id: String(e.id), kind: e.kind, name: p.name, layer: p.layer, title: p.title ?? (p.layer ? titles.get(p.layer) : undefined), at: e.created_at };
    }),
  };
}
