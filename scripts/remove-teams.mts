/**
 * Permanently removes test teams from the event: the team, its memberships, invites, project,
 * submissions, race entries and attempts, finalist rows and manual points (all cascade from the
 * team). The people keep their accounts and their registration, so they can join another team.
 *
 *   DATABASE_URL=… npx tsx scripts/remove-teams.mts "Team A" "Team B"         # shows what would go
 *   DATABASE_URL=… npx tsx scripts/remove-teams.mts "Team A" "Team B" --yes   # deletes it
 *
 * Names must match exactly (case doesn't matter). Each removal is written to the audit log.
 */
import { createSql } from "../src/server/db";

const yes = process.argv.includes("--yes");
const names = process.argv.slice(2).filter((a) => a !== "--yes");
if (!names.length) {
  console.log('Usage: npx tsx scripts/remove-teams.mts "<team name>" [more names] [--yes]');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL.");
const slug = process.env.ACTIVE_EVENT_SLUG ?? "oxbridge-ai-race-2026";
const sql = createSql(url, 1);

try {
  await sql.begin(async (q) => {
    const [ev] = await q`select id from public.events where slug = ${slug}`;
    for (const name of names) {
      const teams = await q`select id, name, track, created_at from public.teams where event_id = ${ev.id} and lower(name) = lower(${name})`;
      if (!teams.length) {
        console.log(`✗ "${name}": no team with exactly that name.`);
        continue;
      }
      for (const t of teams) {
        const members = await q`select u.email from public.team_members m join auth.users u on u.id = m.user_id where m.team_id = ${t.id}`;
        const [c] = await q`
          select (select count(*) from public.submissions where team_id = ${t.id})::int as submissions,
                 (select count(*) from public.verification_attempts a join public.tournament_participants p on p.id = a.participant_id where p.team_id = ${t.id})::int as attempts,
                 (select count(*) from public.point_awards where team_id = ${t.id})::int as awards`;
        console.log(`${yes ? "✓ removed" : "• would remove"} "${t.name}" (${t.track}) · members: ${members.map((m) => m.email).join(", ") || "none"} · ${c.submissions} submission(s), ${c.attempts} race attempt(s), ${c.awards} manual award(s)`);
        if (yes) {
          await q`delete from public.teams where id = ${t.id}`;
          await q`insert into public.audit_logs (event_id, actor_id, action, target_type, target_id, details)
                  values (${ev.id}, null, 'team.removed', 'team', ${t.id}, ${sql.json({ name: t.name, members: members.map((m) => m.email), reason: "test team removed by organiser" })})`;
        }
      }
    }
    if (!yes) console.log("\nNothing deleted yet. Add --yes to the end of the command to remove these.");
  });
} finally {
  await sql.end();
}
