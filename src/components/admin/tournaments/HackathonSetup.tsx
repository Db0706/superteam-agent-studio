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
  const [set, setSet] = useState<"ai" | "onchain">("onchain");
  const onchain = challenges && set === "onchain";
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
              <b>Build points</b>: six milestones of the team&apos;s own app. Idea locked in 50, App live 150, AI feature working 200, Agent uses tools 300, Agentic end-to-end payment 400, Submitted 200. Open all {hours} hours, in any order. Up to 1,300 points.
            </span>
          </label>
          <label className="flex items-start gap-2.5 rounded-[3px] border border-hairline p-3 text-[14px]">
            <input type="checkbox" name="bonusChallenges" checked={challenges} onChange={(e) => setChallenges(e.target.checked)} className="mt-1" />
            <span className="flex flex-col gap-2">
              <span>
                <b>Challenges</b> (optional for teams):
              </span>
              {challenges && (
                <span className="flex flex-col gap-1.5 text-[13.5px]">
                  <label className="flex items-start gap-2">
                    <input type="radio" name="challengeSet" value="onchain" checked={set === "onchain"} onChange={() => setSet("onchain")} className="mt-1" />
                    <span>
                      <b>Operation and Minesweeper</b> (Solana challenges): Operation (30 + 50 + 70) and Minesweeper (90 + 80 + 30). Solved with the team&apos;s own devnet wallet; no app needed.
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input type="radio" name="challengeSet" value="ai" checked={set === "ai"} onChange={() => setSet("ai")} className="mt-1" />
                    <span>
                      <b>Older AI challenges</b>: Structured Outputs 50, External Knowledge 100, Memory and Context 100, Reliability 100, Autonomous Workflow 150, Final Mission 200 (700 points). Checked against the team&apos;s app. Open the whole race; each unlocks once the one before passes.
                    </span>
                  </label>
                </span>
              )}
              {onchain && (
                <span className="flex flex-wrap items-center gap-2 text-[13px]">
                  Open from
                  <input name="challengeStartMinutes" type="number" min={0} max={hours * 60} step={5} defaultValue={20} className={`${field} !h-8 w-20`} />
                  minutes after the start, for
                  <input name="challengeHours" type="number" min={0.25} max={hours} step={0.25} value={challengeHours} onChange={(e) => setChallengeHours(Number(e.target.value))} className={`${field} !h-8 w-20`} />
                  hours
                </span>
              )}
            </span>
          </label>
        </fieldset>

        {stages && (
          <label className={labelCls}>
            Your devnet receiving address (teams pay this for the Agentic end-to-end payment step)
            <input name="payTo" required placeholder="A Solana devnet wallet address you control" className={`${field} font-mono text-[13px]`} />
          </label>
        )}

        {onchain && (
          <fieldset className="m-0 flex flex-col gap-2 rounded-[3px] border border-hairline p-3">
            <legend className="px-1 text-[13px] font-semibold">Challenge constants (from the challenge setup, copy exactly)</legend>
            <div className="grid gap-2 min-[700px]:grid-cols-2">
              <label className={labelCls}>
                Program ID
                <input name="programId" required className={`${field} font-mono text-[13px]`} autoComplete="off" />
              </label>
              <label className={labelCls}>
                CRED mint
                <input name="credMint" required className={`${field} font-mono text-[13px]`} autoComplete="off" />
              </label>
              <label className={labelCls}>
                Presentation account
                <input name="presentationAccount" required className={`${field} font-mono text-[13px]`} autoComplete="off" />
              </label>
              <label className={labelCls}>
                Salt
                <input name="salt" required className={`${field} font-mono text-[13px]`} autoComplete="off" />
              </label>
            </div>
            <label className={labelCls}>
              Devnet RPC address (optional; leave blank for public devnet)
              <input name="challengeRpc" placeholder="https://api.devnet.solana.com" className={`${field} font-mono text-[13px]`} autoComplete="off" />
            </label>
            <span className="text-[12.5px] text-muted">Teams see these on each challenge. They register their wallet and see their Challenge ID on their team page.</span>
          </fieldset>
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
            : `The practice run uses exactly this setup, 30× faster, with three pretend teams. Students never see it. ${onchain ? "Pretend teams have no wallet, so the on-chain challenges show as not passed in practice: that's expected. " : ""}Create and schedule makes the real race.`}
        </p>
      </form>
    </Module>
  );
}
