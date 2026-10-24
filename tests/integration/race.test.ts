import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiRaceTemplate } from "@/core/tournament/templates";
import { verifyReceipt, type ReceiptPayload } from "@/core/verification/receipts";
import { finaliseLayer } from "@/server/engine/scheduler";
import { configHash, drainJobs, endLayer, eventSlug, rpc, rpcError, runTick, signedInUser, startHarness, validated, type Harness } from "./harness";

/**
 * Acceptance scenario (directive §22): an organiser runs a survival AI Race with eight
 * 30-minute layers, teams connect real apps, the platform verifies them for real, eliminations
 * follow the rules, and everything is persisted, visible and recoverable.
 *
 * Teams are fixture apps that pass or fail for genuine reasons:
 *   Atlas      reference implementation (passes every layer)
 *   Borealis   stateless conversations  → fails Memory (layer 5)
 *   Cirrus     no retries/timeouts      → fails Reliability (layer 6)
 *   Draco      never submits            → eliminated at layer 1
 *   Echo       invents tool results     → fails Tool Calling (layer 3)
 *   Fornax     ignores spending limits  → fails Autonomous Workflow (layer 7)
 */

let h: Harness;
let eventId: string;
let tournamentId: string;
let organiser: SupabaseClient;
const teams: Record<string, { client: SupabaseClient; userId: string; teamId: string; variant: string }> = {};

const TEAMS = [
  ["atlas", "reference"],
  ["borealis", "no-memory"],
  ["cirrus", "fragile"],
  ["draco", "reference"],
  ["echo", "fabricator"],
  ["fornax", "overspender"],
] as const;

beforeAll(async () => {
  h = await startHarness({ scope: "race" });
  // The event and its approved participant list (as imported from Luma).
  const [ev] = await h.sql<{ id: string }[]>`
    insert into public.events (slug, name, short_name, status, starts_at, details)
    values (${eventSlug(h)}, 'Race Test Event', 'Race Test', 'published', now(), '{}') returning id`;
  eventId = ev.id;
  await h.sql`insert into public.event_tracks (event_id, track, name, status) values (${eventId}, 'build', 'Build Track', 'confirmed'), (${eventId}, 'policy', 'Policy Track', 'confirmed')`;
  for (const [name] of TEAMS) {
    await h.sql`insert into public.registrations (event_id, email, full_name, ticket, status) values (${eventId}, ${`${name}@${h.domain}`}, ${name}, 'hackathon', 'approved')`;
  }
  await h.sql`insert into public.registrations (event_id, email, full_name, ticket, status) values (${eventId}, ${`panel@${h.domain}`}, 'Panel Only', 'panel', 'approved')`;

  const org = await signedInUser(h, "organiser");
  await h.sql`insert into public.event_roles (event_id, user_id, role) values (${eventId}, ${org.id}, 'organiser')`;
  organiser = org.client;

  for (const [name, variant] of TEAMS) {
    const u = await signedInUser(h, name);
    const teamId = await rpc<string>(u.client, "create_team", { p_event: eventId, p_name: name[0].toUpperCase() + name.slice(1), p_track: "build" });
    await rpc(u.client, "update_project", { p_team: teamId, p_name: name, p_repo: null, p_demo: null, p_endpoint: `${h.host.url}/api/race/fixtures/${variant}` });
    teams[name] = { client: u.client, userId: u.id, teamId, variant };
  }
});

afterAll(async () => {
  await h?.close();
});

describe("AI Race, end to end", () => {
  it("organiser creates, previews, publishes and schedules an 8-layer survival race", async () => {
    const config = validated(aiRaceTemplate({ intervalSeconds: 30 * 60, layers: 8, mode: "survival" }));
    expect(config.layers).toHaveLength(8);
    expect(config.layers.at(-1)!.timing).toEqual({ offsetSeconds: 7 * 1800, durationSeconds: 1800 });

    tournamentId = await rpc<string>(organiser, "create_tournament", { p_event: eventId, p_name: config.name, p_config: config });
    // Participants can't see a draft.
    const { data: hidden } = await teams.atlas.client.from("tournaments").select("id").eq("id", tournamentId);
    expect(hidden).toEqual([]);

    const version = await rpc<number>(organiser, "publish_tournament", { p_id: tournamentId, p_config: config, p_hash: configHash(config), p_note: "v1" });
    expect(version).toBe(1);

    for (const name of Object.keys(teams)) await rpc(teams[name].client, "join_tournament", { p_id: tournamentId });
    // A non-participant can't join.
    const outsider = await signedInUser(h, "outsider");
    expect(await rpcError(outsider.client, "join_tournament", { p_id: tournamentId })).toMatch(/not on the approved participant list/);

    await rpc(organiser, "schedule_tournament", { p_id: tournamentId, p_starts_at: new Date().toISOString() });
    // Rules are locked once scheduled.
    expect(await rpcError(organiser, "save_tournament_draft", { p_id: tournamentId, p_config: config })).toMatch(/locked/);

    await runTick(h);
    const [t] = await h.sql<{ status: string }[]>`select status from public.tournaments where id = ${tournamentId}`;
    expect(t.status).toBe("running");
    const runs = await h.sql<{ layer_key: string; state: string }[]>`select layer_key, state from public.layer_runs where tournament_id = ${tournamentId} order by position`;
    expect(runs.map((r) => r.state)).toEqual(["open", "scheduled", "scheduled", "scheduled", "scheduled", "scheduled", "scheduled", "scheduled"]);
  });

  it("runs all eight layers with real verification, eliminating teams for real failures", async () => {
    const config = aiRaceTemplate({ intervalSeconds: 1800, layers: 8 });
    const eliminatedAt: Record<string, string> = {};
    for (const layer of config.layers) {
      const competing = await h.sql<{ display_name: string }[]>`
        select display_name from public.tournament_participants where tournament_id = ${tournamentId} and state in ('active', 'qualified')`;
      const names = competing.map((c) => c.display_name.toLowerCase());
      for (const name of names) {
        if (name === "draco") continue; // never submits
        await rpc(teams[name].client, "submit_attempt", { p_id: tournamentId, p_layer_key: layer.key, p_request_id: `${name}-${layer.key}` });
        // Idempotent: the same request id doesn't create a second attempt.
        await rpc(teams[name].client, "submit_attempt", { p_id: tournamentId, p_layer_key: layer.key, p_request_id: `${name}-${layer.key}` });
      }
      await drainJobs(h);
      await endLayer(h, tournamentId, layer.key);
      await runTick(h);
      const decisions = await h.sql<{ name: string; decision: string }[]>`
        select tp.display_name as name, d.decision from public.advancement_decisions d
        join public.layer_runs r on r.id = d.layer_run_id join public.tournament_participants tp on tp.id = d.participant_id
        where r.tournament_id = ${tournamentId} and r.layer_key = ${layer.key}`;
      expect(decisions.length, `${layer.key} decided for every competing team`).toBe(names.length);
      for (const d of decisions) if (d.decision === "eliminated") eliminatedAt[d.name.toLowerCase()] = layer.key;
      if (layer.key === config.layers[0].key) {
        // An elimination round has been decided: a team formed now must not skip that cut.
        await h.sql`insert into public.registrations (event_id, email, full_name, ticket, status) values (${eventId}, ${`latecomer@${h.domain}`}, 'Latecomer', 'hackathon', 'approved')`;
        const late = await signedInUser(h, "latecomer");
        await rpc(late.client, "create_team", { p_event: eventId, p_name: "Latecomer", p_track: "build" });
        expect(await rpcError(late.client, "join_tournament", { p_id: tournamentId })).toMatch(/Entries for this race are closed/);
      }
    }

    expect(eliminatedAt).toEqual({
      draco: "first-intelligence",
      echo: "tool-calling",
      borealis: "memory-context",
      cirrus: "reliability",
      fornax: "autonomous-workflow",
    });
    const [t] = await h.sql<{ status: string }[]>`select status from public.tournaments where id = ${tournamentId}`;
    expect(t.status).toBe("completed");
    const [atlas] = await h.sql<{ state: string }[]>`select state from public.tournament_participants where tournament_id = ${tournamentId} and display_name = 'Atlas'`;
    expect(atlas.state).toBe("completed");
  });

  it("gives failing teams actionable feedback without leaking hidden test data", async () => {
    const { data } = await teams.borealis.client.from("verification_attempts").select("status, feedback, layer_run_id").eq("status", "failed");
    expect(data?.length).toBeGreaterThan(0);
    const messages = (data ?? []).flatMap((a) => (a.feedback as { label: string; message: string; passed: boolean }[]).filter((f) => !f.passed));
    expect(messages.some((m) => /earlier facts were recalled/.test(m.message))).toBe(true);
    // Evidence (hidden inputs and expected values) is never readable by the team.
    const { error } = await teams.borealis.client.from("verification_attempts").select("evidence");
    expect(error?.message).toMatch(/permission denied/);
  });

  it("issues signed, non-replayable receipts only for passed attempts", async () => {
    const receipts = await h.sql<{ payload: ReceiptPayload; signature: string; attempt_id: string; status: string }[]>`
      select r.payload, r.signature, r.attempt_id, a.status from public.verification_receipts r join public.verification_attempts a on a.id = r.attempt_id
      where r.tournament_id = ${tournamentId}`;
    expect(receipts.length).toBeGreaterThanOrEqual(8);
    for (const r of receipts) {
      expect(r.status).toBe("passed");
      expect(r.payload.attemptId).toBe(r.attempt_id);
      expect(verifyReceipt(r.payload, r.signature, h.env.receiptKey)).toBe(true);
      // Any change (another attempt, another team) breaks the signature.
      expect(verifyReceipt({ ...r.payload, attemptId: "00000000-0000-0000-0000-000000000000" }, r.signature, h.env.receiptKey)).toBe(false);
    }
    const [final] = await h.sql<{ n: number }[]>`select count(*)::int as n from public.verification_receipts where tournament_id = ${tournamentId} and layer_key = 'final-mission'`;
    expect(final.n).toBe(1);
  });

  it("keeps eliminated teams building: they can't attempt layers but can still submit to the event", async () => {
    expect(await rpcError(teams.draco.client, "submit_attempt", { p_id: tournamentId, p_layer_key: "final-mission" })).toMatch(/not running|no longer competing/);
    const id = await rpc<string>(teams.draco.client, "save_submission", { p_event: eventId, p_track: "build", p_title: "Draco's project", p_fields: { description: "Still shipping" } });
    const receipt = await rpc<string>(teams.draco.client, "finalise_submission", { p_submission: id });
    expect(receipt).toMatch(/^[0-9A-F]{10}$/);
  });

  it("lets organisers inspect evidence, reinstate a team and override a decision, with an audit trail", async () => {
    const [attempt] = await h.sql<{ id: string }[]>`select a.id from public.verification_attempts a join public.tournament_participants tp on tp.id = a.participant_id where a.tournament_id = ${tournamentId} and tp.display_name = 'Borealis' and a.status = 'failed' limit 1`;
    const evidence = await rpc<Record<string, unknown>>(organiser, "attempt_evidence", { p_attempt: attempt.id });
    expect(evidence.plugin).toBe("memory.multiturn");
    expect(await rpcError(teams.borealis.client, "attempt_evidence", { p_attempt: attempt.id })).toMatch(/Only organisers/);

    const [borealis] = await h.sql<{ id: string }[]>`select id from public.tournament_participants where tournament_id = ${tournamentId} and display_name = 'Borealis'`;
    expect(await rpcError(organiser, "reinstate_participant", { p_participant: borealis.id, p_reason: "" })).toMatch(/reason/);
    await rpc(organiser, "reinstate_participant", { p_participant: borealis.id, p_reason: "Dispute upheld: verifier outage at 14:05" });
    const [after] = await h.sql<{ state: string }[]>`select state from public.tournament_participants where id = ${borealis.id}`;
    expect(after.state).toBe("active");
    const audit = await h.sql<{ action: string }[]>`select action from public.audit_logs where target_id = ${borealis.id}`;
    expect(audit.map((a) => a.action)).toContain("participant.reinstate");
    // Participants can't do organiser actions.
    expect(await rpcError(teams.atlas.client, "reinstate_participant", { p_participant: borealis.id, p_reason: "please" })).toMatch(/Only organisers/);
  });

  it("shows spectators public state only", async () => {
    const { data: t } = await h.anon.from("tournaments").select("name, status").eq("id", tournamentId);
    expect(t?.[0]?.status).toBe("completed");
    const { data: feed } = await h.anon.from("activity_events").select("kind, is_public").eq("tournament_id", tournamentId);
    expect(feed?.length).toBeGreaterThan(10);
    expect(feed?.every((e) => e.is_public)).toBe(true);
    const { data: attempts } = await h.anon.from("verification_attempts").select("id").limit(1);
    expect(attempts ?? []).toEqual([]);
  });

  it("is safe to re-run finalisation and to run schedulers concurrently", async () => {
    const runs = await h.sql<{ id: string }[]>`select id from public.layer_runs where tournament_id = ${tournamentId}`;
    const before = await h.sql<{ n: number }[]>`select count(*)::int as n from public.advancement_decisions where tournament_id = ${tournamentId}`;
    for (const r of runs) expect(await finaliseLayer(h.sql, r.id)).toBe("skipped");
    const ticks = await Promise.all([runTick(h), runTick(h), runTick(h)]);
    expect(ticks.filter((t) => t.ran).length).toBeGreaterThanOrEqual(1);
    const after = await h.sql<{ n: number }[]>`select count(*)::int as n from public.advancement_decisions where tournament_id = ${tournamentId}`;
    expect(after[0].n).toBe(before[0].n);
  });
});
