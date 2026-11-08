/**
 * Read-only integrity check for one team: who is in it and when they joined, how they got onto the
 * participant list, the project and submission timeline, every verification attempt, manual points,
 * and every audit-log entry that touches the team. Flags anything that looks off.
 *
 *   DATABASE_URL=… npx tsx scripts/investigate-team.mts "<team name>"
 *
 * Runs in a READ ONLY transaction: it cannot change anything.
 */
import { challengeIdFor } from "../src/core/challenges/identity";
import { createSql } from "../src/server/db";

const name = process.argv[2];
if (!name) {
  console.log('Usage: npx tsx scripts/investigate-team.mts "<team name>"');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL.");
const slug = process.env.ACTIVE_EVENT_SLUG ?? "oxbridge-ai-race-2026";
const sql = createSql(url, 1);
const t = (d: unknown) => (d ? new Date(String(d)).toLocaleString("en-GB", { timeZone: "Europe/London", hour12: false }) : "-");
const flags: string[] = [];

try {
  await sql.begin("read only", async (q) => {
    const [ev] = await q`select id, starts_at from public.events where slug = ${slug}`;
    const teams = await q`select * from public.teams where event_id = ${ev.id} and name ilike ${"%" + name + "%"}`;
    if (!teams.length) return console.log(`No team matching "${name}".`);

    for (const team of teams) {
      console.log(`\n=== TEAM "${team.name}" (${team.track} track) · created ${t(team.created_at)} · id ${team.id}`);

      const members = await q`
        select m.user_id, m.role, m.joined_at, u.email, u.created_at as account_created, r.source, r.university, r.status, r.ticket
        from public.team_members m join auth.users u on u.id = m.user_id
        left join public.registrations r on r.event_id = m.event_id and r.user_id = m.user_id
        where m.team_id = ${team.id} order by m.joined_at`;
      console.log(`\nMEMBERS (${members.length})`);
      for (const m of members) console.log(`  ${m.role.padEnd(7)} ${m.email} · joined ${t(m.joined_at)} · account ${t(m.account_created)} · via ${m.source ?? "no registration"} · ${m.university ?? "?"} · ${m.status ?? "-"}`);
      if (members.length > 4) flags.push(`${team.name}: ${members.length} members (limit is 4).`);
      for (const m of members) if (!m.source) flags.push(`${team.name}: ${m.email} has no registration row.`);

      const [p] = await q`select name, repo_url, demo_url, endpoint_url, solana_wallet, created_at, updated_at from public.projects where team_id = ${team.id}`;
      console.log(`\nPROJECT · ${p?.name || "(no name)"} · created ${t(p?.created_at)} · last change ${t(p?.updated_at)}`);
      console.log(`  app URL ${p?.endpoint_url ?? "-"}\n  repo    ${p?.repo_url ?? "-"}\n  demo    ${p?.demo_url ?? "-"}\n  wallet  ${p?.solana_wallet ?? "- (none saved)"}\n  challenge ID ${challengeIdFor(team.id)}`);
      if (p?.repo_url) {
        const same = await q`select t.name from public.projects pr join public.teams t on t.id = pr.team_id where pr.event_id = ${ev.id} and pr.team_id <> ${team.id} and lower(pr.repo_url) = lower(${p.repo_url})`;
        if (same.length) flags.push(`${team.name}: same repo as ${same.map((s) => s.name).join(", ")}.`);
      }
      if (p?.endpoint_url) {
        const same = await q`select t.name from public.projects pr join public.teams t on t.id = pr.team_id where pr.event_id = ${ev.id} and pr.team_id <> ${team.id} and lower(pr.endpoint_url) = lower(${p.endpoint_url})`;
        if (same.length) flags.push(`${team.name}: same app URL as ${same.map((s) => s.name).join(", ")}.`);
      }

      const subs = await q`
        select s.track, s.status, s.title, s.submitted_at, s.updated_at, s.receipt_code, u.email as by, s.reopened_by, s.fields
        from public.submissions s left join auth.users u on u.id = s.submitted_by where s.team_id = ${team.id}`;
      console.log(`\nSUBMISSIONS (${subs.length})`);
      for (const s of subs) {
        console.log(`  ${s.track} · ${s.status} · "${s.title}" · submitted ${t(s.submitted_at)} by ${s.by ?? "-"} · last change ${t(s.updated_at)} · receipt ${s.receipt_code ?? "-"}${s.reopened_by ? " · REOPENED by an organiser" : ""}`);
        const f = (s.fields ?? {}) as Record<string, unknown>;
        for (const k of ["repo", "demo", "video"]) if (f[k]) console.log(`    ${k}: ${f[k]}`);
        if (s.submitted_by && !members.some((m) => m.user_id === s.submitted_by)) flags.push(`${team.name}: submitted by someone not in the team.`);
        if (s.submitted_at && Date.parse(s.submitted_at) < Date.parse(team.created_at) + 15 * 60_000) flags.push(`${team.name}: ${s.track} submitted within 15 minutes of creating the team (${t(s.submitted_at)}). Fine if they brought existing research, but worth a look.`);
      }

      const attempts = await q`
        select a.submitted_at, a.status, a.score, a.endpoint_url, a.reviewed_by, a.review_note, lr.layer_key, u.email as by, tr.name as race, tr.starts_at as race_start
        from public.verification_attempts a join public.tournament_participants tp on tp.id = a.participant_id
        join public.tournaments tr on tr.id = a.tournament_id
        join public.layer_runs lr on lr.id = a.layer_run_id left join auth.users u on u.id = a.submitted_by
        where tp.team_id = ${team.id} order by a.submitted_at`;
      console.log(`\nRACE ATTEMPTS (${attempts.length})`);
      for (const a of attempts) console.log(`  ${t(a.submitted_at)} · ${a.race} · ${a.layer_key.padEnd(20)} · ${a.status.padEnd(15)} · score ${a.score ?? "-"} · by ${a.by ?? "-"} · ${a.endpoint_url ?? ""}${a.reviewed_by ? ` · MANUALLY REVIEWED: ${a.review_note ?? ""}` : ""}`);
      for (const a of attempts) if (a.reviewed_by && a.status === "passed") flags.push(`${team.name}: ${a.layer_key} passed by manual review (${a.review_note ?? "no note"}).`);
      for (const a of attempts) if (a.race_start && a.status === "passed" && Date.parse(a.submitted_at) < Date.parse(a.race_start)) flags.push(`${team.name}: ${a.layer_key} passed before the race started.`);

      const awards = await q`select a.points, a.label, a.reason, a.created_at, u.email as by from public.point_awards a left join auth.users u on u.id = a.created_by where a.team_id = ${team.id} order by a.created_at`;
      console.log(`\nMANUAL POINTS (${awards.length})`);
      for (const a of awards) console.log(`  ${a.points > 0 ? "+" : ""}${a.points} · ${a.label} · ${a.reason ?? ""} · by ${a.by ?? "-"} at ${t(a.created_at)}`);
      for (const a of awards) flags.push(`${team.name}: manual ${a.points} points ("${a.label}") by ${a.by ?? "?"}.`);

      const audit = await q`
        select l.created_at, l.action, l.target_type, u.email as by, l.details from public.audit_logs l left join auth.users u on u.id = l.actor_id
        where l.event_id = ${ev.id} and (l.target_id = ${team.id}::text or l.details::text ilike ${"%" + team.id + "%"}) order by l.created_at`;
      console.log(`\nAUDIT LOG (${audit.length})`);
      for (const l of audit) console.log(`  ${t(l.created_at)} · ${l.action} · ${l.target_type} · by ${l.by ?? "system"}`);
      for (const l of audit) if (l.by && !members.some((m) => m.email === l.by)) flags.push(`${team.name}: "${l.action}" done by ${l.by}, who isn't in the team (an organiser?).`);
    }
  });
} finally {
  await sql.end();
}

console.log(`\n=== FLAGS (${flags.length})`);
console.log(flags.length ? flags.map((f) => `  ⚠ ${f}`).join("\n") : "  None. Nothing looks tampered with.");
