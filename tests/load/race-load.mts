/**
 * Load test: a full room racing at once, against the local Supabase stack.
 *
 *   npm run test:load                      # 300 participants in 75 teams, 3 layers
 *   LOAD_TEAMS=40 LOAD_LAYERS=2 npm run test:load
 *
 * Every participant is a real signed-in user polling the same reads the race page makes (through RLS)
 * every POLL_MS. At each layer every team submits within a second of each other, verification runs
 * on WORKERS in-process workers against fixture apps (real HTTP, real verifier), then the layer is
 * finalised. Reports latency percentiles and fails if the thresholds below are missed.
 * Stop any running worker first: it would take this test's jobs.
 */
import { performance } from "node:perf_hooks";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { aiRaceTemplate } from "@/core/tournament/templates";
import { finaliseLayer, tick } from "@/server/engine/scheduler";
import { ANON_KEY, API_URL, configHash, drainJobs, endLayer, eventSlug, rpc, signedInUser, startHarness, validated } from "../integration/harness";

const TEAMS = Number(process.env.LOAD_TEAMS ?? 75);
const PER_TEAM = 4;
const LAYERS = Number(process.env.LOAD_LAYERS ?? 3);
const WORKERS = Number(process.env.LOAD_WORKERS ?? 8);
const POLL_MS = 5000;
const THRESHOLDS = { readP95Ms: 750, submitP95Ms: 1000, drainSecondsPerLayer: 120, finaliseSeconds: 10 };

const latencies: Record<string, number[]> = { read: [], submit: [] };
const errors: string[] = [];
const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
};
const timed = async <T,>(bucket: string, fn: () => PromiseLike<T>): Promise<T> => {
  const t = performance.now();
  try {
    return await fn();
  } finally {
    latencies[bucket].push(performance.now() - t);
  }
};

const h = await startHarness({ scope: "load" });
const log = (m: string) => console.log(`[load ${new Date().toISOString().slice(11, 19)}] ${m}`);
try {
  const [ev] = await h.sql<{ id: string }[]>`
    insert into public.events (slug, name, short_name, status, starts_at, details)
    values (${eventSlug(h)}, 'Load Test', 'Load', 'published', now(), '{}') returning id`;
  const eventId = ev.id;
  const org = await signedInUser(h, "organiser");
  await h.sql`insert into public.event_roles (event_id, user_id, role) values (${eventId}, ${org.id}, 'organiser')`;
  await h.sql`
    insert into public.registrations (event_id, email, full_name, ticket, status)
    select ${eventId}, 'p' || g || '@load.test', 'Participant ' || g, 'hackathon', 'approved' from generate_series(1, ${TEAMS * PER_TEAM}) g`;

  log(`signing in ${TEAMS * PER_TEAM} participants`);
  const users: { client: SupabaseClient; id: string; team?: string }[] = [];
  for (let i = 0; i < TEAMS * PER_TEAM; i += 20) {
    const batch = await Promise.all(Array.from({ length: Math.min(20, TEAMS * PER_TEAM - i) }, (_, k) => signedInUser(h, `p${i + k + 1}`)));
    // One process stands in for 300 browsers. supabase-js serialises session reads behind a
    // process-wide auth lock, which would queue every simulated user behind the others, so each
    // gets a client that sends its access token directly, as its own browser effectively would.
    for (const u of batch) {
      const token = (await u.client.auth.getSession()).data.session!.access_token;
      users.push({ client: createClient(API_URL, ANON_KEY, { accessToken: async () => token }), id: u.id });
    }
  }

  log(`forming ${TEAMS} teams`);
  // A mix of apps: most pass, some fail for real reasons, so finalisation has eliminations to decide.
  const variants = ["reference", "reference", "reference", "no-memory", "fragile", "fabricator"];
  const captains: { client: SupabaseClient; teamId: string }[] = [];
  await Promise.all(
    Array.from({ length: TEAMS }, async (_, t) => {
      const captain = users[t * PER_TEAM];
      const teamId = await rpc<string>(captain.client, "create_team", { p_event: eventId, p_name: `Team ${t + 1}`, p_track: "build" });
      const variant = variants[t % variants.length];
      await rpc(captain.client, "update_project", { p_team: teamId, p_name: `team-${t + 1}`, p_repo: null, p_demo: null, p_endpoint: `${h.host.url}/api/race/fixtures/${variant}` });
      const invite = await rpc<string>(captain.client, "create_team_invite", { p_team: teamId });
      for (let m = 1; m < PER_TEAM; m++) {
        const member = users[t * PER_TEAM + m];
        await rpc(member.client, "join_team", { p_code: invite });
        member.team = teamId;
      }
      captain.team = teamId;
      captains.push({ client: captain.client, teamId });
    }),
  );

  const config = validated(aiRaceTemplate({ name: "Load race", intervalSeconds: 1800, layers: LAYERS }));
  const tournamentId = await rpc<string>(org.client, "create_tournament", { p_event: eventId, p_name: config.name, p_config: config });
  await rpc(org.client, "publish_tournament", { p_id: tournamentId, p_config: config, p_hash: configHash(config), p_note: "load" });
  await Promise.all(captains.map((c) => rpc(c.client, "join_tournament", { p_id: tournamentId })));
  await rpc(org.client, "schedule_tournament", { p_id: tournamentId, p_starts_at: new Date().toISOString() });
  await tick(h.sql, undefined, { closingGraceSeconds: 0 });

  // Everyone polls the race page's reads for the whole run.
  let polling = true;
  const poll = async (u: (typeof users)[number], offset: number) => {
    await new Promise((r) => setTimeout(r, offset));
    while (polling) {
      try {
        await timed("read", async () => {
          const s = u.client;
          const [{ error: e1 }, { error: e2 }, { data: parts, error: e3 }, { error: e4 }] = await Promise.all([
            s.from("tournaments").select("id, status, current_version").eq("id", tournamentId).maybeSingle(),
            s.from("layer_runs").select("id, layer_key, position, state, opens_at, deadline_at").eq("tournament_id", tournamentId).order("position"),
            s.from("tournament_participants").select("id, team_id, state").eq("tournament_id", tournamentId),
            s.from("activity_events").select("id, kind, payload").eq("tournament_id", tournamentId).eq("is_public", true).order("id", { ascending: false }).limit(25),
          ]);
          const mine = parts?.find((p) => p.team_id === u.team);
          const { error: e5 } = mine ? await s.from("verification_attempts").select("id, status, score, feedback").eq("participant_id", mine.id).limit(60) : { error: null };
          const err = e1 ?? e2 ?? e3 ?? e4 ?? e5;
          if (err) throw new Error(err.message);
        });
      } catch (e) {
        errors.push(`read: ${(e as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  };
  const pollers = users.map((u, i) => poll(u, (i * POLL_MS) / users.length));

  const layerReport: string[] = [];
  for (const layer of config.layers) {
    const competing = await h.sql<{ team_id: string }[]>`select team_id from public.tournament_participants where tournament_id = ${tournamentId} and state in ('active', 'qualified')`;
    const ids = new Set(competing.map((c) => c.team_id));
    const racing = captains.filter((c) => ids.has(c.teamId));
    log(`${layer.key}: ${racing.length} teams submit`);
    await Promise.all(
      racing.map((c, i) =>
        timed("submit", () => rpc(c.client, "submit_attempt", { p_id: tournamentId, p_layer_key: layer.key, p_request_id: `load-${layer.key}-${i}` })).catch((e: Error) => {
          errors.push(`submit: ${e.message}`);
        }),
      ),
    );
    const t0 = performance.now();
    const processed = await drainJobs(h, WORKERS);
    const drainS = (performance.now() - t0) / 1000;
    const [{ errors: jobErrors }] = await h.sql<{ errors: number }[]>`
      select count(*)::int as errors from public.verification_attempts a join public.layer_runs r on r.id = a.layer_run_id
      where r.tournament_id = ${tournamentId} and r.layer_key = ${layer.key} and a.status = 'error'`;
    if (jobErrors) errors.push(`${layer.key}: ${jobErrors} attempts ended in ERROR (infrastructure)`);
    await endLayer(h, tournamentId, layer.key);
    const [run] = await h.sql<{ id: string }[]>`select id from public.layer_runs where tournament_id = ${tournamentId} and layer_key = ${layer.key}`;
    await h.sql`update public.layer_runs set state = 'finalising' where id = ${run.id} and state in ('open', 'closing')`;
    const t1 = performance.now();
    await finaliseLayer(h.sql, run.id);
    const finaliseS = (performance.now() - t1) / 1000;
    await tick(h.sql, undefined, { closingGraceSeconds: 0 });
    const [d] = await h.sql<{ qualified: number; eliminated: number }[]>`
      select count(*) filter (where decision = 'qualified')::int as qualified, count(*) filter (where decision = 'eliminated')::int as eliminated
      from public.advancement_decisions where layer_run_id = ${run.id}`;
    const line = `${layer.key}: ${processed} verifications in ${drainS.toFixed(1)} s (${((processed / drainS) * 60).toFixed(0)}/min, ${WORKERS} workers), finalised in ${finaliseS.toFixed(2)} s: ${d.qualified} qualified, ${d.eliminated} eliminated`;
    log(line);
    layerReport.push(line);
    if (drainS > THRESHOLDS.drainSecondsPerLayer) errors.push(`${layer.key}: verification took ${drainS.toFixed(0)} s`);
    if (finaliseS > THRESHOLDS.finaliseSeconds) errors.push(`${layer.key}: finalisation took ${finaliseS.toFixed(1)} s`);
    if (d.qualified + d.eliminated !== racing.length) errors.push(`${layer.key}: ${d.qualified + d.eliminated} decisions for ${racing.length} teams`);
  }
  polling = false;
  await Promise.all(pollers);

  const report = [
    `participants ${TEAMS * PER_TEAM} in ${TEAMS} teams, ${LAYERS} layers, polling every ${POLL_MS / 1000} s`,
    `race page reads: ${latencies.read.length} polls, p50 ${pct(latencies.read, 50)} ms, p95 ${pct(latencies.read, 95)} ms, p99 ${pct(latencies.read, 99)} ms`,
    `submissions: ${latencies.submit.length}, p50 ${pct(latencies.submit, 50)} ms, p95 ${pct(latencies.submit, 95)} ms`,
    ...layerReport,
  ];
  if (pct(latencies.read, 95) > THRESHOLDS.readP95Ms) errors.push(`read p95 ${pct(latencies.read, 95)} ms > ${THRESHOLDS.readP95Ms}`);
  if (pct(latencies.submit, 95) > THRESHOLDS.submitP95Ms) errors.push(`submit p95 ${pct(latencies.submit, 95)} ms > ${THRESHOLDS.submitP95Ms}`);
  console.log(`\n=== Load test\n${report.join("\n")}`);
  if (errors.length) {
    console.error(`\nFAILED (${errors.length}):\n${[...new Set(errors)].slice(0, 20).join("\n")}`);
    process.exitCode = 1;
  } else console.log("\nPASSED");
} finally {
  await h.close();
}
