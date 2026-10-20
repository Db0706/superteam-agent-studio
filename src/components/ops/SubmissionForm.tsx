"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { COLORS, Led, Module } from "@/components/system";
import { missingForFinal, TRACK_FIELDS, TRACK_LABEL, type Track } from "@/core/submissions/fields";
import { addLink, saveDraft, submitFinal } from "@/app/submit/actions";

export interface SubmissionView {
  id: string | null;
  status: "draft" | "submitted" | "reopened" | null;
  title: string;
  fields: Record<string, string>;
  submittedAt: string | null;
  receipt: string | null;
  artifacts: { id: string; kind: string; label: string; url: string | null }[];
}

const input = "rounded-[3px] border border-[#CFCFC8] bg-white px-3 text-[14px] font-normal";

/** One track's submission: autosaves drafts, then submits once with a receipt. */
export function SubmissionForm({ track, initial, closesAt, timezone }: { track: Track; initial: SubmissionView; closesAt: string | null; timezone: string }) {
  const [title, setTitle] = useState(initial.title);
  const [fields, setFields] = useState<Record<string, string>>(initial.fields);
  const [id, setId] = useState(initial.id);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const final = initial.status === "submitted";
  const dirty = useRef(false);

  // Debounced autosave while editing.
  useEffect(() => {
    if (final || !dirty.current) return;
    const timer = setTimeout(async () => {
      setSaved("saving");
      const r = await saveDraft(track, title, fields);
      if (r.ok) {
        setId(r.data.id);
        setSaved("saved");
      } else {
        setSaved("error");
        setError(r.error);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [title, fields, track, final]);

  const edit = (k: string, v: string) => {
    dirty.current = true;
    setFields((f) => ({ ...f, [k]: v }));
  };
  const missing = missingForFinal(track, title, fields);

  return (
    <Module
      label={TRACK_LABEL[track].toUpperCase()}
      right={
        final ? (
          <>
            <Led color={COLORS.ok} /> SUBMITTED
          </>
        ) : initial.status === "reopened" ? (
          "REOPENED BY ORGANISERS"
        ) : saved === "saving" ? (
          "SAVING…"
        ) : saved === "saved" ? (
          "DRAFT SAVED"
        ) : (
          "DRAFT"
        )
      }
    >
      <div className="flex flex-col gap-4 p-4">
        {final && (
          <div role="status" className="flex flex-col gap-1 rounded-[3px] border px-4 py-3 text-[14px]" style={{ borderColor: "#B5E4CF", background: COLORS.okTint, color: COLORS.okText }}>
            <b>Submitted {initial.submittedAt ? new Date(initial.submittedAt).toLocaleString("en-GB", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }) : ""}.</b>
            <span>
              Receipt <code className="font-mono">{initial.receipt}</code>. Keep it: it proves your submission was in on time. To change anything now, ask an organiser to reopen it.
            </span>
          </div>
        )}
        {closesAt && !final && (
          <p className="m-0 text-[13px] text-ink-2">
            Submissions close <b>{new Date(closesAt).toLocaleString("en-GB", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit" })}</b>. Drafts save automatically; only a final submission counts.
          </p>
        )}
        <fieldset disabled={final} className="m-0 flex flex-col gap-3 border-0 p-0">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            {track === "build" ? "Project title" : "Proposal title"} *
            <input value={title} maxLength={160} onChange={(e) => { dirty.current = true; setTitle(e.target.value); }} className={`${input} h-11`} />
          </label>
          {TRACK_FIELDS[track].map((f) => (
            <label key={f.key} className="flex flex-col gap-1.5 text-[13px] font-semibold">
              {f.label}
              {f.required ? " *" : " (optional)"}
              {f.help && <span className="text-[12.5px] font-normal text-muted">{f.help}</span>}
              {f.kind === "longtext" ? (
                <textarea rows={4} maxLength={f.max} value={fields[f.key] ?? ""} onChange={(e) => edit(f.key, e.target.value)} className={`${input} py-2`} />
              ) : (
                <input type="url" maxLength={f.max} value={fields[f.key] ?? ""} onChange={(e) => edit(f.key, e.target.value)} placeholder="https://" className={`${input} h-11 font-mono text-[13px]`} />
              )}
            </label>
          ))}
        </fieldset>

        <Material submissionId={id} artifacts={initial.artifacts} disabled={final} />

        {!final && (
          <div className="flex flex-col gap-2 border-t border-hairline pt-4">
            {missing.length > 0 && <p className="m-0 text-[13px] text-muted">To submit, add: {missing.join(", ")}.</p>}
            {confirming ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px]">Submit now? You can&apos;t edit after this unless an organiser reopens it.</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      setError(null);
                      const r = await submitFinal(track, title, fields);
                      if (!r.ok) setError(r.error);
                      setConfirming(false);
                    })
                  }
                  className="btn-primary !h-11 !px-5 !text-[14px]"
                >
                  {pending ? "Submitting…" : "Yes, submit"}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="btn-secondary !h-11 !px-4 !text-[14px]">
                  Not yet
                </button>
              </div>
            ) : (
              <button type="button" disabled={missing.length > 0} onClick={() => setConfirming(true)} className="btn-primary self-start !h-11 !px-5 !text-[14px]">
                Submit to the {TRACK_LABEL[track]} ▸
              </button>
            )}
          </div>
        )}
        {error && <p role="alert" className="m-0 text-[13px] text-fault">{error}</p>}
      </div>
    </Module>
  );
}

function Material({ submissionId, artifacts, disabled }: { submissionId: string | null; artifacts: SubmissionView["artifacts"]; disabled: boolean }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"screenshot" | "document" | "slides" | "link">("screenshot");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold">Supporting material (screenshots, slides, documents)</span>
      {artifacts.length > 0 && (
        <ul className="m-0 flex flex-col gap-1 pl-5 text-[13.5px]">
          {artifacts.map((a) => (
            <li key={a.id}>
              <a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer">
                {a.label || a.url} ↗
              </a>{" "}
              <span className="font-mono text-[10.5px] text-muted">{a.kind.toUpperCase()}</span>
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={`${input} h-10`} aria-label="Kind">
            <option value="screenshot">Screenshot</option>
            <option value="slides">Slides</option>
            <option value="document">Document</option>
            <option value="link">Other link</option>
          </select>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className={`${input} h-10 flex-1`} />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https:// (e.g. a shared Drive or image link)" className={`${input} h-10 flex-[2] font-mono text-[12.5px]`} />
          <button
            type="button"
            disabled={pending || !submissionId || !url}
            onClick={() => start(async () => { const r = await addLink(submissionId!, kind, label, url); if (!r.ok) setError(r.error); else { setLabel(""); setUrl(""); } })}
            className="btn-secondary !h-10 !px-4 !text-[13px]"
          >
            Add
          </button>
        </div>
      )}
      {!submissionId && !disabled && <span className="text-[12.5px] text-muted">Start typing above first; material attaches to the saved draft.</span>}
      {error && <span role="alert" className="text-[12.5px] text-fault">{error}</span>}
    </div>
  );
}
