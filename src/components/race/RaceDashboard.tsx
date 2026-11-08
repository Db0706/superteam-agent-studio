"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { COLORS, Led, Module } from "@/components/system";
import { fetchRaceState, joinTournament, runVerification } from "@/app/race/actions";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { AttemptView, LayerRunView, RaceState } from "@/server/dal/race";
import { Markdown } from "./Markdown";
import { formatRemaining, formatTime, useServerClock } from "./useServerClock";

const STATUS_COPY: Record<string, string> = {
  published: "REGISTRATION OPEN",
  scheduled: "STARTS SOON",
  running: "LIVE",
  paused: "PAUSED BY ORGANISERS",
  finalising: "FINALISING",
  completed: "FINISHED",
  cancelled: "CANCELLED",
};

const MODE_COPY: Record<string, string> = {
  survival: "Survival: pass every layer before its deadline to stay in.",
  ranked: "Ranked: each layer is scored and only the top teams advance.",
  checkpoint: "Checkpoint: earn verified achievements; nobody is eliminated.",
  hybrid: "Hybrid: early layers are checkpoints, later layers eliminate.",
};

/** The participant's race view. Live via Realtime with polling as the fallback. */
export function RaceDashboard({ initial, timezone }: { initial: RaceState; timezone: string }) {
  const [state, setState] = useState(initial);
  const now = useServerClock(state.serverNow);
  const busyRef = useRef(false);

  const reload = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const next = await fetchRaceState(state.tournament.id);
      if (next) setState(next);
    } finally {
      busyRef.current = false;
    }
  }, [state.tournament.id]);

  const verifying = state.me?.attempts.some((a) => a.status === "queued" || a.status === "running") ?? false;

  // Polling fallback: fast while an attempt is being verified, slower otherwise.
  useEffect(() => {
    const id = setInterval(reload, verifying ? 2500 : 10000);
    return () => clearInterval(id);
  }, [reload, verifying]);

  // Realtime: any change to this tournament nudges a reload.
  useEffect(() => {
    const supabase = supabaseBrowser();
    const filter = `tournament_id=eq.${state.tournament.id}`;
    const channel = supabase
      .channel(`race-${state.tournament.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_events", filter }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "layer_runs", filter }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_participants", filter }, () => void reload())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [state.tournament.id, reload]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const t = state.tournament;
  const me = state.me;
  const scoring = state.layers.some((l) => l.points > 0);
  const pointsRace = scoring && t.mode === "checkpoint";
  const passedIds = useMemo(() => new Set((me?.attempts ?? []).filter((a) => a.status === "passed").map((a) => a.layerRunId)), [me?.attempts]);
  const current = useMemo(
    () =>
      state.layers.find((l) => l.id === selectedId) ??
      // Points race: open the first step the team hasn't passed yet, build steps first.
      (pointsRace ? [...state.layers.filter((l) => l.config.category === "build_stage"), ...state.layers.filter((l) => l.config.category !== "build_stage")].find((l) => !passedIds.has(l.id)) : null) ??
      pickCurrentLayer(state.layers),
    [state.layers, selectedId, pointsRace, passedIds],
  );
  const myPoints = scoring
    ? state.layers.reduce((sum, l) => sum + (me?.attempts.some((a) => a.layerRunId === l.id && a.status === "passed") || me?.decisions.some((d) => d.layerRunId === l.id && (d.decision === "qualified" || d.decision === "checkpoint_passed")) ? l.points : 0), 0)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <header className="grid items-end gap-4 min-[900px]:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex flex-col gap-2.5">
          <span className="eyebrow flex items-center gap-2">
            <Led color={t.status === "running" ? COLORS.ok : t.status === "paused" ? COLORS.warnLed : COLORS.soft} blink={t.status === "running"} />
            {STATUS_COPY[t.status] ?? t.status.toUpperCase()}
            {t.simulation && " · REHEARSAL (SIMULATION)"}
          </span>
          <h1 className="display-l">{t.name}</h1>
          <p className="m-0 max-w-[640px] text-[15px] leading-normal text-ink-2">
            {pointsRace ? "Pick a step, build it, press Run verification. Points land straight away. Nobody is knocked out." : MODE_COPY[t.mode]}
            {scoring && (
              <>
                {" "}
                <Link href="/leaderboard">See the leaderboard ▸</Link>
              </>
            )}
          </p>
          {myPoints !== null && me?.participantId && (
            <span className="font-mono text-[12px] font-semibold text-signal-ink">YOUR TEAM: {myPoints} POINTS</span>
          )}
        </div>
        {pointsRace ? <RaceClock layers={state.layers} now={now} timezone={timezone} /> : current && <BigClock layer={current} now={now} timezone={timezone} />}
      </header>

      {!pointsRace && <Progress layers={state.layers} attempts={me?.attempts ?? []} decisions={me?.decisions ?? []} />}

      <div className="grid items-start gap-4 min-[1120px]:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          <YourStatus state={state} onJoined={reload} />
          {current ? <LayerPanel layer={current} state={state} now={now} timezone={timezone} onSubmitted={reload} /> : <NoLayer status={t.status} />}
        </div>
        <aside className="flex flex-col gap-4">
          <Standings standings={state.standings} mode={state.tournament.mode} />
          <Timeline layers={state.layers} attempts={me?.attempts ?? []} decisions={me?.decisions ?? []} now={now} timezone={timezone} currentId={current?.id} onSelect={setSelectedId} />
          <Feed activity={state.activity} layers={state.layers} />
        </aside>
      </div>
    </div>
  );
}

function pickCurrentLayer(layers: LayerRunView[]): LayerRunView | null {
  return (
    layers.find((l) => l.state === "open" && l.config.category !== "build_stage") ??
    layers.find((l) => l.state === "open") ??
    layers.find((l) => l.state === "closing" || l.state === "finalising") ??
    layers.find((l) => l.state === "scheduled" || l.state === "locked") ??
    layers.at(-1) ??
    null
  );
}

/** Points race: one clock for the whole race (every step runs side by side). */
function RaceClock({ layers, now, timezone }: { layers: LayerRunView[]; now: number; timezone: string }) {
  const end = layers.reduce<string | null>((m, l) => (l.deadlineAt && (!m || l.deadlineAt > m) ? l.deadlineAt : m), null);
  const start = layers.reduce<string | null>((m, l) => (l.opensAt && (!m || l.opensAt < m) ? l.opensAt : m), null);
  if (!end || !start) return null;
  const before = Date.parse(start) > now;
  const left = (before ? Date.parse(start) : Date.parse(end)) - now;
  return (
    <div className="flex flex-col items-end gap-1 max-[899px]:items-start" aria-live="polite">
      <span className="font-mono text-[10.5px] font-medium text-muted">{before ? "RACE STARTS IN" : left > 0 ? "RACE ENDS IN" : "RACE"}</span>
      <span className="wide font-mono text-[clamp(40px,6vw,64px)] leading-none tracking-[-0.03em]" style={{ color: !before && left > 0 && left < 10 * 60_000 ? COLORS.fault : COLORS.ink }}>
        {left > 0 ? formatRemaining(left) : "OVER"}
      </span>
      <span className="font-mono text-[10.5px] text-muted">ENDS {formatTime(end, timezone)}</span>
    </div>
  );
}

function BigClock({ layer, now, timezone }: { layer: LayerRunView; now: number; timezone: string }) {
  if (!layer.deadlineAt) return null;
  const opensIn = Date.parse(layer.opensAt) - now;
  const left = Date.parse(layer.deadlineAt) - now;
  const label = layer.state === "scheduled" || layer.state === "locked" ? `LAYER ${layer.position + 1} OPENS IN` : layer.state === "open" ? `LAYER ${layer.position + 1} CLOSES IN` : `LAYER ${layer.position + 1}`;
  const value = layer.state === "scheduled" || layer.state === "locked" ? formatRemaining(opensIn) : layer.state === "open" ? formatRemaining(left) : layer.state === "closed" ? "CLOSED" : "DECIDING";
  const urgent = layer.state === "open" && left < 5 * 60_000;
  return (
    <div className="flex flex-col items-end gap-1 max-[899px]:items-start" aria-live="polite">
      <span className="font-mono text-[10.5px] font-medium text-muted">{label}</span>
      <span className="wide font-mono text-[clamp(40px,6vw,64px)] leading-none tracking-[-0.03em]" style={{ color: urgent ? COLORS.fault : COLORS.ink }}>
        {value}
      </span>
      <span className="font-mono text-[10.5px] text-muted">
        DEADLINE {formatTime(layer.deadlineAt, timezone)}
        {layer.extendedSeconds > 0 && ` · EXTENDED ${Math.round(layer.extendedSeconds / 60)} MIN`}
      </span>
    </div>
  );
}

function Progress({ layers, attempts, decisions }: { layers: LayerRunView[]; attempts: AttemptView[]; decisions: RaceState["me"] extends infer M ? (M extends { decisions: infer D } ? D : never) : never }) {
  return (
    <div role="list" aria-label="Layers" className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${layers.length}, minmax(0, 1fr))` }}>
      {layers.map((l) => {
        const d = decisions.find((x) => x.layerRunId === l.id);
        const passed = attempts.some((a) => a.layerRunId === l.id && a.status === "passed");
        const color = d?.decision === "eliminated" ? COLORS.fault : passed || d?.decision === "qualified" || d?.decision === "checkpoint_passed" ? COLORS.ok : l.state === "open" ? COLORS.signal : COLORS.cell;
        return (
          <div role="listitem" key={l.id} title={`${l.position + 1}. ${l.config.title}`} className="flex flex-col gap-1">
            <span className="h-2 rounded-[1px]" style={{ background: color }} />
            <span className="truncate font-mono text-[9.5px] text-muted max-[700px]:hidden">{l.position + 1}. {l.config.title.toUpperCase()}</span>
          </div>
        );
      })}
    </div>
  );
}

function YourStatus({ state, onJoined }: { state: RaceState; onJoined: () => void }) {
  const me = state.me;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!me) {
    return (
      <Notice tone="info">
        <Link href={`/login?next=/race`}>Sign in</Link> to join with your team and run verifications. You can watch the race without an account.
      </Notice>
    );
  }
  if (!me.participantId) {
    if (me.canJoin) {
      return (
        <Module label="JOIN THE RACE" right={state.tournament.participation === "team" ? "TEAM ENTRY" : "INDIVIDUAL ENTRY"}>
          <div className="flex flex-col gap-3 p-4 text-[14px] leading-normal text-ink-2">
            <p className="m-0">Enter your {state.tournament.participation === "team" ? "team" : "self"} to start scoring. You can join any time while the race is open. Leaving the race never affects your Build or Policy Track submission.</p>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await joinTournament(state.tournament.id);
                  if (!r.ok) setError(r.error);
                  else onJoined();
                })
              }
              className="btn-primary self-start !h-11 !px-5 !text-[14px]"
            >
              {pending ? "Joining…" : "Enter the race ▸"}
            </button>
            {error && <p role="alert" className="m-0 text-[13px] text-fault">{error}</p>}
          </div>
        </Module>
      );
    }
    return (
      <Notice tone="info">
        {state.tournament.participation === "team" && !me.hasTeam ? (
          <>
            You need a team to enter. <Link href="/team">Create or join one</Link>.
          </>
        ) : (
          "Entries for this race have closed: an elimination round has already been decided. You can keep building and still submit to the event tracks."
        )}
      </Notice>
    );
  }
  if (me.state === "eliminated") {
    const layer = state.layers.find((l) => l.key === me.eliminatedLayerKey);
    return (
      <Notice tone="fault">
        <b>Your team left the race at {layer ? `layer ${layer.position + 1}, ${layer.config.title}` : "an earlier layer"}.</b> You keep everything you built. Keep going, and{" "}
        <Link href="/submit">submit to the Build or Policy Track</Link>: the race result doesn&apos;t affect it.
      </Notice>
    );
  }
  if (!me.hasEndpoint && state.tournament.participation === "team") {
    // On-chain challenges don't need the app, so say so rather than blocking everything.
    const chainOnly = state.layers.some((l) => l.config.verifier.plugin.startsWith("bureau."));
    return (
      <Notice tone="info">
        <b>You&apos;re in the race.</b> You don&apos;t need a finished app: the starter from the Builder already passes <b>App live</b> once it&apos;s online. When you want an app step checked, add your app&apos;s public URL on the <Link href="/team">team page</Link>. <b>Idea locked in</b> and <b>Submitted</b> don&apos;t need the app at all.
        {chainOnly && " Neither do the on-chain challenges: register your team wallet on the team page instead."}
      </Notice>
    );
  }
  if (me.state === "completed") return <Notice tone="ok"><b>You finished the race.</b> Every layer verified. Now polish the demo and submit.</Notice>;
  return null;
}

function LayerPanel({ layer, state, now, timezone, onSubmitted }: { layer: LayerRunView; state: RaceState; now: number; timezone: string; onSubmitted: () => void }) {
  const me = state.me;
  const mine = (me?.attempts ?? []).filter((a) => a.layerRunId === layer.id);
  const latest = mine[0];
  const failed = mine.filter((a) => a.status === "failed").length;
  const passed = mine.some((a) => a.status === "passed");
  const max = layer.config.retries.maxAttempts;
  const cooldownLeft = latest ? Date.parse(latest.submittedAt) + layer.config.retries.cooldownSeconds * 1000 - now : 0;
  const hints = layer.config.hints.filter((h) => failed >= h.afterAttempts);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Challenges unlock in order: the first prerequisite this team hasn't passed yet.
  // Only the latest 60 attempts are loaded; past that, leave the check to the server.
  const done = (id: string) => (me?.attempts ?? []).some((a) => a.layerRunId === id && a.status === "passed") || (me?.decisions ?? []).some((d) => d.layerRunId === id && (d.decision === "qualified" || d.decision === "checkpoint_passed"));
  const missingPrereq = (me?.attempts.length ?? 0) >= 60 ? undefined : layer.config.prerequisites.map((k) => state.layers.find((l) => l.key === k)).find((l) => l && !done(l.id));

  const blocker = !me
    ? "Sign in to run a verification."
    : !me.participantId
      ? "Enter the race first."
      : me.state === "eliminated"
        ? "Your team is no longer in the race."
        : state.tournament.status === "paused"
          ? "The organisers have paused the race."
          : state.tournament.status !== "running"
            ? "The race hasn't started."
            : layer.state !== "open"
              ? layer.state === "scheduled" || layer.state === "locked"
                ? `This layer opens at ${formatTime(layer.opensAt, timezone)}.`
                : "This layer is closed."
              : missingPrereq
                ? `Pass ${missingPrereq.config.title} first.`
                : !me.hasEndpoint && state.tournament.participation === "team" && !layer.config.verifier.plugin.startsWith("bureau.")
                ? "Add your app's URL on the team page."
                : latest && (latest.status === "queued" || latest.status === "running")
                  ? "Verifying your last attempt…"
                  : max !== null && mine.length >= max
                    ? `You've used all ${max} attempts.`
                    : cooldownLeft > 0
                      ? `Next attempt in ${Math.ceil(cooldownLeft / 1000)}s.`
                      : null;

  return (
    <Module
      label={
        state.tournament.mode === "checkpoint" && layer.points
          ? `${layer.config.category === "build_stage" ? "BUILD STEP" : "CHALLENGE"} · +${layer.points} PTS`
          : `${layer.config.category === "build_stage" ? "BUILD STAGE" : `LAYER ${layer.position + 1} OF ${state.layers.length}`} · ${layer.config.difficulty.toUpperCase()}${layer.points ? ` · ${layer.points} PTS` : ""}`
      }
      right={passed ? <><Led color={COLORS.ok} /> PASSED</> : layer.state.toUpperCase()}
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="section-h">{layer.config.title}</h2>
          {layer.config.objective && <p className="m-0 text-[15px] leading-normal text-ink">{layer.config.objective}</p>}
        </div>
        {layer.config.instructions && <Markdown text={layer.config.instructions} />}
        {layer.config.verifier.visibleCriteria.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="mono-label">WHAT MUST WORK</span>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px]">
              {layer.config.verifier.visibleCriteria.map((c) => (
                <li key={c} className="flex items-start gap-2">
                  <Led color={COLORS.signal} className="mt-[7px]" />
                  {c}
                </li>
              ))}
            </ul>
            <span className="text-[12.5px] text-muted">Pass mark {layer.config.passingScore}%. Test inputs are fresh for every attempt.</span>
          </div>
        )}
        {layer.config.resources.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {layer.config.resources.map((r) => (
              <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" className="rounded-[3px] border border-[#CFCFC8] bg-white px-2.5 py-1.5 font-mono text-[11px] !text-ink hover:!no-underline">
                {r.label} ↗
              </a>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
          <button
            type="button"
            disabled={!!blocker || pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await runVerification(state.tournament.id, layer.key, crypto.randomUUID());
                if (!r.ok) setError(r.error);
                onSubmitted();
              })
            }
            className="btn-primary !h-12 !px-6 !text-[15px]"
          >
            {pending ? "Starting…" : "Run verification ▸"}
          </button>
          <span className="font-mono text-[11px] text-muted">
            {blocker ?? (max === null ? `ATTEMPT ${mine.length + 1} · UNLIMITED` : `ATTEMPT ${mine.length + 1} OF ${max}`)}
          </span>
        </div>
        {error && <p role="alert" className="m-0 text-[13px] text-fault">{error}</p>}
        {latest && <AttemptResult attempt={latest} />}
        {hints.length > 0 && !passed && (
          <div className="flex flex-col gap-1.5 rounded-[3px] border px-3.5 py-3" style={{ borderColor: COLORS.warnBorder, background: COLORS.warnTint }}>
            <span className="mono-label" style={{ color: COLORS.warnText }}>HINT</span>
            {hints.map((h) => (
              <p key={h.text} className="m-0 text-[13.5px] leading-[1.5]" style={{ color: COLORS.warnText }}>
                {h.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </Module>
  );
}

function AttemptResult({ attempt }: { attempt: AttemptView }) {
  const pending = attempt.status === "queued" || attempt.status === "running";
  const tone = attempt.status === "passed" ? COLORS.ok : attempt.status === "failed" ? COLORS.fault : attempt.status === "error" || attempt.status === "review_required" ? COLORS.warnLed : COLORS.signal;
  const title = {
    queued: "Waiting for a verifier…",
    running: "Verifying your app now…",
    passed: "Verified",
    failed: "Not passed yet",
    error: "Verification hit a problem on our side",
    review_required: "Waiting for a human reviewer",
  }[attempt.status];
  return (
    <div className="flex flex-col gap-2.5 rounded-[4px] border border-[#CFCFC8] bg-white p-3.5" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[15px] font-bold">
          <Led color={tone} blink={pending} size={10} />
          {title}
        </span>
        <span className="font-mono text-[11px] text-muted">
          ATTEMPT {attempt.attemptNo}
          {attempt.score !== null && ` · SCORE ${attempt.score}`}
          {attempt.receiptId && ` · RECEIPT ${attempt.receiptId.slice(0, 8).toUpperCase()}`}
        </span>
      </div>
      {attempt.feedback.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {attempt.feedback.map((f) => (
            <li key={f.id} className="grid grid-cols-[16px_minmax(0,1fr)] gap-2 text-[13.5px] leading-[1.45]">
              <span aria-hidden="true" className="font-mono text-[13px]" style={{ color: f.passed ? COLORS.okText : COLORS.fault }}>
                {f.passed ? "✓" : "✗"}
              </span>
              <span>
                <b>{f.label}.</b> <span className="text-ink-2">{f.message}</span>
                <span className="sr-only">{f.passed ? " Passed." : " Failed."}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Standings({ standings, mode }: { standings: RaceState["standings"]; mode: RaceState["tournament"]["mode"] }) {
  // Nobody is eliminated in a points race, so qualified/out would only confuse.
  if (mode === "checkpoint") {
    return (
      <Module label="THE FIELD" right={`${standings.total} ENTERED`}>
        <div className="flex items-end justify-between gap-3 p-4">
          <div className="flex flex-col gap-1">
            <span className="mono-label">TEAMS RACING</span>
            <span className="wide text-[30px] leading-none" style={{ color: COLORS.signal }}>
              {standings.total}
            </span>
          </div>
          <Link href="/leaderboard" className="font-mono text-[11px]">
            LEADERBOARD ▸
          </Link>
        </div>
      </Module>
    );
  }
  return (
    <Module label="THE FIELD" right={`${standings.total} ENTERED`}>
      <dl className="m-0 grid grid-cols-3 p-4">
        {(
          [
            ["Competing", standings.competing, COLORS.signal],
            ["Qualified", standings.qualified, COLORS.ok],
            ["Out", standings.eliminated, COLORS.fault],
          ] as const
        ).map(([label, n, color]) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="mono-label">{label.toUpperCase()}</dt>
            <dd className="wide m-0 text-[30px] leading-none" style={{ color }}>
              {n}
            </dd>
          </div>
        ))}
      </dl>
    </Module>
  );
}

function Timeline({ layers, attempts, decisions, now, timezone, currentId, onSelect }: { layers: LayerRunView[]; attempts: AttemptView[]; decisions: { layerRunId: string; decision: string }[]; now: number; timezone: string; currentId?: string; onSelect: (id: string) => void }) {
  const groups = layers.some((l) => l.config.category === "build_stage")
    ? ([["BUILD STEPS · EVERYONE", layers.filter((l) => l.config.category === "build_stage")], ["CHALLENGES · OPTIONAL · IN ORDER", layers.filter((l) => l.config.category !== "build_stage")]] as const)
    : ([["ALL LAYERS", layers]] as const);
  const points = groups.length > 1;
  return (
    <Module label={points ? "STEPS" : "LAYERS"} right="TAP ONE TO OPEN IT">
      {groups.map(([title, list]) => (
        <div key={title}>
          {groups.length > 1 && <div className="border-b border-hairline bg-strip px-4 py-1.5 font-mono text-[10px] text-muted">{title}</div>}
          <ol className="m-0 flex list-none flex-col p-0">
            {list.map((l, i) => {
              const d = decisions.find((x) => x.layerRunId === l.id)?.decision;
              const passed = attempts.some((a) => a.layerRunId === l.id && a.status === "passed");
              const mark = d === "eliminated" ? "OUT" : d === "checkpoint_missed" ? "MISSED" : passed ? "✓ DONE" : l.state === "open" ? "OPEN" : l.state === "closed" ? "CLOSED" : l.opensAt ? formatTime(l.opensAt, timezone) : "";
              const color = d === "eliminated" ? COLORS.fault : passed ? COLORS.okText : l.state === "open" ? COLORS.signalInk : COLORS.muted;
              return (
                <li key={l.id} className="border-b border-hairline last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onSelect(l.id)}
                    aria-current={l.id === currentId ? "true" : undefined}
                    className="grid w-full grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 border-0 bg-transparent px-4 py-2.5 text-left hover:bg-strip"
                    style={l.id === currentId ? { background: COLORS.strip } : undefined}
                  >
                    <span className="font-mono text-[10px] text-muted">{String(points ? i + 1 : l.position + 1).padStart(2, "0")}</span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13.5px] font-semibold">{l.config.title}</span>
                      {l.points > 0 && <span className="font-mono text-[10px] text-muted">+{l.points} PTS</span>}
                    </span>
                    <span className="font-mono text-[10px] font-medium" style={{ color }}>
                      {mark}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
      <span className="sr-only">Server time {new Date(now).toISOString()}</span>
    </Module>
  );
}

const FEED_COPY: Record<string, (p: Record<string, unknown> & { layerTitle?: string }) => string> = {
  "tournament.started": () => "The race has started.",
  "tournament.paused": () => "The organisers paused the race.",
  "tournament.resumed": () => "The race resumed. Deadlines moved by the paused time.",
  "tournament.completed": () => "The race is over.",
  "layer.opened": (p) => `Layer opened: ${p.layerTitle ?? p.layer}.`,
  "layer.closing": (p) => `Deadline reached for ${p.layerTitle ?? p.layer}. Finishing verifications.`,
  "layer.closed": (p) => `${p.title ?? p.layer}: ${p.qualified} qualified, ${p.eliminated} out.`,
  "layer.extended": (p) => `${p.layerTitle ?? p.layer} extended by ${Math.round(Number(p.seconds) / 60)} min.`,
  "participant.joined": (p) => `${p.name} entered.`,
  "participant.qualified": (p) => `${p.name} passed ${p.title ?? p.layer}.`,
  "participant.eliminated": (p) => `${p.name} left the race at ${p.title ?? p.layer}.`,
  "participant.reinstated": (p) => `${p.name} was reinstated by the organisers.`,
  "attempt.passed": (p) => `${p.name} verified ${p.layerTitle ?? p.layer}.`,
};

function Feed({ activity, layers }: { activity: RaceState["activity"]; layers: LayerRunView[] }) {
  const titles = new Map(layers.map((l) => [l.key, l.config.title]));
  const items = activity.filter((e) => FEED_COPY[e.kind]).slice(0, 12);
  return (
    <Module label="LIVE FEED">
      {items.length ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {items.map((e) => (
            <li key={e.id} className="flex gap-2.5 border-b border-hairline px-4 py-2 text-[13px] leading-[1.45] text-ink-2 last:border-b-0">
              <span className="w-[42px] flex-none font-mono text-[10px] leading-[19px] text-muted">{new Date(e.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
              {FEED_COPY[e.kind]({ ...e.payload, layerTitle: titles.get(String(e.payload.layer)) })}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 p-4 text-[13px] text-muted">Nothing yet. Updates appear here live.</p>
      )}
    </Module>
  );
}

function NoLayer({ status }: { status: string }) {
  return <Notice tone="info">{status === "published" ? "The layers appear here when the organisers schedule the race." : "No layers to show."}</Notice>;
}

function Notice({ tone, children }: { tone: "info" | "warn" | "fault" | "ok"; children: React.ReactNode }) {
  const palette = {
    info: { borderColor: "#CFCFC8", background: "#FFFFFF", color: COLORS.ink },
    warn: { borderColor: COLORS.warnBorder, background: COLORS.warnTint, color: COLORS.warnText },
    fault: { borderColor: COLORS.fault, background: COLORS.faultTint, color: COLORS.fault },
    ok: { borderColor: "#B5E4CF", background: COLORS.okTint, color: COLORS.okText },
  }[tone];
  return (
    <div role={tone === "fault" ? "alert" : "status"} className="rounded-[3px] border px-4 py-3 text-[14px] leading-normal" style={palette}>
      {children}
    </div>
  );
}
