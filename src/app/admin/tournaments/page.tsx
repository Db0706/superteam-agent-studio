import Link from "next/link";
import { Suspense } from "react";
import { Module } from "@/components/system";
import { Gate } from "@/components/platform/Gate";
import { CreateTournamentForm, RowActions } from "@/components/admin/tournaments/ListActions";
import { HackathonSetup } from "@/components/admin/tournaments/HackathonSetup";
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
    <div className="flex flex-col gap-4">
    <HackathonSetup defaultName={event.name} />
    <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_380px]">
      <Module label="TOURNAMENTS" right={`${rows.length}`}>
        {rows.length > 0 && (
          <p className="m-0 border-b border-hairline bg-strip px-4 py-2.5 text-[13px] leading-[1.45] text-ink-2">
            You only need <b>one</b> race for the day: the one the form above creates. Everything else here is an old draft or a practice run, so press <b>Archive</b> on those to avoid opening the wrong one. <b>Points</b> races never knock anyone out; <b>Knockout</b> is an older format you don&apos;t need.
          </p>
        )}
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
                      {t.status.toUpperCase()} · {cfg.mode === "checkpoint" ? "POINTS (NO KNOCKOUT)" : cfg.mode === "survival" ? "KNOCKOUT (OLD FORMAT)" : (cfg.mode ?? "").toUpperCase()} · {cfg.layers?.length ?? 0} STEPS
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
          <p className="m-0 p-4 text-[14px] text-ink-2">No races yet. Set up the hackathon above.</p>
        )}
      </Module>
      <details className="group">
        <summary className="cursor-pointer list-none rounded-[3px] border border-hairline bg-white px-4 py-3 text-[13.5px] font-semibold">
          Advanced setup <span className="font-normal text-muted">(other race formats, every setting)</span>
        </summary>
        <div className="mt-2">
          <CreateTournamentForm />
        </div>
      </details>
    </div>
    </div>
  );
}
