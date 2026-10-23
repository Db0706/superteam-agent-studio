import Link from "next/link";
import { Suspense } from "react";
import { Module } from "@/components/system";
import { Gate } from "@/components/platform/Gate";
import { CreateTournamentForm, RowActions } from "@/components/admin/tournaments/ListActions";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { EventSummary } from "@/server/dal/viewer";

export const metadata = { title: "Tournaments" };

export default function TournamentsPage() {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Loading…</p>}>
      <Gate path="/admin/tournaments" roles={["organiser"]}>
        {({ event }) => <List event={event} />}
      </Gate>
    </Suspense>
  );
}

async function List({ event }: { event: EventSummary }) {
  const s = await createSupabaseServer();
  const { data } = await s
    .from("tournaments")
    .select("id, name, status, simulation, starts_at, draft_config, current_version, created_at")
    .eq("event_id", event.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  return (
    <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_380px]">
      <Module label="TOURNAMENTS" right={`${rows.length}`}>
        {rows.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {rows.map((t) => {
              const cfg = t.draft_config as { mode?: string; layers?: unknown[] };
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
                  <div className="flex min-w-0 flex-col gap-1">
                    <Link href={`/admin/tournaments/${t.id}`} className="text-[15px] font-bold">
                      {t.name}
                    </Link>
                    <span className="font-mono text-[10.5px] text-muted">
                      {t.simulation ? "REHEARSAL (SIMULATION) · " : ""}
                      {t.status.toUpperCase()} · {(cfg.mode ?? "").toUpperCase()} · {cfg.layers?.length ?? 0} LAYERS
                      {t.current_version ? ` · V${t.current_version}` : ""}
                      {t.starts_at ? ` · STARTS ${new Date(t.starts_at).toLocaleString("en-GB", { timeZone: event.timezone, dateStyle: "medium", timeStyle: "short" })}` : ""}
                    </span>
                  </div>
                  <RowActions id={t.id} name={t.name} status={t.status} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 p-4 text-[14px] text-ink-2">No tournaments yet. Create one from the AI Race template or start blank.</p>
        )}
      </Module>
      <CreateTournamentForm />
    </div>
  );
}
