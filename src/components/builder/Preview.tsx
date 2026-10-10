"use client";

import { useMemo } from "react";
import { COLORS, STATUS_CODE, STATUS_TEXT } from "@/components/system";
import { FRAMEWORKS, INTEGRATIONS } from "@/config/integrations";
import { codeFor, type CodeTab, type TokenKind } from "@/lib/project-builder/code";
import type { Builder } from "./useBuilder";

const TOKEN: Record<TokenKind, string> = {
  key: "#B9A8FF",
  str: "#7FE0B4",
  pun: "#7A7A73",
  num: "#F0C27A",
  com: "#6E6E68",
  txt: "#EDEDE8",
  dir: "#B9A8FF",
  guide: "#4A4A45",
};

interface ModRow {
  id?: string;
  name: string;
  code: string;
  codeColor: string;
  meta: string;
  ext: string;
  kind?: "companion" | "empty";
}

export function Preview({ b }: { b: Builder }) {
  return (
    <div id="b-preview" className="flex min-w-0 max-w-full flex-[1.65_1_560px] scroll-mt-[70px] flex-col gap-3 min-[1120px]:sticky min-[1120px]:top-[72px]">
      <Schematic b={b} />
      <CodePanel b={b} />
    </div>
  );
}

function Schematic({ b }: { b: Builder }) {
  const p = b.project;
  const fw = FRAMEWORKS[b.cfg.framework];

  const mods: ModRow[] = [];
  if (p.needsCompanion) mods.push({ name: "companion-server", code: "SRV", meta: "3 files · included", codeColor: COLORS.signal, ext: "", kind: "companion" });
  INTEGRATIONS.filter((i) => p.valid.includes(i.id)).forEach((i) => {
    const per = p.perIntegration.find((x) => x.id === i.id)!;
    const parts: string[] = [];
    if (per.files) parts.push(`${per.files} file${per.files > 1 ? "s" : ""}`);
    if (per.packages) parts.push(`${per.packages} pkg`);
    if (per.env) parts.push(`${per.env} env`);
    if (per.status === "server") parts.push("via server");
    mods.push({ id: i.id, name: i.name, code: STATUS_CODE[per.status], codeColor: STATUS_TEXT[per.status], meta: parts.join(" · ") || "config only", ext: i.external?.name ?? "" });
  });
  if (!mods.length) mods.push({ name: "Nothing plugged in", code: "·", meta: "Switch on a capability in C", codeColor: COLORS.muted, ext: "", kind: "empty" });
  const n = mods.length;

  return (
    <section aria-label="Schematic" className="module !bg-diagram">
      <div className="module-strip flex-wrap">
        <span>D · SCHEMATIC</span>
        <span className="flex gap-3.5 text-muted">
          <span>━ in project</span>
          <span>┄ external</span>
        </span>
      </div>
      <div className="diagram-dots p-[clamp(12px,2.5vw,28px)]">
        <div
          className="grid grid-cols-[minmax(96px,130px)_24px_minmax(0,1fr)] gap-y-2.5 min-[560px]:grid-cols-[minmax(110px,190px)_36px_minmax(0,1fr)_28px_minmax(84px,150px)]"
          style={{ gridTemplateRows: `repeat(${n}, minmax(58px, auto))` }}
          role="list"
          aria-label={`${b.id} project with ${n} module${n === 1 ? "" : "s"}`}
        >
          <div
            className="col-start-1 flex min-h-[120px] min-w-0 flex-col justify-center gap-2 self-stretch rounded-[4px] bg-ink px-3.5 py-4 text-[#EDEDE8]"
            style={{ gridRow: `1 / span ${n}` }}
          >
            <span className="font-mono text-[9.5px] font-medium tracking-[0.06em] text-dim-2">PROJECT</span>
            <span className="break-all text-[15px] font-extrabold leading-[1.15] tracking-[-0.01em] [font-stretch:112%]">{b.id}</span>
            <span className="font-mono text-[10.5px] leading-[1.4] text-dim">{fw.tech}</span>
            <span className="mt-1.5 self-start rounded-[2px] border border-inv-div-2 px-1.5 py-1 font-mono text-[9.5px] font-medium text-dim">{p.base.files} BASE FILES</span>
          </div>
          {mods.map((m, i) => {
            const hl = !!b.last && m.id === b.last;
            const row = { gridRow: String(i + 1) };
            return (
              <div key={m.name} role="listitem" className="contents">
                <div className="relative col-start-2" style={row} aria-hidden="true">
                  <span className="absolute inset-x-0 top-1/2 -mt-px h-0.5" style={{ background: m.kind === "empty" ? "#CFCFC8" : COLORS.ink }} />
                  {n > 1 && <span className="absolute left-0 w-0.5 bg-ink" style={{ top: i === 0 ? "50%" : "-10px", bottom: i === n - 1 ? "50%" : "-10px" }} />}
                </div>
                <div
                  className="col-start-3 flex min-w-0 flex-col gap-[5px] rounded-[4px] px-3 py-[11px]"
                  style={{
                    ...row,
                    border: m.kind === "empty" ? "1.5px dashed #AFAFA8" : hl || m.kind === "companion" ? `1.5px solid ${COLORS.signal}` : `1.5px solid ${COLORS.ink}`,
                    background: hl ? COLORS.signalTint : m.kind === "empty" ? "transparent" : "#FFFFFF",
                    transition: "background .5s ease, border-color .5s ease",
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-bold">{m.name}</span>
                    <span className="flex-none font-mono text-[9.5px] font-semibold" style={{ color: m.codeColor }}>
                      {m.code}
                    </span>
                  </div>
                  <span className="font-mono text-[10.5px] text-muted">{m.meta}</span>
                </div>
                {m.ext && (
                  <>
                    <div className="relative col-start-4 hidden min-[560px]:block" style={row} aria-hidden="true">
                      <span className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-ext" />
                    </div>
                    <div
                      className="col-start-5 hidden min-w-0 self-center rounded-[4px] border-[1.5px] border-dashed border-ext bg-diagram px-2.5 py-[9px] font-mono text-[10.5px] font-medium leading-[1.35] text-ink-2 [overflow-wrap:anywhere] min-[560px]:block"
                      style={row}
                    >
                      <span className="sr-only">connects to </span>
                      {m.ext}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <dl className="m-0 grid grid-cols-3 border-t border-ink">
        {[
          [p.stats.files, "FILES"],
          [p.stats.packages, "PACKAGES"],
          [p.stats.env, "ENV VARS"],
        ].map(([v, k]) => (
          <div key={k} className="flex flex-col-reverse gap-1 border-r border-hairline px-4 py-3.5 last:border-r-0">
            <dt className="font-mono text-[10px] font-medium tracking-[0.06em] text-muted">{k}</dt>
            <dd className="wide m-0 text-[32px] leading-none tracking-[-0.03em]">{v}</dd>
          </div>
        ))}
      </dl>
      {p.companions.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-ink bg-white px-3.5 py-3">
          <span className="font-mono text-[10px] font-medium tracking-[0.06em] text-muted">ALSO NEEDED</span>
          {p.companions.map((c) => (
            <div key={c.name} className="grid grid-cols-[62px_minmax(0,1fr)] gap-2.5 text-[13px] leading-[1.45]">
              <span
                className="mt-0.5 self-start rounded-[2px] px-[5px] py-1 text-center font-mono text-[9.5px] font-semibold leading-none"
                style={{ border: c.kind === "included" ? `1px solid ${COLORS.signal}` : "1.5px dashed #8E8E87", color: c.kind === "included" ? COLORS.signalInk : "#3D3D3A" }}
              >
                {c.kind === "included" ? "INCLUDED" : "EXTERNAL"}
              </span>
              <span>
                <b>{c.name}</b> <span className="text-muted">· {c.description}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CodePanel({ b }: { b: Builder }) {
  const p = b.project;
  const tabs: Array<[CodeTab, string]> = [
    ["tree", "STRUCTURE"],
    ["deps", p.manifest.toUpperCase()],
    ["env", ".ENV.EXAMPLE"],
    ["setup", "SETUP"],
  ];
  const lines = useMemo(() => codeFor(b.tab, p, b.id, b.cfg.framework), [b.tab, p, b.id, b.cfg.framework]);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    b.setTab(tabs[next][0]);
    document.getElementById(`tab-${tabs[next][0]}`)?.focus();
  };

  return (
    <section aria-label="Generated files preview" className="overflow-hidden rounded-[4px] border border-ink bg-ink">
      <div role="tablist" aria-label="Preview" className="no-scrollbar flex overflow-x-auto border-b border-inv-div">
        {tabs.map(([k, label], i) => {
          const a = b.tab === k;
          return (
            <button
              key={k}
              id={`tab-${k}`}
              type="button"
              role="tab"
              aria-selected={a}
              aria-controls="code-panel"
              tabIndex={a ? 0 : -1}
              onClick={() => b.setTab(k)}
              onKeyDown={(e) => onKey(e, i)}
              className="h-[38px] whitespace-nowrap border-0 border-r border-inv-div px-3.5 font-mono text-[10.5px] font-medium"
              style={{ background: a ? "#2A2A27" : "transparent", color: a ? "#EDEDE8" : "#7A7A73" }}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div id="code-panel" role="tabpanel" aria-labelledby={`tab-${b.tab}`} tabIndex={0} className="max-h-[min(340px,46vh)] overflow-auto pb-3 pt-2.5 font-mono text-[11.5px] leading-5">
        {lines.map((ln, i) => {
          const hl = !!b.last && ln.tag === b.last;
          return (
            <div key={i} className="flex pr-3.5" style={{ background: hl ? "rgba(94,224,168,0.12)" : "transparent", transition: "background .6s ease" }}>
              <span aria-hidden="true" className="w-[38px] flex-none select-none pr-2.5 text-right text-code-ln">
                {i + 1}
              </span>
              <span aria-hidden="true" className="w-3 flex-none text-code-add">
                {hl ? "+" : ""}
              </span>
              <span className="min-w-0 flex-1 whitespace-pre">
                {ln.segs.map((s, j) => (
                  <span key={j} style={{ color: TOKEN[s.k] }}>
                    {s.t}
                  </span>
                ))}
              </span>
              {ln.note && <span className="ml-2.5 flex-none text-[9.5px] text-code-pun">{ln.note}</span>}
            </div>
          );
        })}
      </div>
      <p className="m-0 border-t border-inv-div px-3.5 py-2 font-mono text-[10px] text-code-com">
        {b.zip.ok
          ? "Representative preview · the ZIP's studio.manifest.json lists the exact files and versions"
          : "Representative preview · package versions illustrative until this template is built"}
      </p>
    </section>
  );
}
