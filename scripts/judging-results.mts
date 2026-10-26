/**
 * Read-only judging report: for each track, every submission ranked by its weighted judge score
 * (the same calculation as Admin → Judging), each judge's scores and comments, how many judges
 * finished, published winners, and the race leaderboard's top 10.
 *
 *   DATABASE_URL=… npx tsx scripts/judging-results.mts
 */
import { rankSubmissions, type RubricCriterion } from "../src/core/judging/results";
import { createSql } from "../src/server/db";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL.");
const slug = process.env.ACTIVE_EVENT_SLUG ?? "oxbridge-ai-race-2026";
const sql = createSql(url, 1);

await sql.begin("read only", async (q) => {
  const [ev] = await q`select id, name from public.events where slug = ${slug}`;
  console.log(`=== ${ev.name}: judging results\n`);
  for (const track of ["build", "policy"] as const) {
    const [rubric] = await q`select name, criteria, status from public.judging_rubrics where event_id = ${ev.id} and track = ${track}`;
    const criteria = (rubric?.criteria ?? []) as RubricCriterion[];
    const subs = await q`
      select s.id, s.title, s.status, t.name as team,
        (select string_agg(coalesce(nullif(p.display_name, ''), u.email), ', ') from public.team_members m join auth.users u on u.id = m.user_id
          left join public.profiles p on p.id = m.user_id where m.team_id = t.id) as members
      from public.submissions s join public.teams t on t.id = s.team_id where s.event_id = ${ev.id} and s.track = ${track}`;
    const rows = await q`
      select a.submission_id, js.final, js.scores, js.comments, coalesce(nullif(p.display_name, ''), u.email) as judge, a.status
      from public.judge_assignments a join public.submissions s on s.id = a.submission_id
      left join public.judging_scores js on js.assignment_id = a.id join auth.users u on u.id = a.judge_id left join public.profiles p on p.id = a.judge_id
      where a.event_id = ${ev.id} and s.track = ${track}`;
    const ranked = rankSubmissions(criteria, subs.map((s) => s.id), rows.map((r) => ({ submissionId: r.submission_id, final: !!r.final, scores: (r.scores ?? {}) as Record<string, number> })))
      .sort((a, b) => (b.weighted ?? -1) - (a.weighted ?? -1));
    console.log(`----- ${track.toUpperCase()} TRACK · rubric "${rubric?.name ?? "none"}" (${rubric?.status ?? "-"}) · ${subs.length} submission(s)`);
    console.log(`criteria: ${criteria.map((c) => `${c.name} ${c.weight}%`).join(" · ") || "-"}\n`);
    ranked.forEach((r, i) => {
      const s = subs.find((x) => x.id === r.submissionId)!;
      const mine = rows.filter((x) => x.submission_id === r.submissionId);
      console.log(`${String(i + 1).padStart(2)}. ${r.weighted === null ? "  no final scores" : `${r.weighted.toFixed(1)}/100`}  "${s.title}" · ${s.team} (${s.members ?? "-"}) · ${s.status}`);
      console.log(`    ${r.finalCount} of ${mine.length} judge(s) final${r.finalCount > 1 ? ` · judges differ by up to ${r.spread.toFixed(1)}` : ""}`);
      for (const m of mine) {
        const sc = criteria.map((c) => `${c.name.split(" ")[0]} ${(m.scores as Record<string, number> | null)?.[c.key] ?? "-"}`).join(", ");
        console.log(`      ${m.final ? "✓" : "…"} ${m.judge}: ${sc}${m.comments ? ` · "${String(m.comments).slice(0, 140)}"` : ""}${m.status === "conflict" ? " · CONFLICT" : ""}`);
      }
    });
    const winners = await q`select w.place, w.title, w.published_at, s.title as project, t.name as team from public.winners w join public.submissions s on s.id = w.submission_id join public.teams t on t.id = s.team_id where w.event_id = ${ev.id} and w.track = ${track} order by w.place`;
    console.log(`\n    PUBLISHED WINNERS: ${winners.length ? winners.map((w) => `#${w.place} ${w.title || ""} "${w.project}" (${w.team})${w.published_at ? "" : " [not published]"}`).join(" · ") : "none yet"}\n`);
  }
  const board = await q`select team_name, university, points from public.event_leaderboard(${ev.id}) order by points desc limit 10`;
  console.log("----- AI RACE LEADERBOARD (top 10)");
  board.forEach((b, i) => console.log(`${String(i + 1).padStart(2)}. ${b.points} pts · ${b.team_name} · ${b.university}`));
});
await sql.end();
