import { Suspense } from "react";
import { Module } from "@/components/system";
import { Gate } from "@/components/platform/Gate";
import { tournamentConfigSchema } from "@/core/tournament/config";
import { createSupabaseServer } from "@/lib/supabase/server";
import { loadLeaderboard } from "@/server/dal/leaderboard";
import type { EventSummary } from "@/server/dal/viewer";
import { AwardForm, FinalistPicker, LayerPointsInput, RevokeButton, UniversitySelect } from "./PointsControls";

export const metadata = { title: "Points & finalists" };

export default function PointsPage() {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Loading…</p>}>
      <Gate path="/admin/points" roles={["organiser"]}>
        {({ event }) => <Points event={event} />}
      </Gate>
    </Suspense>
  );
}

async function Points({ event }: { event: EventSummary }) {
  const s = await createSupabaseServer();
  const [board, { data: teams }, { data: awards }, { data: tournaments }] = await Promise.all([
    loadLeaderboard(event.id),
    s.from("teams").select("id, name, university_override").eq("event_id", event.id).order("name"),
    s.from("point_awards").select("id, team_id, points, label, reason, created_at").eq("event_id", event.id).order("created_at", { ascending: false }).limit(200),
    s.from("tournaments").select("id, name, status, current_version").eq("event_id", event.id).eq("simulation", false).is("archived_at", null).not("current_version", "is", null),
  ]);
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const races = await Promise.all(
    (tournaments ?? []).map(async (t) => {
      const [{ data: v }, { data: overrides }] = await Promise.all([
        s.from("tournament_versions").select("config").eq("tournament_id", t.id).eq("version", t.current_version).maybeSingle(),
        s.from("layer_points").select("layer_key, points").eq("tournament_id", t.id),
      ]);
      const cfg = tournamentConfigSchema.safeParse(v?.config);
      const over = new Map((overrides ?? []).map((o) => [o.layer_key, o.points as number]));
      return { ...t, layers: cfg.success ? cfg.data.layers.map((l) => ({ key: l.key, title: l.title, category: l.category, points: over.get(l.key) ?? l.points, changed: over.has(l.key) })) : [] };
    }),
  );
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { timeZone: event.timezone, hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[760px] text-[14px] leading-normal text-ink-2">
        Everything here can change on the day and is written to the audit log. The live leaderboard is at <a href="/leaderboard">/leaderboard</a> and on the venue screen.
      </p>
      <div className="grid items-start gap-4 min-[1100px]:grid-cols-2">
        <FinalistPicker teams={board.teams} confirmed={board.finalistsConfirmed} />
        <div className="flex flex-col gap-4">
          <AwardForm teams={(teams ?? []).map((t) => ({ id: t.id, name: t.name }))} />
          <Module label="AWARDS" right={`${awards?.length ?? 0}`}>
            {awards?.length ? (
              <ul className="m-0 flex list-none flex-col p-0">
                {awards.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-2 text-[13px] last:border-b-0">
                    <span>
                      <b>{a.points > 0 ? `+${a.points}` : a.points}</b> {teamName.get(a.team_id)} · {a.label}
                      {a.reason && <span className="text-muted"> · {a.reason}</span>}
                    </span>
                    <span className="flex items-center gap-2 font-mono text-[10.5px] text-muted">
                      {fmt(a.created_at)}
                      <RevokeButton id={a.id} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 p-4 text-[13px] text-muted">No awards yet.</p>
            )}
          </Module>
        </div>
      </div>

      {races.map((r) => (
        <Module key={r.id} label={`POINTS PER LAYER · ${r.name.toUpperCase()}`} right={r.status.toUpperCase()}>
          <ul className="m-0 grid list-none p-0 min-[900px]:grid-cols-2">
            {r.layers.map((l) => (
              <li key={l.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-2 text-[13px]">
                <span>
                  <b>{l.title}</b> <span className="font-mono text-[10px] text-muted">{l.category === "build_stage" ? "BUILD STAGE" : "CHALLENGE"}{l.changed ? " · CHANGED TODAY" : ""}</span>
                </span>
                <LayerPointsInput tournamentId={r.id} layerKey={l.key} points={l.points} />
              </li>
            ))}
          </ul>
        </Module>
      ))}

      <Module label="TEAM UNIVERSITIES" right="WORKED OUT FROM MEMBERS' LUMA REGISTRATIONS">
        <ul className="m-0 grid list-none p-0 min-[900px]:grid-cols-2">
          {board.teams.map((t) => (
            <li key={t.teamId} className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-2 text-[13px]">
              <span>
                <b>{t.name}</b> <span className="text-muted">· {t.university}</span>
              </span>
              <UniversitySelect teamId={t.teamId} override={(teams ?? []).find((x) => x.id === t.teamId)?.university_override ?? null} />
            </li>
          ))}
        </ul>
      </Module>
    </div>
  );
}
