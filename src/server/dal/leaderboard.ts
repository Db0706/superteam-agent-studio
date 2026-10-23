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
  finalistRank: number | null;
}

export interface Leaderboard {
  serverNow: string;
  teams: LeaderboardTeam[];
  /** Average points per team, by university. Mixed and other teams are listed but not in either side. */
  sides: Record<"cambridge" | "oxford", { teams: number; average: number; total: number }>;
  finalistsConfirmed: boolean;
}

/** Ranks by points, then by who reached their score first. Public: names and totals only. */
export async function loadLeaderboard(eventId: string): Promise<Leaderboard> {
  const supabase = await createSupabaseServer();
  const [{ data: rows }, { data: finalists }, { data: now }] = await Promise.all([
    supabase.rpc("event_leaderboard", { p_event: eventId }),
    supabase.from("finalists").select("team_id, rank").eq("event_id", eventId),
    supabase.rpc("server_now"),
  ]);
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
    }))
    .sort((a, b) => b.points - a.points || (a.lastScoredAt ?? "9").localeCompare(b.lastScoredAt ?? "9") || a.name.localeCompare(b.name));
  // Equal points and equal time share a rank.
  const teams: LeaderboardTeam[] = sorted.map((t, i) => ({ ...t, rank: i + 1 }));
  for (let i = 1; i < teams.length; i++) {
    if (teams[i].points === teams[i - 1].points && teams[i].lastScoredAt === teams[i - 1].lastScoredAt) teams[i].rank = teams[i - 1].rank;
  }
  const side = (u: "cambridge" | "oxford") => {
    const list = teams.filter((t) => t.university === u);
    const total = list.reduce((a, t) => a + t.points, 0);
    return { teams: list.length, total, average: list.length ? Math.round(total / list.length) : 0 };
  };
  return {
    serverNow: typeof now === "string" ? now : new Date().toISOString(),
    teams,
    sides: { cambridge: side("cambridge"), oxford: side("oxford") },
    finalistsConfirmed: fin.size > 0,
  };
}
