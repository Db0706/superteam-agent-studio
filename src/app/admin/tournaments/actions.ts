"use server";

import { createHash } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canonicalJson, parseTournamentConfig, TOURNAMENT_SCHEMA, type TournamentConfig } from "@/core/tournament/config";
import { aiRaceTemplate, rehearsalConfig } from "@/core/tournament/templates";
import { validateVerifierConfig } from "@/core/verification/catalogue";
import { FIXTURE_VARIANTS } from "@/server/fixtures/reference-app";
import { createSupabaseServer } from "@/lib/supabase/server";
import { callRpc, type ActionResult } from "@/server/actions/rpc";
import { getActiveEvent } from "@/server/dal/viewer";

export type Issue = { path: string; message: string };

/** Full validation: the tournament schema plus every layer's verifier settings. */
export async function validateConfig(input: unknown): Promise<{ ok: true; config: TournamentConfig } | { ok: false; issues: Issue[] }> {
  const parsed = parseTournamentConfig(input);
  if (!parsed.ok) return parsed;
  const issues: Issue[] = [];
  parsed.config.layers.forEach((l, i) => {
    const v = validateVerifierConfig(l.verifier.plugin, l.verifier.config);
    if (!v.ok) issues.push({ path: `layers.${i}.verifier.config`, message: v.message });
  });
  return issues.length ? { ok: false, issues } : parsed;
}

const hashOf = (cfg: TournamentConfig) => createHash("sha256").update(canonicalJson(cfg)).digest("hex");

export async function createTournament(_: unknown, form: FormData): Promise<ActionResult<string>> {
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No active event." };
  const f = z
    .object({
      name: z.string().trim().min(1, "Name the tournament.").max(100),
      start: z.enum(["template", "blank"]),
      layers: z.coerce.number().int().min(1).max(8),
      interval: z.coerce.number().int().min(1).max(24 * 60),
      mode: z.enum(["survival", "ranked", "checkpoint", "hybrid"]),
    })
    .safeParse(Object.fromEntries(form));
  if (!f.success) return { ok: false, error: f.error.issues[0].message };
  const base = aiRaceTemplate({ name: f.data.name, layers: f.data.start === "template" ? f.data.layers : 1, intervalSeconds: f.data.interval * 60, mode: f.data.mode });
  const config: TournamentConfig = f.data.start === "blank" ? { ...base, description: "", layers: base.layers.slice(0, 1) } : base;
  const r = await callRpc<string>("create_tournament", { p_event: event.id, p_name: f.data.name, p_config: config });
  if (!r.ok) return r;
  redirect(`/admin/tournaments/${r.data}`);
}

export async function saveDraft(id: string, config: unknown): Promise<ActionResult<{ issues: Issue[] }>> {
  // Drafts may be incomplete: save as long as it's an object, report issues alongside.
  if (!config || typeof config !== "object") return { ok: false, error: "Nothing to save." };
  const r = await callRpc<null>("save_tournament_draft", { p_id: id, p_config: { ...(config as object), schema: TOURNAMENT_SCHEMA } });
  if (!r.ok) return r;
  const v = await validateConfig(config);
  refresh();
  return { ok: true, data: { issues: v.ok ? [] : v.issues } };
}

export async function publish(id: string, config: unknown, note: string): Promise<ActionResult<number> | { ok: false; error: string; issues: Issue[] }> {
  const v = await validateConfig(config);
  if (!v.ok) return { ok: false, error: "Fix the issues before publishing.", issues: v.issues };
  const r = await callRpc<number>("publish_tournament", { p_id: id, p_config: v.config, p_hash: hashOf(v.config), p_note: note.slice(0, 500) });
  if (r.ok) refresh();
  return r;
}

export async function unpublish(id: string): Promise<ActionResult<null>> {
  const r = await callRpc<null>("unpublish_tournament", { p_id: id });
  if (r.ok) refresh();
  return r;
}

export async function schedule(id: string, startsAtIso: string): Promise<ActionResult<null>> {
  if (Number.isNaN(Date.parse(startsAtIso))) return { ok: false, error: "Pick a start time." };
  const r = await callRpc<null>("schedule_tournament", { p_id: id, p_starts_at: startsAtIso });
  if (r.ok) refresh();
  return r;
}

export async function duplicate(id: string, name: string): Promise<ActionResult<string>> {
  const r = await callRpc<string>("duplicate_tournament", { p_id: id, p_name: name.slice(0, 100), p_simulation: false, p_config: null });
  if (r.ok) refresh();
  return r;
}

export async function archive(id: string): Promise<ActionResult<null>> {
  const r = await callRpc<null>("archive_tournament", { p_id: id });
  if (r.ok) refresh();
  return r;
}

/** A rehearsal: same layers, windows scaled down, flagged as a simulation, invisible to participants. */
export async function createRehearsal(id: string, speed: number): Promise<ActionResult<string>> {
  const supabase = await createSupabaseServer();
  const { data: t } = await supabase.from("tournaments").select("name, draft_config").eq("id", id).maybeSingle();
  if (!t) return { ok: false, error: "Tournament not found." };
  const v = await validateConfig(t.draft_config);
  if (!v.ok) return { ok: false, error: "Fix the tournament's issues before rehearsing it." };
  const cfg = rehearsalConfig(v.config, Math.max(1, Math.min(120, speed)));
  const r = await callRpc<string>("duplicate_tournament", { p_id: id, p_name: cfg.name, p_simulation: true, p_config: cfg });
  if (r.ok) refresh();
  return r;
}

export async function addFixtureTeam(id: string, variant: string, name: string): Promise<ActionResult<string>> {
  if (!(FIXTURE_VARIANTS as readonly string[]).includes(variant)) return { ok: false, error: "Unknown fixture." };
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  if (!site) return { ok: false, error: "Set NEXT_PUBLIC_SITE_URL so fixture apps have a public address." };
  const r = await callRpc<string>("add_fixture_participant", { p_id: id, p_name: name.slice(0, 60) || `Fixture ${variant}`, p_endpoint: `${site}/api/race/fixtures/${variant}` });
  if (r.ok) refresh();
  return r;
}

/* ───────────── control room ───────────── */

const reasonOf = (r: string) => r.trim().slice(0, 500);

export async function control(
  action: "pause" | "resume" | "suspend" | "unsuspend" | "cancel",
  id: string,
  reason: string,
): Promise<ActionResult<null>> {
  const r =
    action === "pause"
      ? await callRpc<null>("pause_tournament", { p_id: id, p_reason: reasonOf(reason) })
      : action === "resume"
        ? await callRpc<null>("resume_tournament", { p_id: id })
        : action === "cancel"
          ? await callRpc<null>("cancel_tournament", { p_id: id, p_reason: reasonOf(reason) })
          : await callRpc<null>("set_eliminations_suspended", { p_id: id, p_suspended: action === "suspend", p_reason: reasonOf(reason) });
  if (r.ok) refresh();
  return r;
}

export async function extendLayer(layerRunId: string, minutes: number, shiftFollowing: boolean, reason: string): Promise<ActionResult<null>> {
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 600) return { ok: false, error: "Extend by 1 to 600 minutes." };
  const r = await callRpc<null>("extend_layer", { p_layer_run: layerRunId, p_seconds: Math.round(minutes * 60), p_shift_following: shiftFollowing, p_reason: reasonOf(reason) });
  if (r.ok) refresh();
  return r;
}

export async function reviewAttempt(attemptId: string, passed: boolean, score: number, note: string): Promise<ActionResult<null>> {
  const r = await callRpc<null>("review_attempt", { p_attempt: attemptId, p_passed: passed, p_score: Math.max(0, Math.min(100, score)), p_note: note.trim().slice(0, 1000) });
  if (r.ok) refresh();
  return r;
}

export async function reprocessAttempt(attemptId: string, reason: string): Promise<ActionResult<null>> {
  const r = await callRpc<null>("reprocess_attempt", { p_attempt: attemptId, p_reason: reasonOf(reason) });
  if (r.ok) refresh();
  return r;
}

export async function attemptEvidence(attemptId: string): Promise<ActionResult<Record<string, unknown>>> {
  return callRpc<Record<string, unknown>>("attempt_evidence", { p_attempt: attemptId });
}

export async function reinstate(participantId: string, reason: string): Promise<ActionResult<null>> {
  const r = await callRpc<null>("reinstate_participant", { p_participant: participantId, p_reason: reasonOf(reason) });
  if (r.ok) refresh();
  return r;
}

export async function overrideDecision(decisionId: string, to: "qualified" | "eliminated" | "checkpoint_passed" | "checkpoint_missed", reason: string): Promise<ActionResult<null>> {
  const r = await callRpc<null>("override_decision", { p_decision: decisionId, p_new: to, p_reason: reasonOf(reason) });
  if (r.ok) refresh();
  return r;
}
