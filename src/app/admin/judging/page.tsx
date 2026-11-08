import { Suspense } from "react";
import { Module } from "@/components/system";
import { Gate } from "@/components/platform/Gate";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { EventSummary } from "@/server/dal/viewer";
import { rankSubmissions, type RubricCriterion } from "@/core/judging/results";
import { TRACK_LABEL, type Track } from "@/core/submissions/fields";
import { googleConfigured } from "@/server/google/client";
import { GoogleSheetPanel } from "./GoogleSheetPanel";
import { AssignmentActions, AssignOne, AutoAssign, OpenJudging, RubricEditor, WinnerControl } from "./JudgingControls";

export const metadata = { title: "Judging" };

export default function JudgingPage({ searchParams }: PageProps<"/admin/judging">) {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Loading…</p>}>
      <Gate path="/admin/judging" roles={["organiser"]}>
        {async ({ event }) => <Judging event={event} googleStatus={String((await searchParams).google ?? "")} />}
      </Gate>
    </Suspense>
  );
}

const TRACKS: Track[] = ["build", "policy"];

async function Judging({ event, googleStatus }: { event: EventSummary; googleStatus: string }) {
  const s = await createSupabaseServer();
  const { data: google } = await s.rpc("google_connection_get", { p_event: event.id });
  const gc = ((google ?? []) as { google_email: string; spreadsheet_url: string | null }[])[0];
  const [{ data: rubrics }, { data: subs }, { data: assignments }, { data: scores }, { data: judgeRoles }, { data: winners }] = await Promise.all([
    s.from("judging_rubrics").select("track, name, criteria, status").eq("event_id", event.id),
    s.from("submissions").select("id, team_id, track, title, status, submitted_at").eq("event_id", event.id),
    s.from("judge_assignments").select("id, judge_id, submission_id, status, conflict_note").eq("event_id", event.id),
    s.from("judging_scores").select("assignment_id, scores, final").eq("event_id", event.id),
    s.from("event_roles").select("user_id").eq("event_id", event.id).eq("role", "judge"),
    s.from("winners").select("track, place, submission_id, title, published_at").eq("event_id", event.id),
  ]);
  const judgeIds = (judgeRoles ?? []).map((j) => j.user_id);
  const teamIds = [...new Set((subs ?? []).map((x) => x.team_id))];
  const [{ data: profiles }, { data: teams }] = await Promise.all([
    judgeIds.length ? s.from("profiles").select("id, email, display_name").in("id", judgeIds) : Promise.resolve({ data: [] as { id: string; email: string; display_name: string }[] }),
    teamIds.length ? s.from("teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const judgeName = new Map((profiles ?? []).map((p) => [p.id, p.display_name || p.email]));
  const judges = judgeIds.map((id) => ({ id, name: judgeName.get(id) ?? "Judge" })).sort((a, b) => a.name.localeCompare(b.name));
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const flags = (assignments ?? []).filter((a) => a.status === "clarification" || a.status === "conflict");

  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 max-w-[760px] text-[14px] leading-normal text-ink-2">
        Judges score independently and never see each other&apos;s scores. Results below use only final scores. Add judges on the People page, confirm each track&apos;s criteria, then assign.
      </p>
      <GoogleSheetPanel configured={googleConfigured()} email={gc?.google_email ?? null} sheetUrl={gc?.spreadsheet_url ?? null} status={googleStatus || undefined} />
      <OpenJudging judges={judges.length} />

      {flags.length > 0 && (
        <Module label="NEEDS YOUR ATTENTION" right={`${flags.length}`}>
          <ul className="m-0 flex list-none flex-col p-0">
            {flags.map((a) => {
              const sub = subs?.find((x) => x.id === a.submission_id);
              return (
                <li key={a.id} className="flex flex-col gap-1.5 border-b border-hairline px-4 py-3 last:border-b-0">
                  <span className="text-[13.5px]">
                    <b>{judgeName.get(a.judge_id) ?? "A judge"}</b> {a.status === "conflict" ? "declared a conflict on" : "asked for clarification on"} <b>{sub?.title || "a submission"}</b> ({teamName.get(sub?.team_id ?? "")})
                  </span>
                  {a.conflict_note && <span className="whitespace-pre-line text-[12.5px] text-ink-2">{a.conflict_note}</span>}
                  <AssignmentActions id={a.id} status={a.status} final={false} />
                </li>
              );
            })}
          </ul>
        </Module>
      )}

      {TRACKS.map((track) => {
        const rubric = rubrics?.find((r) => r.track === track);
        const criteria = ((rubric?.criteria ?? []) as RubricCriterion[]).map((c) => ({ ...c, max: c.max ?? 10 }));
        const trackSubs = (subs ?? []).filter((x) => x.track === track);
        const trackAssignments = (assignments ?? []).filter((a) => trackSubs.some((x) => x.id === a.submission_id));
        const rows = trackAssignments.map((a) => {
          const sc = scores?.find((x) => x.assignment_id === a.id);
          return { submissionId: a.submission_id, final: !!sc?.final, scores: (sc?.scores ?? {}) as Record<string, number> };
        });
        const ranked = rankSubmissions(criteria, trackSubs.map((x) => x.id), rows);
        const locked = rows.some((r) => r.final);
        const confirmed = rubric?.status === "confirmed";
        return (
          <section key={track} className="flex flex-col gap-3">
            <h2 className="section-h !text-[22px]">{TRACK_LABEL[track]}</h2>
            <div className="grid items-start gap-4 min-[1200px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <RubricEditor track={track} label={TRACK_LABEL[track]} name={rubric?.name ?? `${TRACK_LABEL[track]} rubric`} criteria={criteria} status={rubric?.status ?? "missing"} locked={locked} />
              <Module label="SUBMISSIONS AND RESULTS" right={`${trackSubs.filter((x) => x.status === "submitted").length} FINAL · ${trackSubs.length} TOTAL`}>
                <div className="flex flex-col gap-3 p-4">
                  <AutoAssign track={track} judges={judges.length} />
                  {!judges.length && <p className="m-0 text-[12.5px] text-muted">No judges yet. Give people the judge role on the Participants page.</p>}
                </div>
                {ranked.length ? (
                  <ol className="m-0 flex list-none flex-col border-t border-hairline p-0">
                    {ranked.map((r, i) => {
                      const sub = trackSubs.find((x) => x.id === r.submissionId)!;
                      const subAssignments = trackAssignments.filter((a) => a.submission_id === sub.id);
                      const win = winners?.find((w) => w.track === track && w.submission_id === sub.id);
                      return (
                        <li key={sub.id} className="flex flex-col gap-2 border-b border-hairline px-4 py-3 last:border-b-0">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-[14px]">
                              <span className="font-mono text-[11px] text-muted">#{i + 1} </span>
                              <b>{sub.title || "Untitled"}</b> <span className="text-ink-2">· {teamName.get(sub.team_id)}</span>
                              {sub.status !== "submitted" && <span className="font-mono text-[10px] text-warn-text"> · {sub.status.toUpperCase()}</span>}
                            </span>
                            <span className="font-mono text-[11.5px]">
                              {r.weighted === null ? "NO FINAL SCORES" : `${r.weighted} / 100`} · {r.finalCount}/{subAssignments.length} JUDGES
                              {r.spread >= 20 && <span className="text-warn-text"> · JUDGES DIFFER BY {r.spread}</span>}
                            </span>
                          </div>
                          {r.finalCount > 0 && (
                            <span className="font-mono text-[10.5px] text-muted">
                              {criteria.map((c) => `${c.name.toUpperCase()} ${r.perCriterion[c.key] ?? "-"}/${c.max}`).join(" · ")}
                            </span>
                          )}
                          <ul className="m-0 flex list-none flex-col gap-1 p-0">
                            {subAssignments.map((a) => {
                              const final = !!scores?.find((x) => x.assignment_id === a.id)?.final;
                              return (
                                <li key={a.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                                  <span>{judgeName.get(a.judge_id) ?? "Judge"}</span>
                                  <span className="font-mono text-[10px] text-muted">{a.status.toUpperCase()}</span>
                                  <AssignmentActions id={a.id} status={a.status} final={final} />
                                </li>
                              );
                            })}
                          </ul>
                          <div className="flex flex-wrap items-center gap-3">
                            <AssignOne submissionId={sub.id} judges={judges.filter((j) => !subAssignments.some((a) => a.judge_id === j.id))} />
                            <WinnerControl track={track} submissionId={sub.id} defaultTitle={win?.title ?? ""} currentPlace={win?.place ?? null} canPublish={confirmed && sub.status === "submitted"} />
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="m-0 border-t border-hairline p-4 text-[13.5px] text-muted">No submissions in this track yet.</p>
                )}
                {!confirmed && ranked.length > 0 && <p className="m-0 border-t border-hairline px-4 py-3 text-[12.5px] text-warn-text">Confirm the criteria to publish winners for this track.</p>}
              </Module>
            </div>
          </section>
        );
      })}
    </div>
  );
}
