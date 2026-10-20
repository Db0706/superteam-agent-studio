"use client";

import { useState, useTransition } from "react";
import { COLORS } from "@/components/system";
import { flag, saveScores } from "@/app/judge/actions";
import { weightedScore, type RubricCriterion as Criterion } from "@/core/judging/results";

/** Independent scoring for one assignment. Judges only ever see their own scores. */
export function ScoreForm({ assignmentId, criteria, initial, comments: initialComments, final, status }: { assignmentId: string; criteria: Criterion[]; initial: Record<string, number>; comments: string; final: boolean; status: string }) {
  const [scores, setScores] = useState<Record<string, number>>(initial);
  const [comments, setComments] = useState(initialComments);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const complete = criteria.every((c) => typeof scores[c.key] === "number");
  const weighted = complete ? Math.round(weightedScore(criteria, scores) * 10) / 10 : null;
  const locked = final || status === "conflict";

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMessage(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error ?? "Could not save." });
    });

  return (
    <div className="flex flex-col gap-3">
      <fieldset disabled={locked} className="m-0 flex flex-col gap-2.5 border-0 p-0">
        {criteria.map((c) => (
          <label key={c.key} className="grid items-center gap-2 min-[700px]:grid-cols-[minmax(0,1fr)_120px]">
            <span className="flex flex-col">
              <b className="text-[14px]">
                {c.name} <span className="font-mono text-[10.5px] font-normal text-muted">WEIGHT {c.weight}%</span>
              </b>
              <span className="text-[12.5px] text-ink-2">{c.description}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={c.max}
                step={1}
                value={scores[c.key] ?? ""}
                onChange={(e) => setScores((s) => ({ ...s, [c.key]: Math.max(0, Math.min(c.max, Number(e.target.value))) }))}
                className="h-10 w-20 rounded-[3px] border border-[#CFCFC8] bg-white px-2 text-[15px]"
                aria-label={`${c.name} score out of ${c.max}`}
              />
              <span className="text-[12.5px] text-muted">/ {c.max}</span>
            </span>
          </label>
        ))}
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          Comments for the organisers (and feedback for the team, if shared)
          <textarea rows={4} value={comments} maxLength={5000} onChange={(e) => setComments(e.target.value)} className="rounded-[3px] border border-[#CFCFC8] bg-white px-3 py-2 text-[14px] font-normal" />
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] text-muted">{weighted === null ? "SCORE EVERY CRITERION" : `WEIGHTED ${weighted} / 100`}</span>
        {!locked && (
          <>
            <button type="button" disabled={pending} onClick={() => run(() => saveScores(assignmentId, scores, comments, false), "Draft saved.")} className="btn-secondary !h-10 !px-4 !text-[13px]">
              Save draft
            </button>
            <button type="button" disabled={pending || !complete} onClick={() => run(() => saveScores(assignmentId, scores, comments, true), "Final scores submitted.")} className="btn-primary !h-10 !px-4 !text-[13px]">
              Submit final scores
            </button>
          </>
        )}
        {final && <span className="font-mono text-[11px]" style={{ color: COLORS.okText }}>FINAL SCORES SUBMITTED</span>}
        {status === "conflict" && <span className="font-mono text-[11px]" style={{ color: COLORS.fault }}>CONFLICT DECLARED</span>}
      </div>
      {!final && status !== "conflict" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the organisers" className="h-9 flex-1 rounded-[3px] border border-[#CFCFC8] bg-white px-3 text-[13px]" />
          <button type="button" disabled={pending} onClick={() => run(() => flag(assignmentId, "clarification", note), "Clarification requested.")} className="btn-secondary !h-9 !px-3 !text-[12.5px]">
            Request clarification
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => flag(assignmentId, "conflict", note), "Conflict declared; this submission is removed from your scoring.")} className="btn-secondary !h-9 !px-3 !text-[12.5px]" style={{ color: COLORS.fault }}>
            Declare a conflict
          </button>
        </div>
      )}
      {message && (
        <p role={message.ok ? "status" : "alert"} className="m-0 text-[13px]" style={{ color: message.ok ? COLORS.okText : COLORS.fault }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
