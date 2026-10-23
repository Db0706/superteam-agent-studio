import type { Metadata } from "next";
import { Suspense } from "react";
import { Module } from "@/components/system";
import { Gate } from "@/components/platform/Gate";
import { ScoreForm } from "@/components/ops/ScoreForm";
import type { RubricCriterion as Criterion } from "@/core/judging/results";
import { TRACK_FIELDS, TRACK_LABEL, type Track } from "@/core/submissions/fields";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { EventSummary, Viewer } from "@/server/dal/viewer";

export const metadata: Metadata = { title: "Judging" };

export default function JudgePage() {
  return (
    <div className="page-wrap flex flex-col gap-4 pb-20 pt-[clamp(24px,4vw,44px)]">
      <div className="flex max-w-[760px] flex-col gap-3">
        <span className="eyebrow">JUDGING PORTAL</span>
        <h1 className="display-l">Your submissions.</h1>
        <p className="m-0 text-[15px] leading-normal text-ink-2">Score each submission independently against its track&apos;s criteria. You only see your own scores.</p>
      </div>
      <Suspense fallback={<p className="text-[14px] text-muted">Loading…</p>}>
        <Gate path="/judge" roles={["judge"]}>
          {(ctx) => <Assignments {...ctx} />}
        </Gate>
      </Suspense>
    </div>
  );
}

async function Assignments({ viewer, event }: { viewer: Viewer; event: EventSummary }) {
  const s = await createSupabaseServer();
  const { data: assignments } = await s.from("judge_assignments").select("id, submission_id, status").eq("event_id", event.id).eq("judge_id", viewer.userId);
  const ids = (assignments ?? []).map((a) => a.submission_id);
  if (!ids.length) {
    return (
      <Module label="NOTHING ASSIGNED YET">
        <p className="m-0 p-4 text-[14px] text-ink-2">The organisers haven&apos;t assigned you any submissions yet. They appear here when they do.</p>
      </Module>
    );
  }
  const [{ data: subs }, { data: rubrics }, { data: scores }, { data: artifacts }] = await Promise.all([
    s.from("submissions").select("id, team_id, track, title, fields, submitted_at, status").in("id", ids),
    s.from("judging_rubrics").select("track, name, criteria, status").eq("event_id", event.id),
    s.from("judging_scores").select("assignment_id, scores, comments, final").in("assignment_id", (assignments ?? []).map((a) => a.id)),
    s.from("submission_artifacts").select("submission_id, kind, label, url").in("submission_id", ids),
  ]);
  const teamIds = [...new Set((subs ?? []).map((x) => x.team_id))];
  const { data: teams } = await s.from("teams").select("id, name").in("id", teamIds);
  const done = (assignments ?? []).filter((a) => a.status === "submitted").length;

  return (
    <div className="flex flex-col gap-4">
      <span className="font-mono text-[11px] text-muted">
        {done} OF {(assignments ?? []).length} SCORED
      </span>
      {(assignments ?? []).map((a) => {
        const sub = subs?.find((x) => x.id === a.submission_id);
        if (!sub) return null;
        const rubric = rubrics?.find((r) => r.track === sub.track);
        const criteria = ((rubric?.criteria ?? []) as Criterion[]).map((c) => ({ ...c, max: c.max ?? 10 }));
        const sc = scores?.find((x) => x.assignment_id === a.id);
        const fields = sub.fields as Record<string, string>;
        return (
          <Module key={a.id} label={`${TRACK_LABEL[sub.track as Track].toUpperCase()} · ${teams?.find((t) => t.id === sub.team_id)?.name ?? ""}`} right={a.status.toUpperCase()}>
            <div className="grid gap-5 p-4 min-[1100px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-3">
                <h2 className="section-h !text-[24px]">{sub.title}</h2>
                {sub.status !== "submitted" && <span className="text-[12.5px] text-warn-text">Not finally submitted yet: the team may still change it.</span>}
                {TRACK_FIELDS[sub.track as Track].map((f) =>
                  fields[f.key] ? (
                    <div key={f.key} className="flex flex-col gap-0.5">
                      <span className="mono-label">{f.label.toUpperCase()}</span>
                      {f.kind === "url" ? (
                        <a href={fields[f.key]} target="_blank" rel="noopener noreferrer" className="break-all text-[13.5px]">
                          {fields[f.key]} ↗
                        </a>
                      ) : (
                        <p className="m-0 whitespace-pre-line text-[13.5px] leading-[1.55] text-ink-2">{fields[f.key]}</p>
                      )}
                    </div>
                  ) : null,
                )}
                {(artifacts ?? []).filter((x) => x.submission_id === sub.id).map((x) => (
                  <a key={x.url} href={x.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-[13px]">
                    {x.kind}: {x.label || x.url} ↗
                  </a>
                ))}
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="mono-label">{rubric?.name.toUpperCase() ?? "NO RUBRIC"}</span>
                  {rubric?.status !== "confirmed" && <span className="rounded-[2px] border border-warn-border bg-warn-tint px-1.5 py-[3px] font-mono text-[9.5px] text-warn-text">SAMPLE CRITERIA, NOT YET CONFIRMED</span>}
                </div>
                {criteria.length ? (
                  <ScoreForm assignmentId={a.id} criteria={criteria} initial={(sc?.scores ?? {}) as Record<string, number>} comments={sc?.comments ?? ""} final={!!sc?.final} status={a.status} />
                ) : (
                  <p className="m-0 text-[13.5px] text-muted">The organisers haven&apos;t set criteria for this track yet.</p>
                )}
              </div>
            </div>
          </Module>
        );
      })}
    </div>
  );
}
