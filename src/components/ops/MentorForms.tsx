"use client";

import { useActionState, useState, useTransition } from "react";
import { COLORS, Module } from "@/components/system";
import { requestHelp, updateRequest } from "@/app/mentor/actions";
import { MENTOR_CATEGORIES as CATEGORIES } from "@/core/mentor-categories";

const input = "rounded-[3px] border border-[#CFCFC8] bg-white px-3 text-[14px] font-normal";

export function RequestHelpForm() {
  const [state, action, pending] = useActionState(requestHelp, null);
  return (
    <Module label="ASK FOR A MENTOR">
      <form action={action} className="flex flex-col gap-3 p-4 text-[13px]">
        <label className="flex flex-col gap-1 font-semibold">
          What do you need help with?
          <select name="category" className={`${input} h-10`}>
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Describe it
          <textarea name="description" rows={3} required minLength={3} maxLength={2000} placeholder="What you tried, what happened, any error message" className={`${input} py-2`} />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          Where are you sitting? (optional)
          <input name="location" maxLength={120} placeholder="Table 12, Keynes Hall" className={`${input} h-10`} />
        </label>
        <button type="submit" disabled={pending} className="btn-primary self-start !h-11 !px-5 !text-[14px]">
          {pending ? "Sending…" : "Request a mentor ▸"}
        </button>
        {state && !state.ok && <p role="alert" className="m-0 text-fault">{state.error}</p>}
        {state?.ok && <p role="status" className="m-0 text-ok-text">Request sent. A mentor will come to you.</p>}
      </form>
    </Module>
  );
}

export function RequestActions({ id, mine, status, claimedByMe, isMentor }: { id: string; mine: boolean; status: string; claimedByMe: boolean; isMentor: boolean }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (a: "claim" | "release" | "resolve" | "escalate" | "cancel") =>
    start(async () => {
      const r = await updateRequest(id, a, note);
      if (!r.ok) setError(r.error);
      else setNote("");
    });
  const open = status === "open" || status === "claimed" || status === "escalated";
  if (!open) return null;
  return (
    <div className="flex flex-col gap-2">
      {isMentor && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" className={`${input} h-9 text-[13px]`} />}
      <div className="flex flex-wrap gap-2">
        {isMentor && status !== "claimed" && (
          <button type="button" disabled={pending} onClick={() => act("claim")} className="btn-primary !h-9 !px-3 !text-[12.5px]">
            I&apos;ll take it
          </button>
        )}
        {isMentor && claimedByMe && (
          <>
            <button type="button" disabled={pending} onClick={() => act("resolve")} className="btn-primary !h-9 !px-3 !text-[12.5px]">
              Resolved
            </button>
            <button type="button" disabled={pending} onClick={() => act("release")} className="btn-secondary !h-9 !px-3 !text-[12.5px]">
              Release
            </button>
            <button type="button" disabled={pending} onClick={() => act("escalate")} className="btn-secondary !h-9 !px-3 !text-[12.5px]" style={{ color: COLORS.warnText }}>
              Escalate
            </button>
          </>
        )}
        {mine && (
          <button type="button" disabled={pending} onClick={() => act("cancel")} className="h-9 border-0 bg-transparent px-2 font-mono text-[11px] text-muted">
            CANCEL REQUEST
          </button>
        )}
      </div>
      {error && <span role="alert" className="text-[12.5px] text-fault">{error}</span>}
    </div>
  );
}
