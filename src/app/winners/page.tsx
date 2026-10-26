import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Module } from "@/components/system";
import { PlatformNotConfigured } from "@/components/platform/NotConfigured";
import { WinnersSection } from "@/components/winners/WinnersSection";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loadLeaderboard } from "@/server/dal/leaderboard";
import { getActiveEvent } from "@/server/dal/viewer";
import { loadWinners } from "@/server/dal/winners";

export const metadata: Metadata = { title: "Winners", description: "The winning projects and teams, and the AI Race result." };

export default function WinnersPage() {
  return (
    <div className="page-wrap flex flex-col gap-7 pb-20 pt-[clamp(24px,4vw,44px)]">
      {isSupabaseConfigured() ? (
        <Suspense fallback={<p className="text-[14px] text-muted">Loading the results…</p>}>
          <Results />
        </Suspense>
      ) : (
        <PlatformNotConfigured feature="The results" />
      )}
    </div>
  );
}

async function Results() {
  const event = await getActiveEvent();
  if (!event) return <PlatformNotConfigured feature="The results" />;
  const [winners, board] = await Promise.all([loadWinners(event.id), loadLeaderboard(event.id)]);
  const date = event.starts_at ? new Date(event.starts_at).toLocaleDateString("en-GB", { timeZone: event.timezone, weekday: "short", day: "numeric", month: "long", year: "numeric" }) : "";
  const champ = board.teams.find((t) => t.points > 0);
  const { cambridge, oxford } = board.sides;
  const lead = cambridge.average === oxford.average ? null : cambridge.average > oxford.average ? "Cambridge" : "Oxford";
  return (
    <>
      <header className="flex max-w-[820px] flex-col gap-3">
        <span className="eyebrow">{date.toUpperCase()}</span>
        <h1 className="display-l">{event.name}: results.</h1>
        <p className="m-0 text-[16px] leading-normal text-ink-2">The projects the judges picked, and who topped the AI Race. Thank you to everyone who built, pitched, mentored and judged.</p>
      </header>

      {winners.length ? <WinnersSection winners={winners} /> : <Module label="RESULTS"><p className="m-0 p-4 text-[14px] text-muted">The winners will appear here once the judges have decided.</p></Module>}

      <section aria-label="AI Race result" className="flex flex-col gap-3">
        <h2 className="section-h">The AI Race</h2>
        <div className="grid gap-4 min-[860px]:grid-cols-2">
          <Module label="CAMBRIDGE VS OXFORD" right="AVG OF TOP 10 TEAMS">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-5 text-center">
              {(["cambridge", "oxford"] as const).map((u, i) => (
                <div key={u} className={i ? "order-3" : ""}>
                  <div className="wide text-[clamp(38px,6vw,60px)] leading-none" style={{ color: u === "cambridge" ? "#3B9FD6" : "#1F3A93" }}>{board.sides[u].average}</div>
                  <div className="mt-1.5 font-mono text-[11px] font-semibold">{u.toUpperCase()}</div>
                  {lead?.toLowerCase() === u && <div className="mt-1 font-mono text-[10px] font-semibold text-ok-text">● WINNERS</div>}
                </div>
              ))}
              <span className="order-2 font-mono text-[12px] text-muted">VS</span>
            </div>
          </Module>
          <Module label="RACE CHAMPIONS" right="MOST POINTS">
            {champ ? (
              <div className="flex flex-col gap-2 p-5">
                <b className="text-[17px]">{champ.name}</b>
                <span className="wide text-[40px] leading-none">{champ.points.toLocaleString("en-GB")} <span className="text-[15px] font-semibold">pts</span></span>
                <Link href="/leaderboard" className="font-mono text-[11px]">FULL LEADERBOARD ↗</Link>
              </div>
            ) : (
              <p className="m-0 p-5 text-[14px] text-muted">No race points yet.</p>
            )}
          </Module>
        </div>
      </section>
    </>
  );
}
