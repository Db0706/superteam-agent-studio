"use client";

import type { LayerConfig, TournamentConfig } from "@/core/tournament/config";
import { field, labelCls } from "./ListActions";
import { VerifierEditor } from "./VerifierEditor";

const area = "rounded-[3px] border border-[#CFCFC8] bg-white px-3 py-2 text-[14px] font-normal";

/** Every setting of one layer, as a form. */
export function LayerEditor({
  layer,
  index,
  config,
  issues,
  readOnly,
  onChange,
}: {
  layer: LayerConfig;
  index: number;
  config: TournamentConfig;
  issues: string[];
  readOnly: boolean;
  onChange: (l: LayerConfig) => void;
}) {
  const set = <K extends keyof LayerConfig>(k: K, v: LayerConfig[K]) => onChange({ ...layer, [k]: v });
  const earlier = config.layers.slice(0, index);
  const minutes = (s: number) => Math.round((s / 60) * 100) / 100;
  const showOutcome = config.mode === "hybrid";
  const showAdvancement = config.mode === "ranked" || (config.mode === "hybrid" && layer.outcome === "eliminate");

  return (
    <fieldset disabled={readOnly} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
      {issues.length > 0 && (
        <ul role="alert" className="m-0 rounded-[3px] border border-fault bg-fault-tint px-4 py-2.5 pl-8 text-[13px] text-fault">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      <Section title="What participants build">
        <div className="grid gap-3 min-[700px]:grid-cols-[minmax(0,1fr)_200px]">
          <label className={labelCls}>
            Title
            <input value={layer.title} maxLength={80} onChange={(e) => set("title", e.target.value)} className={field} />
          </label>
          <label className={labelCls}>
            Key (stable id)
            <input value={layer.key} maxLength={48} onChange={(e) => set("key", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} className={`${field} font-mono`} />
          </label>
        </div>
        <label className={labelCls}>
          One-line description
          <input value={layer.description} maxLength={400} onChange={(e) => set("description", e.target.value)} className={field} />
        </label>
        <label className={labelCls}>
          Objective
          <input value={layer.objective} maxLength={400} onChange={(e) => set("objective", e.target.value)} className={field} />
        </label>
        <label className={labelCls}>
          Instructions (Markdown: paragraphs, - lists, `code`, **bold**, [links](https://…))
          <textarea rows={6} value={layer.instructions} maxLength={8000} onChange={(e) => set("instructions", e.target.value)} className={`${area} font-mono text-[12.5px]`} />
        </label>
        <div className="grid gap-3 min-[700px]:grid-cols-2">
          <label className={labelCls}>
            Difficulty
            <select value={layer.difficulty} onChange={(e) => set("difficulty", e.target.value as LayerConfig["difficulty"])} className={field}>
              <option value="intro">Intro</option>
              <option value="core">Core</option>
              <option value="advanced">Advanced</option>
              <option value="expert">Expert</option>
            </select>
          </label>
          <label className={labelCls}>
            Capabilities (comma separated)
            <input value={layer.capabilities.join(", ")} onChange={(e) => set("capabilities", e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10))} className={field} />
          </label>
        </div>
      </Section>

      <Section title="Timing">
        <div className="grid gap-3 min-[700px]:grid-cols-2">
          <label className={labelCls}>
            Opens (minutes after the tournament starts)
            <input type="number" min={0} step="any" value={minutes(layer.timing.offsetSeconds)} onChange={(e) => set("timing", { ...layer.timing, offsetSeconds: Math.max(0, Math.round(Number(e.target.value) * 60)) })} className={field} />
          </label>
          <label className={labelCls}>
            Open for (minutes)
            <input type="number" min={1} step="any" value={minutes(layer.timing.durationSeconds)} onChange={(e) => set("timing", { ...layer.timing, durationSeconds: Math.max(60, Math.round(Number(e.target.value) * 60)) })} className={field} />
          </label>
        </div>
      </Section>

      <Section title="Passing and advancing">
        <div className="grid gap-3 min-[700px]:grid-cols-3">
          <label className={labelCls}>
            Pass mark (%)
            <input type="number" min={0} max={100} value={layer.passingScore} onChange={(e) => set("passingScore", Math.max(0, Math.min(100, Number(e.target.value))))} className={field} />
          </label>
          <label className={labelCls}>
            Attempts allowed (blank = unlimited)
            <input type="number" min={1} value={layer.retries.maxAttempts ?? ""} onChange={(e) => set("retries", { ...layer.retries, maxAttempts: e.target.value ? Math.max(1, Number(e.target.value)) : null })} className={field} />
          </label>
          <label className={labelCls}>
            Wait between attempts (s)
            <input type="number" min={0} max={3600} value={layer.retries.cooldownSeconds} onChange={(e) => set("retries", { ...layer.retries, cooldownSeconds: Math.max(0, Math.min(3600, Number(e.target.value))) })} className={field} />
          </label>
        </div>
        {showOutcome && (
          <label className={labelCls}>
            In this hybrid tournament, this layer is
            <select value={layer.outcome} onChange={(e) => set("outcome", e.target.value as LayerConfig["outcome"])} className={field}>
              <option value="checkpoint">A checkpoint (nobody is eliminated)</option>
              <option value="eliminate">An elimination round</option>
            </select>
          </label>
        )}
        {showAdvancement && (
          <div className="grid gap-3 min-[700px]:grid-cols-2">
            <label className={labelCls}>
              Who advances
              <select
                value={layer.advancement.kind}
                onChange={(e) => {
                  const kind = e.target.value as LayerConfig["advancement"]["kind"];
                  set("advancement", kind === "top_n" ? { kind, n: 10 } : kind === "top_percent" ? { kind, percent: 50 } : { kind });
                }}
                className={field}
              >
                <option value="all_passing">Everyone who passes</option>
                <option value="top_n">The top N passing teams</option>
                <option value="top_percent">The top % of teams</option>
              </select>
            </label>
            {layer.advancement.kind === "top_n" && (
              <label className={labelCls}>
                N
                <input type="number" min={1} value={layer.advancement.n} onChange={(e) => set("advancement", { kind: "top_n", n: Math.max(1, Number(e.target.value)) })} className={field} />
              </label>
            )}
            {layer.advancement.kind === "top_percent" && (
              <label className={labelCls}>
                Percent
                <input type="number" min={1} max={100} value={layer.advancement.percent} onChange={(e) => set("advancement", { kind: "top_percent", percent: Math.max(1, Math.min(100, Number(e.target.value))) })} className={field} />
              </label>
            )}
          </div>
        )}
        <div className="grid gap-3 min-[700px]:grid-cols-2">
          <label className={labelCls}>
            Weight in overall standings
            <input type="number" min={0} max={100} step="any" value={layer.weight} onChange={(e) => set("weight", Math.max(0, Number(e.target.value)))} className={field} />
          </label>
          <label className={labelCls}>
            Achievement title (optional)
            <input value={layer.achievement?.title ?? ""} maxLength={60} onChange={(e) => set("achievement", e.target.value ? { title: e.target.value } : undefined)} className={field} />
          </label>
        </div>
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1 text-[13px] font-semibold">Must pass first</legend>
          {earlier.length === 0 && <span className="text-[13px] text-muted">This is the first layer.</span>}
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {earlier.map((l) => (
              <label key={l.key} className="flex items-center gap-2 text-[13.5px]">
                <input
                  type="checkbox"
                  checked={layer.prerequisites.includes(l.key)}
                  onChange={(e) => set("prerequisites", e.target.checked ? [...layer.prerequisites, l.key] : layer.prerequisites.filter((p) => p !== l.key))}
                />
                {l.title}
              </label>
            ))}
          </div>
        </fieldset>
      </Section>

      <Section title="Verification">
        <VerifierEditor value={layer.verifier} readOnly={readOnly} onChange={(v) => set("verifier", v)} />
        <label className={labelCls}>
          What must work, as shown to participants (one per line, never hidden test data)
          <textarea rows={3} value={layer.verifier.visibleCriteria.join("\n")} onChange={(e) => set("verifier", { ...layer.verifier, visibleCriteria: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 12) })} className={area} />
        </label>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13.5px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={layer.feedback.showCheckNames} onChange={(e) => set("feedback", { ...layer.feedback, showCheckNames: e.target.checked })} /> Show check names to participants
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={layer.feedback.showDetails} onChange={(e) => set("feedback", { ...layer.feedback, showDetails: e.target.checked })} /> Show detailed feedback
          </label>
        </div>
      </Section>

      <Section title="Help and resources">
        <ListEditor
          label="Resources"
          items={layer.resources}
          blank={{ label: "", url: "https://" }}
          onChange={(v) => set("resources", v)}
          render={(r, upd) => (
            <>
              <input placeholder="Label" value={r.label} onChange={(e) => upd({ ...r, label: e.target.value })} className={`${field} flex-1`} />
              <input placeholder="https://…" value={r.url} onChange={(e) => upd({ ...r, url: e.target.value })} className={`${field} flex-[2] font-mono text-[12.5px]`} />
            </>
          )}
        />
        <ListEditor
          label="Hints (unlock after a number of failed attempts)"
          items={layer.hints}
          blank={{ afterAttempts: 2, text: "" }}
          onChange={(v) => set("hints", v)}
          render={(h, upd) => (
            <>
              <input type="number" min={0} value={h.afterAttempts} onChange={(e) => upd({ ...h, afterAttempts: Math.max(0, Number(e.target.value)) })} className={`${field} w-20`} title="After this many failed attempts" />
              <input placeholder="Hint text" value={h.text} onChange={(e) => upd({ ...h, text: e.target.value })} className={`${field} flex-1`} />
            </>
          )}
        />
      </Section>
    </fieldset>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-4 first:border-t-0 first:pt-0">
      <span className="mono-label">{title.toUpperCase()}</span>
      {children}
    </section>
  );
}

function ListEditor<T>({ label, items, blank, onChange, render }: { label: string; items: T[]; blank: T; onChange: (v: T[]) => void; render: (item: T, update: (v: T) => void) => React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold">{label}</span>
      {items.map((it, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          {render(it, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="h-10 border-0 bg-transparent px-2 font-mono text-[11px] text-muted hover:text-fault">
            REMOVE
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, blank])} className="self-start border-0 bg-transparent p-0 font-mono text-[11px] text-signal">
        + ADD
      </button>
    </div>
  );
}
