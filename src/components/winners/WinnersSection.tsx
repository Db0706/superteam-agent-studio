import type { University } from "@/server/dal/leaderboard";
import type { Winner } from "@/server/dal/winners";

const PLACE: Record<number, { label: string; icon: string; color: string; tint: string }> = {
  1: { label: "WINNER", icon: "🏆", color: "#D4A72C", tint: "#FFF6D6" },
  2: { label: "RUNNER-UP", icon: "🥈", color: "#A7ADB4", tint: "#F1F3F5" },
  3: { label: "HONOURABLE MENTION", icon: "🎖️", color: "#B87A3D", tint: "#F8EBDD" },
};
const UNI_LABEL: Record<University, string> = { cambridge: "Cambridge", oxford: "Oxford", mixed: "Mixed", other: "Other" };
const UNI_COLOR: Record<University, string> = { cambridge: "#3B9FD6", oxford: "#1F3A93", mixed: "#8E8E87", other: "#AFAFA8" };
const TRACKS = [
  { track: "build", name: "Build Track" },
  { track: "policy", name: "Policy Track" },
] as const;

function Card({ w }: { w: Winner }) {
  const first = w.place === 1;
  const p = PLACE[w.place] ?? { label: `PLACE ${w.place}`, icon: "★", color: "#AFAFA8", tint: "#F5F5F1" };
  return (
    <article
      className={`flex flex-col overflow-hidden rounded-[6px] bg-white text-ink ${first ? "min-[860px]:row-span-2" : ""}`}
      style={{ border: `${first ? 4 : 3}px solid ${p.color}`, boxShadow: `0 6px 0 ${p.color}` }}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2.5" style={{ background: p.color }}>
        <span className={`flex items-center gap-2 font-mono font-bold tracking-[0.06em] text-ink ${first ? "text-[15px]" : "text-[12.5px]"}`}>
          <span aria-hidden="true" className={first ? "text-[24px]" : "text-[18px]"}>{p.icon}</span>
          {p.label}
        </span>
        <span className="font-mono text-[10.5px] font-semibold text-ink/70">{w.track === "build" ? "BUILD TRACK" : "POLICY TRACK"}</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4" style={{ background: first ? p.tint : undefined }}>
        <h3 className={`m-0 font-extrabold leading-[1.1] tracking-[-0.01em] [font-stretch:115%] ${first ? "text-[clamp(26px,3vw,34px)]" : "text-[20px]"}`}>{w.project}</h3>
        {w.summary && <p className={`m-0 text-[14px] leading-normal text-ink-2 ${first ? "line-clamp-5" : "line-clamp-3"}`}>{w.summary}</p>}
        <div className="flex flex-wrap items-center gap-2 text-[16px] font-bold">
          {w.team}
          <span className="rounded-[2px] px-1.5 py-[2px] font-mono text-[9.5px] font-semibold text-white" style={{ background: UNI_COLOR[w.university] }}>
            {UNI_LABEL[w.university].toUpperCase()}
          </span>
        </div>
        {w.members.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {w.members.map((m, i) => (
              <li key={`${m}-${i}`} className="rounded-full border bg-white px-2.5 py-1 text-[13px]" style={{ borderColor: p.color }}>
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

/** Published winners, Build Track then Policy Track, on a dark "winners" banner. Nothing until something is published. */
export function WinnersSection({ winners }: { winners: Winner[] }) {
  if (!winners.length) return null;
  return (
    <section aria-label="Winners" className="flex flex-col gap-7 rounded-[8px] bg-ink px-[clamp(16px,3vw,32px)] py-[clamp(22px,3.5vw,40px)] text-white">
      <div className="flex flex-col items-center gap-2 text-center">
        <span aria-hidden="true" className="text-[44px] leading-none">🏆</span>
        <span className="font-mono text-[11px] font-semibold tracking-[0.12em] text-[#D4A72C]">THE JUDGES HAVE DECIDED</span>
        <h2 className="m-0 font-extrabold leading-none tracking-[-0.02em] text-white [font-stretch:125%] text-[clamp(32px,5vw,56px)]">The winners</h2>
      </div>
      {TRACKS.map(({ track, name }) => {
        const list = winners.filter((w) => w.track === track).sort((a, b) => a.place - b.place);
        if (!list.length) return null;
        return (
          <div key={track} className="flex flex-col gap-3">
            <h3 className="m-0 flex items-center gap-3 font-mono text-[12px] font-semibold tracking-[0.1em] text-[#D9D9D2]">
              <span className="h-px flex-1 bg-[#3d3d3a]" />
              {name.toUpperCase()}
              <span className="h-px flex-1 bg-[#3d3d3a]" />
            </h3>
            <div className={`grid gap-5 pb-1.5 ${list.length >= 3 ? "min-[860px]:grid-cols-[1.3fr_1fr] min-[860px]:grid-rows-[auto_auto]" : list.length === 2 ? "min-[860px]:grid-cols-[1.3fr_1fr]" : ""}`}>
              {list.map((w) => (
                <Card key={`${w.track}-${w.place}`} w={w} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
