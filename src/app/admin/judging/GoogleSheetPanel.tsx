"use client";

import { useState, useTransition } from "react";
import { Module } from "@/components/system";
import { PLACES } from "@/core/judging/sheet";
import { createSheet, disconnectGoogle, previewSheet, publishFromSheet, type SyncPreview } from "./google";

const STATUS: Record<string, string> = {
  connected: "Google connected.",
  cancelled: "Google sign-in was cancelled.",
  expired: "That sign-in link expired. Try Connect Google again.",
  failed: "Couldn't connect Google. Try again.",
  "not-organiser": "Only organisers can connect Google.",
  "not-configured": "Google Sheets isn't set up on the server yet.",
};

export function GoogleSheetPanel({ configured, email, sheetUrl, status }: { configured: boolean; email: string | null; sheetUrl: string | null; status?: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(status && STATUS[status] ? { ok: status === "connected", text: STATUS[status] } : null);
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const run = <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, done: (d: T) => void) =>
    start(async () => {
      setNote(null);
      const r = await fn();
      if (r.ok) done(r.data);
      else setNote({ ok: false, text: r.error });
    });

  return (
    <Module label="GOOGLE SHEET" right={email ? `CONNECTED · ${email.toUpperCase()}` : "NOT CONNECTED"}>
      <div className="flex flex-col gap-3 p-4 text-[13.5px] leading-normal">
        {!configured ? (
          <p className="m-0 text-ink-2">
            Judges can score in a Google Sheet and you publish the winners from it. This needs a one-time Google setup on the server: see <code>docs/GOOGLE_SHEETS.md</code>.
          </p>
        ) : !email ? (
          <>
            <p className="m-0 text-ink-2">Create a judging sheet in your Google Drive, shared with every judge. The site can only see sheets it creates, nothing else in your Drive.</p>
            <a href="/api/google/connect" className="btn-primary self-start !h-10 !px-4 !text-[13px]">Connect Google ▸</a>
          </>
        ) : (
          <>
            <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-ink-2">
              <li><b>Create the sheet.</b> One tab per track, one row per final submission, shared with every judge.</li>
              <li>Judges score each criterion and set <b>Place</b> to {PLACES.join(", ")}.</li>
              <li><b>Check the sheet</b>, then <b>Publish winners</b>. The winners page and leaderboard update.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              {sheetUrl && (
                <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="btn-primary !h-10 !px-4 !text-[13px]">Open the sheet ↗</a>
              )}
              <button type="button" disabled={pending} className="btn-secondary !h-10 !px-4 !text-[13px]" onClick={() => run(createSheet, (d) => setNote({ ok: true, text: `Sheet created and shared with ${d.shared} judge${d.shared === 1 ? "" : "s"}.${d.failed.length ? ` Couldn't share with: ${d.failed.join(", ")}.` : ""}` }))}>
                {pending ? "Working…" : sheetUrl ? "Create a new sheet" : "Create judging sheet"}
              </button>
              {sheetUrl && (
                <button type="button" disabled={pending} className="btn-secondary !h-10 !px-4 !text-[13px]" onClick={() => run(previewSheet, (d) => setPreview(d))}>
                  Check the sheet
                </button>
              )}
              <button type="button" disabled={pending} className="ml-auto border-0 bg-transparent font-mono text-[10.5px] text-muted hover:text-fault" onClick={() => run(disconnectGoogle, () => setPreview(null))}>
                DISCONNECT GOOGLE
              </button>
            </div>
          </>
        )}

        {preview && (
          <div className="flex flex-col gap-3 rounded-[3px] border border-ink p-3">
            {preview.tracks.map((t) => {
              const placed = [1, 2, 3].map((n) => ({ n, r: t.results.find((x) => x.place === n) }));
              const scored = t.results.filter((x) => x.total !== null).length;
              return (
                <div key={t.track} className="flex flex-col gap-1.5">
                  <b className="font-mono text-[11px] tracking-[0.04em]">{t.track === "build" ? "BUILD TRACK" : "POLICY TRACK"} · {scored} OF {t.results.length} SCORED</b>
                  {placed.map(({ n, r }) => (
                    <span key={n}>
                      <span className="inline-block w-[150px] text-muted">{PLACES[n - 1]}</span>
                      {r ? <b>{r.project}</b> : <span className="text-muted">not set in the sheet (will be cleared)</span>}
                      {r?.total != null && <span className="text-muted"> · {r.total}/100</span>}
                    </span>
                  ))}
                  {t.problems.map((p) => (
                    <span key={p} className="text-fault">{p}</span>
                  ))}
                </div>
              );
            })}
            <button type="button" disabled={pending} className="btn-primary self-start !h-10 !px-4 !text-[13px]" onClick={() => run(publishFromSheet, (d) => { setPreview(null); setNote({ ok: true, text: `Published ${d.published} place${d.published === 1 ? "" : "s"}${d.cleared ? `, cleared ${d.cleared}` : ""}. The winners page and leaderboard are updated.` }); })}>
              {pending ? "Publishing…" : "Publish winners from the sheet"}
            </button>
          </div>
        )}

        {note && <p role={note.ok ? "status" : "alert"} className={`m-0 ${note.ok ? "text-ok-text" : "text-fault"}`}>{note.text}</p>}
      </div>
    </Module>
  );
}
