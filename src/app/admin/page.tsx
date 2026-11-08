import Link from "next/link";
import { Suspense } from "react";
import { COLORS, Led, Module } from "@/components/system";
import { Gate } from "@/components/platform/Gate";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { EventSummary } from "@/server/dal/viewer";
import { AutoRefresh } from "./AutoRefresh";

export const metadata = { title: "Overview" };

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Loading…</p>}>
      <Gate path="/admin" roles={["organiser"]}>
        {({ event }) => <Overview event={event} />}
      </Gate>
    </Suspense>
  );
}

const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

async function Overview({ event }: { event: EventSummary }) {
  const s = await createSupabaseServer();
  const e = event.id;
  const head = { count: "exact" as const, head: true };
  const [hackathon, panel, checkedIn, linked, teams, withEndpoint, mentorOpen, mentorClaimed, drafts, finals, assigned, scored, tournaments, heartbeats] = await Promise.all([
    count(s.from("registrations").select("id", head).eq("event_id", e).eq("ticket", "hackathon").in("status", ["approved", "checked_in"])),
    count(s.from("registrations").select("id", head).eq("event_id", e).eq("ticket", "panel").in("status", ["approved", "checked_in"])),
    count(s.from("registrations").select("id", head).eq("event_id", e).eq("status", "checked_in")),
    count(s.from("registrations").select("id", head).eq("event_id", e).not("user_id", "is", null)),
    count(s.from("teams").select("id", head).eq("event_id", e)),
    count(s.from("projects").select("id", head).eq("event_id", e).not("endpoint_url", "is", null)),
    count(s.from("mentor_requests").select("id", head).eq("event_id", e).eq("status", "open")),
    count(s.from("mentor_requests").select("id", head).eq("event_id", e).eq("status", "claimed")),
    count(s.from("submissions").select("id", head).eq("event_id", e).neq("status", "submitted")),
    count(s.from("submissions").select("id", head).eq("event_id", e).eq("status", "submitted")),
    count(s.from("judge_assignments").select("id", head).eq("event_id", e)),
    count(s.from("judge_assignments").select("id", head).eq("event_id", e).eq("status", "submitted")),
    s.from("tournaments").select("id, name, status, simulation").eq("event_id", e).is("archived_at", null).order("created_at", { ascending: false }),
    s.from("worker_heartbeats").select("worker_id, last_seen, info").order("last_seen", { ascending: false }).limit(10),
  ]);
  const { data: serverNow } = await s.rpc("server_now");
  const nowMs = Date.parse(String(serverNow));

  const live = (tournaments.data ?? []).filter((t) => ["scheduled", "running", "paused", "finalising"].includes(t.status));
  const raceRows = await Promise.all(
    live.map(async (t) => {
      const [{ data: runs }, { data: ps }, queued, review] = await Promise.all([
        s.from("layer_runs").select("position, layer_key, state, deadline_at").eq("tournament_id", t.id).order("position"),
        s.from("tournament_participants").select("state").eq("tournament_id", t.id),
        count(s.from("verification_attempts").select("id", head).eq("tournament_id", t.id).in("status", ["queued", "running"])),
        count(s.from("verification_attempts").select("id", head).eq("tournament_id", t.id).in("status", ["review_required", "error"])),
      ]);
      const open = runs?.find((r) => r.state === "open") ?? runs?.find((r) => r.state !== "closed");
      const waiting = runs?.filter((r) => r.state === "finalising").length ?? 0;
      return { t, open, total: runs?.length ?? 0, waiting, queued, review, competing: ps?.filter((p) => p.state === "active" || p.state === "qualified").length ?? 0, out: ps?.filter((p) => p.state === "eliminated").length ?? 0 };
    }),
  );

  const freshest = heartbeats.data?.[0];
  const workerAge = freshest ? Math.round((nowMs - Date.parse(freshest.last_seen)) / 1000) : null;
  const workerOk = workerAge !== null && workerAge < 30;

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={15} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="section-h">{event.name}</h1>
        <span className="flex items-center gap-2 font-mono text-[11px]" style={{ color: workerOk ? COLORS.okText : COLORS.fault }}>
          <Led color={workerOk ? COLORS.ok : COLORS.fault} blink={!workerOk} />
          {workerAge === null ? "NO VERIFICATION WORKER HAS REPORTED" : workerOk ? `WORKER OK · SEEN ${workerAge}s AGO · ${heartbeats.data?.filter((h) => nowMs - Date.parse(h.last_seen) < 30_000).length} RUNNING` : `WORKER SILENT FOR ${workerAge}s`}
        </span>
      </div>

      <div className="grid gap-3 min-[900px]:grid-cols-4">
        <Tile label="Hackathon participants" value={hackathon} sub={`${linked} signed in · ${checkedIn} checked in`} href="/admin/participants" />
        <Tile label="Panel-only attendees" value={panel} sub="Not in the hackathon" href="/admin/participants" />
        <Tile label="Teams" value={teams} sub={`${withEndpoint} with an app URL`} href="/admin/participants" />
        <Tile label="Mentor requests" value={mentorOpen} sub={`${mentorClaimed} being helped`} href="/admin/mentors" alert={mentorOpen > 0} />
      </div>

      <Module label="AI RACE" right={<Link href="/admin/tournaments">TOURNAMENTS ▸</Link>}>
        {raceRows.length === 0 ? (
          <p className="m-0 p-4 text-[14px] text-ink-2">No tournament is scheduled or running. Create and schedule one in Tournaments.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {raceRows.map((r) => (
              <li key={r.t.id} className="grid gap-2 border-b border-hairline px-4 py-3 last:border-b-0 min-[900px]:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] min-[900px]:items-center">
                <Link href={`/admin/tournaments/${r.t.id}/control`} className="text-[15px] font-bold">
                  {r.t.name}
                  {r.t.simulation && " (rehearsal)"}
                </Link>
                <span className="font-mono text-[11px] text-ink-2">
                  {r.t.status.toUpperCase()} {r.open ? `· LAYER ${r.open.position + 1}/${r.total} ${r.open.state.toUpperCase()}` : ""}
                </span>
                <span className="font-mono text-[11px] text-ink-2">{r.competing} RACING · {r.out} OUT</span>
                <span className="font-mono text-[11px]" style={{ color: r.queued > 20 ? COLORS.warnText : COLORS.muted }}>{r.queued} VERIFYING</span>
                <span className="font-mono text-[11px]" style={{ color: r.review || r.waiting ? COLORS.fault : COLORS.muted }}>
                  {r.review} NEED REVIEW{r.waiting ? ` · ${r.waiting} LAYER WAITING` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Module>

      <div className="grid gap-3 min-[900px]:grid-cols-3">
        <Tile label="Submissions" value={finals} sub={`${drafts} drafts`} href="/admin/submissions" />
        <Tile label="Judging" value={scored} sub={`of ${assigned} assignments scored`} href="/admin/judging" />
        <Tile label="Venue screen" value={null} sub="Open /display full screen on the projector" href="/display" />
      </div>
    </div>
  );
}

function Tile({ label, value, sub, href, alert }: { label: string; value: number | null; sub: string; href: string; alert?: boolean }) {
  return (
    <Link href={href} className="module flex flex-col gap-1.5 p-4 !text-ink hover:!no-underline" style={alert ? { borderColor: COLORS.fault } : undefined}>
      <span className="mono-label">{label.toUpperCase()}</span>
      {value !== null && (
        <span className="wide text-[34px] leading-none" style={{ color: alert ? COLORS.fault : COLORS.ink }}>
          {value}
        </span>
      )}
      <span className="text-[12.5px] text-muted">{sub}</span>
    </Link>
  );
}
