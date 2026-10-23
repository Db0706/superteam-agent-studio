import { Suspense } from "react";
import { COLORS, Led, Module } from "@/components/system";
import { Gate } from "@/components/platform/Gate";
import { RequestActions } from "@/components/ops/MentorForms";
import { MENTOR_CATEGORIES } from "@/core/mentor-categories";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { EventSummary, Viewer } from "@/server/dal/viewer";
import { AutoRefresh } from "../AutoRefresh";

export const metadata = { title: "Mentors" };

export default function MentorsAdminPage() {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Loading…</p>}>
      <Gate path="/admin/mentors" roles={["organiser"]}>
        {(ctx) => <Mentors {...ctx} />}
      </Gate>
    </Suspense>
  );
}

const label = new Map<string, string>(MENTOR_CATEGORIES);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length / 2)]);
};

async function Mentors({ viewer, event }: { viewer: Viewer; event: EventSummary }) {
  const s = await createSupabaseServer();
  const [{ data: rows }, { data: mentorRoles }, { data: now }] = await Promise.all([
    s.from("mentor_requests").select("id, team_id, requester_id, category, description, location, status, claimed_by, claimed_at, resolved_at, created_at, notes").eq("event_id", event.id).order("created_at", { ascending: false }).limit(500),
    s.from("event_roles").select("user_id").eq("event_id", event.id).eq("role", "mentor"),
    s.rpc("server_now"),
  ]);
  const nowMs = Date.parse(String(now));
  const people = [...new Set([...(mentorRoles ?? []).map((m) => m.user_id), ...(rows ?? []).map((r) => r.claimed_by).filter(Boolean)])] as string[];
  const teamIds = [...new Set((rows ?? []).map((r) => r.team_id).filter(Boolean))] as string[];
  const [{ data: profiles }, { data: teams }] = await Promise.all([
    people.length ? s.from("profiles").select("id, email, display_name").in("id", people) : Promise.resolve({ data: [] as { id: string; email: string; display_name: string }[] }),
    teamIds.length ? s.from("teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const name = new Map((profiles ?? []).map((p) => [p.id, p.display_name || p.email]));
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const all = rows ?? [];
  const minutes = (a: string, b: string | number) => (Date.parse(String(b)) - Date.parse(a)) / 60000;
  const waitToClaim = median(all.filter((r) => r.claimed_at).map((r) => minutes(r.created_at, r.claimed_at!)));
  const timeToResolve = median(all.filter((r) => r.resolved_at && r.claimed_at).map((r) => minutes(r.claimed_at!, r.resolved_at!)));
  const open = all.filter((r) => r.status === "open");
  const oldestOpen = open.length ? Math.round(Math.max(...open.map((r) => (nowMs - Date.parse(r.created_at)) / 60000))) : null;
  const order = { escalated: 0, open: 1, claimed: 2, resolved: 3 } as Record<string, number>;
  const sorted = [...all].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.created_at.localeCompare(b.created_at));

  const stat = (l: string, v: string | number, warn = false) => (
    <Module label={l}>
      <p className="m-0 p-4 text-[24px] font-bold" style={warn ? { color: COLORS.fault } : undefined}>
        {v}
      </p>
    </Module>
  );

  return (
    <div className="flex flex-col gap-4">
      <AutoRefresh seconds={10} />
      <div className="grid gap-3 min-[700px]:grid-cols-3 min-[1100px]:grid-cols-6">
        {stat("WAITING", open.length, open.length > 0 && (oldestOpen ?? 0) >= 10)}
        {stat("IN PROGRESS", all.filter((r) => r.status === "claimed").length)}
        {stat("ESCALATED", all.filter((r) => r.status === "escalated").length, all.some((r) => r.status === "escalated"))}
        {stat("RESOLVED", all.filter((r) => r.status === "resolved").length)}
        {stat("MEDIAN WAIT", waitToClaim === null ? "-" : `${waitToClaim} min`)}
        {stat("MEDIAN FIX", timeToResolve === null ? "-" : `${timeToResolve} min`)}
      </div>
      <div className="grid items-start gap-4 min-[1100px]:grid-cols-[300px_minmax(0,1fr)]">
        <Module label="MENTORS" right={`${(mentorRoles ?? []).length}`}>
          {(mentorRoles ?? []).length ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {(mentorRoles ?? []).map((m) => {
                const active = all.filter((r) => r.claimed_by === m.user_id && r.status === "claimed").length;
                const done = all.filter((r) => r.claimed_by === m.user_id && r.status === "resolved").length;
                return (
                  <li key={m.user_id} className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-2.5 text-[13.5px] last:border-b-0">
                    <span className="flex items-center gap-2">
                      <Led color={active ? COLORS.signal : COLORS.ok} />
                      {name.get(m.user_id) ?? "Mentor"}
                    </span>
                    <span className="font-mono text-[10.5px] text-muted">
                      {active ? `HELPING ${active}` : "FREE"} · {done} DONE
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="m-0 p-4 text-[13px] text-muted">No mentors yet. Give people the mentor role on the Participants page.</p>
          )}
        </Module>
        <Module label="ALL REQUESTS" right={oldestOpen !== null ? `OLDEST WAITING ${oldestOpen} MIN` : undefined}>
          {sorted.length ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {sorted.map((r) => (
                <li key={r.id} className="flex flex-col gap-1.5 border-b border-hairline px-4 py-3 last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13.5px]">
                      <b>{label.get(r.category) ?? r.category}</b>
                      {r.team_id && <span className="text-ink-2"> · {teamName.get(r.team_id)}</span>}
                      {r.location && <span className="text-muted"> · {r.location}</span>}
                    </span>
                    <span className="font-mono text-[10.5px] text-muted">
                      {r.status.toUpperCase()}
                      {r.claimed_by && ` · ${name.get(r.claimed_by) ?? "mentor"}`} · {Math.max(0, Math.round((nowMs - Date.parse(r.created_at)) / 60000))} MIN AGO
                    </span>
                  </div>
                  <p className="m-0 whitespace-pre-line text-[13px] leading-[1.5] text-ink-2">{r.description}</p>
                  {(r.notes as { text: string }[]).map((n, i) => (
                    <span key={i} className="text-[12px] text-muted">
                      {n.text}
                    </span>
                  ))}
                  <RequestActions id={r.id} mine={r.requester_id === viewer.userId} status={r.status} claimedByMe={r.claimed_by === viewer.userId} isMentor />
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 p-4 text-[13.5px] text-muted">No requests yet.</p>
          )}
        </Module>
      </div>
    </div>
  );
}
