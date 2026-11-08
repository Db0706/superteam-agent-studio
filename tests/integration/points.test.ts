import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hackathonTemplate, pointsRaceTemplate } from "@/core/tournament/templates";
import { configHash, drainJobs, eventSlug, rpc, rpcError, runTick, signedInUser, startHarness, validated, type Harness } from "./harness";

/**
 * Points race and live leaderboard: build stages and challenges verified for real, points as soon
 * as a pass is verified, on-the-day points changes and awards, Cambridge vs Oxford averages,
 * finalists.
 */

let h: Harness;
let eventId: string;
let tournamentId: string;
let organiser: SupabaseClient;
const teams: Record<string, { client: SupabaseClient; teamId: string }> = {};

const DEVNET_ADDRESS = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
type Row = { team_name: string; university: string; points: number; build_done: number; build_total: number; challenges_done: number; award_points: number };

async function board(client: SupabaseClient): Promise<Record<string, Row>> {
  const rows = await rpc<Row[]>(client, "event_leaderboard", { p_event: eventId });
  return Object.fromEntries(rows.map((r) => [r.team_name, r]));
}

beforeAll(async () => {
  h = await startHarness({ scope: "points" });
  const [ev] = await h.sql<{ id: string }[]>`
    insert into public.events (slug, name, short_name, status, starts_at, details)
    values (${eventSlug(h)}, 'Points Test', 'Points', 'published', now(), '{}') returning id`;
  eventId = ev.id;
  await h.sql`insert into public.event_tracks (event_id, track, name, status) values (${eventId}, 'build', 'Build Track', 'confirmed')`;
  const org = await signedInUser(h, "organiser");
  await h.sql`insert into public.event_roles (event_id, user_id, role) values (${eventId}, ${org.id}, 'organiser')`;
  organiser = org.client;

  for (const [name, uni] of [["Kings", "University of Cambridge"], ["Trinity", "Cambridge"], ["Balliol", "University of Oxford"]] as const) {
    await h.sql`insert into public.registrations (event_id, email, full_name, ticket, status, university) values (${eventId}, ${`${name.toLowerCase()}@${h.domain}`}, ${name}, 'hackathon', 'approved', ${uni})`;
    const u = await signedInUser(h, name.toLowerCase());
    const teamId = await rpc<string>(u.client, "create_team", { p_event: eventId, p_name: name, p_track: "build" });
    await rpc(u.client, "update_project", { p_team: teamId, p_name: name, p_repo: null, p_demo: null, p_endpoint: `${h.host.url}/api/race/fixtures/reference` });
    teams[name] = { client: u.client, teamId };
  }

  const cfg = pointsRaceTemplate({ name: "Points race", sprintSeconds: 3600, challengeIntervalSeconds: 600 });
  const payment = cfg.layers.find((l) => l.key === "onchain-payment")!;
  payment.verifier.config = { ...payment.verifier.config, payTo: DEVNET_ADDRESS };
  const config = validated(cfg);
  tournamentId = await rpc<string>(organiser, "create_tournament", { p_event: eventId, p_name: config.name, p_config: config });
  await rpc(organiser, "publish_tournament", { p_id: tournamentId, p_config: config, p_hash: configHash(config), p_note: "points" });
  for (const t of Object.values(teams)) await rpc(t.client, "join_tournament", { p_id: tournamentId });
  await rpc(organiser, "schedule_tournament", { p_id: tournamentId, p_starts_at: new Date().toISOString() });
  await runTick(h);
});

afterAll(async () => {
  await h?.close();
});

describe("points race", () => {
  it("is a checkpoint race whose build stages are all open from the start", async () => {
    const open = await h.sql<{ layer_key: string }[]>`select layer_key from public.layer_runs where tournament_id = ${tournamentId} and state = 'open' order by position`;
    expect(open.map((r) => r.layer_key)).toEqual(["structured-outputs", "app-live", "idea-locked", "ai-feature", "agent-tools", "onchain-payment", "submitted"]);
  });

  it("scores build stages and challenges as soon as they're verified", async () => {
    const { client: kings } = teams.Kings;
    // Idea stage fails without a draft, then passes once the draft exists.
    await rpc(kings, "submit_attempt", { p_id: tournamentId, p_layer_key: "idea-locked", p_request_id: "idea-1" });
    await drainJobs(h);
    expect((await board(organiser)).Kings.points).toBe(0);
    await rpc(kings, "save_submission", { p_event: eventId, p_track: "build", p_title: "Lab notebook agent", p_fields: { problem: "Researchers lose hours re-finding results buried in old lab notebooks and email threads." } });
    await h.sql`update public.verification_attempts set submitted_at = submitted_at - interval '1 minute' where request_id = 'idea-1'`;
    for (const [key, id] of [["idea-locked", "idea-2"], ["app-live", "live-1"], ["ai-feature", "ai-1"], ["structured-outputs", "so-1"]]) {
      await rpc(kings, "submit_attempt", { p_id: tournamentId, p_layer_key: key, p_request_id: id });
    }
    await rpc(teams.Balliol.client, "submit_attempt", { p_id: tournamentId, p_layer_key: "app-live", p_request_id: "b-live" });
    await drainJobs(h);

    const b = await board(organiser);
    expect(b.Kings).toMatchObject({ points: 50 + 50 + 100 + 100, build_done: 3, build_total: 6, challenges_done: 1 });
    expect(b.Balliol.points).toBe(50);
    expect(b.Trinity.points).toBe(0);
    // A second pass of the same stage doesn't score twice.
    await h.sql`update public.verification_attempts set submitted_at = submitted_at - interval '1 minute' where request_id = 'live-1'`;
    await rpc(kings, "submit_attempt", { p_id: tournamentId, p_layer_key: "app-live", p_request_id: "live-2" });
    await drainJobs(h);
    expect((await board(organiser)).Kings.points).toBe(300);
  });

  it("lets a team formed after the start enter the race and score", async () => {
    await h.sql`insert into public.registrations (event_id, email, full_name, ticket, status, university) values (${eventId}, ${`exeter@${h.domain}`}, 'Exeter', 'hackathon', 'approved', 'University of Oxford')`;
    const u = await signedInUser(h, "exeter");
    const teamId = await rpc<string>(u.client, "create_team", { p_event: eventId, p_name: "Exeter", p_track: "build" });
    await rpc(u.client, "update_project", { p_team: teamId, p_name: "Exeter", p_repo: null, p_demo: null, p_endpoint: `${h.host.url}/api/race/fixtures/reference` });
    const [t] = await h.sql<{ status: string }[]>`select status from public.tournaments where id = ${tournamentId}`;
    expect(t.status).toBe("running");
    await rpc(u.client, "join_tournament", { p_id: tournamentId });
    await rpc(u.client, "submit_attempt", { p_id: tournamentId, p_layer_key: "app-live" });
    await drainJobs(h);
    expect((await board(u.client)).Exeter.points).toBe(50);
  });

  it("lets a team with no app URL attempt on-chain challenges, but not app layers", async () => {
    const cfg = validated(hackathonTemplate({
      name: "Chain test", sprintSeconds: 3600, challengeWindowSeconds: 3600, payTo: DEVNET_ADDRESS,
      onchain: { programId: "B3aSCgNhYqukoMrhsUa6tWctG8rhqMJBqC6mKAbE2eV8", credMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", presentationAccount: "G5Tu25otWo8kTaSACmTvx68YMoj6e6stn2ad7TM19VvZ", salt: "s" },
    }));
    const tid = await rpc<string>(organiser, "create_tournament", { p_event: eventId, p_name: cfg.name, p_config: cfg });
    await rpc(organiser, "publish_tournament", { p_id: tid, p_config: cfg, p_hash: configHash(cfg), p_note: "chain" });
    await h.sql`insert into public.registrations (event_id, email, full_name, ticket, status, university) values (${eventId}, ${`chainonly@${h.domain}`}, 'Chain Only', 'hackathon', 'approved', 'Cambridge')`;
    const u = await signedInUser(h, "chainonly");
    const teamId = await rpc<string>(u.client, "create_team", { p_event: eventId, p_name: "Chain Only", p_track: "build" });
    await rpc(u.client, "set_project_wallet", { p_team: teamId, p_wallet: DEVNET_ADDRESS });
    expect(await rpcError(u.client, "set_project_wallet", { p_team: teamId, p_wallet: "not-a-wallet" })).toMatch(/isn't a Solana address/);
    await rpc(u.client, "join_tournament", { p_id: tid });
    await rpc(organiser, "schedule_tournament", { p_id: tid, p_starts_at: new Date().toISOString() });
    await runTick(h);
    const attempt = await rpc<string>(u.client, "submit_attempt", { p_id: tid, p_layer_key: "operation-1" });
    const [a] = await h.sql<{ endpoint_url: string }[]>`select endpoint_url from public.verification_attempts where id = ${attempt}`;
    expect(a.endpoint_url).toBe("onchain:");
    expect(await rpcError(u.client, "submit_attempt", { p_id: tid, p_layer_key: "app-live" })).toMatch(/Add your app's URL/);
    await h.sql`delete from public.verification_jobs where attempt_id = ${attempt}`;
    await rpc(organiser, "cancel_tournament", { p_id: tid, p_reason: "test done" });
  });

  it("works out each team's university and is public", async () => {
    const b = await board(h.anon);
    expect(b.Kings.university).toBe("cambridge");
    expect(b.Trinity.university).toBe("cambridge");
    expect(b.Balliol.university).toBe("oxford");
    expect(await rpcError(teams.Kings.client, "set_team_university", { p_team: teams.Balliol.teamId, p_university: "cambridge" })).toMatch(/organiser/i);
    await rpc(organiser, "set_team_university", { p_team: teams.Trinity.teamId, p_university: "mixed" });
    expect((await board(h.anon)).Trinity.university).toBe("mixed");
    await rpc(organiser, "set_team_university", { p_team: teams.Trinity.teamId, p_university: null });
  });

  it("lets organisers change points and award points on the day", async () => {
    await rpc(organiser, "set_layer_points", { p_tournament: tournamentId, p_layer_key: "app-live", p_points: 80 });
    expect((await board(organiser)).Kings.points).toBe(330);
    expect((await board(organiser)).Balliol.points).toBe(80);
    expect(await rpcError(teams.Kings.client, "award_points", { p_event: eventId, p_team: teams.Kings.teamId, p_points: 500, p_label: "Self-award", p_reason: "" })).toMatch(/organiser/i);
    const award = await rpc<string>(organiser, "award_points", { p_event: eventId, p_team: teams.Trinity.teamId, p_points: 250, p_label: "Escape room: Assembly", p_reason: "Lockbox opened" });
    expect((await board(h.anon)).Trinity).toMatchObject({ points: 250, award_points: 250 });
    await rpc(organiser, "revoke_award", { p_award: award, p_reason: "Wrong team" });
    expect((await board(organiser)).Trinity.points).toBe(0);
    const [{ n }] = await h.sql<{ n: number }[]>`select count(*)::int as n from public.audit_logs where event_id = ${eventId} and action in ('layer.points', 'points.award', 'points.revoke')`;
    expect(n).toBe(3);
  });

  it("confirms finalists in order, for organisers only, visible to everyone", async () => {
    expect(await rpcError(teams.Kings.client, "confirm_finalists", { p_event: eventId, p_teams: [teams.Kings.teamId] })).toMatch(/organiser/i);
    expect(await rpcError(organiser, "confirm_finalists", { p_event: eventId, p_teams: [teams.Kings.teamId, teams.Kings.teamId] })).toMatch(/twice/);
    await rpc(organiser, "confirm_finalists", { p_event: eventId, p_teams: [teams.Kings.teamId, teams.Balliol.teamId] });
    const { data } = await h.anon.from("finalists").select("team_id, rank, points").eq("event_id", eventId).order("rank");
    expect(data).toEqual([
      { team_id: teams.Kings.teamId, rank: 1, points: 330 },
      { team_id: teams.Balliol.teamId, rank: 2, points: 80 },
    ]);
    await rpc(organiser, "clear_finalists", { p_event: eventId });
    const { data: none } = await h.anon.from("finalists").select("team_id").eq("event_id", eventId);
    expect(none).toEqual([]);
  });
});
