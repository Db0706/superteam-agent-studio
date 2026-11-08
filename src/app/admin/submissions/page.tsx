import { Suspense } from "react";
import { Module } from "@/components/system";
import { Gate } from "@/components/platform/Gate";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { EventSummary } from "@/server/dal/viewer";
import { missingForFinal, TRACK_FIELDS, TRACK_LABEL, type Track } from "@/core/submissions/fields";
import { ReopenButton } from "./ReopenButton";

export const metadata = { title: "Submissions" };

export default function SubmissionsPage({ searchParams }: PageProps<"/admin/submissions">) {
  return (
    <Suspense fallback={<p className="text-[14px] text-muted">Loading…</p>}>
      <Gate path="/admin/submissions" roles={["organiser"]}>
        {async ({ event }) => {
          const sp = await searchParams;
          return <Submissions event={event} track={sp.track === "build" || sp.track === "policy" ? sp.track : null} open={String(sp.open ?? "")} />;
        }}
      </Gate>
    </Suspense>
  );
}

async function Submissions({ event, track, open }: { event: EventSummary; track: Track | null; open: string }) {
  const s = await createSupabaseServer();
  let q = s.from("submissions").select("id, team_id, track, title, status, fields, submitted_at, receipt_code, updated_at").eq("event_id", event.id).order("updated_at", { ascending: false });
  if (track) q = q.eq("track", track);
  const [{ data: subs }, { data: tracks }, { data: teams }] = await Promise.all([
    q,
    s.from("event_tracks").select("track, submissions_close_at").eq("event_id", event.id),
    s.from("teams").select("id, name").eq("event_id", event.id),
  ]);
  const ids = (subs ?? []).map((x) => x.id);
  const { data: artifacts } = ids.length ? await s.from("submission_artifacts").select("submission_id, kind, label, url").in("submission_id", ids) : { data: [] };
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: event.timezone, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "");
  const count = (t: Track, st?: string) => (subs ?? []).filter((x) => x.track === t && (!st || x.status === st)).length;
  const withoutSubmission = (teams ?? []).filter((t) => !(subs ?? []).some((x) => x.team_id === t.id)).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 min-[800px]:grid-cols-3">
        {(["build", "policy"] as Track[]).map((t) => (
          <Module key={t} label={TRACK_LABEL[t].toUpperCase()} right={tracks?.find((x) => x.track === t)?.submissions_close_at ? `CLOSES ${fmt(tracks.find((x) => x.track === t)!.submissions_close_at)}` : "NO DEADLINE SET"}>
            <p className="m-0 p-4 text-[14px]">
              <b className="text-[22px]">{count(t, "submitted")}</b> final · {count(t, "draft")} draft · {count(t, "reopened")} reopened
            </p>
          </Module>
        ))}
        <Module label="TEAMS WITHOUT A SUBMISSION">
          <p className="m-0 p-4 text-[22px] font-bold">{withoutSubmission}</p>
        </Module>
      </div>
      <nav className="flex gap-1" aria-label="Filter by track">
        {[["", "All"], ["build", "Build"], ["policy", "Policy"]].map(([v, l]) => (
          <a key={v} href={v ? `?track=${v}` : "?"} aria-current={(track ?? "") === v ? "page" : undefined} className={`rounded-[3px] px-3 py-1.5 font-mono text-[11px] hover:!no-underline ${(track ?? "") === v ? "bg-ink !text-white" : "!text-ink-2 hover:bg-strip"}`}>
            {l.toUpperCase()}
          </a>
        ))}
      </nav>
      <Module label="SUBMISSIONS" right={`${subs?.length ?? 0}`}>
        {subs?.length ? (
          <ul className="m-0 flex list-none flex-col p-0">
            {subs.map((x) => {
              const t = x.track as Track;
              const fields = x.fields as Record<string, string>;
              const missing = missingForFinal(t, x.title, fields);
              const expanded = open === x.id;
              return (
                <li key={x.id} className="flex flex-col gap-2 border-b border-hairline px-4 py-3 last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[14px]">
                      <b>{x.title || "Untitled"}</b> <span className="text-ink-2">· {teamName.get(x.team_id)} · {TRACK_LABEL[t]}</span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-muted">
                      {x.status.toUpperCase()}
                      {x.receipt_code && ` · RECEIPT ${x.receipt_code}`}
                      {x.submitted_at ? ` · ${fmt(x.submitted_at)}` : ` · EDITED ${fmt(x.updated_at)}`}
                      {x.status === "submitted" && <ReopenButton id={x.id} />}
                    </span>
                  </div>
                  {x.status !== "submitted" && missing.length > 0 && <span className="text-[12px] text-warn-text">Missing: {missing.join(", ")}</span>}
                  <a href={expanded ? `?${track ? `track=${track}` : ""}` : `?${track ? `track=${track}&` : ""}open=${x.id}`} className="self-start font-mono text-[11px]">
                    {expanded ? "HIDE DETAILS" : "VIEW DETAILS"}
                  </a>
                  {expanded && (
                    <div className="flex flex-col gap-2 rounded-[3px] bg-strip p-3">
                      {TRACK_FIELDS[t].map((f) =>
                        fields[f.key] ? (
                          <div key={f.key} className="flex flex-col gap-0.5">
                            <span className="mono-label">{f.label.toUpperCase()}</span>
                            {f.kind === "url" ? (
                              <a href={fields[f.key]} target="_blank" rel="noopener noreferrer" className="break-all text-[13px]">
                                {fields[f.key]} ↗
                              </a>
                            ) : (
                              <p className="m-0 whitespace-pre-line text-[13px] leading-[1.5] text-ink-2">{fields[f.key]}</p>
                            )}
                          </div>
                        ) : null,
                      )}
                      {(artifacts ?? []).filter((a) => a.submission_id === x.id).map((a) => (
                        <a key={a.url} href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-[13px]">
                          {a.kind}: {a.label || a.url} ↗
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="m-0 p-4 text-[13.5px] text-muted">No submissions yet.</p>
        )}
      </Module>
    </div>
  );
}
