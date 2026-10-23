"use client";

import { useState, useTransition } from "react";
import { reopenSubmission } from "./actions";

export function ReopenButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary !h-8 !px-2.5 !text-[12px]">
        Reopen
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audited)" className="h-8 rounded-[3px] border border-[#CFCFC8] bg-white px-2 text-[12.5px]" />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await reopenSubmission(id, reason);
            if (r.ok) setOpen(false);
            else setError(r.error);
          })
        }
        className="btn-primary !h-8 !px-2.5 !text-[12px]"
      >
        Confirm reopen
      </button>
      <button type="button" onClick={() => setOpen(false)} className="h-8 border-0 bg-transparent px-1.5 font-mono text-[10.5px] text-muted">
        CANCEL
      </button>
      {error && <span role="alert" className="text-[12px] text-fault">{error}</span>}
    </span>
  );
}
