"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { COLORS, Led, Module } from "@/components/system";
import { evenWindows, parseTournamentConfig, tournamentSpanSeconds, type LayerConfig, type TournamentConfig } from "@/core/tournament/config";
import { BUILD_STAGES, LAYER_TEMPLATES } from "@/core/tournament/templates";
import { validateVerifierConfig } from "@/core/verification/catalogue";
import { addFixtureTeam, createRehearsal, publish, saveDraft, schedule, unpublish } from "@/app/admin/tournaments/actions";
import { field, labelCls } from "./ListActions";
import { LayerEditor } from "./LayerEditor";
import { formatZoned, zonedLocalToIso } from "./zoned-time";

const LOCKED = ["scheduled", "running", "paused", "finalising", "completed", "cancelled"];

export interface BuilderProps {
  id: string;
  status: string;
  simulation: boolean;
  startsAt: string | null;
  timezone: string;
  initial: TournamentConfig;
  versions: { version: number; publishedAt: string; note: string }[];
  fixtures: { id: string; name: string; state: string }[];
  fixtureVariants: readonly string[];
}

export function Builder(props: BuilderProps) {
  const [config, setConfig] = useState<TournamentConfig>(props.initial);
  const [selected, setSelected] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "fault"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const readOnly = LOCKED.includes(props.status);

  const update = (next: TournamentConfig) => {
    setConfig(next);
    setDirty(true);
  };
  const setLayer = (i: number, l: LayerConfig) => update({ ...config, layers: config.layers.map((x, j) => (j === i ? l : x)) });

  // Live validation with the same rules the server applies.
  const issues = useMemo(() => {
    const out: { path: string; message: string }[] = [];
    const r = parseTournamentConfig(config);
    if (!r.ok) out.push(...r.issues);
    config.layers.forEach((l, i) => {
      const v = validateVerifierConfig(l.verifier.plugin, l.verifier.config);
      if (!v.ok) out.push({ path: `layers.${i}.verifier.config`, message: v.message });
    });
    return out;
  }, [config]);
  const layerIssues = (i: number) => issues.filter((x) => x.path.startsWith(`layers.${i}.`) || x.path === `layers.${i}`).map((x) => `${x.path.replace(`layers.${i}.`, "")}: ${x.message}`);
  const topIssues = issues.filter((x) => !x.path.startsWith("layers."));

  const run = (fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, success: string) =>
    start(async () => {
      setMessage(null);
      const r = await fn();
      if (r.ok) {
        setDirty(false);
        setMessage({ tone: "ok", text: success });
      } else setMessage({ tone: "fault", text: r.error ?? "Something went wrong." });
    });

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= config.layers.length) return;
    const layers = [...config.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    update({ ...config, layers });
    setSelected(j);
  };
  const uniqueKey = (base: string) => {
    let key = base.slice(0, 40);
    let n = 2;
    while (config.layers.some((l) => l.key === key)) key = `${base.slice(0, 40)}-${n++}`;
    return key;
  };
  const addLayer = (templateKey: string) => {
    const stage = BUILD_STAGES.find((x) => x.key === templateKey);
    const t = stage ?? LAYER_TEMPLATES.find((x) => x.key === templateKey) ?? LAYER_TEMPLATES[0];
    const challenges = config.layers.filter((l) => l.category !== "build_stage");
    const last = challenges.at(-1);
    const span = Math.max(1800, ...config.layers.map((l) => l.timing.offsetSeconds + l.timing.durationSeconds));
    // Build stages stay open for the whole race; challenges go after the last challenge.
    const timing = stage ? { offsetSeconds: 0, durationSeconds: span } : { offsetSeconds: last ? last.timing.offsetSeconds + last.timing.durationSeconds : 0, durationSeconds: last?.timing.durationSeconds ?? 1800 };
    const layer: LayerConfig = { ...structuredClone(t), key: uniqueKey(templateKey === "blank" ? "layer" : t.key), title: templateKey === "blank" ? "New layer" : t.title, prerequisites: [], timing };
    update({ ...config, layers: [...config.layers, layer] });
    setSelected(config.layers.length);
  };

  const [spacing, setSpacing] = useState({ minutes: 30 });
  const [startLocal, setStartLocal] = useState("");
  const [note, setNote] = useState("");
  const layer = config.layers[selected];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow flex items-center gap-2">
            <Led color={readOnly ? COLORS.soft : COLORS.signal} />
            {props.simulation ? "REHEARSAL (SIMULATION) · " : ""}
            {props.status.toUpperCase()}
            {props.versions[0] ? ` · PUBLISHED V${props.versions[0].version}` : ""}
            {dirty && " · UNSAVED CHANGES"}
          </span>
          <h1 className="section-h">{config.name || "Untitled tournament"}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {readOnly && (
            <Link href={`/admin/tournaments/${props.id}/control`} className="btn-primary !h-10 !px-4 !text-[13px] hover:!no-underline">
              Control room ▸
            </Link>
          )}
          {!readOnly && (
            <button type="button" disabled={pending || !dirty} onClick={() => run(() => saveDraft(props.id, config) as never, "Draft saved.")} className="btn-secondary !h-10 !px-4 !text-[13px]">
              Save draft
            </button>
          )}
        </div>
      </div>

      {readOnly && (
        <div role="status" className="rounded-[3px] border px-4 py-3 text-[14px]" style={{ borderColor: COLORS.warnBorder, background: COLORS.warnTint, color: COLORS.warnText }}>
          The rules are locked because the tournament is {props.status}. Change timings with the control room&apos;s emergency controls; every change is audited.
        </div>
      )}
      {message && (
        <p role={message.tone === "fault" ? "alert" : "status"} className="m-0 text-[13.5px]" style={{ color: message.tone === "ok" ? COLORS.okText : COLORS.fault }}>
          {message.text}
        </p>
      )}

      <div className="grid items-start gap-4 min-[1200px]:grid-cols-[360px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Module label="TOURNAMENT">
            <fieldset disabled={readOnly} className="m-0 flex flex-col gap-3 border-0 p-4">
              <label className={labelCls}>
                Name
                <input value={config.name} maxLength={100} onChange={(e) => update({ ...config, name: e.target.value })} className={field} />
              </label>
              <label className={labelCls}>
                Description (shown to participants)
                <textarea rows={3} value={config.description} maxLength={2000} onChange={(e) => update({ ...config, description: e.target.value })} className="rounded-[3px] border border-[#CFCFC8] bg-white px-3 py-2 text-[14px] font-normal" />
              </label>
              <label className={labelCls}>
                Mode
                <select value={config.mode} onChange={(e) => update({ ...config, mode: e.target.value as TournamentConfig["mode"] })} className={field}>
                  <option value="survival">Survival</option>
                  <option value="ranked">Ranked elimination</option>
                  <option value="checkpoint">Checkpoint</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className={labelCls}>
                  Entries
                  <select value={config.participation} onChange={(e) => update({ ...config, participation: e.target.value as TournamentConfig["participation"] })} className={field}>
                    <option value="team">Teams</option>
                    <option value="individual">Individuals</option>
                  </select>
                </label>
                <label className={labelCls}>
                  Timezone
                  <input value={config.timezone} onChange={(e) => update({ ...config, timezone: e.target.value })} className={field} />
                </label>
              </div>
              <label className={labelCls}>
                Tie-break order (published to participants)
                <select
                  value={config.tieBreak.join(",")}
                  onChange={(e) => update({ ...config, tieBreak: e.target.value.split(",") as TournamentConfig["tieBreak"] })}
                  className={field}
                >
                  <option value="score_desc,first_pass_at_asc,attempts_asc">Score, then first to pass, then fewest attempts</option>
                  <option value="first_pass_at_asc,score_desc,attempts_asc">First to pass, then score, then fewest attempts</option>
                  <option value="score_desc,attempts_asc,first_pass_at_asc">Score, then fewest attempts, then first to pass</option>
                </select>
              </label>
              <label className="flex items-start gap-2 text-[13px]">
                <input type="checkbox" checked={config.countsTowardsJudging} onChange={(e) => update({ ...config, countsTowardsJudging: e.target.checked })} className="mt-1" />
                <span>Show results to judges as supporting evidence. Off by default: the race never decides the official tracks by itself.</span>
              </label>
              {topIssues.length > 0 && (
                <ul role="alert" className="m-0 pl-5 text-[13px] text-fault">
                  {topIssues.map((i) => (
                    <li key={i.path + i.message}>{i.message}</li>
                  ))}
                </ul>
              )}
            </fieldset>
          </Module>

          <Module label="LAYERS" right={`${config.layers.length} · ${Math.round(tournamentSpanSeconds(config) / 60)} MIN TOTAL`}>
            <ol className="m-0 flex list-none flex-col p-0">
              {config.layers.map((l, i) => (
                <li key={`${l.key}-${i}`} className="flex items-center gap-2 border-b border-hairline px-3 py-2 last:border-b-0" style={i === selected ? { background: COLORS.strip } : undefined}>
                  <button type="button" onClick={() => setSelected(i)} className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-left">
                    <span className="font-mono text-[10px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                    <span className="truncate text-[14px] font-semibold">{l.title || "Untitled"}</span>
                    {layerIssues(i).length > 0 && <Led color={COLORS.fault} />}
                  </button>
                  {!readOnly && (
                    <span className="flex flex-none gap-1 font-mono text-[11px]">
                      <button type="button" aria-label="Move up" onClick={() => move(i, -1)} className="border-0 bg-transparent px-1 text-muted">↑</button>
                      <button type="button" aria-label="Move down" onClick={() => move(i, 1)} className="border-0 bg-transparent px-1 text-muted">↓</button>
                      <button type="button" aria-label="Duplicate" onClick={() => { update({ ...config, layers: [...config.layers.slice(0, i + 1), { ...structuredClone(l), key: uniqueKey(l.key), title: `${l.title} (copy)` }, ...config.layers.slice(i + 1)] }); setSelected(i + 1); }} className="border-0 bg-transparent px-1 text-muted">⧉</button>
                      <button type="button" aria-label="Remove" disabled={config.layers.length === 1} onClick={() => { update({ ...config, layers: config.layers.filter((_, j) => j !== i).map((x) => ({ ...x, prerequisites: x.prerequisites.filter((p) => p !== l.key) })) }); setSelected(Math.max(0, i - 1)); }} className="border-0 bg-transparent px-1 text-muted hover:text-fault">✕</button>
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {!readOnly && (
              <div className="flex flex-col gap-2 border-t border-hairline p-3">
                <label className={labelCls}>
                  Add a layer
                  <select value="" onChange={(e) => e.target.value && addLayer(e.target.value)} className={field}>
                    <option value="">Choose a template…</option>
                    <optgroup label="Challenges">
                      {LAYER_TEMPLATES.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.title}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Build stages (open all race)">
                      {BUILD_STAGES.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.title}
                        </option>
                      ))}
                    </optgroup>
                    <option value="blank">Blank layer</option>
                  </select>
                </label>
                <div className="flex flex-wrap items-end gap-2">
                  <label className={labelCls}>
                    Space challenges every
                    <input type="number" min={1} value={spacing.minutes} onChange={(e) => setSpacing({ minutes: Math.max(1, Number(e.target.value)) })} className={`${field} w-24`} />
                  </label>
                  <span className="pb-2.5 text-[13px]">minutes</span>
                  <button type="button" onClick={() => {
                      // Only challenges are spaced out; build stages keep their all-race window.
                      const idx = config.layers.map((l, i) => (l.category === "build_stage" ? -1 : i)).filter((i) => i >= 0);
                      const w = evenWindows(idx.length, spacing.minutes * 60);
                      update({ ...config, layers: config.layers.map((l, i) => (idx.includes(i) ? { ...l, timing: w[idx.indexOf(i)] } : l)) });
                    }} className="btn-secondary !h-10 !px-3 !text-[13px]">
                    Apply
                  </button>
                </div>
              </div>
            )}
          </Module>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {layer && (
            <Module label={`LAYER ${selected + 1}`} right={layer.difficulty.toUpperCase()}>
              <div className="p-4">
                <LayerEditor layer={layer} index={selected} config={config} issues={layerIssues(selected)} readOnly={readOnly} onChange={(l) => setLayer(selected, l)} />
              </div>
            </Module>
          )}

          <Module label="TIMELINE" right={props.startsAt ? `STARTS ${formatZoned(props.startsAt, config.timezone)}` : "RELATIVE TO THE START"}>
            <Timeline config={config} startsAt={props.startsAt ?? (startLocal ? zonedLocalToIso(startLocal, config.timezone) : null)} />
          </Module>

          {!readOnly && (
            <Module label="PUBLISH AND SCHEDULE" right={issues.length ? `${issues.length} ISSUE${issues.length === 1 ? "" : "S"}` : "READY"}>
              <div className="flex flex-col gap-3 p-4 text-[13.5px] leading-normal text-ink-2">
                <p className="m-0">
                  Publishing freezes these rules as version {(props.versions[0]?.version ?? 0) + 1} and opens registration. Scheduling sets the start time and locks the rules.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <label className={`${labelCls} flex-1`}>
                    Version note
                    <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="What changed" className={field} />
                  </label>
                  <button type="button" disabled={pending || issues.length > 0} onClick={() => run(() => publish(props.id, config, note) as never, "Published. Teams can now enter.")} className="btn-primary !h-10 !px-4 !text-[13px]">
                    Publish
                  </button>
                  {props.status === "published" && (
                    <button type="button" disabled={pending} onClick={() => {
                      if (!window.confirm("Unpublish? Registration closes and the race goes back to a draft. Teams who already entered stay entered.")) return;
                      run(() => unpublish(props.id) as never, "Unpublished: back to draft.");
                    }} className="btn-secondary !h-10 !px-4 !text-[13px]">
                      Unpublish
                    </button>
                  )}
                </div>
                {props.status === "published" && (
                  <div className="flex flex-wrap items-end gap-2 border-t border-hairline pt-3">
                    <label className={labelCls}>
                      Start time ({config.timezone})
                      <input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} className={field} />
                    </label>
                    <button
                      type="button"
                      disabled={pending || !startLocal || dirty}
                      onClick={() => {
                        if (!window.confirm(`Schedule the race to start at ${startLocal.replace("T", " ")} (${config.timezone})?\n\nThis locks the rules: after this you can only pause, extend or cancel from the control room.`)) return;
                        run(() => schedule(props.id, zonedLocalToIso(startLocal, config.timezone)) as never, "Scheduled. The worker opens each layer on time.");
                      }}
                      className="btn-primary !h-10 !px-4 !text-[13px]"
                    >
                      Schedule
                    </button>
                    {dirty && <span className="pb-2.5 text-[12.5px] text-muted">Publish your changes first.</span>}
                  </div>
                )}
              </div>
            </Module>
          )}

          {!props.simulation && !readOnly && issues.length === 0 && <RehearsalPanel id={props.id} />}
          {props.simulation && <FixturePanel id={props.id} fixtures={props.fixtures} variants={props.fixtureVariants} readOnly={readOnly} />}
        </div>
      </div>
    </div>
  );
}

function Timeline({ config, startsAt }: { config: TournamentConfig; startsAt: string | null }) {
  const span = Math.max(1, tournamentSpanSeconds(config));
  return (
    <div className="flex flex-col gap-1.5 p-4">
      {config.layers.map((l, i) => (
        <div key={`${l.key}-${i}`} className="grid grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-3 text-[12.5px]">
          <span className="truncate font-semibold">{i + 1}. {l.title}</span>
          <span className="relative h-3 rounded-[2px] bg-strip">
            <span className="absolute inset-y-0 rounded-[2px]" style={{ left: `${(l.timing.offsetSeconds / span) * 100}%`, width: `${Math.max(1, (l.timing.durationSeconds / span) * 100)}%`, background: COLORS.signal }} />
          </span>
          <span className="whitespace-nowrap font-mono text-[10.5px] text-muted">
            {startsAt
              ? `${formatZoned(new Date(Date.parse(startsAt) + l.timing.offsetSeconds * 1000).toISOString(), config.timezone)} to ${formatZoned(new Date(Date.parse(startsAt) + (l.timing.offsetSeconds + l.timing.durationSeconds) * 1000).toISOString(), config.timezone).split(" ").pop()}`
              : `+${Math.round(l.timing.offsetSeconds / 60)} to +${Math.round((l.timing.offsetSeconds + l.timing.durationSeconds) / 60)} min`}
          </span>
        </div>
      ))}
    </div>
  );
}

function RehearsalPanel({ id }: { id: string }) {
  const [speed, setSpeed] = useState(30);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string; href?: string } | null>(null);
  return (
    <Module label="REHEARSAL" right="SIMULATION">
      <div className="flex flex-col gap-3 p-4 text-[13.5px] leading-normal text-ink-2">
        <p className="m-0">Run the whole tournament at speed with fixture apps that pass or fail for real reasons. Rehearsals are hidden from participants and the venue screen.</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className={labelCls}>
            Speed-up
            <input type="number" min={1} max={120} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className={`${field} w-24`} />
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { const r = await createRehearsal(id, speed); setResult(r.ok ? { ok: true, text: "Rehearsal created.", href: `/admin/tournaments/${r.data}` } : { ok: false, text: r.error }); })}
            className="btn-secondary !h-10 !px-4 !text-[13px]"
          >
            Create rehearsal
          </button>
        </div>
        {result && (
          <p className="m-0" style={{ color: result.ok ? COLORS.okText : COLORS.fault }}>
            {result.text} {result.href && <Link href={result.href}>Open it ▸</Link>}
            {result.ok && (
              <span className="mt-1 block text-[12.5px] text-ink-2">
                Next, in the rehearsal: add fixture teams (at least one &quot;reference&quot;), press Publish, then pick a start time and Schedule. Watch it in its control room.
              </span>
            )}
          </p>
        )}
      </div>
    </Module>
  );
}

function FixturePanel({ id, fixtures, variants, readOnly }: { id: string; fixtures: BuilderProps["fixtures"]; variants: readonly string[]; readOnly: boolean }) {
  const [variant, setVariant] = useState(variants[0] ?? "reference");
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Module label="FIXTURE TEAMS" right={`${fixtures.length}`}>
      <div className="flex flex-col gap-3 p-4 text-[13.5px]">
        <p className="m-0 text-ink-2">Fixture apps are deterministic reference implementations with no AI model. &quot;reference&quot; passes every built-in layer; the others fail specific layers for real reasons.</p>
        {fixtures.length > 0 && (
          <ul className="m-0 flex flex-col gap-1 pl-5">
            {fixtures.map((f) => (
              <li key={f.id}>
                {f.name} <span className="font-mono text-[10.5px] text-muted">{f.state.toUpperCase()}</span>
              </li>
            ))}
          </ul>
        )}
        {!readOnly && (
          <div className="flex flex-wrap items-end gap-2">
            <label className={labelCls}>
              Behaviour
              <select value={variant} onChange={(e) => setVariant(e.target.value)} className={field}>
                {variants.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelCls}>
              Display name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Fixture ${variant}`} className={field} />
            </label>
            <button type="button" disabled={pending} onClick={() => start(async () => { const r = await addFixtureTeam(id, variant, name); if (!r.ok) setError(r.error); else setName(""); })} className="btn-secondary !h-10 !px-4 !text-[13px]">
              Add
            </button>
          </div>
        )}
        {error && <p role="alert" className="m-0 text-fault">{error}</p>}
      </div>
    </Module>
  );
}
