import { Suspense } from "react";
import { Module } from "@/components/system";
import { Gate } from "@/components/platform/Gate";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { EventSummary } from "@/server/dal/viewer";
import { CheckInButton, ImportPanel, JoinCodePanel, RoleForm } from "./ImportPanel";

export const metadata = { title: "Participants" };

export default function ParticipantsPage({ searchParams }: PageProps<"/admin/participants">) {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Loading…</p>}>
      <Gate path="/admin/participants" roles={["organiser"]}>
        {async ({ event }) => <Participants event={event} q={String((await searchParams).q ?? "")} />}
      </Gate>
    </Suspense>
  );
}

async function Participants({ event, q }: { event: EventSummary; q: string }) {
  const s = await createSupabaseServer();
  let regQuery = s.from("registrations").select("id, email, full_name, ticket, status, university, user_id, checked_in_at").eq("event_id", event.id).order("full_name").limit(400);
  if (q) regQuery = regQuery.or(`email.ilike.%${q.replace(/[%,()]/g, "")}%,full_name.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const [{ data: regs }, { data: roles }, { data: teams }, { data: members }, { data: projects }, { data: joinCode }] = await Promise.all([
    regQuery,
    s.from("event_roles").select("user_id, role").eq("event_id", event.id).neq("role", "participant"),
    s.from("teams").select("id, name, track, created_at").eq("event_id", event.id).order("name"),
    s.from("team_members").select("team_id, user_id").eq("event_id", event.id),
    s.from("projects").select("team_id, endpoint_url, repo_url").eq("event_id", event.id),
    s.rpc("event_join_code", { p_event: event.id }),
  ]);
  const roleUsers = [...new Set((roles ?? []).map((r) => r.user_id))];
  const { data: roleProfiles } = roleUsers.length ? await s.from("profiles").select("id, email, display_name").in("id", roleUsers) : { data: [] };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 min-[1000px]:grid-cols-2">
        <JoinCodePanel code={(joinCode as string | null) ?? null} />
        <RoleForm />
        <ImportPanel />
      </div>

      {roleUsers.length > 0 && (
        <Module label="STAFF" right={`${roleUsers.length} PEOPLE`}>
          <ul className="m-0 flex list-none flex-col p-0">
            {roleUsers.map((id) => {
              const p = roleProfiles?.find((x) => x.id === id);
              return (
                <li key={id} className="flex flex-wrap justify-between gap-2 border-b border-hairline px-4 py-2.5 text-[13.5px] last:border-b-0">
                  <span>{p?.display_name || p?.email || id}</span>
                  <span className="font-mono text-[10.5px] text-muted">{(roles ?? []).filter((r) => r.user_id === id).map((r) => r.role.toUpperCase()).join(" · ")}</span>
                </li>
              );
            })}
          </ul>
        </Module>
      )}

      <Module label="TEAMS" right={`${teams?.length ?? 0} TEAMS`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="font-mono text-[10px] text-muted">
                <th className="px-4 py-2 font-medium">TEAM</th>
                <th className="px-4 py-2 font-medium">TRACK</th>
                <th className="px-4 py-2 font-medium">MEMBERS</th>
                <th className="px-4 py-2 font-medium">APP URL</th>
              </tr>
            </thead>
            <tbody>
              {(teams ?? []).map((t) => {
                const pr = projects?.find((p) => p.team_id === t.id);
                return (
                  <tr key={t.id} className="border-t border-hairline">
                    <td className="px-4 py-2 font-semibold">{t.name}</td>
                    <td className="px-4 py-2">{t.track ?? "build"}</td>
                    <td className="px-4 py-2">{members?.filter((m) => m.team_id === t.id).length ?? 0}</td>
                    <td className="max-w-[320px] truncate px-4 py-2 font-mono text-[11.5px]">{pr?.endpoint_url ?? <span className="text-muted">not set</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Module>

      <Module label="REGISTRATIONS" right={`${regs?.length ?? 0} SHOWN`}>
        <form className="flex gap-2 border-b border-hairline p-3">
          <input name="q" defaultValue={q} placeholder="Search name or email" className="h-10 flex-1 rounded-[3px] border border-[#CFCFC8] bg-white px-3 text-[14px]" />
          <button type="submit" className="btn-secondary !h-10 !px-4 !text-[13px]">
            Search
          </button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="font-mono text-[10px] text-muted">
                <th className="px-4 py-2 font-medium">NAME</th>
                <th className="px-4 py-2 font-medium">EMAIL</th>
                <th className="px-4 py-2 font-medium">TICKET</th>
                <th className="px-4 py-2 font-medium">STATUS</th>
                <th className="px-4 py-2 font-medium">ACCOUNT</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {(regs ?? []).map((r) => (
                <tr key={r.id} className="border-t border-hairline">
                  <td className="px-4 py-2">{r.full_name}</td>
                  <td className="px-4 py-2 font-mono text-[11.5px]">{r.email}</td>
                  <td className="px-4 py-2">{r.ticket === "panel" ? "Panel only" : "Hackathon"}</td>
                  <td className="px-4 py-2">{r.status.replace("_", " ")}</td>
                  <td className="px-4 py-2">{r.user_id ? "Signed in" : <span className="text-muted">Not yet</span>}</td>
                  <td className="px-4 py-2">{r.status !== "declined" && <CheckInButton id={r.id} checkedIn={!!r.checked_in_at} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(regs ?? []).length === 0 && <p className="m-0 p-4 text-[13.5px] text-muted">{q ? "Nobody matches that search." : "No registrations yet. Import the Luma guest list above."}</p>}
        </div>
      </Module>
    </div>
  );
}
