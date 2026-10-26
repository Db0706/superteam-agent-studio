import type { University } from "@/server/dal/leaderboard";
import type { Winner } from "@/server/dal/winners";

const PLACE_LABEL: Record<number, string> = { 1: "WINNER", 2: "RUNNER-UP", 3: "HONOURABLE MENTION" };
const PLACE_COLOR: Record<number, string> = { 1: "#C9A227", 2: "#9AA0A6", 3: "#B0743A" };
const UNI_LABEL: Record<University, string> = { cambridge: "Cambridge", oxford: "Oxford", mixed: "Mixed", other: "Other" };
const UNI_COLOR: Record<University, string> = { cambridge: "#3B9FD6", oxford: "#1F3A93", mixed: "#8E8E87", other: "#AFAFA8" };
const TRACKS = [
  { track: "build", name: "Build Track" },
  { track: "policy", name: "Policy Track" },
] as const;

function Card({ w }: { w: Winner }) {
  const first = w.place === 1;
  return (
    <article className={`module flex flex-col ${first ? "min-[860px]:row-span-1" : ""}`}>
      <div className="module-strip">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full" style={{ background: PLACE_COLOR[w.place] ?? "#AFAFA8" }} />
          {PLACE_LABEL[w.place] ?? `PLACE ${w.place}`}
        </span>
        <span className="text-muted">{w.track === "build" ? "BUILD TRACK" : "POLICY TRACK"}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className={`m-0 font-extrabold leading-[1.15] [font-stretch:112%] ${first ? "text-[24px]" : "text-[19px]"}`}>{w.project}</h3>
        {w.summary && <p className="m-0 line-clamp-3 text-[14px] leading-normal text-ink-2">{w.summary}</p>}
        <div className="flex flex-wrap items-center gap-2 text-[15px] font-bold">
          {w.team}
          <span className="rounded-[2px] px-1.5 py-[2px] font-mono text-[9.5px] font-semibold text-white" style={{ background: UNI_COLOR[w.university] }}>
            {UNI_LABEL[w.university].toUpperCase()}
          </span>
        </div>
        {w.members.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {w.members.map((m, i) => (
              <li key={`${m}-${i}`} className="rounded-full border border-hairline bg-strip px-2.5 py-1 text-[13px]">
                {m}
              </li>
            ))}
          </ul>
        )}
        {(w.repo || w.demo) && (
          <div className="mt-auto flex flex-wrap gap-4 border-t border-hairline pt-2.5 font-mono text-[11px]">
            {w.repo && <a href={w.repo} target="_blank" rel="noopener noreferrer">REPO ↗</a>}
            {w.demo && <a href={w.demo} target="_blank" rel="noopener noreferrer">{w.track === "policy" ? "DOCUMENT ↗" : "DEMO ↗"}</a>}
          </div>
        )}
      </div>
    </article>
  );
}

/** Published winners, Build Track then Policy Track. Renders nothing until something is published. */
export function WinnersSection({ winners }: { winners: Winner[] }) {
  if (!winners.length) return null;
  return (
    <div className="flex flex-col gap-6">
      {TRACKS.map(({ track, name }) => {
        const list = winners.filter((w) => w.track === track).sort((a, b) => a.place - b.place);
        if (!list.length) return null;
        return (
          <section key={track} aria-label={`${name} winners`} className="flex flex-col gap-3">
            <h2 className="section-h">{name}</h2>
            <div className={`grid gap-4 ${list.length >= 3 ? "min-[860px]:grid-cols-[1.25fr_1fr_1fr]" : "min-[860px]:grid-cols-2"}`}>
              {list.map((w) => (
                <Card key={`${w.track}-${w.place}`} w={w} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

