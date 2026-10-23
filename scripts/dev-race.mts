/**
 * LOCAL DEVELOPMENT ONLY: starts a demo AI Race in the active event so the race, venue and
 * control-room pages have something live to show. Refuses to run against anything but a local
 * database. Uses the same database functions as the organiser UI (run as a local organiser).
 *
 *   npx tsx scripts/dev-race.mts [intervalMinutes=30] [layers=8]
 */
import { createHash } from "node:crypto";
import { canonicalJson, parseTournamentConfig } from "../src/core/tournament/config";
import { aiRaceTemplate } from "../src/core/tournament/templates";
import { createSql } from "../src/server/db";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env from shell */
}
const url = process.env.DATABASE_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("dev-race only runs against a local database.");

const interval = Number(process.argv[2] ?? 30) * 60;
const layers = Number(process.argv[3] ?? 8);
const slug = process.env.ACTIVE_EVENT_SLUG ?? "oxbridge-ai-race-2026";
const sql = createSql(url, 2);

const [event] = await sql<{ id: string }[]>`select id from public.events where slug = ${slug}`;
if (!event) throw new Error(`No event ${slug}. Run npm run db:seed.`);
// A local organiser to act as (created once).
const [org] = await sql<{ id: string }[]>`select id from auth.users where email = 'dev-organiser@demo.test'`;
if (!org) throw new Error("Create dev-organiser@demo.test first: sign in once at /login with that email.");
await sql`insert into public.event_roles (event_id, user_id, role) values (${event.id}, ${org.id}, 'organiser') on conflict do nothing`;

const parsed = parseTournamentConfig(aiRaceTemplate({ name: "AI Race (local demo)", intervalSeconds: interval, layers }));
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
console.log(`Started "${cfg.name}" (${id}) with ${layers} layers every ${interval / 60} min. Run the worker: npm run worker`);
await sql.end();
