"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CellMeter, COLORS, GLOW, Led, Module, cx } from "@/components/system";
import { fmt, toCents, type Step } from "@/lib/simulation/engine";
import { activeBlockFor, httpBlocks } from "@/lib/simulation/http";
import { BUDGET_MAX, BUDGET_MIN, BUDGET_STEP, FLOW_STAGES, SCENARIO_ORDER, SCENARIOS, STAGE_CAPTIONS } from "@/lib/simulation/scenarios";
import { useSimulation, type Outcome, type Simulation } from "./useSimulation";

export function Playground() {
  const sim = useSimulation();
  return (
    <div className="page-wrap flex flex-col gap-4 pb-20 pt-[clamp(28px,4vw,48px)]">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-3.5">
          <h1 className="display-l">
            Watch an agent
            <br />
            pay its way.
          </h1>
        </div>
        <p className="m-0 max-w-[400px] text-[15px] leading-normal text-ink-2 [text-wrap:pretty]">
          Pick a scenario, set a budget and step through every decision, from finding a service to paying for it.
        </p>
      </div>
      <FlowStrip sim={sim} />
      <div className="flex flex-wrap items-start gap-4">
        <AgentConfig sim={sim} />
        <ActivityLog sim={sim} />
      </div>
      <TechInspector sim={sim} />
    </div>
  );
}

type NodeState = "idle" | "active" | "done" | "error";
const NODE_STYLE: Record<NodeState, { border: string; bg: string; led: string; glow?: string }> = {
  idle: { border: "#CFCFC8", bg: "#FFFFFF", led: COLORS.soft },
  active: { border: COLORS.signal, bg: COLORS.signalTint, led: COLORS.signal, glow: GLOW.signal },
  done: { border: COLORS.ink, bg: "#FFFFFF", led: COLORS.ok },
  error: { border: COLORS.fault, bg: COLORS.faultTint, led: COLORS.fault, glow: GLOW.fault },
};

function nodeState(i: number, cur: Step | null): NodeState {
  if (!cur) return "idle";
  if (cur.kind === "done" || i < cur.stage) return "done";
  if (i === cur.stage) return cur.err ? "error" : "active";
  return "idle";
}

function FlowStrip({ sim }: { sim: Simulation }) {
  const { current: cur, index, steps, status } = sim;
  let caption = "Press RUN to start. Each stage lights up here as it happens.";
  let tag = "IDLE";
  let bg = "#FFFFFF";
  let tagColor: string = COLORS.muted;
  if (cur) {
    if (cur.kind === "done") {
      caption = cur.gaps ? "Finished. The agent stayed within your rules and reported what it could not get." : "Task complete. Every payment stayed within the budget you set.";
      tag = "DONE";
      bg = COLORS.okTint;
      tagColor = COLORS.okText;
    } else if (cur.err) {
      caption = cur.detail;
      tag = "FAULT";
      bg = COLORS.faultTint;
      tagColor = COLORS.fault;
    } else {
      caption = STAGE_CAPTIONS[cur.stage];
      tag = `STAGE ${cur.stage + 1}`;
      bg = COLORS.signalTint;
      tagColor = COLORS.signalInk;
    }
  }
  const counter =
    index < 0
      ? `${steps.length} STEPS QUEUED`
      : `STEP ${index + 1} / ${steps.length} · ${status === "running" ? "RUNNING" : status === "paused" ? "PAUSED" : "FINISHED"}`;

  return (
    <Module label="C · PAYMENT FLOW" right={counter} variant="diagram" aria-label="Payment flow">
      <div className="diagram-dots p-[clamp(14px,2.4vw,24px)]">
        <ol className="m-0 grid list-none grid-cols-5 gap-[clamp(10px,2vw,22px)] p-0">
          {FLOW_STAGES.map(([label, sub, short], i) => {
            const st = nodeState(i, cur);
            const s = NODE_STYLE[st];
            return (
              <li key={label} className="relative min-w-0" aria-label={`${label}: ${st}`}>
                {i < 4 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-full top-1/2 -mt-px h-0.5 w-[clamp(10px,2vw,22px)]"
                    style={{ background: st === "done" ? COLORS.ink : "#CFCFC8", transition: "background .35s ease" }}
                  />
                )}
                <div
                  className="flex min-h-[clamp(70px,8vw,92px)] flex-col gap-1.5 rounded-[4px] border-[1.5px] p-[clamp(8px,1.2vw,12px)]"
                  style={{ borderColor: s.border, background: s.bg, transition: "background .3s ease, border-color .3s ease" }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-[9.5px] font-semibold text-muted">0{i + 1}</span>
                    <Led color={s.led} size={9} glow={s.glow} blink={st === "active"} />
                  </div>
                  <span className="mt-auto text-[clamp(11px,1.15vw,14px)] font-extrabold leading-[1.15]">
                    <span className="hidden min-[560px]:inline">{label}</span>
                    <span className="min-[560px]:hidden" aria-hidden="true">
                      {short}
                    </span>
                  </span>
                  <span className="hidden text-[12px] leading-[1.3] text-muted min-[560px]:block">{sub}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex items-baseline gap-3 border-t border-ink px-3.5 py-3" style={{ background: bg, transition: "background .3s ease" }} aria-live="polite">
        <span className="flex-none font-mono text-[10px] font-semibold" style={{ color: tagColor }}>
          {tag}
        </span>
        <span className="text-[14px] leading-[1.45]">{caption}</span>
      </div>
    </Module>
  );
}

const OUTCOMES: Array<[Outcome, string, string]> = [
  ["normal", "NORMAL", COLORS.ok],
  ["low", "LOW BUDGET", COLORS.warnLed],
  ["down", "SERVICE DOWN", COLORS.fault],
];

function AgentConfig({ sim }: { sim: Simulation }) {
  const { config, scenario, current, taskTotal, outcome } = sim;
  const budget = toCents(config.budget);
  const spent = current?.spentCents ?? 0;
  const paid = current?.paid ?? 0;
  const left = budget - spent;
  return (
    <Module label="A · AGENT CONFIG" className="max-w-full flex-[1_1_320px]">
      <div className="flex flex-col gap-[18px] p-3.5">
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mono-label mb-1.5 p-0">SCENARIO</legend>
          {SCENARIO_ORDER.map((id) => {
            const s = SCENARIOS[id];
            const a = id === config.scenario;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={a}
                onClick={() => sim.selectScenario(id)}
                className="flex min-h-[52px] items-center gap-3 rounded-[4px] border px-3 py-[11px] text-left text-ink transition-colors hover:bg-strip"
                style={{ borderColor: a ? COLORS.ink : "#CFCFC8", background: a ? COLORS.strip : "#FFFFFF", boxShadow: a ? "inset 0 0 0 1px #161616" : "none" }}
              >
                <Led color={a ? COLORS.signal : COLORS.cell} size={10} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[14px] font-bold">{s.name}</span>
                  <span className="text-[12.5px] text-muted">{s.blurb}</span>
                  <span className="font-mono text-[9.5px] font-medium tracking-[0.04em] text-muted">
                    {s.letter} · {s.kind.toUpperCase()}
                  </span>
                </span>
              </button>
            );
          })}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <span className="mono-label">TASK</span>
          <span className="rounded-[4px] border border-dashed border-dash bg-diagram px-3 py-[11px] text-[14px] leading-normal">“{scenario.task}”</span>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="budget" className="mono-label">
              SPENDING BUDGET
            </label>
            <span className="wide text-[30px] leading-none tracking-[-0.03em]">{fmt(budget)}</span>
          </div>
          <input
            id="budget"
            type="range"
            min={BUDGET_MIN}
            max={BUDGET_MAX}
            step={BUDGET_STEP}
            value={config.budget}
            onChange={(e) => sim.setBudget(parseFloat(e.target.value))}
            aria-valuetext={`${fmt(budget)} simulated budget`}
            className="m-0 h-6 w-full"
          />
          <div className="flex justify-between font-mono text-[10px] text-muted">
            <span>TASK NEEDS ≈ {fmt(taskTotal)}</span>
            <span>$0.05 to $2.00</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="mono-label" id="outcome-l">
            TRY AN OUTCOME
          </span>
          <div role="group" aria-labelledby="outcome-l" className="grid grid-cols-3 overflow-hidden rounded-[4px] border border-ink">
            {OUTCOMES.map(([k, label, led]) => {
              const a = outcome === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={a}
                  onClick={() => sim.setOutcome(k)}
                  className="-mr-px flex h-[42px] items-center justify-center gap-1.5 border-0 border-r border-ink px-1 font-mono text-[10px] font-semibold"
                  style={{ background: a ? COLORS.ink : "#FFFFFF", color: a ? "#FFFFFF" : COLORS.ink }}
                >
                  <Led color={a ? led : COLORS.soft} size={6} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-hairline pt-3.5">
          <div className="mono-label flex items-baseline justify-between">
            <span>AVAILABLE FUNDS</span>
            <span className="wide font-sans text-[20px] tracking-[-0.02em] text-ink">{fmt(left)}</span>
          </div>
          <CellMeter availableCents={left} spentCents={spent} label={`Simulated funds: ${fmt(left)} available, ${fmt(spent)} spent`} />
          <div className="flex justify-between font-mono text-[10px] text-muted">
            <span>SPENT {fmt(spent)}</span>
            <span>
              {paid} PAYMENT{paid === 1 ? "" : "S"}
            </span>
          </div>
        </div>
      </div>
    </Module>
  );
}

const KIND: Record<Exclude<Step["kind"], "user" | "done">, [code: string, tone: string]> = {
  agent: ["AGT", "tone-ink"],
  service: ["SVC", "tone-line"],
  offer: ["OFR", "tone-line"],
  payreq: ["402", "tone-server"],
  check: ["CHK", "tone-line"],
  paid: ["PAY", "tone-purple-fill"],
  result: ["200", "tone-ok"],
  error: ["ERR", "tone-red-fill"],
};

function ActivityLog({ sim }: { sim: Simulation }) {
  const { steps, index, status, running } = sim;
  const logRef = useRef<HTMLDivElement>(null);
  const finished = status === "completed" || status === "failed";

  useEffect(() => {
    const el = logRef.current;
    if (el) requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }));
  }, [index]);

  const runLabel = running ? "RUNNING" : finished ? "RUN AGAIN" : index >= 0 ? "RESUME" : "RUN";

  return (
    <section aria-label="Agent activity" className="module flex max-w-full flex-[2.2_1_480px] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-ink bg-strip py-2 pl-3.5 pr-2">
        <span className="font-mono text-[10.5px] font-medium tracking-[0.04em]">B · AGENT ACTIVITY</span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={sim.run} disabled={running} className="btn-tool-primary disabled:opacity-100">
            ▸ {runLabel}
          </button>
          <button type="button" onClick={sim.pause} disabled={!running} className="btn-tool">
            ❚❚ PAUSE
          </button>
          <button type="button" onClick={sim.step} disabled={finished} className="btn-tool">
            STEP ▸|
          </button>
          <button type="button" onClick={sim.reset} className="btn-tool">
            RESET
          </button>
        </div>
      </div>
      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Simulation log"
        tabIndex={0}
        className="flex h-[min(600px,72vh)] flex-col gap-1.5 overflow-auto p-3.5"
        style={{ backgroundImage: "radial-gradient(#ECECE6 1px,transparent 1px)", backgroundSize: "12px 12px" }}
      >
        {index < 0 ? (
          <div className="m-auto flex max-w-[360px] flex-col items-center gap-3 py-6 text-center">
            <span className="wide relative grid h-[52px] w-[52px] place-items-center rounded-[4px] border-[1.5px] border-ink bg-white text-[16px]">
              AI
              <span aria-hidden="true" className="absolute right-[5px] top-[5px] h-[7px] w-[7px] animate-[sx-blink_1.4s_ease-in-out_infinite] bg-signal" />
            </span>
            <span className="wide text-[18px] tracking-[-0.02em]">Agent standing by</span>
            <span className="text-[14px] leading-normal text-muted">
              Press <b className="text-ink">RUN</b> to watch the whole task, or <b className="text-ink">STEP</b> through one decision at a time.
            </span>
          </div>
        ) : (
          steps.slice(0, index + 1).map((st, i) => <LogItem key={`${sim.config.scenario}-${i}`} step={st} i={i} isCurrent={i === index} />)
        )}
      </div>
    </section>
  );
}

function LogItem({ step: st, i, isCurrent }: { step: Step; i: number; isCurrent: boolean }) {
  const time = `+${(i * 0.4).toFixed(1)}s`;
  if (st.kind === "user") {
    return (
      <div className="flex animate-sx-in justify-end pb-2 pt-0.5">
        <div className="flex max-w-[80%] flex-col gap-1.5 rounded-[4px] bg-ink px-3.5 py-3 text-[#EDEDE8]">
          <span className="font-mono text-[9.5px] font-medium text-dim-2">YOU → AGENT</span>
          <span className="text-[14.5px] leading-[1.45]">{st.text}</span>
        </div>
      </div>
    );
  }
  if (st.kind === "done") {
    const gaps = !!st.gaps;
    const border = gaps ? "#EBD3A0" : COLORS.ok;
    return (
      <div className="flex animate-sx-in pb-0.5 pt-2">
        <div className="max-w-[88%] overflow-hidden rounded-[4px] border-[1.5px] bg-white" style={{ borderColor: border }}>
          <div
            className="flex justify-between gap-3 border-b px-3 py-2 font-mono text-[10px] font-semibold"
            style={{ borderColor: border, background: gaps ? COLORS.warnTint : COLORS.okTint, color: gaps ? COLORS.warnText : COLORS.okText }}
          >
            <span>AGENT → YOU · {st.title}</span>
            <span>{time}</span>
          </div>
          <div className="flex flex-col gap-2 px-3.5 py-3">
            <span className="text-[14.5px] leading-normal">{st.text}</span>
            <span className="font-mono text-[10.5px] text-muted">{st.detail}</span>
          </div>
        </div>
      </div>
    );
  }
  const [code, tone] = KIND[st.kind];
  return (
    <div className="animate-sx-in">
      <div
        className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-start gap-3 rounded-[4px] border p-2.5"
        style={{
          borderColor: isCurrent ? (st.err ? COLORS.fault : COLORS.signal) : COLORS.cell,
          background: isCurrent ? (st.err ? COLORS.faultTint : COLORS.signalTint) : "#FFFFFF",
          transition: "background .3s ease, border-color .3s ease",
        }}
      >
        <span className={cx("status-code !px-0 !py-1.5 text-center", tone)}>{code}</span>
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="text-[14px] font-bold" style={{ color: st.err ? COLORS.fault : COLORS.ink }}>
            {st.title}
          </span>
          <span className="text-[13px] leading-[1.45] text-[#5A5A55] [overflow-wrap:anywhere] [text-wrap:pretty]">{st.detail}</span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="font-mono text-[10px] text-dim-2">{time}</span>
          {st.chip && (
            <span className="wide text-[14px]" style={{ color: st.chipTone === "signal" ? COLORS.signalInk : COLORS.ink }}>
              {st.chip}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const TECH_NOTES = [
  { k: "HTTP 402", v: "A status code reserved since the early web for “Payment Required”, but never standardised. x402 gives it a precise meaning." },
  {
    k: "x402 V2",
    v: "The service states its price in a PAYMENT-REQUIRED header. The client pays and retries with PAYMENT-SIGNATURE. A facilitator verifies and settles, and the service confirms with PAYMENT-RESPONSE.",
  },
  {
    k: "WHERE SOLANA FITS",
    v: "Payments settle in digital dollars (USDC) on Solana: fast and cheap enough to price a single request. In development, everything runs on devnet with test funds.",
  },
];

function TechInspector({ sim }: { sim: Simulation }) {
  const [open, setOpen] = useState(false);
  const { current, scenario } = sim;
  const call = current?.call ?? {
    service: scenario.services[0].name,
    host: scenario.services[0].host,
    path: scenario.services[0].path,
    priceCents: toCents(scenario.services[0].price ?? scenario.services[0].offers?.[0].price ?? 0),
  };
  const blocks = useMemo(() => httpBlocks(call), [call.host, call.path, call.priceCents]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = activeBlockFor(current?.kind);

  return (
    <section className="module" aria-label="Technical inspector">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="inspector-body"
        className="flex min-h-[52px] w-full items-center justify-between gap-3 border-0 bg-strip px-3.5 py-3 text-left text-ink hover:bg-[#EDEDE8]"
      >
        <span className="flex flex-col gap-[3px]">
          <span className="font-mono text-[10.5px] font-medium tracking-[0.04em]">D · TECHNICAL INSPECTOR</span>
          <span className="text-[13px] text-muted">How HTTP 402 and x402 V2 power each payment above</span>
        </span>
        <span className="flex-none rounded-[3px] border border-ink bg-white px-2 py-1.5 font-mono text-[10.5px] font-semibold">{open ? "HIDE ▲" : "SHOW ▼"}</span>
      </button>
      {open && (
        <div id="inspector-body" className="flex animate-[sx-in_.2s_ease-out] flex-wrap gap-5 border-t border-ink px-3.5 py-4">
          <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-4">
            {TECH_NOTES.map((n) => (
              <div key={n.k} className="flex flex-col gap-[5px]">
                <span className="font-mono text-[10.5px] font-semibold text-signal">{n.k}</span>
                <span className="text-[14px] leading-normal text-ink-2 [text-wrap:pretty]">{n.v}</span>
              </div>
            ))}
            <span className="notice-amber">
              Illustrative values for {call.service}. Field names follow the x402 V2 flow but are not exact SDK structures; signatures and receipts are never generated. Nothing is sent over
              the network.
            </span>
          </div>
          <div className="flex min-w-0 flex-[2_1_460px] flex-col gap-2">
            {blocks.map((b, i) => (
              <div
                key={b.title}
                className="overflow-hidden rounded-[4px] border-[1.5px] bg-ink"
                style={{ borderColor: i === active ? COLORS.signal : COLORS.ink, opacity: active < 0 || i === active ? 1 : 0.5, transition: "opacity .3s ease, border-color .3s ease" }}
              >
                <div className="flex flex-wrap justify-between gap-2.5 border-b border-inv-div px-3 py-2 font-mono text-[10px] font-medium text-[#EDEDE8]">
                  <span className="flex items-center gap-2">
                    <Led size={7} color={i === active ? COLORS.signal : i < active ? COLORS.ok : "#3D3D3A"} />
                    {b.title}
                  </span>
                  <span className="text-code-pun">{b.caption}</span>
                </div>
                <pre tabIndex={0} className="m-0 overflow-auto whitespace-pre p-3 font-mono text-[11.5px] leading-[1.65] text-[#D4D4CE]">
                  {b.code}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
