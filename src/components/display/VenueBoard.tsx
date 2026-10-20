"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSpectatorState } from "@/app/display/actions";
import { formatRemaining, formatTime, useServerClock } from "@/components/race/useServerClock";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import type { SpectatorState } from "@/server/dal/spectator";

const INK = "#161616";
const PAPER = "#EDEDE8";
const DIM = "#8E8E87";
const SIGNAL = "#7C64FF";
const OK = "#3DD69A";
const FAULT = "#FF6B52";

/**
 * Venue screen: full-screen, spectator-safe, readable from the back of a hall.
 * Live via Realtime with 5-second polling; announcements slide in for qualifications and exits.
 */
export function VenueBoard({ initial, timezone }: { initial: SpectatorState; timezone: string }) {
  const [state, setState] = useState(initial);
  const now = useServerClock(state.serverNow);
  const reduced = usePrefersReducedMotion();
  const seen = useRef(new Set(initial.recent.map((r) => r.id)));
  const [banner, setBanner] = useState<SpectatorState["recent"][number] | null>(null);
  const seenNotices = useRef(new Set(initial.notices.map((n) => n.id)));
  const [notice, setNotice] = useState<SpectatorState["notices"][number] | null>(null);

  const reload = useCallback(async () => {
    const next = await fetchSpectatorState(state.tournament.id);
    if (!next) return;
    const fresh = next.recent.filter((r) => !seen.current.has(r.id) && (r.kind === "participant.qualified" || r.kind === "participant.eliminated" || r.kind === "layer.opened"));
    for (const r of next.recent) seen.current.add(r.id);
    if (fresh.length) setBanner(fresh.at(-1)!);
    const newNotice = next.notices.find((n) => !seenNotices.current.has(n.id));
    for (const n of next.notices) seenNotices.current.add(n.id);
    if (newNotice) setNotice(newNotice);
    setState(next);
  }, [state.tournament.id]);

  useEffect(() => {
    const id = setInterval(reload, 5000);
    return () => clearInterval(id);
  }, [reload]);
  useEffect(() => {
    const supabase = supabaseBrowser();
    const filter = `tournament_id=eq.${state.tournament.id}`;
    const channel = supabase
      .channel(`venue-${state.tournament.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_events", filter }, () => void reload())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "layer_runs", filter }, () => void reload())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [state.tournament.id, reload]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 15000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 7000);
    return () => clearTimeout(id);
  }, [banner]);

  const current = state.layers.find((l) => l.state === "open") ?? state.layers.find((l) => l.state === "closing" || l.state === "finalising") ?? state.layers.find((l) => l.state === "scheduled");
  const next = current ? state.layers.find((l) => l.position === current.position + 1) : undefined;
  const competing = state.teams.filter((t) => t.state === "active" || t.state === "qualified" || t.state === "registered");
  const finished = state.teams.filter((t) => t.state === "completed");
  const out = state.teams.filter((t) => t.state === "eliminated");
  const clockTarget = current ? (current.state === "scheduled" ? current.opensAt : current.deadlineAt) : null;
  const remaining = clockTarget ? Date.parse(clockTarget) - now : 0;
  const statusLine =
    state.tournament.status === "paused"
      ? "PAUSED BY THE ORGANISERS"
      : state.tournament.status === "completed"
        ? "THE RACE IS OVER"
        : !current
          ? "STARTING SOON"
          : current.state === "scheduled"
            ? `LAYER ${current.position + 1} OPENS IN`
            : current.state === "open"
              ? `LAYER ${current.position + 1} CLOSES IN`
              : `LAYER ${current.position + 1} · CHECKING RESULTS`;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden" style={{ background: INK, color: PAPER }}>
      <header className="flex items-center justify-between gap-6 px-[3vw] py-[2.2vh]" style={{ borderBottom: "1px solid #2D2D2A" }}>
        <div className="flex items-baseline gap-4">
          <span className="wide text-[clamp(16px,1.6vw,28px)] tracking-[0.02em]">AGENT STUDIO</span>
          <span className="font-mono text-[clamp(11px,0.9vw,16px)]" style={{ color: DIM }}>
            {state.eventName.toUpperCase()}
          </span>
        </div>
        <span className="font-mono text-[clamp(11px,0.9vw,16px)]" style={{ color: DIM }}>
          {state.tournament.name.toUpperCase()}
        </span>
      </header>
      {state.notices[0] && (
        <div className="flex items-baseline gap-[1vw] truncate px-[3vw] py-[1.2vh] font-mono text-[clamp(12px,1vw,18px)]" style={{ borderBottom: "1px solid #2D2D2A", color: PAPER }}>
          <span style={{ color: SIGNAL }}>NOTICE</span>
          <span className="truncate">{state.notices[0].title}</span>
        </div>
      )}

      <main className="grid flex-1 grid-cols-[1.35fr_1fr] gap-[3vw] px-[3vw] py-[3.5vh]">
        <section className="flex min-w-0 flex-col justify-between gap-[3vh]">
          <div className="flex flex-col gap-[1.4vh]">
            <span className="font-mono text-[clamp(12px,1.1vw,20px)] font-medium tracking-[0.08em]" style={{ color: state.tournament.status === "paused" ? "#E0A100" : SIGNAL }}>
              {statusLine}
            </span>
            <span className="wide font-mono leading-[0.9] tracking-[-0.04em]" style={{ fontSize: "clamp(72px,13vw,240px)", color: current?.state === "open" && remaining < 5 * 60_000 ? FAULT : PAPER }}>
              {clockTarget && state.tournament.status !== "completed" ? formatRemaining(remaining) : "··:··"}
            </span>
            {current && (
              <div className="flex flex-col gap-[0.6vh]">
                <span className="wide text-[clamp(28px,3.6vw,68px)] leading-[1] tracking-[-0.03em]">{current.title}</span>
                <span className="font-mono text-[clamp(12px,1vw,18px)]" style={{ color: DIM }}>
                  LAYER {current.position + 1} OF {state.layers.length} · DEADLINE {formatTime(current.deadlineAt, timezone)}
                  {next ? ` · NEXT: ${next.title.toUpperCase()} AT ${formatTime(next.opensAt, timezone)}` : ""}
                </span>
              </div>
            )}
          </div>
          <div className="grid gap-[0.6vw]" style={{ gridTemplateColumns: `repeat(${Math.max(1, state.layers.length)}, minmax(0, 1fr))` }}>
            {state.layers.map((l) => (
              <div key={l.key} className="flex flex-col gap-[0.8vh]">
                <span className="h-[1.1vh] rounded-[2px]" style={{ background: l.state === "closed" ? "#5A5A55" : l.state === "open" ? SIGNAL : "#2D2D2A" }} />
                <span className="truncate font-mono text-[clamp(9px,0.75vw,13px)]" style={{ color: l.state === "open" ? PAPER : DIM }}>
                  {l.position + 1}. {l.title.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-w-0 flex-col gap-[2.4vh]">
          <div className="grid grid-cols-3 gap-[1vw]">
            <Stat label="STILL RACING" value={competing.length + finished.length} color={PAPER} />
            <Stat label="OUT" value={out.length} color={FAULT} />
            <Stat label="VERIFIED" value={state.verifications.passed} color={OK} />
          </div>
          {state.winners.length > 0 && (
            <div className="flex flex-col gap-[1vh] rounded-[4px] px-[1vw] py-[1.4vh]" style={{ border: `2px solid ${OK}` }}>
              <span className="font-mono text-[clamp(11px,0.9vw,15px)] tracking-[0.08em]" style={{ color: OK }}>
                WINNERS
              </span>
              <ul className="m-0 flex list-none flex-col gap-[0.8vh] p-0">
                {state.winners.map((w) => (
                  <li key={`${w.track}-${w.place}`} className="flex flex-col">
                    <span className="wide text-[clamp(16px,1.6vw,30px)] leading-tight">{w.team || w.project}</span>
                    <span className="font-mono text-[clamp(10px,0.85vw,15px)]" style={{ color: DIM }}>
                      {w.track.toUpperCase()} TRACK · PLACE {w.place}
                      {w.title ? ` · ${w.title.toUpperCase()}` : ""}
                      {w.project && w.team ? ` · ${w.project}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col gap-[1vh]">
            <span className="font-mono text-[clamp(11px,0.9vw,15px)] tracking-[0.08em]" style={{ color: DIM }}>
              TEAMS
            </span>
            <ul className="m-0 grid min-h-0 list-none grid-cols-2 content-start gap-x-[1.4vw] gap-y-[0.9vh] overflow-hidden p-0">
              {[...finished, ...competing, ...out].map((t) => (
                <li key={t.name} className="flex items-center gap-[0.6vw] truncate text-[clamp(14px,1.3vw,24px)] font-semibold" style={{ color: t.state === "eliminated" ? "#5A5A55" : PAPER, textDecoration: t.state === "eliminated" ? "line-through" : "none" }}>
                  <span className="inline-block h-[0.9vw] w-[0.9vw] flex-none rounded-[2px]" style={{ background: t.state === "eliminated" ? "#3D3D3A" : t.state === "completed" ? OK : t.state === "qualified" ? OK : SIGNAL }} />
                  <span className="truncate">{t.name}</span>
                </li>
              ))}
              {state.teams.length === 0 && <li style={{ color: DIM }}>Teams appear here as they enter.</li>}
            </ul>
          </div>
          <ul className="m-0 flex list-none flex-col gap-[0.7vh] p-0" style={{ borderTop: "1px solid #2D2D2A", paddingTop: "1.6vh" }}>
            {state.recent.slice(0, 4).map((r) => (
              <li key={r.id} className="truncate font-mono text-[clamp(11px,0.95vw,16px)]" style={{ color: DIM }}>
                <span style={{ color: r.kind === "participant.eliminated" ? FAULT : r.kind === "participant.qualified" || r.kind === "attempt.passed" ? OK : PAPER }}>{describe(r)}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      {notice && (
        <div role="status" className="absolute inset-x-[6vw] top-[16vh] z-10 flex flex-col gap-[1.4vh] rounded-[6px] px-[2.4vw] py-[3vh]" style={{ background: "#1E1648", border: `2px solid ${SIGNAL}`, animation: reduced ? undefined : "sx-in .35s ease-out" }}>
          <span className="font-mono text-[clamp(12px,1vw,18px)] tracking-[0.08em]" style={{ color: SIGNAL }}>
            ANNOUNCEMENT
          </span>
          <span className="wide text-[clamp(28px,3.4vw,64px)] leading-tight">{notice.title}</span>
          {notice.body && <span className="text-[clamp(16px,1.5vw,28px)] leading-snug" style={{ color: PAPER }}>{notice.body}</span>}
        </div>
      )}
      {banner && (
        <div
          role="status"
          className="absolute inset-x-[3vw] bottom-[4vh] flex items-center gap-[1.4vw] rounded-[6px] px-[2vw] py-[2.4vh]"
          style={{
            background: banner.kind === "participant.eliminated" ? "#3A1712" : banner.kind === "layer.opened" ? "#1E1648" : "#0F3326",
            border: `2px solid ${banner.kind === "participant.eliminated" ? FAULT : banner.kind === "layer.opened" ? SIGNAL : OK}`,
            animation: reduced ? undefined : "sx-in .35s ease-out",
          }}
        >
          <span className="wide text-[clamp(22px,2.6vw,48px)] leading-tight">{describe(banner)}</span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-[0.6vh] rounded-[4px] px-[1vw] py-[1.4vh]" style={{ border: "1px solid #2D2D2A" }}>
      <span className="font-mono text-[clamp(10px,0.8vw,14px)] tracking-[0.08em]" style={{ color: DIM }}>
        {label}
      </span>
      <span className="wide font-mono leading-none tracking-[-0.03em]" style={{ fontSize: "clamp(36px,4.6vw,88px)", color }}>
        {value}
      </span>
    </div>
  );
}

function describe(r: SpectatorState["recent"][number]): string {
  switch (r.kind) {
    case "participant.qualified":
      return `${r.name} advance past ${r.title ?? r.layer}`;
    case "participant.eliminated":
      return `${r.name} are out at ${r.title ?? r.layer}`;
    case "participant.reinstated":
      return `${r.name} reinstated by the organisers`;
    case "attempt.passed":
      return `${r.name} verified ${r.title ?? r.layer}`;
    case "layer.opened":
      return `Now open: ${r.title ?? r.layer}`;
    case "layer.closed":
      return `${r.title ?? r.layer} closed`;
    case "tournament.paused":
      return "The race is paused";
    case "tournament.resumed":
      return "The race has resumed";
    case "layer.extended":
      return `${r.title ?? r.layer} extended`;
    default:
      return r.kind;
  }
}
