"use client";

import { useEffect, useState } from "react";
import { COLORS, Led, Module } from "@/components/system";
import { fetchLeaderboard } from "@/app/leaderboard/actions";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Leaderboard, University } from "@/server/dal/leaderboard";

export const UNI_LABEL: Record<University, string> = { cambridge: "Cambridge", oxford: "Oxford", mixed: "Mixed", other: "Other" };
export const UNI_COLOR: Record<University, string> = { cambridge: "#3B9FD6", oxford: "#1F3A93", mixed: "#8E8E87", other: "#AFAFA8" };

/** Live points table: Realtime nudges plus polling every 10 seconds. */
export function LeaderboardView({ initial, eventId }: { initial: Leaderboard; eventId: string }) {
  const [board, setBoard] = useState(initial);
  useEffect(() => {
    const reload = () => void fetchLeaderboard().then((b) => b && setBoard(b));
    const id = setInterval(reload, 10_000);
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`leaderboard-${eventId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_events", filter: `event_id=eq.${eventId}` }, reload)
      .subscribe();
    return () => {
      clearInterval(id);
      void supabase.removeChannel(channel);
    };
  }, [eventId]);

  const { cambridge, oxford } = board.sides;
  const lead = cambridge.average === oxford.average ? null : cambridge.average > oxford.average ? "cambridge" : "oxford";
  return (
    <div className="flex flex-col gap-4">
      <Module label="CAMBRIDGE VS OXFORD" right="AVERAGE POINTS PER TEAM">
        <div className="grid grid-cols-2">
          {(["cambridge", "oxford"] as const).map((u) => (
            <div key={u} className="flex flex-col gap-1 border-r border-hairline p-5 last:border-r-0" style={lead === u ? { background: COLORS.okTint } : undefined}>
              <span className="flex items-center gap-2 font-mono text-[11px]">
                <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: UNI_COLOR[u] }} />
                {UNI_LABEL[u].toUpperCase()}
                {lead === u && <span style={{ color: COLORS.okText }}>· LEADING</span>}
              </span>
              <span className="wide text-[clamp(40px,6vw,72px)] leading-none tracking-[-0.03em]">{board.sides[u].average}</span>
              <span className="text-[12.5px] text-muted">
                {board.sides[u].teams} team{board.sides[u].teams === 1 ? "" : "s"} · {board.sides[u].total} points in total
              </span>
            </div>
          ))}
        </div>
      </Module>
      <Module label="TEAMS" right={board.finalistsConfirmed ? "FINALISTS CONFIRMED" : `${board.teams.length} TEAMS`}>
        {board.teams.length ? (
          <ol className="m-0 flex list-none flex-col p-0">
            {board.teams.map((t) => (
              <li key={t.teamId} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
                <span className="wide text-[22px] leading-none">{t.rankLabel}</span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="truncate text-[15px]">{t.name}</b>
                    <span className="rounded-[2px] px-1.5 py-[2px] font-mono text-[9.5px] text-white" style={{ background: UNI_COLOR[t.university] }}>
                      {UNI_LABEL[t.university].toUpperCase()}
                    </span>
                    {t.finalistRank && (
                      <span className="flex items-center gap-1 font-mono text-[10px]" style={{ color: COLORS.okText }}>
                        <Led color={COLORS.ok} size={6} /> FINALIST
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[10.5px] text-muted">
                    {t.buildTotal > 0 && `BUILD ${t.buildDone}/${t.buildTotal}`}
                    {t.challengesTotal > 0 && ` · CHALLENGES ${t.challengesDone}/${t.challengesTotal}`}
                    {t.awardPoints !== 0 && ` · AWARDS ${t.awardPoints > 0 ? "+" : ""}${t.awardPoints}`}
                  </span>
                </span>
                <span className="wide text-[24px] leading-none">{t.points}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="m-0 p-4 text-[14px] text-muted">Teams appear here as soon as they form.</p>
        )}
      </Module>
      <p className="m-0 text-[12.5px] text-muted">Points come from verified build stages and challenges, plus any points the organisers award. Equal points: whoever got there first ranks higher.</p>
    </div>
  );
}
