/**
 * LOCAL DEVELOPMENT ONLY: starts a demo AI Race in the active event so the race, venue and
 * control-room pages have something live to show. Refuses to run against anything but a local
 * database. Uses the same database functions as the organiser UI (run as a local organiser).
 *
 *   npx tsx scripts/dev-race.mts [intervalMinutes=30] [layers=8]
 *   npx tsx scripts/dev-race.mts points [challengeMinutes=45]     (points race + leaderboard)
 */
import { createHash } from "node:crypto";
import { canonicalJson, parseTournamentConfig } from "../src/core/tournament/config";
import { aiRaceTemplate, pointsRaceTemplate } from "../src/core/tournament/templates";
import { createSql } from "../src/server/db";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env from shell */
}
const url = process.env.DATABASE_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("dev-race only runs against a local database.");

const points = process.argv[2] === "points";
const interval = Number((points ? process.argv[3] : process.argv[2]) ?? (points ? 45 : 30)) * 60;
const layers = Number(process.argv[3] ?? 8);
const slug = process.env.ACTIVE_EVENT_SLUG ?? "oxbridge-ai-race-2026";
const sql = createSql(url, 2);

const [event] = await sql<{ id: string }[]>`select id from public.events where slug = ${slug}`;
if (!event) throw new Error(`No event ${slug}. Run npm run db:seed.`);
// A local organiser to act as (created once).
const [org] = await sql<{ id: string }[]>`select id from auth.users where email = 'dev-organiser@demo.test'`;
if (!org) throw new Error("Create dev-organiser@demo.test first: sign in once at /login with that email.");
await sql`insert into public.event_roles (event_id, user_id, role) values (${event.id}, ${org.id}, 'organiser') on conflict do nothing`;

const template = points
  ? pointsRaceTemplate({ name: "Points race (local demo)", challengeIntervalSeconds: interval })
  : aiRaceTemplate({ name: "AI Race (local demo)", intervalSeconds: interval, layers });
if (points) {
  // A devnet address so the payment stage validates locally. Organisers set their own.
  const pay = template.layers.find((l) => l.key === "onchain-payment");
  if (pay) pay.verifier.config = { ...pay.verifier.config, payTo: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" };
  // Only one demo race at a time.
  await sql`update public.tournaments set archived_at = now(), status = case when status in ('running', 'paused', 'scheduled') then 'cancelled' else status end
    where event_id = ${event.id} and archived_at is null and name like '%(local demo)'`;
}
const parsed = parseTournamentConfig(template);
if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
const cfg = parsed.config;
const hash = createHash("sha256").update(canonicalJson(cfg)).digest("hex");

const id = await sql.begin(async (tx) => {
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: org.id, role: "authenticated" })}, true)`;
  await tx`set local role authenticated`;
  const [{ create_tournament: tid }] = await tx`select public.create_tournament(${event.id}, ${cfg.name}, ${tx.json(cfg as never)})`;
  await tx`select public.publish_tournament(${tid}, ${tx.json(cfg as never)}, ${hash}, 'local demo')`;
  return tid as string;
});
// Enter every local team, then start now.
await sql`
  insert into public.tournament_participants (tournament_id, event_id, team_id, display_name)
  select ${id}, event_id, id, name from public.teams where event_id = ${event.id} on conflict do nothing`;
await sql.begin(async (tx) => {
  await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: org.id, role: "authenticated" })}, true)`;
  await tx`set local role authenticated`;
  await tx`select public.schedule_tournament(${id}, now())`;
});
console.log(`Started "${cfg.name}" (${id}) with ${cfg.layers.length} layers. Run the worker: npm run worker`);
await sql.end();
