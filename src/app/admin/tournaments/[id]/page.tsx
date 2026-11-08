import { Suspense } from "react";
import { Builder } from "@/components/admin/tournaments/Builder";
import { Gate } from "@/components/platform/Gate";
import { Module } from "@/components/system";
import { TOURNAMENT_SCHEMA, type TournamentConfig } from "@/core/tournament/config";
import { aiRaceTemplate } from "@/core/tournament/templates";
import { createSupabaseServer } from "@/lib/supabase/server";
import { FIXTURE_VARIANTS } from "@/server/fixtures/reference-app";
import type { EventSummary } from "@/server/dal/viewer";

export const metadata = { title: "Tournament builder" };

export default function BuilderPage({ params }: PageProps<"/admin/tournaments/[id]">) {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Loading…</p>}>
      <Gate path="/admin/tournaments" roles={["organiser"]}>
        {async ({ event }) => <Load event={event} id={(await params).id} />}
      </Gate>
    </Suspense>
  );
}

async function Load({ event, id }: { event: EventSummary; id: string }) {
  const s = await createSupabaseServer();
  const { data: t } = await s.from("tournaments").select("id, event_id, status, simulation, starts_at, draft_config").eq("id", id).maybeSingle();
  if (!t || t.event_id !== event.id) return <Module label="NOT FOUND"><p className="m-0 p-4 text-[14px]">No such tournament in this event.</p></Module>;
  const [{ data: versions }, { data: fixtures }] = await Promise.all([
    s.from("tournament_versions").select("version, published_at, note").eq("tournament_id", id).order("version", { ascending: false }),
    s.from("tournament_participants").select("id, display_name, state").eq("tournament_id", id).not("fixture_endpoint", "is", null),
  ]);
  // Drafts can be incomplete; fill missing top-level fields from the template so the editor always has a shape.
  const draft = { ...(t.draft_config as Record<string, unknown>) };
  delete draft._resume_status;
  const base = aiRaceTemplate({ layers: 1 });
  const initial = { ...base, ...draft, schema: TOURNAMENT_SCHEMA, layers: Array.isArray(draft.layers) && draft.layers.length ? draft.layers : base.layers } as TournamentConfig;
  return (
    <Builder
      id={t.id}
      status={t.status}
      simulation={t.simulation}
      startsAt={t.starts_at}
      timezone={event.timezone}
      initial={initial}
      versions={(versions ?? []).map((v) => ({ version: v.version, publishedAt: v.published_at, note: v.note }))}
      fixtures={(fixtures ?? []).map((f) => ({ id: f.id, name: f.display_name, state: f.state }))}
      fixtureVariants={FIXTURE_VARIANTS}
    />
  );
}
