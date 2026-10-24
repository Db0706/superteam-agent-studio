/**
 * Runs a rehearsal of the points race on a deployed platform: the real site, worker and database,
 * with fixture apps that pass or fail for known reasons. Rehearsals are simulations: hidden from
 * participants, the leaderboard and the venue screen.
 *
 *   DATABASE_URL=… REHEARSAL_ORGANISER=you@example.com REHEARSAL_SITE=https://… npx tsx scripts/rehearse.mts [speed=30]
 *
 * With REHEARSAL_PAY_TO=<devnet address> the on-chain payment stage is rehearsed too: the site
 * needs FIXTURE_PAYER_KEY (a funded throwaway devnet wallet), and each passing fixture pays
 * 0.01 devnet USDC to that address.
 *
 * It acts as the organiser through the same database functions the admin pages use, then watches
 * until the rehearsal finishes and prints what each fixture team scored. The worker must be running.
 */
import { createHash } from "node:crypto";
import { canonicalJson, parseTournamentConfig } from "../src/core/tournament/config";
import { pointsRaceTemplate, rehearsalConfig } from "../src/core/tournament/templates";
import { createSql } from "../src/server/db";

const url = process.env.DATABASE_URL ?? "";
const email = process.env.REHEARSAL_ORGANISER ?? "";
const site = (process.env.REHEARSAL_SITE ?? "").replace(/\/+$/, "");
const speed = Number(process.argv[2] ?? 30);
const slug = process.env.ACTIVE_EVENT_SLUG ?? "oxbridge-ai-race-2026";
if (!url || !email || !/^https?:\/\//.test(site)) throw new Error("Set DATABASE_URL, REHEARSAL_ORGANISER and REHEARSAL_SITE.");

const sql = createSql(url, 2);
const [event] = await sql<{ id: string }[]>`select id from public.events where slug = ${slug}`;
const [org] = await sql<{ id: string }[]>`select id from auth.users where email = ${email}`;
if (!event || !org) throw new Error("Event or organiser not found.");

/** Runs fn as the organiser, so permission checks and audit logs apply as in the admin pages. */
const asOrganiser = <T,>(fn: (tx: typeof sql) => Promise<T>) =>
  sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: org.id, role: "authenticated" })}, true)`;
    await tx`set local role authenticated`;
    return fn(tx as unknown as typeof sql);
  }) as Promise<T>;

// The payment stage needs a receiving address and a funded fixture wallet, so it's opt-in.
const payTo = process.env.REHEARSAL_PAY_TO ?? "";
const base = pointsRaceTemplate({ name: "Points race", sprintSeconds: 7 * 3600, challengeIntervalSeconds: 45 * 60 });
if (payTo) {
  for (const l of base.layers) if (l.key === "onchain-payment") l.verifier.config = { ...l.verifier.config, payTo };
} else base.layers = base.layers.filter((l) => l.key !== "onchain-payment");
const parsed = parseTournamentConfig(rehearsalConfig(base, speed));
if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
const cfg = parsed.config;
const hash = createHash("sha256").update(canonicalJson(cfg)).digest("hex");

const FIXTURES = [
  ["Fixture Atlas", "reference"],
  ["Fixture Borealis", "no-memory"],
  ["Fixture Cirrus", "fragile"],
  ["Fixture Ghost", "offline"],
  ["Fixture Dune", "fabricator"],
] as const;

const id = await asOrganiser(async (tx) => {
  // As in Builder > Create rehearsal: a draft, duplicated as a simulation, then the draft archived.
  const [{ create_tournament: draft }] = await tx`select public.create_tournament(${event.id}, ${cfg.name}, ${tx.json(cfg as never)})`;
  const [{ duplicate_tournament: tid }] = await tx`select public.duplicate_tournament(${draft}, ${cfg.name}, true, ${tx.json(cfg as never)})`;
  await tx`select public.archive_tournament(${draft})`;
  await tx`select public.publish_tournament(${tid}, ${tx.json(cfg as never)}, ${hash}, 'rehearsal')`;
  for (const [name, variant] of FIXTURES) await tx`select public.add_fixture_participant(${tid}, ${name}, ${`${site}/api/race/fixtures/${variant}`})`;
  await tx`select public.schedule_tournament(${tid}, now() + interval '5 seconds')`;
  return tid as string;
});
const span = Math.max(...cfg.layers.map((l) => l.timing.offsetSeconds + l.timing.durationSeconds));
console.log(`Rehearsal ${id}: ${cfg.layers.length} layers, about ${Math.ceil(span / 60) + 1} minutes. Watching…`);

for (;;) {
  await new Promise((r) => setTimeout(r, 10_000));
  try {
    const [t] = await sql<{ status: string }[]>`select status from public.tournaments where id = ${id}`;
    const [{ queued, errors }] = await sql<{ queued: number; errors: number }[]>`
      select count(*) filter (where status in ('queued', 'running'))::int as queued, count(*) filter (where status = 'error')::int as errors
      from public.verification_attempts where tournament_id = ${id}`;
    console.log(`  ${new Date().toISOString().slice(11, 19)} ${t.status} · ${queued} verifying · ${errors} errors`);
    if (t.status === "completed" || t.status === "cancelled") break;
  } catch (e) {
    // A dropped connection doesn't stop the rehearsal (it runs on the worker); keep watching.
    console.log(`  ${new Date().toISOString().slice(11, 19)} database unreachable (${(e as Error).message}), retrying`);
  }
}

const rows = await sql<{ name: string; layer: string; points: number; passed: boolean }[]>`
  select tp.display_name as name, r.layer_key as layer, coalesce((l ->> 'points')::int, 0) as points,
         exists (select 1 from public.verification_attempts a where a.layer_run_id = r.id and a.participant_id = tp.id and a.status = 'passed') as passed
  from public.tournament_participants tp
  join public.layer_runs r on r.tournament_id = tp.tournament_id
  join public.tournament_versions v on v.tournament_id = r.tournament_id and v.version = r.version
  cross join lateral jsonb_array_elements(v.config -> 'layers') l
  where tp.tournament_id = ${id} and l ->> 'key' = r.layer_key
  order by tp.display_name, r.position`;
for (const [name] of FIXTURES) {
  const mine = rows.filter((r) => r.name === name);
  const total = mine.filter((r) => r.passed).reduce((a, r) => a + r.points, 0);
  console.log(`${name}: ${total} points · passed ${mine.filter((r) => r.passed).map((r) => r.layer).join(", ") || "nothing"}`);
}
await sql.end();
