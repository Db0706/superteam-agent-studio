import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";

export type University = "cambridge" | "oxford" | "mixed" | "other";

export interface LeaderboardTeam {
  teamId: string;
  name: string;
  university: University;
  points: number;
  awardPoints: number;
  buildDone: number;
  buildTotal: number;
  challengesDone: number;
  challengesTotal: number;
  lastScoredAt: string | null;
  rank: number;
  /** What to show: "–" before a team has any points, "=4" for a shared place, otherwise "4". */
  rankLabel: string;
  finalistRank: number | null;
  /** Members' display names (never emails). */
  members: string[];
}

export interface Leaderboard {
  serverNow: string;
  teams: LeaderboardTeam[];
  /** Average points per team, by university. Mixed and other teams are listed but not in either side. */
  sides: Record<"cambridge" | "oxford", { teams: number; counted: number; average: number; total: number }>;
  finalistsConfirmed: boolean;
}

/** Ranks by points, then by who reached their score first. Public: names and totals only. */
export async function loadLeaderboard(eventId: string): Promise<Leaderboard> {
  const supabase = await createSupabaseServer();
  const [{ data: rows }, { data: finalists }, { data: now }, { data: memberRows }] = await Promise.all([
    supabase.rpc("event_leaderboard", { p_event: eventId }),
    supabase.from("finalists").select("team_id, rank").eq("event_id", eventId),
    supabase.rpc("server_now"),
    supabase.rpc("public_team_members", { p_event: eventId }),
  ]);
  const membersOf = new Map(((memberRows ?? []) as { team_id: string; members: string[] | null }[]).map((m) => [m.team_id, m.members ?? []]));
  const fin = new Map((finalists ?? []).map((f) => [f.team_id as string, f.rank as number]));
  type Row = { team_id: string; team_name: string; university: University; points: number; award_points: number; build_done: number; build_total: number; challenges_done: number; challenges_total: number; last_scored_at: string | null };
  const sorted = ((rows ?? []) as Row[])
    .map((r) => ({
      teamId: r.team_id,
      name: r.team_name,
      university: r.university,
      points: r.points,
      awardPoints: r.award_points,
      buildDone: r.build_done,
      buildTotal: r.build_total,
      challengesDone: r.challenges_done,
      challengesTotal: r.challenges_total,
      lastScoredAt: r.last_scored_at,
      finalistRank: fin.get(r.team_id) ?? null,
      members: membersOf.get(r.team_id) ?? [],
    }))
    .sort((a, b) => b.points - a.points || (a.lastScoredAt ?? "9").localeCompare(b.lastScoredAt ?? "9") || a.name.localeCompare(b.name));
  // Equal points and equal time share a rank.
  const teams: LeaderboardTeam[] = sorted.map((t, i) => ({ ...t, rank: i + 1, rankLabel: "" }));
  for (let i = 1; i < teams.length; i++) {
    if (teams[i].points === teams[i - 1].points && teams[i].lastScoredAt === teams[i - 1].lastScoredAt) teams[i].rank = teams[i - 1].rank;
  }
  for (const t of teams) {
    const shared = teams.filter((x) => x.rank === t.rank).length > 1;
    t.rankLabel = t.points <= 0 ? "–" : shared ? `=${t.rank}` : String(t.rank);
  }
  const side = (u: "cambridge" | "oxford") => {
    // The side's score: average of its top 10 teams that have scored (teams on 0 points don't count).
    const list = teams.filter((t) => t.university === u);
    const top = list.filter((t) => t.points > 0).sort((a, b) => b.points - a.points).slice(0, 10);
    const total = list.reduce((a, t) => a + t.points, 0);
    return { teams: list.length, counted: top.length, total, average: top.length ? Math.round(top.reduce((a, t) => a + t.points, 0) / top.length) : 0 };
  };
  return {
    serverNow: typeof now === "string" ? now : new Date().toISOString(),
    teams,
    sides: { cambridge: side("cambridge"), oxford: side("oxford") },
    finalistsConfirmed: fin.size > 0,
  };
}
