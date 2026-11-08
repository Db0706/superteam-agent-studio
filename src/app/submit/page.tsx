import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Module } from "@/components/system";
import { Gate } from "@/components/platform/Gate";
import { SubmissionForm, type SubmissionView } from "@/components/ops/SubmissionForm";
import type { Track } from "@/core/submissions/fields";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { EventSummary, Viewer } from "@/server/dal/viewer";

export const metadata: Metadata = { title: "Submit your project" };

export default function SubmitPage() {
  return (
    <div className="page-wrap flex flex-col gap-4 pb-20 pt-[clamp(24px,4vw,44px)]">
      <div className="flex max-w-[760px] flex-col gap-3">
        <span className="eyebrow">SUBMISSIONS</span>
        <h1 className="display-l">Submit your work.</h1>
        <p className="m-0 text-[15px] leading-normal text-ink-2">
          Submit to the event&apos;s official tracks. The AI Race is separate: whatever happened there, your submission is judged on its own merits.
        </p>
      </div>
      <Suspense fallback={<p className="text-[14px] text-muted">Loading…</p>}>
        <Gate path="/submit">{(ctx) => <Forms {...ctx} />}</Gate>
      </Suspense>
    </div>
  );
}

async function Forms({ viewer, event }: { viewer: Viewer; event: EventSummary }) {
  if (!viewer.team) {
    return (
      <Module label="NO TEAM YET">
        <p className="m-0 p-4 text-[14px] text-ink-2">
          Submissions belong to a team (a team of one is fine). <Link href="/team">Create or join a team</Link> first.
        </p>
      </Module>
    );
  }
  const s = await createSupabaseServer();
  const [{ data: tracks }, { data: subs }] = await Promise.all([
    s.from("event_tracks").select("track, name, description, submissions_close_at").eq("event_id", event.id).order("track"),
    s.from("submissions").select("id, track, status, title, fields, submitted_at, receipt_code").eq("team_id", viewer.team.id),
  ]);
  const ids = (subs ?? []).map((x) => x.id);
  const { data: artifacts } = ids.length ? await s.from("submission_artifacts").select("id, submission_id, kind, label, url").in("submission_id", ids).order("created_at") : { data: [] };
  const preferred = (viewer.team.track ?? "build") as Track;
  const ordered = [...(tracks ?? [])].sort((a, b) => (a.track === preferred ? -1 : b.track === preferred ? 1 : 0));
  return (
    <div className="flex flex-col gap-4">
      {ordered.map((t) => {
        const sub = subs?.find((x) => x.track === t.track);
        const view: SubmissionView = {
          id: sub?.id ?? null,
          status: (sub?.status as SubmissionView["status"]) ?? null,
          title: sub?.title ?? "",
          fields: (sub?.fields as Record<string, string>) ?? {},
          submittedAt: sub?.submitted_at ?? null,
          receipt: sub?.receipt_code ?? null,
          artifacts: (artifacts ?? []).filter((a) => a.submission_id === sub?.id),
        };
        return (
          <div key={t.track} className="flex flex-col gap-2">
            <p className="m-0 max-w-[760px] text-[13.5px] leading-[1.5] text-ink-2">{t.description}</p>
            <SubmissionForm track={t.track as Track} initial={view} closesAt={t.submissions_close_at} timezone={event.timezone} />
          </div>
        );
      })}
      {(tracks ?? []).length === 0 && <p className="text-[14px] text-muted">This event has no submission tracks configured.</p>}
    </div>
  );
}
