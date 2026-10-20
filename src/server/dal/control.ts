import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";

/** Everything the organiser's control room shows. Organisers' RLS covers all of it. */
export interface ControlState {
  serverNow: string;
  tournament: { id: string; name: string; status: string; simulation: boolean; eliminationsSuspended: boolean; startsAt: string | null; version: number | null };
  layers: { id: string; key: string; position: number; state: string; opensAt: string; deadlineAt: string; extendedSeconds: number }[];
  participants: { id: string; name: string; state: string; eliminatedLayerKey: string | null; fixture: boolean }[];
  attempts: { id: string; participantId: string; layerRunId: string; attemptNo: number; status: string; score: number | null; submittedAt: string; finishedAt: string | null; reviewNote: string | null }[];
  decisions: { id: string; layerRunId: string; participantId: string; decision: string; reason: string; score: number | null; rank: number | null; overriddenAt: string | null; overrideReason: string | null }[];
  queue: { queued: number; leased: number; dead: number };
  workers: { id: string; lastSeen: string }[];
  waiting: { layer: string; waitingOn: { name: string; why: string }[] } | null;
}

export async function loadControlState(id: string): Promise<ControlState | null> {
  const s = await createSupabaseServer();
  const { data: t } = await s.from("tournaments").select("id, name, status, simulation, eliminations_suspended, starts_at, current_version").eq("id", id).maybeSingle();
  if (!t) return null;
  const [{ data: runs }, { data: ps }, { data: atts }, { data: ds }, { data: jobs }, { data: hb }, { data: wait }, { data: now }] = await Promise.all([
    s.from("layer_runs").select("id, layer_key, position, state, opens_at, deadline_at, extended_seconds").eq("tournament_id", id).order("position"),
    s.from("tournament_participants").select("id, display_name, state, eliminated_layer_key, fixture_endpoint").eq("tournament_id", id).order("display_name"),
    s.from("verification_attempts").select("id, participant_id, layer_run_id, attempt_no, status, score, submitted_at, finished_at, review_note").eq("tournament_id", id).order("submitted_at", { ascending: false }).limit(400),
    s.from("advancement_decisions").select("id, layer_run_id, participant_id, decision, reason, score, rank, overridden_at, override_reason").eq("tournament_id", id),
    s.from("verification_jobs").select("status, verification_attempts!inner(tournament_id)").eq("verification_attempts.tournament_id", id).in("status", ["queued", "leased", "dead"]),
    s.from("worker_heartbeats").select("worker_id, last_seen").order("last_seen", { ascending: false }).limit(10),
    s.from("activity_events").select("payload, created_at").eq("tournament_id", id).eq("kind", "layer.waiting").order("id", { ascending: false }).limit(1),
    s.rpc("server_now"),
  ]);
  const lastWait = wait?.[0];
  const waitingLayer = lastWait ? (lastWait.payload as { layer: string; waitingOn: { name: string; why: string }[] }) : null;
  const stillWaiting = waitingLayer && runs?.some((r) => r.layer_key === waitingLayer.layer && r.state === "finalising");
  return {
    serverNow: typeof now === "string" ? now : new Date().toISOString(),
    tournament: { id: t.id, name: t.name, status: t.status, simulation: t.simulation, eliminationsSuspended: t.eliminations_suspended, startsAt: t.starts_at, version: t.current_version },
    layers: (runs ?? []).map((r) => ({ id: r.id, key: r.layer_key, position: r.position, state: r.state, opensAt: r.opens_at, deadlineAt: r.deadline_at, extendedSeconds: r.extended_seconds })),
    participants: (ps ?? []).map((p) => ({ id: p.id, name: p.display_name, state: p.state, eliminatedLayerKey: p.eliminated_layer_key, fixture: !!p.fixture_endpoint })),
    attempts: (atts ?? []).map((a) => ({ id: a.id, participantId: a.participant_id, layerRunId: a.layer_run_id, attemptNo: a.attempt_no, status: a.status, score: a.score === null ? null : Number(a.score), submittedAt: a.submitted_at, finishedAt: a.finished_at, reviewNote: a.review_note })),
    decisions: (ds ?? []).map((d) => ({ id: d.id, layerRunId: d.layer_run_id, participantId: d.participant_id, decision: d.decision, reason: d.reason, score: d.score === null ? null : Number(d.score), rank: d.rank, overriddenAt: d.overridden_at, overrideReason: d.override_reason })),
    queue: {
      queued: (jobs ?? []).filter((j) => j.status === "queued").length,
      leased: (jobs ?? []).filter((j) => j.status === "leased").length,
      dead: (jobs ?? []).filter((j) => j.status === "dead").length,
    },
    workers: (hb ?? []).map((h) => ({ id: h.worker_id, lastSeen: h.last_seen })),
    waiting: stillWaiting ? waitingLayer : null,
  };
}
