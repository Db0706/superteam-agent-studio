import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventSlug, rpc, rpcError, signedInUser, startHarness, type Harness } from "./harness";

/**
 * Event operations and permissions against the real database: submissions, mentor support,
 * judging and winners, plus the checks that stop participants doing organiser things.
 */

let h: Harness;
let eventId: string;
let organiser: SupabaseClient;
let alice: { id: string; client: SupabaseClient };
let bob: { id: string; client: SupabaseClient };
let judgeA: { id: string; client: SupabaseClient };
let judgeB: { id: string; client: SupabaseClient };
let mentor: { id: string; client: SupabaseClient };
let aliceTeam: string;
let bobTeam: string;
let aliceSub: string;
let bobSub: string;

const RUBRIC = [
  { key: "impact", name: "Impact", description: "", weight: 60, max: 10 },
  { key: "execution", name: "Execution", description: "", weight: 40, max: 10 },
];
const buildFields = { problem: "p", description: "d", repo: "https://github.com/x/y", architecture: "a", aiCapabilities: "ai" };

beforeAll(async () => {
  h = await startHarness({ scope: "ops" });
  const [ev] = await h.sql<{ id: string }[]>`
    insert into public.events (slug, name, short_name, status, starts_at, details)
    values (${eventSlug(h)}, 'Ops Test Event', 'Ops Test', 'published', now(), '{}') returning id`;
  eventId = ev.id;
  await h.sql`insert into public.event_tracks (event_id, track, name, status) values (${eventId}, 'build', 'Build Track', 'confirmed'), (${eventId}, 'policy', 'Policy Track', 'confirmed')`;
  for (const n of ["alice", "bob"]) {
    await h.sql`insert into public.registrations (event_id, email, full_name, ticket, status) values (${eventId}, ${`${n}@${h.domain}`}, ${n}, 'hackathon', 'approved')`;
  }
  const org = await signedInUser(h, "organiser");
  await h.sql`insert into public.event_roles (event_id, user_id, role) values (${eventId}, ${org.id}, 'organiser')`;
  organiser = org.client;
  alice = await signedInUser(h, "alice");
  bob = await signedInUser(h, "bob");
  judgeA = await signedInUser(h, "judge-a");
  judgeB = await signedInUser(h, "judge-b");
  mentor = await signedInUser(h, "mentor");
  for (const [email, role] of [[`judge-a@${h.domain}`, "judge"], [`judge-b@${h.domain}`, "judge"], [`mentor@${h.domain}`, "mentor"]]) {
    await rpc(organiser, "set_event_role", { p_event: eventId, p_email: email, p_role: role, p_grant: true });
  }
  aliceTeam = await rpc<string>(alice.client, "create_team", { p_event: eventId, p_name: "Alpha", p_track: "build" });
  bobTeam = await rpc<string>(bob.client, "create_team", { p_event: eventId, p_name: "Bravo", p_track: "build" });
});

afterAll(async () => {
  await h?.close();
});

describe("permissions", () => {
  it("blocks internal helpers and direct writes", async () => {
    expect(await rpcError(alice.client, "emit", { p_event: eventId, p_tournament: null, p_kind: "x", p_public: true, p_payload: {} })).toMatch(/permission|not find|function/i);
    expect(await rpcError(alice.client, "write_audit", { p_event: eventId, p_action: "x", p_type: "x", p_target: "x", p_details: {} })).toMatch(/permission|not find|function/i);
    const { error } = await alice.client.from("judging_rubrics").update({ status: "confirmed" }).eq("event_id", eventId);
    const { data } = await h.sql`select count(*)::int as n from public.judging_rubrics where event_id = ${eventId} and status = 'confirmed'`.then((r) => ({ data: r }));
    expect(error || data[0].n === 0).toBeTruthy();
    const { error: subErr } = await alice.client.from("submissions").insert({ event_id: eventId, team_id: aliceTeam, track: "build" });
    expect(subErr).not.toBeNull();
  });

  it("only exposes read helpers to anonymous callers", async () => {
    const open = await h.sql<{ proname: string }[]>`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1`;
    const allowed = ["event_leaderboard", "has_event_role", "is_organiser", "is_platform_admin", "is_team_member", "owns_participant", "server_now", "team_university"];
    expect(open.map((r) => r.proname).filter((n) => !allowed.includes(n))).toEqual([]);
    expect(await rpcError(h.anon, "create_team", { p_event: eventId, p_name: "x", p_track: "build" })).toMatch(/permission denied/);
  });

  it("keeps organiser actions for organisers", async () => {
    expect(await rpcError(alice.client, "set_event_role", { p_event: eventId, p_email: `alice@${h.domain}`, p_role: "organiser", p_grant: true })).toMatch(/organiser/i);
    expect(await rpcError(alice.client, "import_registrations", { p_event: eventId, p_rows: [] })).toMatch(/organiser/i);
    expect(await rpcError(alice.client, "save_rubric", { p_event: eventId, p_track: "build", p_name: "x", p_criteria: RUBRIC, p_confirm: true })).toMatch(/organiser/i);
    expect(await rpcError(judgeA.client, "publish_announcement", { p_event: eventId, p_title: "x", p_body: "", p_audience: "everyone" })).toMatch(/organiser/i);
  });

  it("hides other teams' data", async () => {
    const { data } = await bob.client.from("teams").select("id, name").eq("event_id", eventId);
    const { data: projects } = await bob.client.from("projects").select("team_id").eq("team_id", aliceTeam);
    expect(projects ?? []).toHaveLength(0);
    expect((data ?? []).some((t) => t.id === bobTeam)).toBe(true);
  });
});

describe("submissions", () => {
  it("saves drafts, finalises with a receipt and locks", async () => {
    aliceSub = await rpc<string>(alice.client, "save_submission", { p_event: eventId, p_track: "build", p_title: "Alpha app", p_fields: buildFields });
    bobSub = await rpc<string>(bob.client, "save_submission", { p_event: eventId, p_track: "build", p_title: "Bravo app", p_fields: buildFields });
    const code = await rpc<string>(alice.client, "finalise_submission", { p_submission: aliceSub });
    expect(code).toMatch(/^[0-9A-F]{10}$/);
    expect(await rpcError(alice.client, "save_submission", { p_event: eventId, p_track: "build", p_title: "changed", p_fields: buildFields })).toMatch(/final/i);
    const { data: other } = await bob.client.from("submissions").select("id").eq("id", aliceSub);
    expect(other ?? []).toHaveLength(0);
  });

  it("lets organisers reopen with an audited reason", async () => {
    await rpc(organiser, "reopen_submission", { p_submission: aliceSub, p_reason: "Wrong repo link" });
    await rpc(alice.client, "save_submission", { p_event: eventId, p_track: "build", p_title: "Alpha app v2", p_fields: buildFields });
    await rpc(alice.client, "finalise_submission", { p_submission: aliceSub });
    await rpc(bob.client, "finalise_submission", { p_submission: bobSub });
    const [audit] = await h.sql`select details from public.audit_logs where event_id = ${eventId} and action = 'submission.reopen'`;
    expect(audit.details.reason).toBe("Wrong repo link");
    expect(await rpcError(bob.client, "reopen_submission", { p_submission: aliceSub, p_reason: "x" })).toMatch(/organiser/i);
  });
});

describe("mentor support", () => {
  it("runs a request from open to resolved", async () => {
    const id = await rpc<string>(alice.client, "request_mentor", { p_event: eventId, p_category: "ai", p_description: "Model keeps timing out", p_location: "Table 4" });
    expect(await rpcError(bob.client, "update_mentor_request", { p_id: id, p_action: "claim", p_note: "" })).toMatch(/mentor/i);
    await rpc(mentor.client, "update_mentor_request", { p_id: id, p_action: "claim", p_note: "On my way" });
    await rpc(mentor.client, "update_mentor_request", { p_id: id, p_action: "resolve", p_note: "Added a timeout and retry" });
    const [r] = await h.sql`select status, claimed_by, resolved_at, jsonb_array_length(notes) as n from public.mentor_requests where id = ${id}`;
    expect(r.status).toBe("resolved");
    expect(r.claimed_by).toBe(mentor.id);
    expect(r.resolved_at).not.toBeNull();
    expect(r.n).toBe(2);
    const { data: seen } = await bob.client.from("mentor_requests").select("id").eq("id", id);
    expect(seen ?? []).toHaveLength(0);
  });
});

describe("judging", () => {
  let aA: string; // judge A on Alice
  let aB: string; // judge B on Alice
  let bA: string; // judge A on Bob

  it("validates rubrics", async () => {
    expect(await rpcError(organiser, "save_rubric", { p_event: eventId, p_track: "build", p_name: "x", p_criteria: [{ ...RUBRIC[0], weight: 50 }, RUBRIC[1]], p_confirm: false })).toMatch(/add up to 100/);
    expect(await rpcError(organiser, "save_rubric", { p_event: eventId, p_track: "build", p_name: "x", p_criteria: [RUBRIC[0], { ...RUBRIC[1], key: "impact" }], p_confirm: false })).toMatch(/unique/);
    await rpc(organiser, "save_rubric", { p_event: eventId, p_track: "build", p_name: "Build", p_criteria: RUBRIC, p_confirm: false });
  });

  it("assigns only real judges, and judges only see their own work", async () => {
    expect(await rpcError(organiser, "assign_judge", { p_event: eventId, p_judge: alice.id, p_submission: bobSub })).toMatch(/not a judge/);
    aA = await rpc<string>(organiser, "assign_judge", { p_event: eventId, p_judge: judgeA.id, p_submission: aliceSub });
    aB = await rpc<string>(organiser, "assign_judge", { p_event: eventId, p_judge: judgeB.id, p_submission: aliceSub });
    bA = await rpc<string>(organiser, "assign_judge", { p_event: eventId, p_judge: judgeA.id, p_submission: bobSub });
    const { data: bSubs } = await judgeB.client.from("submissions").select("id").eq("event_id", eventId);
    expect((bSubs ?? []).map((x) => x.id)).toEqual([aliceSub]);
    expect(await rpcError(judgeB.client, "save_judging_score", { p_assignment: aA, p_scores: { impact: 5 }, p_comments: "", p_final: false })).toMatch(/not your/);
  });

  it("checks scores against the rubric and keeps judges independent", async () => {
    expect(await rpcError(judgeA.client, "save_judging_score", { p_assignment: aA, p_scores: { impact: 11 }, p_comments: "", p_final: false })).toMatch(/range/);
    expect(await rpcError(judgeA.client, "save_judging_score", { p_assignment: aA, p_scores: { invented: 3 }, p_comments: "", p_final: false })).toMatch(/range/);
    expect(await rpcError(judgeA.client, "save_judging_score", { p_assignment: aA, p_scores: { impact: 8 }, p_comments: "", p_final: true })).toMatch(/every criterion/);
    await rpc(judgeA.client, "save_judging_score", { p_assignment: aA, p_scores: { impact: 8, execution: 6 }, p_comments: "Strong", p_final: true });
    await rpc(judgeB.client, "save_judging_score", { p_assignment: aB, p_scores: { impact: 6, execution: 9 }, p_comments: "", p_final: true });
    await rpc(judgeA.client, "save_judging_score", { p_assignment: bA, p_scores: { impact: 4, execution: 5 }, p_comments: "", p_final: true });
    const { data: bScores } = await judgeB.client.from("judging_scores").select("assignment_id");
    expect((bScores ?? []).map((x) => x.assignment_id)).toEqual([aB]);
    expect(await rpcError(judgeA.client, "save_judging_score", { p_assignment: aA, p_scores: { impact: 1, execution: 1 }, p_comments: "", p_final: false })).toMatch(/already submitted/);
    const { data: all } = await organiser.from("judging_scores").select("assignment_id").eq("event_id", eventId);
    expect(all ?? []).toHaveLength(3);
  });

  it("locks criteria once final scores exist, until reopened", async () => {
    const changed = [{ ...RUBRIC[0], weight: 50 }, { ...RUBRIC[1], weight: 50 }];
    expect(await rpcError(organiser, "save_rubric", { p_event: eventId, p_track: "build", p_name: "Build", p_criteria: changed, p_confirm: true })).toMatch(/final scores/);
    await rpc(organiser, "resolve_judging", { p_assignment: aA, p_action: "reopen", p_note: "" });
    const [s] = await h.sql`select final from public.judging_scores where assignment_id = ${aA}`;
    expect(s.final).toBe(false);
    await rpc(judgeA.client, "save_judging_score", { p_assignment: aA, p_scores: { impact: 8, execution: 6 }, p_comments: "Strong", p_final: true });
  });

  it("handles conflicts and clarifications", async () => {
    const extra = await signedInUser(h, "judge-c");
    await rpc(organiser, "set_event_role", { p_event: eventId, p_email: `judge-c@${h.domain}`, p_role: "judge", p_grant: true });
    const cA = await rpc<string>(organiser, "assign_judge", { p_event: eventId, p_judge: extra.id, p_submission: bobSub });
    await rpc(extra.client, "flag_judging", { p_assignment: cA, p_kind: "conflict", p_note: "I mentored this team" });
    expect(await rpcError(extra.client, "save_judging_score", { p_assignment: cA, p_scores: { impact: 10, execution: 10 }, p_comments: "", p_final: true })).toMatch(/conflict/);
    await rpc(organiser, "unassign_judge", { p_assignment: cA });
    const [{ n }] = await h.sql`select count(*)::int as n from public.judge_assignments where id = ${cA}`;
    expect(n).toBe(0);
  });

  it("publishes winners only from confirmed criteria and final submissions", async () => {
    expect(await rpcError(organiser, "publish_winner", { p_event: eventId, p_track: "build", p_submission: aliceSub, p_place: 1, p_title: "Best build" })).toMatch(/Confirm/);
    await rpc(organiser, "save_rubric", { p_event: eventId, p_track: "build", p_name: "Build", p_criteria: RUBRIC, p_confirm: true });
    expect(await rpcError(alice.client, "publish_winner", { p_event: eventId, p_track: "build", p_submission: aliceSub, p_place: 1, p_title: "Me" })).toMatch(/organiser/i);
    expect(await rpcError(organiser, "publish_winner", { p_event: eventId, p_track: "policy", p_submission: aliceSub, p_place: 1, p_title: "x" })).toMatch(/not in this track/);
    await rpc(organiser, "publish_winner", { p_event: eventId, p_track: "build", p_submission: aliceSub, p_place: 1, p_title: "Best build" });
    expect(await rpcError(organiser, "publish_winner", { p_event: eventId, p_track: "build", p_submission: aliceSub, p_place: 2, p_title: "x" })).toMatch(/another place/);
    const { data: publicWinners } = await bob.client.from("winners").select("place, submission_id").eq("event_id", eventId);
    expect(publicWinners).toEqual([{ place: 1, submission_id: aliceSub }]);
    const [act] = await h.sql`select payload from public.activity_events where event_id = ${eventId} and kind = 'winner.published'`;
    expect(act.payload.team).toBe("Alpha");
    await rpc(organiser, "unpublish_winner", { p_event: eventId, p_track: "build", p_place: 1 });
    const { data: after } = await bob.client.from("winners").select("place").eq("event_id", eventId);
    expect(after ?? []).toHaveLength(0);
  });
});
