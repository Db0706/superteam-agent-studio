import type { University } from "@/server/dal/leaderboard";
import type { Winner } from "@/server/dal/winners";

const PLACE: Record<number, { label: string; mark: string; text: string; medal: string; block: string; height: string }> = {
  1: { label: "WINNER", mark: "1", text: "#A87F0C", medal: "radial-gradient(circle at 35% 30%, #FFF3B0, #E7B923 55%, #A87F0C)", block: "repeating-linear-gradient(135deg, #E7B923 0 18px, #F2CC4A 18px 36px)", height: "150px" },
  2: { label: "RUNNER-UP", mark: "2", text: "#7D858F", medal: "radial-gradient(circle at 35% 30%, #FFFFFF, #C3C9D1 55%, #7D858F)", block: "repeating-linear-gradient(135deg, #C3C9D1 0 18px, #D5DAE0 18px 36px)", height: "105px" },
  3: { label: "HONOURABLE MENTION", mark: "HM", text: "#8A5220", medal: "radial-gradient(circle at 35% 30%, #FFD9B0, #C9813F 55%, #8A5220)", block: "repeating-linear-gradient(135deg, #C9813F 0 18px, #D9955A 18px 36px)", height: "75px" },
};
const UNI_LABEL: Record<University, string> = { cambridge: "Cambridge", oxford: "Oxford", mixed: "Mixed", other: "Other" };
const UNI_COLOR: Record<University, string> = { cambridge: "#3B9FD6", oxford: "#1F3A93", mixed: "#8E8E87", other: "#8E8E87" };
const TRACKS = [
  { track: "build", name: "Build Track" },
  { track: "policy", name: "Policy Track" },
] as const;

function Spot({ w }: { w: Winner }) {
  const p = PLACE[w.place] ?? { ...PLACE[3], label: `PLACE ${w.place}`, mark: String(w.place) };
  const first = w.place === 1;
  return (
    <div className={`flex flex-col ${first ? "max-[879px]:order-first" : ""}`}>
      <div
        className={`relative rounded-t-[14px] border-[3px] border-b-0 border-ink bg-white px-5 pb-5 text-ink ${first ? "pt-9" : "pt-7"}`}
        style={first ? { boxShadow: "0 0 0 6px rgba(231,185,35,.35), 0 30px 60px -20px rgba(231,185,35,.6)" } : undefined}
      >
        <span
          aria-hidden="true"
          className={`absolute left-5 grid place-items-center rounded-full border-[3px] border-ink font-black text-ink ${first ? "-top-[34px] h-[66px] w-[66px] text-[26px]" : "-top-[26px] h-[52px] w-[52px] text-[19px]"}`}
          style={{ background: p.medal }}
        >
          {p.mark}
        </span>
        <span className="mb-2.5 block text-right font-mono text-[11px] font-bold tracking-[0.12em]" style={{ color: p.text }}>
          {p.label}
        </span>
        <h3 className={`m-0 mb-2.5 font-black leading-[1.05] tracking-[-0.015em] [font-stretch:112%] ${first ? "text-[clamp(24px,2.6vw,32px)]" : "text-[21px]"}`}>{w.project}</h3>
        {w.summary && <p className="m-0 mb-3.5 line-clamp-4 text-[14px] leading-normal text-ink-2">{w.summary}</p>}
        <div className="flex flex-wrap items-center gap-2 text-[16px] font-extrabold">
          {w.team}
          <span className="rounded-[3px] px-[7px] py-[3px] font-mono text-[9.5px] font-bold tracking-[0.06em] text-white" style={{ background: UNI_COLOR[w.university] }}>
            {UNI_LABEL[w.university].toUpperCase()}
          </span>
        </div>
        {w.members.length > 0 && (
          <ul className="m-0 mt-2.5 flex list-none flex-wrap gap-1.5 p-0">
            {w.members.map((m, i) => (
              <li key={`${m}-${i}`} className="rounded-full border border-[#DEDAD0] bg-[#F4F2EC] px-2.5 py-1 text-[12.5px]">
                {m}
              </li>
            ))}
          </ul>
        )}
        {(w.repo || w.demo) && (
          <div className="mt-3.5 flex gap-4 font-mono text-[11px] font-semibold">
            {w.repo && <a href={w.repo} target="_blank" rel="noopener noreferrer">REPO ↗</a>}
            {w.demo && <a href={w.demo} target="_blank" rel="noopener noreferrer">{w.track === "policy" ? "DOCUMENT ↗" : "DEMO ↗"}</a>}
          </div>
        )}
      </div>
      <div className="grid place-items-center border-[3px] border-t-0 border-ink text-ink" style={{ background: p.block, height: p.height }}>
        <div className="text-center">
          <div className={`font-black leading-none [font-stretch:125%] ${w.place === 3 ? "text-[40px]" : "text-[64px]"}`}>{p.mark}</div>
          <div className="mt-1 font-mono text-[11px] font-bold tracking-[0.14em]">{p.label}</div>
        </div>
      </div>
    </div>
  );
}

/** One podium per track: winner in the middle and tallest, runner-up left, honourable mention right. */
export function WinnersPodiums({ winners, tone = "light" }: { winners: Winner[]; tone?: "light" | "dark" }) {
  if (!winners.length) return null;
  return (
    <div className="flex flex-col gap-[clamp(56px,7vw,90px)]">
      {TRACKS.map(({ track, name }) => {
        const list = winners.filter((w) => w.track === track).sort((a, b) => a.place - b.place);
        if (!list.length) return null;
        // Podium order: 2 · 1 · 3 with three places, 1 · 2 with two.
        const order = list.length >= 3 ? [list[1], list[0], ...list.slice(2)] : list;
        return (
          <section key={track} aria-label={`${name} winners`} className="flex flex-col gap-[42px]">
            <h3 className={`m-0 flex items-center justify-center gap-3.5 font-mono text-[13px] font-bold tracking-[0.14em] ${tone === "dark" ? "text-white" : "text-ink"}`}>
              <span className="h-[2px] max-w-[220px] flex-1 bg-current opacity-35" />
              {name.toUpperCase()}
              <span className="h-[2px] max-w-[220px] flex-1 bg-current opacity-35" />
            </h3>
            <div className={`grid items-end gap-[18px] max-[879px]:gap-12 ${list.length >= 3 ? "min-[880px]:grid-cols-[1fr_1.15fr_1fr]" : list.length === 2 ? "mx-auto w-full max-w-[880px] min-[880px]:grid-cols-[1.15fr_1fr]" : "mx-auto w-full max-w-[520px]"}`}>
              {order.map((w) => (
                <Spot key={`${w.track}-${w.place}`} w={w} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** The leaderboard's winners block: a dark banner with the podiums. Nothing until something is published. */
export function WinnersSection({ winners }: { winners: Winner[] }) {
  if (!winners.length) return null;
  return (
    <section
      aria-label="Winners"
      className="flex flex-col gap-12 overflow-hidden rounded-[14px] px-[clamp(16px,3vw,36px)] pb-[clamp(28px,4vw,48px)] pt-[clamp(28px,4vw,48px)] text-white"
      style={{ background: "radial-gradient(1100px 420px at 50% -10%, #3A24C9 0%, #1A1240 45%, #0F0F12 85%)" }}
    >
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span className="font-mono text-[12px] font-bold tracking-[0.1em] text-[#E7B923]">THE JUDGES HAVE DECIDED</span>
        <h2 className="m-0 font-black leading-[0.95] tracking-[-0.03em] text-white [font-stretch:125%] text-[clamp(38px,6vw,72px)]">
          The <span className="bg-[linear-gradient(90deg,#E7B923,#FFF3B0,#E7B923)] bg-clip-text text-transparent">winners</span>
        </h2>
      </div>
      <WinnersPodiums winners={winners} tone="dark" />
    </section>
  );
}
