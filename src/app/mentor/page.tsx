import type { Metadata } from "next";
import { Suspense } from "react";
import { COLORS, Led, Module } from "@/components/system";
import { Gate } from "@/components/platform/Gate";
import { RequestActions, RequestHelpForm } from "@/components/ops/MentorForms";
import { createSupabaseServer } from "@/lib/supabase/server";
import { hasRole, type EventSummary, type Viewer } from "@/server/dal/viewer";
import { AutoRefresh } from "../admin/AutoRefresh";
import { MENTOR_CATEGORIES as CATEGORIES } from "@/core/mentor-categories";

export const metadata: Metadata = { title: "Mentors" };

export default function MentorPage() {
  return (
    <div className="page-wrap flex flex-col gap-4 pb-20 pt-[clamp(24px,4vw,44px)]">
      <div className="flex max-w-[760px] flex-col gap-3">
        <span className="eyebrow">MENTOR SUPPORT</span>
        <h1 className="display-l">Get unstuck.</h1>
      </div>
      <Suspense fallback={<p className="text-[14px] text-muted">Loading…</p>}>
        <Gate path="/mentor">{(ctx) => <Mentor {...ctx} />}</Gate>
      </Suspense>
    </div>
  );
}

const label = new Map<string, string>(CATEGORIES);

async function Mentor({ viewer, event }: { viewer: Viewer; event: EventSummary }) {
  const isMentor = hasRole(viewer, "mentor", "organiser");
  const s = await createSupabaseServer();
  const { data: rows } = await s
    .from("mentor_requests")
    .select("id, team_id, requester_id, category, description, location, status, claimed_by, created_at, notes")
    .eq("event_id", event.id)
    .order("created_at", { ascending: true })
    .limit(300);
  const { data: now } = await s.rpc("server_now");
  const nowMs = Date.parse(String(now));
  const teamIds = [...new Set((rows ?? []).map((r) => r.team_id).filter(Boolean))] as string[];
  const { data: teams } = teamIds.length ? await s.from("teams").select("id, name").in("id", teamIds) : { data: [] };
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const mine = (rows ?? []).filter((r) => r.requester_id === viewer.userId).reverse();
  const queue = (rows ?? []).filter((r) => ["open", "claimed", "escalated"].includes(r.status));
  const ago = (iso: string) => `${Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60000))} min`;

  const Item = ({ r, showTeam }: { r: NonNullable<typeof rows>[number]; showTeam: boolean }) => (
    <li className="flex flex-col gap-2 border-b border-hairline px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[14px] font-semibold">
          <Led color={r.status === "open" ? COLORS.fault : r.status === "claimed" ? COLORS.signal : r.status === "escalated" ? COLORS.warnLed : COLORS.ok} />
          {label.get(r.category) ?? r.category}
          {showTeam && r.team_id && <span className="font-normal text-ink-2">· {teamName.get(r.team_id)}</span>}
          {r.location && <span className="font-normal text-muted">· {r.location}</span>}
        </span>
        <span className="font-mono text-[10.5px] text-muted">
          {r.status.toUpperCase()} · {ago(r.created_at)} AGO
        </span>
      </div>
      <p className="m-0 whitespace-pre-line text-[13.5px] leading-[1.5] text-ink-2">{r.description}</p>
      {(r.notes as { text: string; at: string }[]).length > 0 && (
        <ul className="m-0 flex flex-col gap-0.5 pl-5 text-[12.5px] text-muted">
          {(r.notes as { text: string; at: string }[]).map((n, i) => (
            <li key={i}>{n.text}</li>
          ))}
        </ul>
      )}
      <RequestActions id={r.id} mine={r.requester_id === viewer.userId} status={r.status} claimedByMe={r.claimed_by === viewer.userId} isMentor={isMentor} />
    </li>
  );

  return (
    <div className="grid items-start gap-4 min-[1000px]:grid-cols-[400px_minmax(0,1fr)]">
      <AutoRefresh seconds={10} />
      <div className="flex flex-col gap-4">
        {(viewer.roles.includes("participant") || viewer.isPlatformAdmin) && <RequestHelpForm />}
        {mine.length > 0 && (
          <Module label="YOUR REQUESTS">
            <ul className="m-0 flex list-none flex-col p-0">
              {mine.map((r) => (
                <Item key={r.id} r={r} showTeam={false} />
              ))}
            </ul>
          </Module>
        )}
      </div>
      {isMentor && (
        <Module label="QUEUE" right={`${queue.filter((r) => r.status === "open").length} WAITING · ${queue.filter((r) => r.status === "claimed").length} IN PROGRESS`}>
          {queue.length ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {queue.map((r) => (
                <Item key={r.id} r={r} showTeam />
              ))}
            </ul>
          ) : (
            <p className="m-0 p-4 text-[13.5px] text-muted">Nobody is waiting. New requests appear here automatically.</p>
          )}
        </Module>
      )}
    </div>
  );
}
