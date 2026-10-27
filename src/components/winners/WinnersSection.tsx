import type { University } from "@/server/dal/leaderboard";
import type { Winner } from "@/server/dal/winners";

const UNI_LABEL: Record<University, string> = { cambridge: "Cambridge", oxford: "Oxford", mixed: "Mixed", other: "Other" };
const UNI_COLOR: Record<University, string> = { cambridge: "#3B9FD6", oxford: "#1F3A93", mixed: "#8E8E87", other: "#8E8E87" };
// Brand colours per place: signal purple, Oxford blue, then the site's red.
const PLACE: Record<number, { mark: string; label: string; color: string }> = {
  1: { mark: "01", label: "WINNER", color: "#5A3CF0" },
  2: { mark: "02", label: "RUNNER-UP", color: "#1F3A93" },
  3: { mark: "HM", label: "HONOURABLE MENTION", color: "#C2361F" },
};
const TRACKS = [
  { track: "build", name: "Build Track" },
  { track: "policy", name: "Policy Track" },
] as const;

function Team({ w, dark }: { w: Winner; dark?: boolean }) {
  return (
    <>
      <div className={`flex flex-wrap items-center gap-2 font-bold ${dark ? "text-[16px] text-white" : "text-[14.5px]"}`}>
        {w.team}
        <span className="rounded-[2px] px-1.5 py-[3px] font-mono text-[9.5px] font-semibold tracking-[0.04em] text-white" style={{ background: UNI_COLOR[w.university] }}>
          {UNI_LABEL[w.university].toUpperCase()}
        </span>
      </div>
      {w.members.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {w.members.map((m, i) => (
            <li key={`${m}-${i}`} className={`rounded-[3px] border px-2 py-1 font-mono text-[10.5px] ${dark ? "border-[#3A3A36] bg-[#232320] text-[#D9D9D2]" : "border-hairline bg-strip text-ink-2"}`}>
              {m}
            </li>
          ))}
        </ul>
      )}
      {(w.repo || w.demo) && (
        <div className={`flex gap-4 font-mono text-[10.5px] font-semibold ${dark ? "mt-0.5 border-t border-[#2E2E2B] pt-3" : "mt-1"}`}>
          {w.repo && <a href={w.repo} target="_blank" rel="noopener noreferrer" className={dark ? "!text-[#B8A8FF]" : ""}>REPO ↗</a>}
          {w.demo && <a href={w.demo} target="_blank" rel="noopener noreferrer" className={dark ? "!text-[#B8A8FF]" : ""}>{w.track === "policy" ? "DOCUMENT ↗" : "DEMO ↗"}</a>}
        </div>
      )}
    </>
  );
}

function First({ w }: { w: Winner }) {
  return (
    <div className="grid bg-ink text-[#EDEDE8] min-[760px]:grid-cols-[200px_minmax(0,1fr)]">
      <div className="flex items-end justify-between gap-4 bg-signal p-6 min-[760px]:flex-col min-[760px]:items-start">
        <span className="wide text-[clamp(84px,9vw,120px)] leading-[0.8] tracking-[-0.04em] text-white">01</span>
        <span className="font-mono text-[11px] font-semibold tracking-[0.08em] text-white">WINNER</span>
      </div>
      <div className="flex flex-col gap-3 px-[26px] pb-[22px] pt-6">
        <h3 className="m-0 text-[clamp(26px,3vw,38px)] font-extrabold leading-[1.05] tracking-[-0.02em] text-white [font-stretch:115%]">{w.project}</h3>
        {w.summary && <p className="m-0 line-clamp-3 max-w-[760px] text-[15px] leading-[1.55] text-[#B9B9B2]">{w.summary}</p>}
        <Team w={w} dark />
      </div>
    </div>
  );
}

function Other({ w }: { w: Winner }) {
  const p = PLACE[w.place] ?? { mark: String(w.place).padStart(2, "0"), label: `PLACE ${w.place}`, color: "#161616" };
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-5 p-5" style={{ boxShadow: `inset 0 4px 0 ${p.color}` }}>
      <div>
        <div className={`wide leading-[0.85] tracking-[-0.04em] ${p.mark.length > 2 || /[A-Z]/.test(p.mark) ? "text-[46px]" : "text-[60px]"}`} style={{ color: p.color }}>{p.mark}</div>
        <div className="mt-2 font-mono text-[10px] font-semibold tracking-[0.06em]" style={{ color: p.color }}>{p.label}</div>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h4 className="m-0 text-[20px] font-extrabold leading-[1.15] [font-stretch:112%]">{w.project}</h4>
        {w.summary && <p className="m-0 line-clamp-3 text-[13.5px] leading-normal text-ink-2">{w.summary}</p>}
        <Team w={w} />
      </div>
    </div>
  );
}

/** One results panel per track: the winner on a dark row, runner-up and honourable mention beneath. */
export function WinnersSection({ winners }: { winners: Winner[] }) {
  if (!winners.length) return null;
  return (
    <div className="flex flex-col gap-7">
      {TRACKS.map(({ track, name }) => {
        const list = winners.filter((w) => w.track === track).sort((a, b) => a.place - b.place);
        if (!list.length) return null;
        const [first, ...rest] = list[0].place === 1 ? list : [null, ...list];
        return (
          <section key={track} aria-label={`${name} winners`} className="module">
            <div className="module-strip">
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-signal shadow-[0_0_0_3px_rgba(90,60,240,0.2)]" />
                {name.toUpperCase()} · RESULTS
              </span>
              <span className="text-muted">JUDGED BY THE PANEL</span>
            </div>
            {first && <First w={first} />}
            {rest.length > 0 && (
              <div className="grid border-t border-ink min-[760px]:grid-cols-2">
                {rest.map((w, i) => (
                  <div key={w!.place} className={i % 2 ? "border-ink max-[759px]:border-t min-[760px]:border-l" : ""}>
                    <Other w={w!} />
                  </div>
                ))}
                {rest.length % 2 === 1 && <div className="border-ink bg-strip max-[759px]:hidden min-[760px]:border-l" />}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
