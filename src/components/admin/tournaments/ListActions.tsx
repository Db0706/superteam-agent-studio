"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Module } from "@/components/system";
import { archive, createTournament, duplicate } from "@/app/admin/tournaments/actions";

export const field = "h-10 rounded-[3px] border border-[#CFCFC8] bg-white px-3 text-[14px] font-normal";
export const labelCls = "flex flex-col gap-1 text-[13px] font-semibold";

export function CreateTournamentForm() {
  const [state, action, pending] = useActionState(createTournament, null);
  const [start, setStart] = useState<"points" | "template" | "blank">("points");
  return (
    <Module label="NEW TOURNAMENT">
      <form action={action} className="flex flex-col gap-3 p-4">
        <label className={labelCls}>
          Name
          <input name="name" required maxLength={100} defaultValue="The AI Race" className={field} />
        </label>
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0 text-[14px]">
          <legend className="mb-1 text-[13px] font-semibold">Start from</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="start" value="points" checked={start === "points"} onChange={() => setStart("points")} /> Points race: build stages and challenges, live leaderboard, no eliminations
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="start" value="template" checked={start === "template"} onChange={() => setStart("template")} /> The eight AI Race layers (editable)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="start" value="blank" checked={start === "blank"} onChange={() => setStart("blank")} /> A single layer to build from
          </label>
        </fieldset>
        {start === "points" ? (
          <div className="grid grid-cols-2 gap-2">
            <label className={labelCls}>
              Build sprint (hours)
              <input name="sprintHours" type="number" min={1} max={24} step="0.5" defaultValue={7} className={field} />
            </label>
            <label className={labelCls}>
              Minutes per challenge
              <input name="interval" type="number" min={1} max={1440} defaultValue={45} className={field} />
            </label>
            <input type="hidden" name="layers" value="6" />
            <input type="hidden" name="mode" value="checkpoint" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <label className={labelCls}>
              Layers
              <input name="layers" type="number" min={1} max={8} defaultValue={8} disabled={start === "blank"} className={field} />
            </label>
            <label className={labelCls}>
              Minutes per layer
              <input name="interval" type="number" min={1} max={1440} defaultValue={30} className={field} />
            </label>
          </div>
        )}
        <label className={labelCls} hidden={start === "points"}>
          Mode
          <select name="mode" defaultValue="survival" disabled={start === "points"} className={field}>
            <option value="survival">Survival: fail a layer, leave the race</option>
            <option value="ranked">Ranked: top teams advance each layer</option>
            <option value="checkpoint">Checkpoint: achievements, no eliminations</option>
            <option value="hybrid">Hybrid: checkpoints first, then eliminations</option>
          </select>
        </label>
        {start === "blank" && <input type="hidden" name="layers" value="1" />}
        <button type="submit" disabled={pending} className="btn-primary self-start !h-11 !px-5 !text-[14px]">
          {pending ? "Creating…" : "Create draft ▸"}
        </button>
        <p className="m-0 text-[12.5px] text-muted">Everything is editable afterwards: layers, timings, rules and verification.</p>
        {state && !state.ok && <p role="alert" className="m-0 text-[13px] text-fault">{state.error}</p>}
      </form>
    </Module>
  );
}

export function RowActions({ id, name, status }: { id: string; name: string; status: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const live = ["scheduled", "running", "paused", "finalising", "completed", "cancelled"].includes(status);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {live && (
        <Link href={`/admin/tournaments/${id}/control`} className="btn-primary !h-9 !px-3 !text-[12.5px] hover:!no-underline">
          Control room
        </Link>
      )}
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await duplicate(id, `${name} (copy)`); if (!r.ok) setError(r.error); })} className="btn-secondary !h-9 !px-3 !text-[12.5px]">
        Duplicate
      </button>
      {!["scheduled", "running", "paused", "finalising"].includes(status) && (
        <button type="button" disabled={pending} onClick={() => start(async () => { const r = await archive(id); if (!r.ok) setError(r.error); })} className="h-9 border-0 bg-transparent px-2 font-mono text-[11px] text-muted hover:text-fault">
          ARCHIVE
        </button>
      )}
      {error && <span role="alert" className="text-[12px] text-fault">{error}</span>}
    </div>
  );
}
