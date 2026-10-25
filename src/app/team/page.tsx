import type { Metadata } from "next";
import { Suspense } from "react";
import { Module } from "@/components/system";
import { Gate } from "@/components/platform/Gate";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { EventSummary, Viewer } from "@/server/dal/viewer";
import { challengeIdFor } from "@/core/challenges/identity";
import { ChallengePanel, EventCodeForm, InvitePanel, JoinOrCreate, LeaveTeam, ProjectForm, TokenPanel } from "./TeamForms";

export const metadata: Metadata = { title: "Your team" };

export default function TeamPage() {
  return (
    <div className="page-wrap flex flex-col gap-4 pb-20 pt-[clamp(24px,4vw,44px)]">
      <div className="flex max-w-[760px] flex-col gap-3">
        <span className="eyebrow">TEAM WORKSPACE</span>
        <h1 className="display-l">Your team.</h1>
      </div>
      <Suspense fallback={<p className="text-[14px] text-muted">Loading your team…</p>}>
        <Gate path="/team">{(ctx) => <Workspace {...ctx} />}</Gate>
      </Suspense>
    </div>
  );
}

async function Workspace({ viewer, event }: { viewer: Viewer; event: EventSummary }) {
  if (viewer.registration?.ticket === "panel") {
    return (
      <Module label="PANEL TICKET">
        <p className="m-0 p-4 text-[14px] leading-normal text-ink-2">
          Your registration is for the panel talks only, so you can&apos;t join a hackathon team. If that&apos;s wrong, speak to an organiser at the registration desk.
        </p>
      </Module>
    );
  }
  const participant = viewer.isPlatformAdmin || viewer.roles.includes("participant") || viewer.roles.includes("organiser");
  if (!participant) {
    return (
      <Module label="NOT ON THE PARTICIPANT LIST">
        <div className="flex flex-col gap-2 p-4 text-[14px] leading-normal text-ink-2">
          <p className="m-0">
            <b>{viewer.email}</b> isn&apos;t on the approved participant list for {event.name}.
          </p>
          <p className="m-0 text-[13px] text-muted">If you&apos;re in the room, enter the event code below. Otherwise sign in with the email you registered with, or ask an organiser to add you.</p>
          <div className="mt-2 border-t border-hairline pt-4">
            <EventCodeForm />
          </div>
        </div>
      </Module>
    );
  }
  if (!viewer.team) return <JoinOrCreate />;

  const supabase = await createSupabaseServer();
  const [{ data: memberRows }, { data: project }] = await Promise.all([
    supabase.from("team_members").select("user_id, role, joined_at").eq("team_id", viewer.team.id).order("joined_at"),
    supabase.from("projects").select("name, repo_url, demo_url, endpoint_url, solana_wallet").eq("team_id", viewer.team.id).maybeSingle(),
  ]);
  // Teammates can read each other's profiles (RLS); team_members points at auth.users, so fetch separately.
  const ids = (memberRows ?? []).map((m) => m.user_id as string);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, display_name, email").in("id", ids) : { data: [] };
  const members = (memberRows ?? []).map((m) => ({ ...m, profile: (profiles ?? []).find((p) => p.id === m.user_id) ?? null }));

  return (
    <div className="grid items-start gap-4 min-[1000px]:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-4">
        <Module label={viewer.team.name.toUpperCase()} right={(viewer.team.track ?? "build").toUpperCase() + " TRACK"}>
          <ul className="m-0 flex list-none flex-col p-0">
            {members.map((m) => {
              const p = m.profile as { display_name: string; email: string } | null;
              return (
                <li key={m.user_id} className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 last:border-b-0">
                  <span className="text-[14px] font-semibold">{p?.display_name || p?.email || "Teammate"}</span>
                  <span className="font-mono text-[10.5px] text-muted">{m.role === "captain" ? "CAPTAIN" : "MEMBER"}</span>
                </li>
              );
            })}
          </ul>
        </Module>
        <ProjectForm teamId={viewer.team.id} project={project ?? { name: "", repo_url: null, demo_url: null, endpoint_url: null }} />
      </div>
      <aside className="flex flex-col gap-4">
        {viewer.team.isCaptain && <InvitePanel teamId={viewer.team.id} />}
        <ChallengePanel teamId={viewer.team.id} challengeId={challengeIdFor(viewer.team.id)} wallet={(project as { solana_wallet?: string | null } | null)?.solana_wallet ?? null} />
        <TokenPanel teamId={viewer.team.id} />
        <LeaveTeam teamId={viewer.team.id} />
      </aside>
    </div>
  );
}
