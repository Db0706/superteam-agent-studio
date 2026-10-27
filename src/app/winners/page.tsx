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
    <div className="page-wrap flex flex-col gap-7 pb-24 pt-[clamp(28px,4vw,48px)]">
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
  const date = event.starts_at ? new Date(event.starts_at).toLocaleDateString("en-GB", { timeZone: event.timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
  const venue = (event.details as { venue?: { value?: string } } | null)?.venue?.value?.split("·")[0]?.trim();
  const champ = board.teams.find((t) => t.points > 0);
  const { cambridge, oxford } = board.sides;
  const lead = cambridge.average === oxford.average ? null : cambridge.average > oxford.average ? "cambridge" : "oxford";
  return (
    <>
      <header className="flex max-w-[860px] flex-col gap-2.5">
        <span className="eyebrow">RESULTS · {date.toUpperCase()}{venue ? ` · ${venue.toUpperCase()}` : ""}</span>
        <h1 className="display-xl">The winners.</h1>
        <p className="m-0 max-w-[620px] text-[16px] leading-normal text-ink-2">Chosen by the judging panel for each official track, plus the final AI Race standings. Thank you to everyone who built, pitched, mentored and judged.</p>
      </header>

      {winners.length ? <WinnersSection winners={winners} /> : <Module label="RESULTS"><p className="m-0 p-4 text-[14px] text-muted">The winners will appear here once the judges have decided.</p></Module>}

      <section aria-label="AI Race result" className="module">
        <div className="module-strip">
          <span>AI RACE · FINAL STANDINGS</span>
          <span className="text-muted">AVG OF TOP 10 SCORING TEAMS</span>
        </div>
        <div className="grid min-[760px]:grid-cols-2">
          {(["cambridge", "oxford"] as const).map((u) => (
            <div key={u} className="flex flex-col gap-1.5 px-5 py-[22px] text-white" style={{ background: u === "cambridge" ? "#3B9FD6" : "#1F3A93" }}>
              <span className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.04em]">
                {u.toUpperCase()}
                {lead === u && <span className="rounded-[2px] bg-white px-1.5 py-[3px] text-[9.5px] text-ink">WINS THE RACE</span>}
              </span>
              <span className="wide text-[clamp(48px,6vw,72px)] leading-none tracking-[-0.03em]">{board.sides[u].average.toLocaleString("en-GB")}</span>
            </div>
          ))}
        </div>
        {champ && (
          <div className="flex flex-wrap items-center justify-between gap-3.5 border-t border-ink bg-signal-tint px-5 py-4">
            <div className="flex flex-col gap-1">
              <span className="eyebrow">RACE CHAMPIONS · MOST POINTS</span>
              <span className="flex flex-wrap items-center gap-2">
                <b className="text-[20px]">{champ.name}</b>
                {champ.members.map((m) => (
                  <span key={m} className="rounded-[3px] border border-signal-border bg-white px-2 py-1 font-mono text-[10.5px] text-ink-2">{m}</span>
                ))}
              </span>
            </div>
            <span className="wide text-[34px] leading-none text-signal-ink">{champ.points.toLocaleString("en-GB")} PTS</span>
          </div>
        )}
      </section>

      <div>
        <Link href="/leaderboard" className="btn-primary !px-5">SEE THE FULL LEADERBOARD ▸</Link>
      </div>
    </>
  );
}
