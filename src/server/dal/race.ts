import "server-only";
import { layerSchema, tournamentConfigSchema, type LayerConfig, type TournamentConfig } from "@/core/tournament/config";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * Everything the race dashboard shows, loaded as the signed-in user (RLS decides what they can
 * see). Serialisable, so the same shape feeds the first render and live polling.
 */

export interface LayerRunView {
  id: string;
  key: string;
  position: number;
  state: "locked" | "scheduled" | "open" | "closing" | "finalising" | "closed";
  opensAt: string;
  deadlineAt: string;
  extendedSeconds: number;
  config: LayerConfig;
  /** Leaderboard points for passing it, including any change made on the day. */
  points: number;
}

export interface AttemptView {
  id: string;
  layerRunId: string;
  attemptNo: number;
  status: "queued" | "running" | "passed" | "failed" | "error" | "review_required";
  score: number | null;
  submittedAt: string;
  finishedAt: string | null;
  feedback: { id: string; label: string; passed: boolean; message: string }[];
  receiptId: string | null;
}

export interface RaceState {
  serverNow: string;
  tournament: { id: string; name: string; description: string; status: string; mode: TournamentConfig["mode"]; startsAt: string | null; tieBreak: string[]; participation: "team" | "individual"; simulation: boolean };
  layers: LayerRunView[];
  me: {
    participantId: string | null;
    state: string | null;
    eliminatedLayerKey: string | null;
    canJoin: boolean;
    hasEndpoint: boolean;
    attempts: AttemptView[];
    decisions: { layerRunId: string; decision: string; reason: string }[];
  } | null;
  standings: { competing: number; qualified: number; eliminated: number; total: number };
  activity: { id: string; kind: string; payload: Record<string, unknown>; createdAt: string }[];
}

export async function listRaceTournaments(eventId: string) {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("tournaments")
    .select("id, name, status, starts_at, simulation")
    .eq("event_id", eventId)
    .is("archived_at", null)
    .neq("status", "draft")
    .order("starts_at", { ascending: true, nullsFirst: false });
  return (data ?? []) as { id: string; name: string; status: string; starts_at: string | null; simulation: boolean }[];
}

/** The tournament the dashboard should feature: running, then upcoming, then most recent. */
export function pickFeatured<T extends { status: string; simulation: boolean }>(list: T[]): T | null {
  const real = list.filter((t) => !t.simulation);
  const order = ["running", "paused", "finalising", "scheduled", "published", "completed", "cancelled"];
  return [...real].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))[0] ?? null;
}

export async function loadRaceState(tournamentId: string, viewer: { userId: string; teamId: string | null } | null): Promise<RaceState | null> {
  const supabase = await createSupabaseServer();
  const { data: t } = await supabase.from("tournaments").select("id, name, description, status, starts_at, current_version, simulation").eq("id", tournamentId).maybeSingle();
  if (!t || t.current_version === null) return null;
  const [{ data: version }, { data: runs }, { data: participants }, { data: feed }, { data: now }, { data: pointOverrides }] = await Promise.all([
    supabase.from("tournament_versions").select("config").eq("tournament_id", t.id).eq("version", t.current_version).maybeSingle(),
    supabase.from("layer_runs").select("id, layer_key, position, state, opens_at, deadline_at, extended_seconds, version").eq("tournament_id", t.id).order("position"),
    supabase.from("tournament_participants").select("id, team_id, user_id, state, eliminated_layer_key").eq("tournament_id", t.id),
    supabase.from("activity_events").select("id, kind, payload, created_at").eq("tournament_id", t.id).eq("is_public", true).order("id", { ascending: false }).limit(25),
    supabase.rpc("server_now"),
    supabase.from("layer_points").select("layer_key, points").eq("tournament_id", t.id),
  ]);
  const config = tournamentConfigSchema.parse(version?.config);
  // Organisers can change a layer's points during the race; the override wins over the config.
  const pointsOverride = new Map((pointOverrides ?? []).map((p) => [p.layer_key as string, p.points as number]));
  const pointsFor = (key: string, fallback: number) => pointsOverride.get(key) ?? fallback;
  const layerByKey = new Map(config.layers.map((l) => [l.key, l]));
  const layers: LayerRunView[] = runs?.length
    ? runs.map((r) => ({
        id: r.id,
        key: r.layer_key,
        position: r.position,
        state: r.state,
        opensAt: r.opens_at,
        deadlineAt: r.deadline_at,
        extendedSeconds: r.extended_seconds,
        config: layerSchema.parse(layerByKey.get(r.layer_key)),
        points: pointsFor(r.layer_key, layerByKey.get(r.layer_key)?.points ?? 0),
      }))
    : // Published but not scheduled yet: show the plan with times relative to an unknown start.
      config.layers.map((l, i) => ({ id: `planned-${l.key}`, key: l.key, position: i, state: "locked", opensAt: "", deadlineAt: "", extendedSeconds: 0, config: l, points: pointsFor(l.key, l.points) }));

  const list = participants ?? [];
  const mine = viewer ? list.find((p) => p.user_id === viewer.userId || (viewer.teamId && p.team_id === viewer.teamId)) : undefined;
  let me: RaceState["me"] = null;
  if (viewer) {
    let attempts: AttemptView[] = [];
    let decisions: { layerRunId: string; decision: string; reason: string }[] = [];
    if (mine) {
      const [{ data: rows }, { data: receipts }, { data: ds }] = await Promise.all([
        supabase.from("verification_attempts").select("id, layer_run_id, attempt_no, status, score, submitted_at, finished_at, feedback").eq("participant_id", mine.id).order("submitted_at", { ascending: false }).limit(60),
        supabase.from("verification_receipts").select("id, attempt_id").eq("participant_id", mine.id),
        supabase.from("advancement_decisions").select("layer_run_id, decision, reason").eq("participant_id", mine.id),
      ]);
      attempts = (rows ?? []).map((a) => ({
        id: a.id,
        layerRunId: a.layer_run_id,
        attemptNo: a.attempt_no,
        status: a.status,
        score: a.score === null ? null : Number(a.score),
        submittedAt: a.submitted_at,
        finishedAt: a.finished_at,
        feedback: (a.feedback ?? []) as AttemptView["feedback"],
        receiptId: receipts?.find((r) => r.attempt_id === a.id)?.id ?? null,
      }));
      decisions = (ds ?? []).map((d) => ({ layerRunId: d.layer_run_id, decision: d.decision, reason: d.reason }));
    }
    let hasEndpoint = false;
    if (viewer.teamId) {
      const { data: project } = await supabase.from("projects").select("endpoint_url").eq("team_id", viewer.teamId).maybeSingle();
      hasEndpoint = !!project?.endpoint_url;
    }
    me = {
      participantId: mine?.id ?? null,
      state: mine?.state ?? null,
      eliminatedLayerKey: mine?.eliminated_layer_key ?? null,
      canJoin: !mine && ["published", "scheduled"].includes(t.status) && (config.participation === "individual" || !!viewer.teamId),
      hasEndpoint,
      attempts,
      decisions,
    };
  }

  return {
    serverNow: typeof now === "string" ? now : new Date().toISOString(),
    tournament: { id: t.id, name: t.name, description: config.description, status: t.status, mode: config.mode, startsAt: t.starts_at, tieBreak: config.tieBreak, participation: config.participation, simulation: t.simulation },
    layers,
    me,
    standings: {
      competing: list.filter((p) => p.state === "active" || p.state === "qualified").length,
      qualified: list.filter((p) => p.state === "qualified" || p.state === "completed").length,
      eliminated: list.filter((p) => p.state === "eliminated").length,
      total: list.length,
    },
    activity: (feed ?? []).map((e) => ({ id: String(e.id), kind: e.kind, payload: e.payload as Record<string, unknown>, createdAt: e.created_at })),
  };
}
