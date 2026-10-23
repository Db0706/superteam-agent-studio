"use client";

import { useActionState, useState, useTransition } from "react";
import { COLORS, Module } from "@/components/system";
import type { LeaderboardTeam } from "@/server/dal/leaderboard";
import { awardPoints, clearFinalists, confirmFinalists, revokeAward, setLayerPoints, setTeamUniversity } from "./actions";

const input = "rounded-[3px] border border-[#CFCFC8] bg-white px-2 text-[13.5px] font-normal";

function useRun() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: ok } : { ok: false, text: r.error });
    });
  const note = msg && (
    <span role={msg.ok ? "status" : "alert"} className="text-[12px]" style={{ color: msg.ok ? COLORS.okText : COLORS.fault }}>
      {msg.text}
    </span>
  );
  return { pending, run, note };
}

export function FinalistPicker({ teams, confirmed }: { teams: LeaderboardTeam[]; confirmed: boolean }) {
  const [n, setN] = useState(Math.min(8, teams.length));
  const [sure, setSure] = useState(false);
  const { pending, run, note } = useRun();
  const picked = teams.slice(0, n);
  const cutTie = n > 0 && n < teams.length && teams[n].points === teams[n - 1].points;
  return (
    <Module label="FINALISTS" right={confirmed ? "CONFIRMED" : "NOT CONFIRMED YET"}>
      <div className="flex flex-col gap-3 p-4 text-[13.5px]">
        <p className="m-0 text-ink-2">Choose how many teams go through to the pitches once you know how many turned up. The top teams by points are selected, in leaderboard order.</p>
        <label className="flex items-center gap-2">
          Number of finalists
          <input type="number" min={1} max={Math.max(1, teams.length)} value={n} onChange={(e) => { setN(Math.max(1, Math.min(teams.length, Number(e.target.value)))); setSure(false); }} className={`${input} h-9 w-20`} />
          <span className="text-muted">of {teams.length} teams</span>
        </label>
        {cutTie && <p className="m-0 text-warn-text">Team {n + 1} has the same points as team {n}. The earlier scorer ranks higher; consider {n + 1} finalists.</p>}
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {picked.map((t, i) => (
            <li key={t.teamId} className="text-[13px]">
              <span className="font-mono text-muted">{i + 1}.</span> <b>{t.name}</b> <span className="text-muted">· {t.university} · {t.points} pts</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          {sure ? (
            <>
              <button type="button" disabled={pending || !picked.length} onClick={() => run(() => confirmFinalists(picked.map((t) => t.teamId)), "Finalists confirmed and announced.")} className="btn-primary !h-10 !px-4 !text-[13px]">
                Confirm {picked.length} finalists
              </button>
              <button type="button" onClick={() => setSure(false)} className="h-10 border-0 bg-transparent px-2 font-mono text-[11px] text-muted">CANCEL</button>
            </>
          ) : (
            <button type="button" disabled={!picked.length} onClick={() => setSure(true)} className="btn-primary !h-10 !px-4 !text-[13px]">
              {confirmed ? "Replace finalists" : "Choose these finalists"}
            </button>
          )}
          {confirmed && (
            <button type="button" disabled={pending} onClick={() => run(clearFinalists, "Finalists cleared.")} className="btn-secondary !h-10 !px-4 !text-[13px]">
              Clear finalists
            </button>
          )}
          {note}
        </div>
      </div>
    </Module>
  );
}

export function AwardForm({ teams }: { teams: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(awardPoints, null);
  return (
    <Module label="AWARD POINTS" right="AUDITED · SHOWN ON THE LEADERBOARD">
      <form action={action} className="grid gap-2 p-4 text-[13px] min-[700px]:grid-cols-[minmax(0,1fr)_100px]">
        <select name="team" required defaultValue="" className={`${input} h-10`} aria-label="Team">
          <option value="" disabled>Choose a team…</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <input name="points" type="number" required min={-10000} max={10000} placeholder="Points" className={`${input} h-10`} aria-label="Points (negative to deduct)" />
        <input name="label" required maxLength={80} placeholder="What for, e.g. Escape room: Assembly" className={`${input} h-10 min-[700px]:col-span-2`} aria-label="What the points are for" />
        <input name="reason" maxLength={500} placeholder="Note for the audit log (optional)" className={`${input} h-10 min-[700px]:col-span-2`} aria-label="Note" />
        <div className="flex flex-wrap items-center gap-2 min-[700px]:col-span-2">
          <button type="submit" disabled={pending} className="btn-primary !h-10 !px-4 !text-[13px]">Award</button>
          {state && !state.ok && <span role="alert" className="text-fault">{state.error}</span>}
          {state?.ok && <span role="status" className="text-ok-text">Awarded.</span>}
        </div>
      </form>
    </Module>
  );
}

export function RevokeButton({ id }: { id: string }) {
  const { pending, run, note } = useRun();
  return (
    <span className="flex items-center gap-1.5">
      <button type="button" disabled={pending} onClick={() => run(() => revokeAward(id, "Revoked by an organiser"), "Revoked.")} className="h-7 border-0 bg-transparent px-1.5 font-mono text-[10.5px] text-muted">REVOKE</button>
      {note}
    </span>
  );
}

export function UniversitySelect({ teamId, override }: { teamId: string; override: string | null }) {
  const { pending, run, note } = useRun();
  return (
    <span className="flex items-center gap-1.5">
      <select defaultValue={override ?? "auto"} disabled={pending} onChange={(e) => run(() => setTeamUniversity(teamId, e.target.value), "Saved.")} className={`${input} h-8 text-[12.5px]`} aria-label="University">
        <option value="auto">From members</option>
        <option value="cambridge">Cambridge</option>
        <option value="oxford">Oxford</option>
        <option value="mixed">Mixed</option>
        <option value="other">Other</option>
      </select>
      {note}
    </span>
  );
}

export function LayerPointsInput({ tournamentId, layerKey, points }: { tournamentId: string; layerKey: string; points: number }) {
  const [value, setValue] = useState(points);
  const { pending, run, note } = useRun();
  return (
    <span className="flex items-center gap-1.5">
      <input type="number" min={0} max={10000} value={value} onChange={(e) => setValue(Number(e.target.value))} className={`${input} h-8 w-20 text-[12.5px]`} aria-label={`Points for ${layerKey}`} />
      <button type="button" disabled={pending || value === points} onClick={() => run(() => setLayerPoints(tournamentId, layerKey, value), "Saved.")} className="btn-secondary !h-8 !px-2.5 !text-[12px]">Save</button>
      {note}
    </span>
  );
}
