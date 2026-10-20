import type { Metadata } from "next";
import { Suspense } from "react";
import { VenueBoard } from "@/components/display/VenueBoard";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { listRaceTournaments, pickFeatured } from "@/server/dal/race";
import { loadSpectatorState } from "@/server/dal/spectator";
import { getActiveEvent } from "@/server/dal/viewer";

export const metadata: Metadata = { title: "Venue display", robots: { index: false } };

/** Venue screen for projectors. Public and spectator-safe: open it full screen (F11). */
export default function DisplayPage() {
  return (
    <Suspense fallback={<Blank text="Connecting…" />}>
      <Board />
    </Suspense>
  );
}

async function Board() {
  if (!isSupabaseConfigured()) return <Blank text="The platform database is not connected." />;
  const event = await getActiveEvent();
  if (!event) return <Blank text="No active event." />;
  const featured = pickFeatured(await listRaceTournaments(event.id));
  if (!featured) return <Blank text={`${event.name}: the race starts soon.`} />;
  const state = await loadSpectatorState(featured.id, event.name);
  if (!state) return <Blank text="The race starts soon." />;
  return <VenueBoard initial={state} timezone={event.timezone} />;
}

function Blank({ text }: { text: string }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-ink text-[clamp(20px,2.4vw,40px)] text-[#EDEDE8]">
      <span className="wide">{text}</span>
    </div>
  );
}
