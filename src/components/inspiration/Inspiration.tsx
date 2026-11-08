"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLORS, Led } from "@/components/system";
import { TRACK_LABEL } from "@/config/tracks";
import {
  APP_TYPES,
  DIFFICULTIES,
  filterIdeas,
  getIdea,
  hasFilters,
  IDEAS,
  INDUSTRIES,
  NO_FILTERS,
  pickNext,
  TRACK_OPTIONS,
  type Idea,
  type IdeaFilters,
} from "@/lib/inspiration/ideas";

const STORAGE_KEY = "agent-studio:inspiration";
const SWAP_MS = 170;
const HISTORY_MAX = 6;

interface Persisted {
  filters: IdeaFilters;
  currentId: number;
  history: number[];
}

function readStored(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    return getIdea(p.currentId) ? p : null;
  } catch {
    return null;
  }
}

export function Inspiration() {
  const [filters, setFilters] = useState<IdeaFilters>(NO_FILTERS);
  const [currentId, setCurrentId] = useState<number>(7);
  const [history, setHistory] = useState<number[]>([]);
  const [out, setOut] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  /** Ideas shown this session. Surprise Me avoids them until the pool is exhausted. */
  const seen = useRef<Set<number>>(new Set());
  const swapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const pool = useMemo(() => filterIdeas(filters), [filters]);
  const idea = getIdea(currentId) ?? IDEAS[0];

  useEffect(() => {
    const saved = readStored();
    /* eslint-disable react-hooks/set-state-in-effect -- one-off restore after hydration */
    if (saved) {
      setFilters({ ...NO_FILTERS, ...saved.filters });
      setCurrentId(saved.currentId);
      setHistory(saved.history.filter((h) => getIdea(h)).slice(0, HISTORY_MAX));
      seen.current = new Set([saved.currentId, ...saved.history]);
    } else {
      const first = pickNext(IDEAS, null, seen.current);
      if (first) setCurrentId(first.id);
      if (first) seen.current.add(first.id);
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ filters, currentId, history } satisfies Persisted));
    } catch {}
  }, [filters, currentId, history, hydrated]);

  useEffect(() => () => clearTimeout(swapTimer.current), []);

  const showIdea = useCallback(
    (id: number) => {
      if (id === currentId) return;
      seen.current.add(id);
      setOut(true);
      clearTimeout(swapTimer.current);
      swapTimer.current = setTimeout(() => {
        setHistory((h) => [currentId, ...h.filter((x) => x !== currentId && x !== id)].slice(0, HISTORY_MAX));
        setCurrentId(id);
        setOut(false);
      }, SWAP_MS);
    },
    [currentId],
  );

  const surprise = useCallback(() => {
    // Refill the bag for this pool once every match has been seen.
    if (pool.every((i) => seen.current.has(i.id))) pool.forEach((i) => seen.current.delete(i.id));
    const next = pickNext(pool, currentId, seen.current);
    if (next) showIdea(next.id);
  }, [pool, currentId, showIdea]);

  // SPACE = Surprise me, unless focus is in a form control or button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"].includes(t.tagName) || t.isContentEditable)) return;
      e.preventDefault();
      surprise();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [surprise]);

  const setFilter = (key: keyof IdeaFilters, value: string) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    const nextPool = filterIdeas(next);
    if (nextPool.length && !nextPool.some((i) => i.id === currentId)) {
      const pick = pickNext(nextPool, currentId, seen.current);
      if (pick) showIdea(pick.id);
    }
  };

  const filterDefs: Array<[string, keyof IdeaFilters, string[]]> = [
    ["INDUSTRY", "industry", INDUSTRIES],
    ["TRACK", "track", TRACK_OPTIONS],
    ["DIFFICULTY", "difficulty", DIFFICULTIES],
    ["APPLICATION TYPE", "type", APP_TYPES],
  ];
  const filtered = hasFilters(filters);

  return (
    <div className="page-wrap flex flex-col gap-4 pb-20 pt-[clamp(28px,4vw,48px)]">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-5">
        <div className="flex max-w-[760px] flex-col gap-3.5">
          <h1 className="m-0 text-[clamp(38px,5.6vw,76px)] font-extrabold leading-[0.95] tracking-[-0.04em] [font-stretch:125%]">Big ideas start somewhere.</h1>
          <p className="m-0 max-w-[520px] text-[16px] leading-normal text-ink-2 [text-wrap:pretty]">
            Explore unexpected problems, industries and opportunities. Find something worth building.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 max-[560px]:w-full max-[560px]:items-stretch">
          <button
            type="button"
            onClick={surprise}
            disabled={!pool.length}
            aria-keyshortcuts="Space"
            className="flex h-[68px] items-center justify-center gap-4 rounded-[4px] border-0 bg-signal px-6 text-[20px] font-extrabold tracking-[-0.01em] text-white shadow-[0_4px_0_#2E1A9E] [font-stretch:125%] active:translate-y-[3px] active:shadow-[0_1px_0_#2E1A9E] disabled:bg-hairline disabled:text-muted disabled:shadow-none"
          >
            SURPRISE ME
            <span aria-hidden="true" className="rounded-[3px] border border-white/40 px-[7px] py-[5px] font-mono text-[10px] font-semibold shadow-[0_2px_0_rgba(0,0,0,.25)]">
              SPACE
            </span>
          </button>
          <span className="font-mono text-[10px] text-muted" aria-live="polite">
            {pool.length} OF {IDEAS.length} IDEAS MATCH · OFFLINE LIBRARY
          </span>
        </div>
      </div>

      <section aria-label="Filters" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] overflow-hidden rounded-[4px] border border-ink bg-white">
        {filterDefs.map(([label, key, options]) => {
          const active = filters[key] !== "All";
          return (
            <label
              key={key}
              className="relative -mb-px -mr-px flex cursor-pointer flex-col gap-0.5 border-b border-r border-hairline px-3.5 pb-1.5 pt-[9px] focus-within:shadow-[inset_0_0_0_2px_#5A3CF0]"
              style={{ background: active ? COLORS.signalTint : "#FFFFFF" }}
            >
              <span className="mono-label flex items-center gap-[7px]">
                <Led color={active ? COLORS.signal : COLORS.soft} size={6} />
                {label}
              </span>
              <select
                value={filters[key]}
                onChange={(e) => setFilter(key, e.target.value)}
                className="select-reset h-[30px] w-full cursor-pointer border-0 bg-transparent pr-[22px] text-[15px] font-bold text-ink outline-none"
              >
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <span aria-hidden="true" className="pointer-events-none absolute bottom-3.5 right-3.5 font-mono text-[9px] font-medium text-muted">
                ▼
              </span>
            </label>
          );
        })}
        {filtered && (
          <button type="button" onClick={() => setFilters(NO_FILTERS)} className="min-h-14 border-0 border-b border-hairline bg-strip font-mono text-[10.5px] font-semibold text-signal">
            CLEAR FILTERS ✕
          </button>
        )}
      </section>

      {pool.length > 0 ? (
        <IdeaCard idea={idea} out={out} />
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-[4px] border-[1.5px] border-dashed border-ext bg-diagram px-5 py-16 text-center" role="status">
          <span className="font-mono text-[10.5px] font-semibold text-muted">NO SIGNAL</span>
          <span className="wide text-[24px] tracking-[-0.02em]">No ideas match every filter.</span>
          <span className="max-w-[400px] text-[14px] leading-normal text-muted">Loosen one. The best idea is often next to the one you were looking for.</span>
          <button type="button" onClick={() => setFilters(NO_FILTERS)} className="btn-tool mt-1.5 h-[42px] px-3.5 shadow-[0_2px_0_#161616]">
            CLEAR FILTERS
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-stretch gap-3">
        <section aria-label="Recently explored" className="module flex-[2_1_480px]">
          <div className="module-strip">RECENTLY EXPLORED</div>
          <div className="flex flex-wrap gap-1.5 px-3.5 py-3">
            {history.length ? (
              history.map((h) => {
                const i = getIdea(h);
                if (!i) return null;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => showIdea(h)}
                    className="h-9 max-w-[280px] truncate rounded-[3px] border border-rest bg-white px-2.5 text-[13px] font-semibold text-ink shadow-[0_2px_0_#CFCFC8] hover:border-ink"
                  >
                    {i.title}
                  </button>
                );
              })
            ) : (
              <span className="text-[13px] leading-9 text-muted">Ideas you skip land here, so you can come back to them.</span>
            )}
          </div>
        </section>
        <section aria-label="Found your own angle" className="flex min-w-0 flex-[1_1_300px] flex-col gap-2 rounded-[4px] bg-ink p-3.5 text-[#EDEDE8]">
          <span className="font-mono text-[10.5px] font-medium tracking-[0.04em] text-dim-2">FOUND YOUR OWN ANGLE?</span>
          <span className="text-[14px] leading-[1.45] text-dim">Pick the framework that suits it and start from a clean, configured project.</span>
          <Link href="/build" className="mt-auto flex h-10 items-center self-start rounded-[3px] bg-[#EDEDE8] px-3 font-mono text-[10.5px] font-semibold !text-ink hover:!no-underline">
            OPEN PROJECT BUILDER ▸
          </Link>
        </section>
      </div>
    </div>
  );
}

function IdeaCard({ idea, out }: { idea: Idea; out: boolean }) {
  const level = { Beginner: 1, Intermediate: 2, Advanced: 3 }[idea.difficulty];
  return (
    <article
      aria-labelledby="idea-title"
      aria-live="polite"
      className="module"
      style={{ opacity: out ? 0 : 1, transform: out ? "translateY(6px)" : "none", transition: "opacity .2s ease, transform .2s ease" }}
    >
      <div className="module-strip flex-wrap">
        <span>
          IDEA № {String(idea.id).padStart(3, "0")} · {idea.industry.toUpperCase()}
        </span>
        <span className="flex flex-wrap gap-3.5 text-ink-2">
          <span>{TRACK_LABEL[idea.track].toUpperCase()}</span>
          <span>{idea.type.toUpperCase()}</span>
          <span className="flex items-center gap-1.5">
            <span className="flex gap-0.5" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-2.5 w-2.5" style={{ background: i < level ? COLORS.ink : COLORS.cell }} />
              ))}
            </span>
            {idea.difficulty.toUpperCase()}
          </span>
        </span>
      </div>
      <div className="soft-dots flex flex-col gap-[clamp(28px,4vw,48px)] px-[clamp(16px,3vw,36px)] py-[clamp(24px,4vw,52px)]">
        <h2 id="idea-title" className="m-0 max-w-[1000px] text-[clamp(32px,5vw,68px)] font-extrabold leading-[0.95] tracking-[-0.04em] [font-stretch:125%] [text-wrap:balance] [overflow-wrap:anywhere]">
          {idea.title}
        </h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-3">
          <IdeaBox label="THE PROBLEM" led={COLORS.ink} border="1.5px solid #161616" text={idea.problem} />
          <IdeaBox label="THE INTERESTING PART" led={COLORS.signal} border="1.5px solid #5A3CF0" labelColor={COLORS.signalInk} text={idea.challenge} />
          <IdeaBox label="ONE POSSIBLE DIRECTION" led={COLORS.ok} border="1.5px dashed #161616" labelColor={COLORS.okText} text={idea.direction} />
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] border-t border-ink">
        {idea.angles.map((a, i) => (
          <div key={i} className="-mr-px flex flex-col gap-1.5 border-r border-hairline p-3.5">
            <span className="font-mono text-[10px] font-semibold tracking-[0.04em] text-signal">{i ? "OR FLIP IT" : "TAKE IT SOMEWHERE ELSE"}</span>
            <span className="text-[15px] font-semibold leading-[1.45]">{a}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function IdeaBox({ label, led, border, labelColor, text }: { label: string; led: string; border: string; labelColor?: string; text: string }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[4px] bg-white p-3.5" style={{ border }}>
      <span className="flex items-center gap-2 font-mono text-[10.5px] font-semibold tracking-[0.04em]" style={{ color: labelColor }}>
        <Led color={led} />
        {label}
      </span>
      <p className="m-0 text-[16px] leading-normal text-ink-2 [text-wrap:pretty]">{text}</p>
    </div>
  );
}
