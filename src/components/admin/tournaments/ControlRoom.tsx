"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { COLORS, Led, Module } from "@/components/system";
import { formatRemaining, useServerClock } from "@/components/race/useServerClock";
import { attemptEvidence, control, extendLayer, overrideDecision, reinstate, reprocessAttempt, reviewAttempt } from "@/app/admin/tournaments/actions";
import { fetchControlState } from "@/app/admin/tournaments/[id]/control/actions";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { ControlState } from "@/server/dal/control";
import type { ActionResult } from "@/server/actions/rpc";
import { field } from "./ListActions";
import { formatZoned } from "./zoned-time";

/** The live operations view for one tournament. Realtime nudges with 5-second polling. */
export function ControlRoom({ initial, timezone }: { initial: ControlState; timezone: string }) {
  const [s, setS] = useState(initial);
  const now = useServerClock(s.serverNow);
  const busy = useRef(false);
  const reload = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const next = await fetchControlState(s.tournament.id);
      if (next) setS(next);
    } finally {
      busy.current = false;
    }
  }, [s.tournament.id]);
  useEffect(() => {
    const id = setInterval(reload, 5000);
    return () => clearInterval(id);
  }, [reload]);
  useEffect(() => {
    const supabase = supabaseBrowser();
    const filter = `tournament_id=eq.${s.tournament.id}`;
    const ch = supabase
      .channel(`control-${s.tournament.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_events", filter }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "layer_runs", filter }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_participants", filter }, () => void reload())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [s.tournament.id, reload]);

  const t = s.tournament;
  // Points races (checkpoint) never eliminate, so elimination counts and controls are hidden.
  const pointsRace = t.mode === "checkpoint";
  const names = useMemo(() => new Map(s.participants.map((p) => [p.id, p.name])), [s.participants]);
  const layerById = useMemo(() => new Map(s.layers.map((l) => [l.id, l])), [s.layers]);
  const current = s.layers.find((l) => l.state === "open") ?? s.layers.find((l) => l.state !== "closed");
  const review = s.attempts.filter((a) => a.status === "review_required" || a.status === "error");
  const worker = s.workers[0];
  const workerAge = worker ? Math.round((now - Date.parse(worker.lastSeen)) / 1000) : null;
  const ended = t.status === "completed" || t.status === "cancelled";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow flex items-center gap-2">
            <Led color={t.status === "running" ? COLORS.ok : t.status === "paused" ? COLORS.warnLed : COLORS.soft} blink={t.status === "running"} />
            {t.simulation ? "REHEARSAL (SIMULATION) · " : ""}
            {t.status.toUpperCase()} · V{t.version}
            {t.eliminationsSuspended && " · ELIMINATIONS SUSPENDED"}
          </span>
          <h1 className="section-h">{t.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/tournaments/${t.id}`} className="btn-secondary !h-10 !px-4 !text-[13px] hover:!no-underline">
            Rules
          </Link>
          <a href={`/admin/tournaments/${t.id}/export`} className="btn-secondary !h-10 !px-4 !text-[13px] hover:!no-underline">
            Export CSV
          </a>
        </div>
      </div>

      <div className="grid gap-3 min-[900px]:grid-cols-5">
        <Stat label="Current layer" value={current ? `${current.position + 1}/${s.layers.length}` : "None"} sub={current ? `${current.state.toUpperCase()} · ${current.state === "open" ? formatRemaining(Date.parse(current.deadlineAt) - now) + " LEFT" : current.state === "scheduled" ? "OPENS IN " + formatRemaining(Date.parse(current.opensAt) - now) : ""}` : ""} />
        <Stat label="Racing" value={String(s.participants.filter((p) => p.state === "active" || p.state === "qualified" || p.state === "registered").length)} sub={`${s.participants.filter((p) => p.state === "completed").length} finished`} />
        {pointsRace ? (
          <Stat label="Passes" value={String(s.attempts.filter((a) => a.status === "passed").length)} sub="verified so far" tone={COLORS.okText} />
        ) : (
          <Stat label="Out" value={String(s.participants.filter((p) => p.state === "eliminated").length)} sub={`of ${s.participants.length} entered`} tone={COLORS.fault} />
        )}
        <Stat label="Verification queue" value={String(s.queue.queued + s.queue.leased)} sub={`${s.queue.leased} running · ${s.queue.dead} failed jobs`} tone={s.queue.dead ? COLORS.fault : undefined} />
        <Stat label="Worker" value={workerAge === null ? "None" : workerAge < 30 ? "OK" : "Silent"} sub={workerAge === null ? "No heartbeat" : `seen ${workerAge}s ago`} tone={workerAge === null || workerAge >= 30 ? COLORS.fault : COLORS.okText} />
      </div>

      {s.waiting && (
        <div role="alert" className="rounded-[3px] border px-4 py-3 text-[14px] leading-normal" style={{ borderColor: COLORS.fault, background: COLORS.faultTint, color: COLORS.fault }}>
          <b>Layer {s.waiting.layer} is waiting for you.</b> Nobody is decided until these are resolved: {s.waiting.waitingOn.map((w) => `${w.name} (${w.why === "error" ? "verification error" : w.why === "review" ? "needs review" : "still verifying"})`).join(", ")}. Use the review queue below.
        </div>
      )}

      {!ended && (
        <Module label="EMERGENCY CONTROLS" right="ALL ACTIONS ARE AUDITED">
          <div className="flex flex-wrap gap-3 p-4">
            {t.status === "paused" ? (
              <Confirm label="Resume" tone="primary" needsReason={false} onConfirm={() => control("resume", t.id, "")} after={reload} help="Every remaining window moves later by the paused time." />
            ) : (
              <Confirm label="Pause race" tone="warn" onConfirm={(r) => control("pause", t.id, r)} after={reload} help="Stops new attempts and the clock until you resume." />
            )}
            {pointsRace ? null : t.eliminationsSuspended ? (
              <Confirm label="Resume eliminations" tone="secondary" onConfirm={(r) => control("unsuspend", t.id, r)} after={reload} />
            ) : (
              <Confirm label="Suspend eliminations" tone="secondary" onConfirm={(r) => control("suspend", t.id, r)} after={reload} help="Layers still finalise, but nobody is eliminated while suspended." />
            )}
            <Confirm label="Cancel tournament" tone="danger" onConfirm={(r) => control("cancel", t.id, r)} after={reload} help="Ends the race for everyone. This cannot be undone." />
          </div>
        </Module>
      )}

      <Module label="LAYERS">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="font-mono text-[10px] text-muted">
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">LAYER</th>
                <th className="px-4 py-2 font-medium">STATE</th>
                <th className="px-4 py-2 font-medium">WINDOW</th>
                <th className="px-4 py-2 font-medium">{pointsRace ? "PASSED" : "PASSED · OUT"}</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {s.layers.map((l) => {
                const ds = s.decisions.filter((d) => d.layerRunId === l.id);
                return (
                  <tr key={l.id} className="border-t border-hairline align-top">
                    <td className="px-4 py-2 font-mono text-[11px]">{l.position + 1}</td>
                    <td className="px-4 py-2 font-semibold">{l.title}</td>
                    <td className="px-4 py-2 font-mono text-[11px]" style={{ color: l.state === "open" ? COLORS.signalInk : l.state === "finalising" ? COLORS.warnText : COLORS.muted }}>
                      {l.state.toUpperCase()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px]">
                      {formatZoned(l.opensAt, timezone)} to {formatZoned(l.deadlineAt, timezone).split(" ").pop()}
                      {l.extendedSeconds > 0 && <span className="text-muted"> (+{Math.round(l.extendedSeconds / 60)}m)</span>}
                    </td>
                    <td className="px-4 py-2 font-mono text-[11px]">
                      {ds.length ? (pointsRace ? String(ds.filter((d) => d.decision === "qualified" || d.decision === "checkpoint_passed").length) : `${ds.filter((d) => d.decision === "qualified" || d.decision === "checkpoint_passed").length} · ${ds.filter((d) => d.decision === "eliminated").length}`) : ""}
                    </td>
                    <td className="px-4 py-2">{["scheduled", "open", "closing"].includes(l.state) && !ended && <ExtendForm layerRunId={l.id} after={reload} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Module>

      <Module label="REVIEW QUEUE" right={`${review.length}`}>
        {review.length === 0 ? (
          <p className="m-0 p-4 text-[13.5px] text-muted">Nothing needs a human. Attempts that hit an infrastructure error or need a reviewer appear here.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0">
            {review.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 border-b border-hairline px-4 py-3 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold">
                    {names.get(a.participantId)} · {layerById.get(a.layerRunId)?.title} · attempt {a.attemptNo}
                  </span>
                  <span className="font-mono text-[10.5px]" style={{ color: a.status === "error" ? COLORS.fault : COLORS.warnText }}>
                    {a.status === "error" ? "VERIFICATION ERROR" : "NEEDS REVIEW"} · SUBMITTED {formatZoned(a.submittedAt, timezone).split(" ").pop()}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Evidence attemptId={a.id} />
                  <Confirm label="Re-run verification" tone="secondary" onConfirm={(r) => reprocessAttempt(a.id, r)} after={reload} />
                  <ReviewForm attemptId={a.id} after={reload} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Module>

      <Participants s={s} timezone={timezone} after={reload} ended={ended} />
      <Attempts s={s} names={names} layerById={layerById} timezone={timezone} after={reload} />
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="module flex flex-col gap-1 p-3.5">
      <span className="mono-label">{label.toUpperCase()}</span>
      <span className="wide text-[26px] leading-none" style={{ color: tone ?? COLORS.ink }}>
        {value}
      </span>
      <span className="font-mono text-[10.5px] text-muted">{sub}</span>
    </div>
  );
}

/** Two-step action: click, give a reason, confirm. */
function Confirm({ label, tone, onConfirm, after, help, needsReason = true }: { label: string; tone: "primary" | "secondary" | "warn" | "danger"; onConfirm: (reason: string) => Promise<ActionResult<unknown>>; after: () => void; help?: string; needsReason?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const style =
    tone === "danger" ? { borderColor: COLORS.fault, color: COLORS.fault, background: "#fff" } : tone === "warn" ? { borderColor: COLORS.warnBorder, background: COLORS.warnTint, color: COLORS.warnText } : undefined;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${tone === "primary" ? "btn-primary" : "btn-secondary"} !h-10 !px-4 !text-[13px]`} style={style}>
        {label}
      </button>
    );
  return (
    <div className="flex min-w-[280px] flex-col gap-2 rounded-[4px] border border-[#CFCFC8] bg-white p-3">
      <b className="text-[13.5px]">{label}?</b>
      {help && <span className="text-[12.5px] text-ink-2">{help}</span>}
      {needsReason && <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (saved in the audit log)" className="rounded-[3px] border border-[#CFCFC8] px-2.5 py-1.5 text-[13px]" />}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || (needsReason && !reason.trim())}
          onClick={() =>
            start(async () => {
              const r = await onConfirm(reason);
              if (!r.ok) setError(r.error);
              else {
                setOpen(false);
                setReason("");
                after();
              }
            })
          }
          className="btn-primary !h-9 !px-3 !text-[12.5px]"
          style={tone === "danger" ? { background: COLORS.fault } : undefined}
        >
          {pending ? "Working…" : `Confirm`}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-9 border-0 bg-transparent px-2 font-mono text-[11px] text-muted">
          CANCEL
        </button>
      </div>
      {error && <span role="alert" className="text-[12.5px] text-fault">{error}</span>}
    </div>
  );
}

function ExtendForm({ layerRunId, after }: { layerRunId: string; after: () => void }) {
  const [minutes, setMinutes] = useState(5);
  const [shift, setShift] = useState(true);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="number" min={1} max={600} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={`${field} !h-9 w-20`} aria-label="Minutes to extend" />
      <label className="flex items-center gap-1 text-[12px]">
        <input type="checkbox" checked={shift} onChange={(e) => setShift(e.target.checked)} /> move later layers
      </label>
      <Confirm label={`Extend ${minutes} min`} tone="secondary" onConfirm={(r) => extendLayer(layerRunId, minutes, shift, r)} after={after} />
    </div>
  );
}

function ReviewForm({ attemptId, after }: { attemptId: string; after: () => void }) {
  const [open, setOpen] = useState(false);
  const [passed, setPassed] = useState(true);
  const [score, setScore] = useState(100);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary !h-10 !px-4 !text-[13px]">
        Decide manually
      </button>
    );
  return (
    <div className="flex min-w-[300px] flex-col gap-2 rounded-[4px] border border-[#CFCFC8] bg-white p-3 text-[13px]">
      <div className="flex gap-3">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={passed} onChange={() => setPassed(true)} /> Pass
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={!passed} onChange={() => setPassed(false)} /> Fail
        </label>
        <label className="flex items-center gap-1.5">
          Score <input type="number" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} className="h-8 w-16 rounded-[3px] border border-[#CFCFC8] px-1.5" />
        </label>
      </div>
      <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why (saved in the audit log)" className="rounded-[3px] border border-[#CFCFC8] px-2.5 py-1.5" />
      <div className="flex gap-2">
        <button type="button" disabled={pending || !note.trim()} onClick={() => start(async () => { const r = await reviewAttempt(attemptId, passed, score, note); if (!r.ok) setError(r.error); else { setOpen(false); after(); } })} className="btn-primary !h-9 !px-3 !text-[12.5px]">
          Save decision
        </button>
        <button type="button" onClick={() => setOpen(false)} className="h-9 border-0 bg-transparent px-2 font-mono text-[11px] text-muted">
          CANCEL
        </button>
      </div>
      {error && <span role="alert" className="text-fault">{error}</span>}
    </div>
  );
}

function Evidence({ attemptId }: { attemptId: string }) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await attemptEvidence(attemptId); if (r.ok) setData(r.data); else setError(r.error); })} className="btn-secondary !h-10 !px-4 !text-[13px]">
        {data ? "Refresh evidence" : "Evidence"}
      </button>
      {error && <span className="text-[12.5px] text-fault">{error}</span>}
      {data && (
        <pre className="m-0 max-h-[360px] w-full overflow-auto rounded-[4px] bg-ink px-3 py-2.5 font-mono text-[11px] leading-[1.6] text-[#D4D4CE]">{JSON.stringify(data, null, 2)}</pre>
      )}
    </>
  );
}

function Participants({ s, timezone, after, ended }: { s: ControlState; timezone: string; after: () => void; ended: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Module label="PARTICIPANTS" right={`${s.participants.length}`}>
      <ul className="m-0 flex list-none flex-col p-0">
        {s.participants.map((p) => {
          const ds = s.decisions.filter((d) => d.participantId === p.id);
          return (
            <li key={p.id} className="flex flex-col gap-2 border-b border-hairline px-4 py-2.5 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={() => setOpenId(openId === p.id ? null : p.id)} className="border-0 bg-transparent p-0 text-left text-[14px] font-semibold">
                  {p.name} {p.fixture && <span className="font-mono text-[10px] text-muted">FIXTURE</span>}
                </button>
                <span className="flex items-center gap-2 font-mono text-[10.5px]" style={{ color: p.state === "eliminated" ? COLORS.fault : p.state === "completed" ? COLORS.okText : COLORS.muted }}>
                  {p.state.toUpperCase()}
                  {p.eliminatedLayerKey && ` AT ${p.eliminatedLayerKey.toUpperCase()}`}
                </span>
              </div>
              {openId === p.id && (
                <div className="flex flex-col gap-2 rounded-[4px] bg-strip p-3">
                  {ds.length === 0 && <span className="text-[12.5px] text-muted">No decisions yet.</span>}
                  {ds.map((d) => (
                    <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                      <span>
                        <b>{s.layers.find((l) => l.id === d.layerRunId)?.title}</b>: {d.decision.replace("_", " ")} {d.rank ? `(rank ${d.rank})` : ""} · {d.reason}
                        {d.overriddenAt && <span className="text-warn-text"> · overridden: {d.overrideReason}</span>}
                      </span>
                      {!ended && !(s.tournament.mode === "checkpoint" && d.decision !== "eliminated") && (
                        <Confirm
                          label={d.decision === "eliminated" ? "Override to qualified" : "Override to eliminated"}
                          tone="secondary"
                          onConfirm={(r) => overrideDecision(d.id, d.decision === "eliminated" ? "qualified" : "eliminated", r)}
                          after={after}
                        />
                      )}
                    </div>
                  ))}
                  {p.state === "eliminated" && !ended && <Confirm label="Reinstate" tone="primary" onConfirm={(r) => reinstate(p.id, r)} after={after} help="They rejoin the race from the current layer." />}
                </div>
              )}
            </li>
          );
        })}
        {s.participants.length === 0 && <li className="p-4 text-[13.5px] text-muted">No entries yet.</li>}
      </ul>
      <span className="sr-only">{timezone}</span>
    </Module>
  );
}

function Attempts({ s, names, layerById, timezone, after }: { s: ControlState; names: Map<string, string>; layerById: Map<string, ControlState["layers"][number]>; timezone: string; after: () => void }) {
  const [status, setStatus] = useState("all");
  const [layer, setLayer] = useState("all");
  const rows = s.attempts.filter((a) => (status === "all" || a.status === status) && (layer === "all" || a.layerRunId === layer)).slice(0, 150);
  return (
    <Module label="ATTEMPTS" right={`${s.attempts.length} LATEST`}>
      <div className="flex flex-wrap gap-2 border-b border-hairline p-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${field} !h-9`} aria-label="Filter by status">
          {["all", "queued", "running", "passed", "failed", "error", "review_required"].map((x) => (
            <option key={x} value={x}>
              {x === "all" ? "All statuses" : x.replace("_", " ")}
            </option>
          ))}
        </select>
        <select value={layer} onChange={(e) => setLayer(e.target.value)} className={`${field} !h-9`} aria-label="Filter by layer">
          <option value="all">All layers</option>
          {s.layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.position + 1}. {l.title}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="font-mono text-[10px] text-muted">
              <th className="px-4 py-2 font-medium">SUBMITTED</th>
              <th className="px-4 py-2 font-medium">TEAM</th>
              <th className="px-4 py-2 font-medium">LAYER</th>
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-4 py-2 font-medium">STATUS</th>
              <th className="px-4 py-2 font-medium">SCORE</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t border-hairline align-top">
                <td className="whitespace-nowrap px-4 py-1.5 font-mono text-[11px]">{formatZoned(a.submittedAt, timezone).split(" ").pop()}</td>
                <td className="px-4 py-1.5">{names.get(a.participantId)}</td>
                <td className="px-4 py-1.5 text-[12.5px]">{layerById.get(a.layerRunId)?.title}</td>
                <td className="px-4 py-1.5">{a.attemptNo}</td>
                <td className="px-4 py-1.5 font-mono text-[11px]" style={{ color: a.status === "passed" ? COLORS.okText : a.status === "failed" || a.status === "error" ? COLORS.fault : COLORS.muted }}>
                  {a.status.toUpperCase()}
                </td>
                <td className="px-4 py-1.5">{a.score ?? ""}</td>
                <td className="px-4 py-1.5">
                  <AttemptTools attemptId={a.id} after={after} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="m-0 p-4 text-[13.5px] text-muted">No attempts match.</p>}
      </div>
    </Module>
  );
}

function AttemptTools({ attemptId, after }: { attemptId: string; after: () => void }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="border-0 bg-transparent p-0 font-mono text-[10.5px] text-signal">
        INSPECT
      </button>
    );
  return (
    <div className="flex min-w-[260px] flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Evidence attemptId={attemptId} />
        <Confirm label="Re-run" tone="secondary" onConfirm={(r) => reprocessAttempt(attemptId, r)} after={after} />
      </div>
      <button type="button" onClick={() => setOpen(false)} className="self-start border-0 bg-transparent p-0 font-mono text-[10.5px] text-muted">
        CLOSE
      </button>
    </div>
  );
}
