import type { Metadata } from "next";
import { Suspense } from "react";
import { LeaderboardView } from "@/components/leaderboard/LeaderboardView";
import { PlatformNotConfigured } from "@/components/platform/NotConfigured";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loadLeaderboard } from "@/server/dal/leaderboard";
import { getActiveEvent } from "@/server/dal/viewer";

export const metadata: Metadata = { title: "Leaderboard", description: "Live points for every team, and Cambridge vs Oxford." };

export default function LeaderboardPage() {
  return (
    <div className="page-wrap flex flex-col gap-4 pb-20 pt-[clamp(24px,4vw,44px)]">
      <div className="flex max-w-[760px] flex-col gap-3">
        <span className="eyebrow">LIVE LEADERBOARD</span>
        <h1 className="display-l">Cambridge vs Oxford.</h1>
      </div>
      {isSupabaseConfigured() ? (
        <Suspense fallback={<p className="text-[14px] text-muted">Loading the leaderboard…</p>}>
          <Board />
        </Suspense>
      ) : (
        <PlatformNotConfigured feature="The leaderboard" />
      )}
    </div>
  );
}

async function Board() {
  const event = await getActiveEvent();
  if (!event) return <PlatformNotConfigured feature="The leaderboard" />;
  return <LeaderboardView initial={await loadLeaderboard(event.id)} eventId={event.id} />;
}
