"use client";

import { useState, useTransition } from "react";
import { COLORS, Module } from "@/components/system";
import { rubricIssues, type RubricCriterion } from "@/core/judging/results";
import { assignJudge, autoAssign, publishWinner, resolveFlag, saveRubric, unassign, unpublishWinner } from "./actions";

const input = "rounded-[3px] border border-[#CFCFC8] bg-white px-2 text-[13.5px] font-normal";

type Result = { ok: true } | { ok: false; error: string };

function useRun() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<Result | { ok: true; data: unknown }>, ok: string | ((d: unknown) => string)) =>
    start(async () => {
      const r = await fn();
      if (r.ok) setMessage({ ok: true, text: typeof ok === "string" ? ok : ok("data" in r ? r.data : null) });
      else setMessage({ ok: false, text: r.error });
    });
  const note = message && (
    <span role={message.ok ? "status" : "alert"} className="text-[12.5px]" style={{ color: message.ok ? COLORS.okText : COLORS.fault }}>
      {message.text}
    </span>
  );
  return { pending, run, note };
}

export function RubricEditor({ track, label, name: initialName, criteria: initial, status, locked }: { track: "build" | "policy"; label: string; name: string; criteria: RubricCriterion[]; status: string; locked: boolean }) {
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState<RubricCriterion[]>(initial);
  const { pending, run, note } = useRun();
  const total = rows.reduce((a, c) => a + (Number(c.weight) || 0), 0);
  const issues = rubricIssues(rows);
  const set = (i: number, patch: Partial<RubricCriterion>) => setRows((r) => r.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <Module label={`${label.toUpperCase()} CRITERIA`} right={status.toUpperCase()}>
      <div className="flex flex-col gap-3 p-4">
        {status !== "confirmed" && <p className="m-0 text-[12.5px] text-warn-text">These criteria aren&apos;t confirmed yet. Judges see a warning, and winners can&apos;t be published until you confirm them.</p>}
        {locked && <p className="m-0 text-[12.5px] text-ink-2">Judges have submitted final scores, so criteria can only be changed after reopening those scores.</p>}
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold">
          Rubric name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={`${input} h-9`} />
        </label>
        <div className="flex flex-col gap-2">
          {rows.map((c, i) => (
            <div key={i} className="grid gap-1.5 rounded-[3px] border border-hairline p-2.5 min-[800px]:grid-cols-[110px_minmax(0,1fr)_70px_70px_auto]">
              <input value={c.key} onChange={(e) => set(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="key" aria-label="Key" className={`${input} h-9 font-mono`} />
              <div className="flex flex-col gap-1.5">
                <input value={c.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Criterion name" aria-label="Name" className={`${input} h-9`} />
                <input value={c.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="What judges look for" aria-label="Description" className={`${input} h-9`} />
              </div>
              <label className="flex flex-col text-[10.5px] font-mono text-muted">
                WEIGHT
                <input type="number" min={1} max={100} value={c.weight} onChange={(e) => set(i, { weight: Number(e.target.value) })} className={`${input} h-9`} />
              </label>
              <label className="flex flex-col text-[10.5px] font-mono text-muted">
                MAX
                <input type="number" min={1} max={100} value={c.max} onChange={(e) => set(i, { max: Number(e.target.value) })} className={`${input} h-9`} />
              </label>
              <button type="button" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} className="h-9 self-end border-0 bg-transparent px-2 font-mono text-[11px] text-muted" aria-label={`Remove ${c.name || "criterion"}`}>
                REMOVE
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setRows((r) => [...r, { key: `criterion_${r.length + 1}`, name: "", description: "", weight: 0, max: 10 }])} className="btn-secondary self-start !h-9 !px-3 !text-[12.5px]">
            Add criterion
          </button>
        </div>
        <span className="font-mono text-[11px]" style={{ color: total === 100 ? COLORS.okText : COLORS.fault }}>
          WEIGHTS TOTAL {total} / 100
        </span>
        {issues.length > 0 && <span className="text-[12.5px] text-fault">{issues[0]}</span>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={pending || issues.length > 0} onClick={() => run(() => saveRubric(track, name, rows, false), "Saved as proposed.")} className="btn-secondary !h-10 !px-4 !text-[13px]">
            Save as proposed
          </button>
          <button type="button" disabled={pending || issues.length > 0} onClick={() => run(() => saveRubric(track, name, rows, true), "Criteria confirmed.")} className="btn-primary !h-10 !px-4 !text-[13px]">
            Save and confirm
          </button>
          {note}
        </div>
      </div>
    </Module>
  );
}

export function AutoAssign({ track, judges }: { track: "build" | "policy"; judges: number }) {
  const [n, setN] = useState(Math.min(3, Math.max(1, judges)));
  const { pending, run, note } = useRun();
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <label className="flex items-center gap-2">
        Judges per submission
        <input type="number" min={1} max={Math.max(1, judges)} value={n} onChange={(e) => setN(Number(e.target.value))} className={`${input} h-9 w-16`} />
      </label>
      <button type="button" disabled={pending || !judges} onClick={() => run(() => autoAssign(track, n), (d) => `Added ${d as number} assignment${d === 1 ? "" : "s"}.`)} className="btn-secondary !h-9 !px-3 !text-[12.5px]">
        Assign evenly
      </button>
      {note}
    </div>
  );
}

export function AssignOne({ submissionId, judges }: { submissionId: string; judges: { id: string; name: string }[] }) {
  const [judge, setJudge] = useState("");
  const { pending, run, note } = useRun();
  if (!judges.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <select value={judge} onChange={(e) => setJudge(e.target.value)} className={`${input} h-8 text-[12.5px]`} aria-label="Judge to assign">
        <option value="">Add a judge…</option>
        {judges.map((j) => (
          <option key={j.id} value={j.id}>
            {j.name}
          </option>
        ))}
      </select>
      <button type="button" disabled={pending || !judge} onClick={() => run(() => assignJudge(judge, submissionId), "Assigned.")} className="btn-secondary !h-8 !px-2.5 !text-[12px]">
        Assign
      </button>
      {note}
    </span>
  );
}

export function AssignmentActions({ id, status, final }: { id: string; status: string; final: boolean }) {
  const [reply, setReply] = useState("");
  const { pending, run, note } = useRun();
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {status === "clarification" && (
        <>
          <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the judge" className={`${input} h-8 text-[12.5px]`} />
          <button type="button" disabled={pending || !reply.trim()} onClick={() => run(() => resolveFlag(id, "answer", reply), "Reply sent.")} className="btn-secondary !h-8 !px-2.5 !text-[12px]">
            Reply
          </button>
        </>
      )}
      {status === "conflict" && (
        <button type="button" disabled={pending} onClick={() => run(() => resolveFlag(id, "clear_conflict", ""), "Conflict cleared.")} className="btn-secondary !h-8 !px-2.5 !text-[12px]">
          Clear conflict
        </button>
      )}
      {final && (
        <button type="button" disabled={pending} onClick={() => run(() => resolveFlag(id, "reopen", ""), "Scores reopened for the judge.")} className="btn-secondary !h-8 !px-2.5 !text-[12px]">
          Reopen scores
        </button>
      )}
      {!final && (
        <button type="button" disabled={pending} onClick={() => run(() => unassign(id), "Removed.")} className="h-8 border-0 bg-transparent px-1.5 font-mono text-[10.5px] text-muted">
          REMOVE
        </button>
      )}
      {note}
    </span>
  );
}

export function WinnerControl({ track, submissionId, defaultTitle, currentPlace, canPublish }: { track: "build" | "policy"; submissionId: string; defaultTitle: string; currentPlace: number | null; canPublish: boolean }) {
  const [place, setPlace] = useState(currentPlace ?? 1);
  const [title, setTitle] = useState(defaultTitle);
  const [confirming, setConfirming] = useState(false);
  const { pending, run, note } = useRun();
  if (!canPublish) return null;
  if (currentPlace) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px]" style={{ color: COLORS.okText }}>
          PUBLISHED · PLACE {currentPlace}
        </span>
        <button type="button" disabled={pending} onClick={() => run(() => unpublishWinner(track, currentPlace), "Unpublished.")} className="h-8 border-0 bg-transparent px-1.5 font-mono text-[10.5px] text-muted">
          UNPUBLISH
        </button>
        {note}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <select value={place} onChange={(e) => setPlace(Number(e.target.value))} className={`${input} h-8 text-[12.5px]`} aria-label="Place">
        {[1, 2, 3, 4, 5].map((p) => (
          <option key={p} value={p}>
            Place {p}
          </option>
        ))}
      </select>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Award title" maxLength={140} className={`${input} h-8 text-[12.5px]`} aria-label="Award title" />
      {confirming ? (
        <>
          <button type="button" disabled={pending} onClick={() => run(() => publishWinner(track, submissionId, place, title), "Published to everyone.")} className="btn-primary !h-8 !px-2.5 !text-[12px]">
            Confirm publish
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="h-8 border-0 bg-transparent px-1.5 font-mono text-[10.5px] text-muted">
            CANCEL
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="btn-secondary !h-8 !px-2.5 !text-[12px]">
          Publish winner
        </button>
      )}
      {note}
    </span>
  );
}
