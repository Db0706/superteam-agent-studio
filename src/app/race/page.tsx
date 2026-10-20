import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Module } from "@/components/system";
import { PlatformNotConfigured } from "@/components/platform/NotConfigured";
import { RaceDashboard } from "@/components/race/RaceDashboard";
import { NoticeFeed } from "@/components/race/NoticeFeed";
import { fetchNotices } from "./actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { listRaceTournaments, loadRaceState, pickFeatured } from "@/server/dal/race";
import { getActiveEvent, getViewer } from "@/server/dal/viewer";

export const metadata: Metadata = {
  title: "AI Race",
  description: "Build an AI application one capability at a time. Every layer is verified automatically against your live app.",
};

export default function RacePage() {
  return (
    <div className="page-wrap flex flex-col gap-4 pb-20 pt-[clamp(24px,4vw,44px)]">
      {isSupabaseConfigured() ? (
        <Suspense fallback={<p className="text-[14px] text-muted">Loading the race…</p>}>
          <Race />
        </Suspense>
      ) : (
        <PlatformNotConfigured feature="The AI Race" />
      )}
    </div>
  );
}

async function Race() {
  const event = await getActiveEvent();
  if (!event) return <PlatformNotConfigured feature="The AI Race" />;
  const [viewer, list, notices] = await Promise.all([getViewer(event.id), listRaceTournaments(event.id), fetchNotices()]);
  const featured = pickFeatured(list);
  const feed = <NoticeFeed initial={notices} timezone={event.timezone} />;
  if (!featured) {
    return (
      <div className="flex max-w-[720px] flex-col gap-4">
        {feed}
        <span className="eyebrow">AI RACE · {event.short_name.toUpperCase()}</span>
        <h1 className="display-l">The race hasn&apos;t been announced yet.</h1>
        <Module label="WHILE YOU WAIT">
          <div className="flex flex-col gap-2 p-4 text-[14px] leading-normal text-ink-2">
            <p className="m-0">
              Set up your team and deploy a starter app so you&apos;re ready: <Link href="/team">your team</Link>, <Link href="/build">download a starter</Link>, then read the{" "}
              <Link href="/start">first 10 minutes guide</Link>.
            </p>
          </div>
        </Module>
      </div>
    );
  }
  const state = await loadRaceState(featured.id, viewer ? { userId: viewer.userId, teamId: viewer.team?.id ?? null } : null);
  if (!state) return <PlatformNotConfigured feature="The AI Race" />;
  return (
    <>
      {feed}
      <RaceDashboard initial={state} timezone={event.timezone} />
    </>
  );
}
