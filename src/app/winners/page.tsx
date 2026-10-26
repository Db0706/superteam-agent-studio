import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PlatformNotConfigured } from "@/components/platform/NotConfigured";
import { WinnersPodiums } from "@/components/winners/WinnersSection";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loadLeaderboard } from "@/server/dal/leaderboard";
import { getActiveEvent } from "@/server/dal/viewer";
import { loadWinners } from "@/server/dal/winners";

export const metadata: Metadata = { title: "Winners", description: "The winning projects and teams, and the AI Race result." };

const CONFETTI: { left: string; top: string; w: number; h: number; c: string; r: number; round?: boolean }[] = [
  { left: "6%", top: "30%", w: 14, h: 14, c: "#E7B923", r: 20 },
  { left: "13%", top: "70%", w: 10, h: 22, c: "#8B6CFF", r: -30 },
  { left: "88%", top: "28%", w: 18, h: 8, c: "#3B9FD6", r: 35 },
  { left: "92%", top: "66%", w: 12, h: 12, c: "#E7B923", r: 0, round: true },
  { left: "22%", top: "14%", w: 8, h: 8, c: "#FFFFFF", r: 0, round: true },
  { left: "80%", top: "82%", w: 20, h: 6, c: "#C9813F", r: -15 },
  { left: "74%", top: "9%", w: 10, h: 10, c: "#C3C9D1", r: 45 },
  { left: "3%", top: "86%", w: 16, h: 6, c: "#3B9FD6", r: 60 },
];

export default function WinnersPage() {
  return (
    <div className="flex flex-col pb-20">
      {isSupabaseConfigured() ? (
        <Suspense fallback={<p className="page-wrap pt-10 text-[14px] text-muted">Loading the results…</p>}>
          <Results />
        </Suspense>
      ) : (
        <div className="page-wrap pt-10">
          <PlatformNotConfigured feature="The results" />
        </div>
      )}
    </div>
  );
}

async function Results() {
  const event = await getActiveEvent();
  if (!event) return <div className="page-wrap pt-10"><PlatformNotConfigured feature="The results" /></div>;
  const [winners, board] = await Promise.all([loadWinners(event.id), loadLeaderboard(event.id)]);
  const date = event.starts_at ? new Date(event.starts_at).toLocaleDateString("en-GB", { timeZone: event.timezone, weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
  const champ = board.teams.find((t) => t.points > 0);
  const { cambridge, oxford } = board.sides;
  const lead = cambridge.average === oxford.average ? null : cambridge.average > oxford.average ? "cambridge" : "oxford";
  const projects = new Set(winners.map((w) => w.track)).size;
  return (
    <>
      <header
        className="relative overflow-hidden px-4 pb-[clamp(56px,8vw,96px)] pt-[clamp(48px,7vw,80px)] text-center text-white"
        style={{ background: "radial-gradient(1200px 500px at 50% -10%, #3A24C9 0%, #1A1240 45%, #0F0F12 80%)" }}
      >
        {CONFETTI.map((c, i) => (
          <span key={i} aria-hidden="true" className="absolute block max-[760px]:hidden" style={{ left: c.left, top: c.top, width: c.w, height: c.h, background: c.c, transform: `rotate(${c.r}deg)`, borderRadius: c.round ? "50%" : 0 }} />
        ))}
        <div className="relative mx-auto flex max-w-[1100px] flex-col items-center gap-3.5">
          <span className="font-mono text-[12px] font-bold tracking-[0.08em] text-[#E7B923]">{date.toUpperCase()}</span>
          <h1 className="m-0 font-black leading-[0.9] tracking-[-0.035em] [font-stretch:125%] text-[clamp(44px,9vw,120px)]">
            The <span className="bg-[linear-gradient(90deg,#E7B923,#FFF3B0,#E7B923)] bg-clip-text text-transparent">winners</span> of the {event.name}
          </h1>
          <p className="m-0 max-w-[640px] text-[17px] leading-normal text-[#CFCAF5]">The teams the judges picked, and the team that topped the AI Race. Thank you to everyone who built, pitched, mentored and judged.</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {["BUILD TRACK", "POLICY TRACK", "AI RACE"].map((c) => (
              <span key={c} className="rounded-full border border-[#4A3D99] px-3 py-1.5 font-mono text-[11px] font-semibold text-[#E4DFFF]">{c}</span>
            ))}
          </div>
        </div>
      </header>

      <div className="page-wrap flex flex-col gap-[clamp(56px,7vw,90px)] pt-[clamp(56px,7vw,80px)]">
        {projects ? <WinnersPodiums winners={winners} /> : <p className="m-0 text-center text-[15px] text-muted">The winners will appear here once the judges have decided.</p>}

        <section aria-label="AI Race result" className="flex flex-col gap-[18px]">
          <div className="grid overflow-hidden rounded-[14px] border-[3px] border-ink text-white min-[880px]:grid-cols-2">
            <div className="flex justify-between bg-ink px-5 py-3.5 font-mono text-[11px] font-bold tracking-[0.12em] min-[880px]:col-span-2">
              <span>THE AI RACE · CAMBRIDGE VS OXFORD</span>
              <span className="max-[600px]:hidden">AVG OF TOP 10 TEAMS</span>
            </div>
            {(["cambridge", "oxford"] as const).map((u) => (
              <div key={u} className="relative px-[26px] py-[34px]" style={{ background: u === "cambridge" ? "linear-gradient(135deg, #2B86BF, #3B9FD6)" : "linear-gradient(135deg, #1F3A93, #2C4FBF)" }}>
                {lead === u && <span className="absolute right-[18px] top-[18px] rounded-[3px] bg-[#E7B923] px-2.5 py-1.5 font-mono text-[11px] font-extrabold tracking-[0.1em] text-ink">WINNERS</span>}
                <div className="font-black leading-[0.9] tracking-[-0.03em] [font-stretch:125%] text-[clamp(64px,9vw,110px)]">{board.sides[u].average.toLocaleString("en-GB")}</div>
                <div className="mt-2.5 font-mono text-[13px] font-bold tracking-[0.14em]">{u.toUpperCase()}</div>
              </div>
            ))}
          </div>
          {champ && (
            <div className="flex flex-wrap items-center justify-between gap-5 rounded-[14px] bg-ink p-6 text-white">
              <div>
                <div className="font-mono text-[11px] font-bold tracking-[0.14em] text-[#A9A4C9]">AI RACE CHAMPIONS · MOST POINTS</div>
                <div className="mt-1.5 font-black [font-stretch:125%] text-[32px]">{champ.name}</div>
                {champ.members.length > 0 && <div className="mt-1 text-[13px] text-[#CFCAF5]">{champ.members.join(" · ")}</div>}
              </div>
              <div className="font-black leading-none text-[#E7B923] [font-stretch:125%] text-[54px]">
                {champ.points.toLocaleString("en-GB")}
                <span className="ml-1.5 text-[18px] text-white">pts</span>
              </div>
            </div>
          )}
        </section>

        <footer className="flex flex-col items-center gap-3.5 text-center text-[13px] text-muted">
          <span>Organised by Kings Politics Cambridge, AI3, Solana Superteam UK and Oxbridge AIx.</span>
          <Link href="/leaderboard" className="btn-primary !px-5">SEE THE FULL LEADERBOARD ▸</Link>
        </footer>
      </div>
    </>
  );
}
