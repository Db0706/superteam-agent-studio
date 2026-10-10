"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { COLORS, Led, Module, StatusCode, STATUS_TEXT } from "@/components/system";
import { FRAMEWORKS, FW_ORDER, INTEGRATIONS, statusOf } from "@/config/integrations";
import { canDownload } from "@/lib/project-builder/generator";
import { Preview } from "./Preview";
import { GEN_CELLS, useBuilder, type Builder } from "./useBuilder";

const SUGGESTIONS = ["research-agent", "paid-weather-api", "campus-market"];
const GEN_STAGES = ["VALIDATING SELECTION…", "RESOLVING CAPABILITIES…", "LISTING FILES…", "PREPARING PREVIEW…"];

export function ProjectBuilder() {
  const b = useBuilder();
  const outputRef = useRef<HTMLElement>(null);

  const generateFromBar = () => {
    b.generate();
    outputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="page-wrap flex flex-col gap-7 pb-[120px] pt-[clamp(28px,4vw,48px)] min-[1120px]:pb-20">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <h1 className="display-l max-w-[900px]">
          Wire up your
          <br />
          starter project.
        </h1>
        <div className="flex max-w-[380px] flex-col gap-2.5">
          <p className="m-0 text-[15px] leading-normal text-ink-2 [text-wrap:pretty]">
            Plug in a framework and the capabilities you need. The schematic shows exactly what gets built, and what it connects to.
          </p>
          <button type="button" onClick={b.reset} className="self-start border-0 bg-transparent p-0 font-mono text-[10.5px] font-medium text-signal hover:text-ink">
            ↺ START OVER
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 max-w-full flex-[1_1_400px] flex-col gap-3">
          <Identity b={b} />
          <FrameworkKeys b={b} />
          <Capabilities b={b} />
          <Output b={b} ref={outputRef} />
        </div>
        <Preview b={b} />
      </div>

      <MobileBar b={b} onGenerate={generateFromBar} />
    </div>
  );
}

function Identity({ b }: { b: Builder }) {
  const ok = !b.name.error;
  const msg = ok ? (b.name.formatted ? `Formatted as ${b.name.id}. Used for the folder and package name.` : "Used for the folder and package name.") : b.name.error;
  return (
    <Module
      label="A · IDENTITY"
      right={
        <span className="flex items-center gap-[7px]" style={{ color: ok ? COLORS.okText : COLORS.fault }}>
          <Led color={ok ? COLORS.ok : COLORS.fault} glow={`0 0 0 2px ${ok ? "rgba(16,163,109,0.2)" : "rgba(194,54,31,0.2)"}`} />
          {ok ? "OK" : "ERR"}
        </span>
      }
      className="!overflow-visible"
    >
      <div className="flex flex-col gap-2.5 px-3.5 py-4">
        <label htmlFor="project-name" className="text-[15px] font-bold">
          What are you building?
        </label>
        <input
          id="project-name"
          value={b.cfg.name}
          onChange={(e) => b.setName(e.target.value)}
          placeholder="my-first-ai-agent"
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
          aria-invalid={!ok}
          aria-describedby="project-name-msg"
          className="h-[50px] w-full rounded-[3px] border bg-diagram px-3.5 font-mono text-[16px] font-medium text-ink outline-none focus:!border-signal focus:shadow-[inset_0_0_0_1px_#5A3CF0]"
          style={{ borderColor: ok ? COLORS.ink : COLORS.fault }}
        />
        <span id="project-name-msg" aria-live="polite" className="text-[13px] leading-[1.45]" style={{ color: ok ? COLORS.muted : COLORS.fault }}>
          {msg}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] font-medium text-muted">TRY</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => b.setName(s)}
              className="h-[30px] rounded-[3px] border border-rest bg-white px-[9px] font-mono text-[10.5px] text-ink-2 hover:border-ink hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </Module>
  );
}

function FrameworkKeys({ b }: { b: Builder }) {
  const fw = FRAMEWORKS[b.cfg.framework];
  return (
    <Module label="B · FRAMEWORK" right="SELECT 1">
      <div role="group" aria-label="Framework" className="grid grid-cols-2 gap-2 p-3.5">
        {FW_ORDER.map((k) => {
          const f = FRAMEWORKS[k];
          const sel = k === b.cfg.framework;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={sel}
              onClick={() => b.pickFramework(k)}
              className="relative flex min-h-[132px] flex-col gap-2 rounded-[4px] border px-3 pb-3 pt-3.5 text-left text-ink hover:!bg-strip"
              style={{
                borderColor: sel ? COLORS.ink : "#CFCFC8",
                background: sel ? COLORS.strip : "#FFFFFF",
                boxShadow: sel ? "inset 0 0 0 1px #161616" : "0 2px 0 #CFCFC8",
                transform: sel ? "translateY(2px)" : "none",
                transition: "transform .08s ease, box-shadow .12s ease, background .12s ease",
              }}
            >
              <Led
                color={sel ? COLORS.signal : COLORS.cell}
                size={10}
                glow={sel ? "0 0 0 3px rgba(90,60,240,0.18)" : undefined}
                className="absolute right-2.5 top-2.5"
              />
              <span aria-hidden="true" className="wide text-[30px] leading-none tracking-[-0.03em]">
                {f.abbr}
              </span>
              <span className="mt-auto text-[14px] font-bold leading-[1.2]">{f.name}</span>
              <span className="font-mono text-[10.5px] leading-[1.4] text-muted">{f.tech}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-1 px-3.5 pb-3.5 text-[13px] leading-[1.45] text-ink-2" aria-live="polite">
        <span>
          {fw.name}: {fw.blurb}
        </span>
        <span className="text-muted">{fw.useCase}</span>
      </div>
    </Module>
  );
}

function Capabilities({ b }: { b: Builder }) {
  const [showTech, setShowTech] = useState(false);
  return (
    <Module
      label="C · CAPABILITIES"
      right={
        <button type="button" aria-pressed={showTech} onClick={() => setShowTech((s) => !s)} className="border-0 bg-transparent p-0 font-mono text-[10.5px] font-medium text-signal hover:text-ink">
          {showTech ? "HIDE DETAILS" : "TECH DETAILS"}
        </button>
      }
    >
      {b.notice && (
        <div role="status" className="flex justify-between gap-2.5 border-b border-ink bg-[#FFF4DB] px-3.5 py-2.5 text-[13px] leading-[1.45] text-[#5C3D00]">
          <span>{b.notice}</span>
          <button type="button" onClick={b.clearNotice} className="border-0 bg-transparent font-mono text-[10.5px] font-semibold text-[#5C3D00]">
            CLEAR
          </button>
        </div>
      )}
      <ul className="m-0 list-none p-0">
        {INTEGRATIONS.map((it) => {
          const st = statusOf(it.id, b.cfg.framework);
          const na = st === "na";
          const on = b.cfg.integrations.includes(it.id) && !na;
          const reason = it.reasons[b.cfg.framework];
          const just = b.last === it.id;
          return (
            <li key={it.id}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-disabled={na || undefined}
                aria-describedby={reason ? `reason-${it.id}` : undefined}
                onClick={() => b.toggle(it.id)}
                className="grid w-full grid-cols-[38px_minmax(0,1fr)_auto] items-start gap-3 border-0 border-b border-hairline px-3.5 py-[13px] text-left text-ink"
                style={{
                  background: just ? COLORS.signalTint : "#FFFFFF",
                  cursor: na ? "not-allowed" : "pointer",
                  opacity: na ? 0.55 : 1,
                  transition: "background .4s ease",
                }}
              >
                <span aria-hidden="true" className="relative mt-px h-5 w-9 rounded-[3px]" style={{ background: on ? COLORS.ink : na ? "#ECECE7" : COLORS.soft, transition: "background .12s ease" }}>
                  <span className="absolute top-[3px] h-3.5 w-3.5 rounded-[2px] bg-white" style={{ left: on ? 19 : 3, transition: "left .12s ease" }} />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-[14px] font-bold">{it.name}</span>
                  <span className="text-[13px] leading-[1.4] text-ink-2">{it.description}</span>
                  {showTech && <span className="font-mono text-[10.5px] leading-normal text-muted">{it.tech}</span>}
                  {reason && (
                    <span id={`reason-${it.id}`} className="text-[12.5px] leading-[1.4]" style={{ color: STATUS_TEXT[st] }}>
                      {reason}
                    </span>
                  )}
                </span>
                <StatusCode status={st} className="mt-px" title={`${st === "ok" ? "Ready" : st === "server" ? "Adds companion server" : st === "unverified" ? "Unverified" : "Not available"} (provisional)`} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-3 px-3.5 py-2.5 font-mono text-[10px] text-muted">
        <span>RDY ready</span>
        <span>+SRV adds companion server</span>
        <span>UNV unverified</span>
        <span>· compatibility illustrative</span>
      </div>
    </Module>
  );
}

function Output({ b, ref }: { b: Builder; ref: React.Ref<HTMLElement> }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const p = b.project;
  const ok = !b.name.error;
  const statsLine = `${p.stats.files} FILES · ${p.stats.packages} PKGS · ${p.stats.env} ENV`;
  const names = INTEGRATIONS.filter((i) => p.valid.includes(i.id)).map((i) => i.name);
  const warnings = b.validation.issues.filter((i) => i.severity === "warning");
  const zip = canDownload(b.generator);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.setup.map((s) => s.cmd).join("\n"));
    } catch {}
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section ref={ref} aria-label="Output" className="module">
      <div className="module-strip">
        <span>E · OUTPUT</span>
        <span className="text-muted">{statsLine}</span>
      </div>
      <div aria-live="polite">
        {(b.gen === "idle" || b.gen === "error") && (
          <div className="flex flex-col gap-2.5 p-3.5">
            <button
              type="button"
              onClick={b.generate}
              disabled={!ok}
              className="btn-primary h-[60px] justify-between !px-[18px] !text-[16px] tracking-[0.01em]"
            >
              GENERATE PROJECT <span className="font-mono text-[14px]">▸</span>
            </button>
            <span className="text-[12.5px] leading-[1.45]" style={{ color: ok && b.gen !== "error" ? COLORS.muted : COLORS.fault }}>
              {b.gen === "error"
                ? b.genError
                : ok
                  ? "Design preview: shows the intended result. The ZIP connects to the scaffold repository later."
                  : "Fix the project name in A to generate."}
            </span>
            {warnings.length > 0 && (
              <ul className="notice-amber m-0 flex list-none flex-col gap-1">
                {warnings.map((w) => (
                  <li key={w.message}>{w.message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {b.gen === "working" && (
          <div className="flex flex-col gap-2.5 p-3.5 font-mono text-[10.5px] font-medium">
            <div role="progressbar" aria-valuemin={0} aria-valuemax={GEN_CELLS} aria-valuenow={b.genStep} aria-label="Preparing preview" className="grid h-[60px] grid-cols-12 gap-[3px] rounded-[4px] border border-ink bg-diagram p-1.5">
              {Array.from({ length: GEN_CELLS }, (_, i) => (
                <span key={i} className="rounded-[1px]" style={{ background: i < b.genStep ? COLORS.signal : COLORS.cell, transition: "background .1s ease" }} />
              ))}
            </div>
            <span>{GEN_STAGES[Math.min(3, Math.floor(b.genStep / 3))]}</span>
          </div>
        )}
        {b.gen === "done" && (
          <div className="flex flex-col bg-ink text-[#EDEDE8]">
            <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-4">
              <span className="flex items-center gap-2 font-mono text-[10.5px] font-semibold text-code-add">
                <Led color={COLORS.ok} />
                CONFIGURED · {statsLine}
              </span>
              <span className="wide break-all text-[22px] tracking-[-0.02em]">{b.id}</span>
              <span className="text-[13px] leading-[1.45] text-dim">
                {FRAMEWORKS[b.cfg.framework].name} ({FRAMEWORKS[b.cfg.framework].tech}) with {names.length ? names.join(", ") : "no extra capabilities"}.
              </span>
            </div>
            <div className="flex flex-col gap-[5px] border-t border-inv-div px-3.5 py-3 font-mono text-[11px] leading-normal">
              {p.setup.map((s) => (
                <div key={s.cmd} className="flex flex-wrap justify-between gap-2.5">
                  <span className="[overflow-wrap:anywhere]">
                    <span className="text-code-add">$ </span>
                    {s.cmd}
                  </span>
                  <span className="text-code-pun">{s.note}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1.5 border-t border-inv-div px-3.5 py-3">
              <span className="font-mono text-[10px] font-medium tracking-[0.04em] text-dim-2">YOU&apos;LL ADD THESE KEYS YOURSELF · NEVER HERE</span>
              {p.env.length ? (
                <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                  {p.env.map((e) => (
                    <li key={e.key} className="rounded-[2px] border border-inv-div-2 px-1.5 py-1 font-mono text-[10px] text-[#EDEDE8]" title={`${e.file}${e.note ? ` (${e.note})` : ""}`}>
                      {e.key}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-[12.5px] text-dim">No keys needed for this configuration.</span>
              )}
            </div>
            <div className="border-t border-inv-div px-3.5 py-3 text-[12.5px] leading-[1.45] text-[#E9C77A]">
              <b>Generator integration coming next.</b> This is a design preview. The ZIP will be assembled from the open-source scaffold repository once the generator is connected. Nothing
              has been generated or downloaded.
            </div>
            <div className="flex flex-wrap gap-1.5 border-t border-inv-div px-3.5 pb-3.5 pt-3">
              <button type="button" onClick={copy} className="h-10 rounded-[3px] border-0 bg-[#EDEDE8] px-3 font-mono text-[10.5px] font-semibold text-ink">
                {copied ? "COPIED ✓" : "COPY SETUP"}
              </button>
              <span className="group relative">
                <button
                  type="button"
                  disabled={!zip}
                  aria-describedby="zip-tip"
                  className="h-10 rounded-[3px] border border-dashed border-[#5A5A55] bg-transparent px-3 font-mono text-[10.5px] font-semibold text-dim-2 disabled:cursor-not-allowed"
                >
                  ZIP · SOON
                </button>
                <span
                  id="zip-tip"
                  role="tooltip"
                  className="pointer-events-none absolute bottom-[calc(100%+6px)] left-0 z-10 w-max max-w-[240px] rounded-[3px] bg-[#EDEDE8] px-2 py-1.5 text-[12px] text-ink opacity-0 transition-opacity delay-300 group-focus-within:opacity-100 group-hover:opacity-100"
                >
                  Available once the scaffold generator is connected
                </span>
              </span>
              <button type="button" onClick={b.backToEdit} className="h-10 rounded-[3px] border border-[#5A5A55] bg-transparent px-3 font-mono text-[10.5px] font-semibold text-[#EDEDE8]">
                EDIT
              </button>
              <Link href="/inspiration" className="flex h-10 items-center rounded-[3px] border border-[#5A5A55] px-3 font-mono text-[10.5px] font-semibold !text-[#EDEDE8] hover:!no-underline">
                FIND AN IDEA ▸
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function MobileBar({ b, onGenerate }: { b: Builder; onGenerate: () => void }) {
  const ok = !b.name.error;
  const p = b.project;
  return (
    <div className="fixed inset-x-2.5 bottom-2.5 z-30 flex items-center gap-2 rounded-[4px] bg-ink py-2 pl-3.5 pr-2 text-[#EDEDE8] shadow-[0_10px_30px_-10px_rgba(0,0,0,.5)] min-[1120px]:hidden">
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[14px] font-extrabold [font-stretch:112%]">{b.id}</span>
        <span className="truncate font-mono text-[10px] text-dim-2">
          {p.stats.files} FILES · {p.stats.packages} PKGS · {p.stats.env} ENV
        </span>
      </div>
      <button
        type="button"
        onClick={() => document.getElementById("b-preview")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        className="h-11 rounded-[3px] border border-inv-div-2 bg-transparent px-3 font-mono text-[10px] font-semibold text-[#EDEDE8]"
      >
        PREVIEW
      </button>
      <button
        type="button"
        onClick={onGenerate}
        disabled={!ok}
        className="h-11 rounded-[3px] border-0 px-3.5 font-mono text-[10px] font-semibold disabled:cursor-not-allowed"
        style={{ background: ok ? COLORS.signal : COLORS.cell, color: ok ? "#FFFFFF" : COLORS.muted }}
      >
        GENERATE ▸
      </button>
    </div>
  );
}
