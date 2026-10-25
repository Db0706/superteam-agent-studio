"use client";

import { useActionState, useState, useTransition } from "react";
import { COLORS, Led, Module } from "@/components/system";
import type { ActionResult } from "@/server/actions/rpc";
import { createInvite, createTeam, joinTeam, joinWithCode, leaveTeam, revealToken, rotateToken, saveProject, saveWallet, testConnection } from "./actions";

const input = "h-11 rounded-[3px] border border-[#CFCFC8] bg-white px-3 text-[15px] font-normal";
const label = "flex flex-col gap-1.5 text-[13px] font-semibold";

function Result({ state, success }: { state: ActionResult<unknown> | null; success?: string }) {
  if (!state) return null;
  if (!state.ok) return <p role="alert" className="m-0 text-[13px] text-fault">{state.error}</p>;
  return success ? <p role="status" className="m-0 text-[13px] text-ok-text">{success}</p> : null;
}

export function JoinOrCreate() {
  const [created, create, creating] = useActionState(createTeam, null);
  const [joined, join, joining] = useActionState(joinTeam, null);
  return (
    <div className="grid gap-4 min-[860px]:grid-cols-2">
      <Module label="CREATE A TEAM" right="YOU BECOME CAPTAIN">
        <form action={create} className="flex flex-col gap-3 p-4">
          <label className={label}>
            Team name
            <input name="name" required minLength={2} maxLength={60} className={input} />
          </label>
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1.5 text-[13px] font-semibold">Official track</legend>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="radio" name="track" value="build" defaultChecked /> Build Track
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="radio" name="track" value="policy" /> Policy Track
            </label>
          </fieldset>
          <button type="submit" disabled={creating} className="btn-primary self-start !h-11 !px-5 !text-[14px]">
            {creating ? "Creating…" : "Create team ▸"}
          </button>
          <Result state={created} />
        </form>
      </Module>
      <Module label="JOIN A TEAM" right="INVITE CODE">
        <form action={join} className="flex flex-col gap-3 p-4">
          <label className={label}>
            Invite code from your captain
            <input name="code" required className={`${input} font-mono`} autoComplete="off" />
          </label>
          <button type="submit" disabled={joining} className="btn-secondary self-start !h-11 !px-5 !text-[14px]">
            {joining ? "Joining…" : "Join team"}
          </button>
          <Result state={joined} />
        </form>
      </Module>
    </div>
  );
}

/** For people not on the imported list: the event code shown in the room makes them a participant. */
export function EventCodeForm() {
  // Submitted by hand, not via `action`: React resets an action form afterwards, wiping a wrong code.
  const [state, setState] = useState<ActionResult<null> | null>(null);
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const [university, setUniversity] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        start(async () => setState(await joinWithCode(null, form)));
      }}
      className="flex flex-col gap-3"
    >
      <label className={label}>
        Event code (on the screen in the room)
        <input name="code" required value={code} onChange={(e) => setCode(e.target.value)} className={`${input} max-w-[260px] font-mono uppercase`} autoComplete="off" />
      </label>
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 text-[13px] font-semibold">Your university</legend>
        {[["cambridge", "Cambridge"], ["oxford", "Oxford"], ["other", "Other"]].map(([value, name]) => (
          <label key={value} className="flex items-center gap-2 text-[14px]">
            <input type="radio" name="university" value={value} required checked={university === value} onChange={() => setUniversity(value)} /> {name}
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={pending} className="btn-primary self-start !h-11 !px-5 !text-[14px]">
        {pending ? "Joining…" : "Join the hackathon ▸"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function ProjectForm({ teamId, project }: { teamId: string; project: { name: string; repo_url: string | null; demo_url: string | null; endpoint_url: string | null } }) {
  const [saved, save, saving] = useActionState(saveProject.bind(null, teamId), null);
  const [endpoint, setEndpoint] = useState(project.endpoint_url ?? "");
  const [check, setCheck] = useState<{ ok: boolean; message: string; ms: number } | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [testing, startTest] = useTransition();
  return (
    <Module label="PROJECT" right="WHAT THE VERIFIER CALLS">
      <form action={save} className="flex flex-col gap-3 p-4">
        <label className={label}>
          Project name
          <input name="name" defaultValue={project.name} maxLength={80} className={input} />
        </label>
        <label className={label}>
          Your app&apos;s public URL
          <input name="endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://your-app.vercel.app" className={`${input} font-mono text-[14px]`} />
          <span className="text-[12.5px] font-normal leading-[1.45] text-muted">
            The AI Race verifier calls <code>/agent-studio/v1/health</code> and <code>/agent-studio/v1/tasks</code> on this URL. It must be a <b>public https address</b>, not localhost: deploy your app (for example to Vercel), or run <code>npx cloudflared tunnel --url http://localhost:3000</code> and paste the https address it prints.
          </span>
        </label>
        <div className="grid gap-3 min-[700px]:grid-cols-2">
          <label className={label}>
            Code repository (optional)
            <input name="repo" defaultValue={project.repo_url ?? ""} placeholder="https://github.com/…" className={input} />
          </label>
          <label className={label}>
            Demo link (optional)
            <input name="demo" defaultValue={project.demo_url ?? ""} placeholder="https://…" className={input} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving} className="btn-primary !h-11 !px-5 !text-[14px]">
            {saving ? "Saving…" : "Save project"}
          </button>
          <button
            type="button"
            disabled={testing || !endpoint}
            onClick={() =>
              startTest(async () => {
                setCheckError(null);
                const r = await testConnection(teamId, endpoint);
                if (r.ok) setCheck(r.data);
                else setCheckError(r.error);
              })
            }
            className="btn-secondary !h-11 !px-4 !text-[14px]"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
        </div>
        <Result state={saved} success="Saved." />
        {checkError && <p role="alert" className="m-0 text-[13px] text-fault">{checkError}</p>}
        {check && (
          <div role="status" className="flex items-start gap-2.5 rounded-[3px] border px-3 py-2.5 text-[13px] leading-[1.45]" style={check.ok ? { borderColor: "#B5E4CF", background: COLORS.okTint, color: COLORS.okText } : { borderColor: COLORS.fault, background: COLORS.faultTint, color: COLORS.fault }}>
            <Led color={check.ok ? COLORS.ok : COLORS.fault} className="mt-[5px]" />
            <span>
              {check.message} <span className="font-mono text-[11px] opacity-70">{check.ms} ms</span>
            </span>
          </div>
        )}
      </form>
    </Module>
  );
}

/** For the on-chain challenges: the team's Challenge ID and its registered devnet wallet. */
export function ChallengePanel({ teamId, challengeId, wallet }: { teamId: string; challengeId: string; wallet: string | null }) {
  const [saved, save, saving] = useActionState(saveWallet.bind(null, teamId), null);
  const [copied, setCopied] = useState(false);
  return (
    <Module label="ON-CHAIN CHALLENGES" right="OPTIONAL">
      <form action={save} className="flex flex-col gap-3 p-4 text-[13px] leading-[1.45] text-ink-2">
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-ink">Your Challenge ID</span>
          <span className="flex items-center gap-2">
            <code className="rounded-[3px] bg-ink px-3 py-1.5 font-mono text-[15px] text-[#EDEDE8]">{challengeId}</code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(challengeId);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {}
              }}
              className="border-0 bg-transparent p-0 font-mono text-[11px] text-signal"
            >
              {copied ? "COPIED" : "COPY"}
            </button>
          </span>
          <span>Use it exactly as shown in the challenge puzzles.</span>
        </div>
        <label className={label}>
          Team wallet (Solana devnet public address)
          <input name="wallet" defaultValue={wallet ?? ""} placeholder="Your devnet wallet's public address" className={`${input} font-mono text-[13px]`} autoComplete="off" />
        </label>
        <p className="m-0">Only transactions signed by this wallet count. Register it before the challenges open so the organisers can fund it and set up your puzzle.</p>
        <details className="text-[12.5px]">
          <summary className="cursor-pointer font-semibold text-ink">How do I make a devnet wallet?</summary>
          <ul className="m-0 mt-1.5 flex list-disc flex-col gap-1 pl-5">
            <li>
              Command line: <code>solana-keygen new -o team-wallet.json</code>, then <code>solana-keygen pubkey team-wallet.json</code> prints the address to paste here.
            </li>
            <li>
              JavaScript: <code>Keypair.generate()</code> from <code>@solana/web3.js</code>; save the secret key to a file and paste <code>publicKey.toBase58()</code> here.
            </li>
            <li>Keep the secret key file safe and out of your repo: your scripts sign with it. Test money only (devnet).</li>
          </ul>
        </details>
        <button type="submit" disabled={saving} className="btn-secondary self-start !h-10 !px-4 !text-[13px]">
          {saving ? "Saving…" : "Save wallet"}
        </button>
        <Result state={saved} success="Wallet saved." />
      </form>
    </Module>
  );
}

export function TokenPanel({ teamId }: { teamId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: typeof revealToken) =>
    start(async () => {
      const r = await fn(teamId);
      if (r.ok) setToken(r.data);
      else setError(r.error);
    });
  return (
    <Module label="VERIFIER TOKEN" right="TEAM ONLY">
      <div className="flex flex-col gap-3 p-4 text-[13px] leading-[1.45] text-ink-2">
        <p className="m-0">Every verifier request carries <code>Authorization: Bearer &lt;token&gt;</code>. Check it in your app so only the verifier can run tasks.</p>
        {token ? (
          <code className="block break-all rounded-[3px] bg-ink px-3 py-2 font-mono text-[12px] text-[#D4D4CE]">{token}</code>
        ) : (
          <button type="button" disabled={pending} onClick={() => run(revealToken)} className="btn-secondary self-start !h-10 !px-4 !text-[13px]">
            Show token
          </button>
        )}
        {token && (
          <button type="button" disabled={pending} onClick={() => run(rotateToken)} className="self-start border-0 bg-transparent p-0 font-mono text-[11px] text-signal">
            ROTATE TOKEN
          </button>
        )}
        {error && <p role="alert" className="m-0 text-fault">{error}</p>}
      </div>
    </Module>
  );
}

export function InvitePanel({ teamId }: { teamId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Module label="INVITE TEAMMATES" right="CAPTAIN">
      <div className="flex flex-col gap-3 p-4 text-[13px] leading-[1.45] text-ink-2">
        <p className="m-0">Create a code and share it with up to six teammates. It works for seven days. Teammates must be on the approved participant list.</p>
        {code && <code className="block rounded-[3px] bg-strip px-3 py-2 font-mono text-[15px] text-ink">{code}</code>}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await createInvite(teamId);
              if (r.ok) setCode(r.data);
              else setError(r.error);
            })
          }
          className="btn-secondary self-start !h-10 !px-4 !text-[13px]"
        >
          {code ? "Create another code" : "Create invite code"}
        </button>
        {error && <p role="alert" className="m-0 text-fault">{error}</p>}
      </div>
    </Module>
  );
}

export function LeaveTeam({ teamId }: { teamId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2 text-[13px]">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-2">Leave this team?</span>
          <button type="button" disabled={pending} onClick={() => start(async () => { const r = await leaveTeam(teamId); if (!r.ok) setError(r.error); })} className="h-9 rounded-[3px] border border-fault bg-white px-3 font-mono text-[11px] font-semibold text-fault">
            LEAVE
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="h-9 border-0 bg-transparent px-2 font-mono text-[11px] text-muted">
            CANCEL
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="self-start border-0 bg-transparent p-0 font-mono text-[11px] text-muted hover:text-fault">
          LEAVE TEAM
        </button>
      )}
      {error && <p role="alert" className="m-0 text-fault">{error}</p>}
    </div>
  );
}
