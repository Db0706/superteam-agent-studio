"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { Module } from "@/components/system";
import { createHackathon, rehearseHackathon } from "@/app/admin/tournaments/actions";
import { field, labelCls } from "./ListActions";

/**
 * The simple way to set up the event's race: how long the hackathon runs, whether teams score
 * build stages, bonus challenges or both, and when it starts. One button creates, publishes and
 * schedules it; another runs a fast practice of exactly the same setup first.
 */
export function HackathonSetup({ defaultName }: { defaultName: string }) {
  const [created, create, creating] = useActionState(createHackathon, null);
  const [rehearsed, rehearse, rehearsing] = useActionState(rehearseHackathon, null);
  const [stages, setStages] = useState(true);
  const [challenges, setChallenges] = useState(true);
  const [hours, setHours] = useState(7);
  const [challengeHours, setChallengeHours] = useState(2);
  const [sure, setSure] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  // Submitted by hand (not <form action>) so a validation error doesn't reset what was typed.
  const submit = (dispatch: (data: FormData) => void) => {
    if (!form.current?.reportValidity()) return;
    const data = new FormData(form.current);
    startTransition(() => dispatch(data));
  };
  const error = (created && !created.ok && created.error) || (rehearsed && !rehearsed.ok && rehearsed.error);
  const pending = creating || rehearsing;

  return (
    <Module label="SET UP THE HACKATHON" right="SIMPLE SETUP">
      <form ref={form} onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4 p-4">
        <div className="grid gap-3 min-[700px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.7fr)]">
          <label className={labelCls}>
            Name (students see this)
            <input name="name" required maxLength={100} defaultValue={defaultName} className={field} />
          </label>
          <label className={labelCls}>
            Starts at (London time)
            <input name="start" type="datetime-local" required className={field} onChange={() => setSure(false)} />
          </label>
          <label className={labelCls}>
            Length (hours)
            <input name="hours" type="number" min={1} max={24} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} className={field} />
          </label>
        </div>

        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-1 text-[13px] font-semibold">How teams score</legend>
          <label className="flex items-start gap-2.5 rounded-[3px] border border-hairline p-3 text-[14px]">
            <input type="checkbox" name="buildStages" checked={stages} onChange={(e) => setStages(e.target.checked)} className="mt-1" />
            <span>
              <b>Build points</b>: six milestones of the team&apos;s own app (app live, idea locked in, AI feature, agent uses tools, on-chain payment, submitted). Open all {hours} hours, in any order. Up to 600 points.
            </span>
          </label>
          <label className="flex items-start gap-2.5 rounded-[3px] border border-hairline p-3 text-[14px]">
            <input type="checkbox" name="bonusChallenges" checked={challenges} onChange={(e) => setChallenges(e.target.checked)} className="mt-1" />
            <span className="flex flex-col gap-2">
              <span>
                <b>Bonus challenges</b>: four optional challenges for extra points: Quick Draw (100), Look It Up (150), Remember Me (175), Shop Run (225). All open together at the start.
              </span>
              {challenges && (
                <span className="flex flex-wrap items-center gap-2 text-[13px]">
                  Open for the first
                  <input name="challengeHours" type="number" min={0.25} max={hours} step={0.25} value={challengeHours} onChange={(e) => setChallengeHours(Number(e.target.value))} className={`${field} !h-8 w-20`} />
                  hours
                </span>
              )}
            </span>
          </label>
        </fieldset>

        {stages && (
          <label className={labelCls}>
            Your devnet receiving address (for the on-chain payment build stage)
            <input name="payTo" required placeholder="A Solana devnet wallet address you control" className={`${field} font-mono text-[13px]`} />
          </label>
        )}

        {error && (
          <p role="alert" className="m-0 text-[13.5px] text-fault">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          <button type="button" onClick={() => submit(rehearse)} disabled={pending} className="btn-secondary !h-11 !px-4 !text-[13.5px]">
            {rehearsing ? "Starting practice…" : "Try it first (15-min practice)"}
          </button>
          {sure ? (
            <>
              <button type="button" onClick={() => submit(create)} disabled={pending} className="btn-primary !h-11 !px-4 !text-[13.5px]">
                {creating ? "Setting up…" : "Yes, create and schedule"}
              </button>
              <button type="button" onClick={() => setSure(false)} className="h-11 border-0 bg-transparent px-2 font-mono text-[11px] text-muted">
                CANCEL
              </button>
            </>
          ) : (
            <button type="button" disabled={pending} onClick={() => setSure(true)} className="btn-primary !h-11 !px-4 !text-[13.5px]">
              Create and schedule ▸
            </button>
          )}
        </div>
        <p className="m-0 text-[12.5px] leading-[1.5] text-muted">
          {sure
            ? "This publishes the race (teams can join straight away) and starts it at the time above. After that you can pause, extend or cancel it from its control room, but not change the setup."
            : "The practice run uses exactly this setup, 30× faster, with three pretend teams. Students never see it. Create and schedule makes the real race."}
        </p>
      </form>
    </Module>
  );
}
