import Link from "next/link";
import { Suspense } from "react";
import { Arrow, ConfirmationTag, COLORS, Led, Module, SectionHeading } from "@/components/system";
import { eventFromDb, FALLBACK_EVENT, type FactStatus, type PublicEvent } from "@/config/active-event";
import { TRACKS } from "@/config/tracks";
import type { Confirmation } from "@/config/schema";
import { LAYER_TEMPLATES } from "@/core/tournament/templates";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServer } from "@/lib/supabase/server";
import { listRaceTournaments, pickFeatured } from "@/server/dal/race";
import { getActiveEvent } from "@/server/dal/viewer";

const TAG: Record<FactStatus, Confirmation> = { confirmed: "CONFIRMED", proposed: "PROPOSED", sample: "SAMPLE", tbc: "TBC" };

export function Landing() {
  return (
    <div className="page-wrap flex flex-col gap-[clamp(48px,6vw,80px)] pb-20 pt-[clamp(32px,5vw,64px)]">
      <Hero />
      <Suspense fallback={<EventSections event={FALLBACK_EVENT} live={null} />}>
        <LiveEvent />
      </Suspense>
      <Starters />
      <Journey />
    </div>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-h" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,480px),1fr))] items-center gap-[clamp(28px,4vw,56px)]">
      <div className="flex min-w-0 flex-col gap-6">
        <h1 id="hero-h" className="display-xl">
          Build the future of AI.
        </h1>
        <p className="m-0 max-w-[540px] text-[clamp(16px,1.4vw,19px)] leading-normal text-ink-2 [text-wrap:pretty]">
          Agent Studio is where teams build AI applications, agents and policy, prove each capability works against live checks, and race them in front of the room.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/race" className="btn-primary">
            JOIN THE AI RACE <Arrow />
          </Link>
          <Link href="/build" className="btn-secondary">
            GET A STARTER
          </Link>
          <Link href="/playground" className="btn-secondary">
            TRY THE PLAYGROUND
          </Link>
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-[18px] p-0 font-mono text-[10.5px] text-muted">
          <li>■ NO AI EXPERIENCE NEEDED</li>
          <li>■ AI-ASSISTED CODING WELCOME</li>
          <li>■ OPEN-SOURCE STARTERS</li>
        </ul>
      </div>
      <RaceLadder />
    </section>
  );
}

/** The default race template, shown as it is. Organisers configure the real race per event. */
function RaceLadder() {
  return (
    <Module label="THE AI RACE · DEFAULT LAYERS" right={<ConfirmationTag status="SAMPLE" />}>
      <ol className="m-0 flex list-none flex-col p-0">
        {LAYER_TEMPLATES.map((l, i) => (
          <li key={l.key} className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2 border-b border-hairline px-3.5 py-2.5 last:border-b-0">
            <span className="font-mono text-[10.5px] text-muted">L{String(i + 1).padStart(2, "0")}</span>
            <span className="flex min-w-0 flex-col">
              <b className="truncate text-[14px]">{l.title}</b>
              <span className="truncate text-[12px] text-muted">{l.capabilities.join(" · ")}</span>
            </span>
            <span className="font-mono text-[9.5px] text-muted">{l.verifier.plugin.toUpperCase()}</span>
          </li>
        ))}
      </ol>
      <p className="m-0 border-t border-hairline px-3.5 py-2.5 text-[12px] leading-[1.45] text-muted">
        Each layer is checked automatically against your running app. Organisers set the real layers, timings and rules for each event.
      </p>
    </Module>
  );
}

async function LiveEvent() {
  if (!isSupabaseConfigured()) return <EventSections event={FALLBACK_EVENT} live={null} />;
  const row = await getActiveEvent();
  if (!row) return <EventSections event={FALLBACK_EVENT} live={null} />;
  const s = await createSupabaseServer();
  const [{ data: tracks }, list] = await Promise.all([
    s.from("event_tracks").select("track, name, description, status, submissions_open_at, submissions_close_at").eq("event_id", row.id).order("track"),
    listRaceTournaments(row.id),
  ]);
  const featured = pickFeatured(list);
  return <EventSections event={eventFromDb(row, (tracks ?? []) as Parameters<typeof eventFromDb>[1])} live={featured} />;
}

function fmtDate(iso: string | null, tz: string) {
  if (!iso) return "Date to be announced";
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "long", year: "numeric" });
}
function fmtTime(iso: string | null, tz: string) {
  return iso ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }) : "";
}

const RACE_STATUS: Record<string, string> = {
  running: "LIVE NOW",
  paused: "PAUSED",
  finalising: "FINALISING",
  scheduled: "SCHEDULED",
  published: "PUBLISHED",
  completed: "FINISHED",
  cancelled: "CANCELLED",
};

function EventSections({ event, live }: { event: PublicEvent; live: { id: string; name: string; status: string; starts_at: string | null } | null }) {
  const facts = [
    { label: "DATE", value: fmtDate(event.startsAt, event.timezone), sub: event.startsAt ? `${fmtTime(event.startsAt, event.timezone)} to ${fmtTime(event.endsAt, event.timezone)}` : "", status: event.startsAt ? ("confirmed" as const) : ("tbc" as const) },
    { label: "VENUE", value: event.venue.value, sub: event.venue.address ?? "", status: event.venue.status },
    { label: "TEAMS", value: event.teams.value, sub: "", status: event.teams.status },
    { label: "JUDGING", value: event.judging.value, sub: "", status: event.judging.status },
  ];
  return (
    <>
      <section aria-labelledby="event-h" className="flex flex-col gap-3.5">
        <SectionHeading
          eyebrow="01 · THE EVENT"
          id="event-h"
          title={event.name}
          aside={
            event.source && (
              <a href={event.source.url} target="_blank" rel="noopener noreferrer" className="font-mono text-[11px]">
                EVENT PAGE ↗
              </a>
            )
          }
        />
        {event.audience.value && <p className="m-0 max-w-[760px] text-[15px] leading-normal text-ink-2">{event.audience.value}</p>}
        <div className="flex flex-wrap items-stretch gap-3">
          <Module label="AT A GLANCE" className="flex-[2_1_560px]">
            <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))]">
              {facts.map((f) => (
                <div key={f.label} className="-mb-px -mr-px flex min-w-0 flex-col gap-[7px] border-b border-r border-hairline px-4 pb-[18px] pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="mono-label">{f.label}</dt>
                    <ConfirmationTag status={TAG[f.status]} />
                  </div>
                  <dd className="m-0 flex flex-col gap-[7px]">
                    <span className="text-[16px] font-bold leading-[1.3]">{f.value}</span>
                    {f.sub && <span className="text-[13px] leading-[1.4] text-muted">{f.sub}</span>}
                  </dd>
                </div>
              ))}
            </dl>
            {(event.aiAssistance || event.travel) && (
              <ul className="m-0 flex list-none flex-col gap-1 border-t border-hairline p-4 text-[13.5px] text-ink-2">
                {event.aiAssistance && <li>{event.aiAssistance.value}</li>}
                {event.travel && <li>{event.travel.value}</li>}
              </ul>
            )}
          </Module>
          <Module label="PROGRAMME" right={<ConfirmationTag status={TAG[event.agenda.status]} />} className="flex-[1_1_320px]">
            {event.agenda.value.length ? (
              <ol className="m-0 flex list-none flex-col p-0">
                {event.agenda.value.map((a) => (
                  <li key={a.start + a.title} className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 border-b border-hairline px-4 py-2.5 text-[13.5px] last:border-b-0">
                    <span className="font-mono text-[11px] text-muted">
                      {a.start}
                      {a.end ? ` to ${a.end}` : ""}
                    </span>
                    <span>{a.title}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="m-0 p-4 text-[13.5px] text-muted">Programme to be announced.</p>
            )}
            {event.agenda.note && <p className="m-0 border-t border-hairline px-4 py-2.5 text-[12px] text-muted">{event.agenda.note}</p>}
          </Module>
        </div>
        <div className="flex flex-wrap items-stretch gap-3">
          <Module label="PRIZES" right={<ConfirmationTag status={TAG[event.prizes.status]} />} className="flex-[1_1_320px]">
            <ul className="m-0 flex list-none flex-col gap-1.5 p-4 text-[14px]">
              {event.prizes.value.length ? event.prizes.value.map((p) => <li key={p}>■ {p}</li>) : <li className="text-muted">Prizes to be announced.</li>}
            </ul>
            {event.prizes.note && <p className="m-0 border-t border-hairline px-4 py-2.5 text-[12px] text-muted">{event.prizes.note}</p>}
          </Module>
          <Module label="ORGANISED BY" right={<ConfirmationTag status={TAG[event.organisers.status]} />} className="flex-[1_1_320px]">
            <div className="flex flex-col gap-3 p-4 text-[14px]">
              <span className="font-semibold">{event.organisers.value.join(" · ") || "To be announced"}</span>
              {event.supporters.value.length > 0 && (
                <span className="flex flex-col gap-1">
                  <span className="mono-label">SUPPORTED BY</span>
                  <span className="text-ink-2">{event.supporters.value.join(" · ")}</span>
                </span>
              )}
            </div>
          </Module>
        </div>
      </section>

      <section aria-labelledby="tracks-h" className="flex flex-col gap-3.5">
        <SectionHeading
          eyebrow="02 · OFFICIAL TRACKS"
          id="tracks-h"
          title="Two ways to win."
          aside={<span className="max-w-[380px] text-[13px] leading-[1.45] text-muted">Track judging is separate from the AI Race. Leaving the race never affects your track submission.</span>}
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-3">
          {event.tracks.map((t) => (
            <article key={t.track} className="module flex flex-col">
              <div className="module-strip">
                <span>{t.name.toUpperCase()}</span>
                <ConfirmationTag status={TAG[t.status]} />
              </div>
              <div className="flex flex-1 flex-col gap-3 px-4 py-4">
                <p className="m-0 text-[14.5px] leading-normal text-ink-2 [text-wrap:pretty]">{t.description}</p>
                {t.closesAt && (
                  <span className="font-mono text-[11px] text-muted">
                    SUBMISSIONS {fmtTime(t.opensAt, event.timezone)} TO {fmtTime(t.closesAt, event.timezone)} · {fmtDate(t.closesAt, event.timezone).toUpperCase()}
                  </span>
                )}
              </div>
              <Link href="/submit" className="flex h-[46px] items-center justify-between border-t border-ink bg-white px-4 font-mono text-[11px] font-semibold !text-ink transition-colors hover:bg-signal hover:!text-white hover:!no-underline">
                SUBMIT TO THE {t.name.toUpperCase()}
                <span aria-hidden="true">▸</span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="race-h" className="flex flex-col gap-3.5">
        <SectionHeading eyebrow="03 · THE AI RACE" id="race-h" title="Prove it works, live." />
        <Module label="RACE STATUS" right={live ? RACE_STATUS[live.status] ?? live.status.toUpperCase() : "NOT PUBLISHED YET"}>
          <div className="grid gap-4 p-4 min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:items-center">
            <div className="flex flex-col gap-2">
              <span className="flex items-center gap-2 text-[17px] font-bold">
                <Led color={live?.status === "running" ? COLORS.ok : live ? COLORS.signal : COLORS.soft} blink={live?.status === "running"} />
                {live ? live.name : "The race will appear here once the organisers publish it."}
              </span>
              <p className="m-0 max-w-[720px] text-[14px] leading-normal text-ink-2">
                Connect your app, then clear each layer before its window closes. Every check runs against your real app with fresh inputs, so results can&apos;t be copied or faked. Teams that leave the race keep building for the tracks.
              </p>
              {live?.starts_at && <span className="font-mono text-[11px] text-muted">STARTS {fmtTime(live.starts_at, event.timezone)} · {fmtDate(live.starts_at, event.timezone).toUpperCase()}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/race" className="btn-primary">
                OPEN THE RACE <Arrow />
              </Link>
              <Link href="/team" className="btn-secondary">
                SET UP YOUR TEAM
              </Link>
            </div>
          </div>
        </Module>
      </section>
    </>
  );
}

function Starters() {
  return (
    <section aria-labelledby="starters-h" className="flex flex-col gap-3.5">
      <SectionHeading
        eyebrow="04 · STARTERS"
        id="starters-h"
        title="Start from working code."
        aside={<span className="max-w-[360px] text-[13px] leading-[1.45] text-muted">Open-source starters for any track. Add AI, tools, memory, the race adapter or payments as modules.</span>}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,270px),1fr))] gap-3">
        {TRACKS.map((t) => (
          <article key={t.id} aria-labelledby={`starter-${t.id}-h`} className="module flex flex-col">
            <div className="flex flex-1 flex-col gap-3 px-3.5 py-4">
              <span aria-hidden="true" className="wide text-[40px] leading-none tracking-[-0.04em]">
                {t.abbr}
              </span>
              <div className="flex flex-col gap-1">
                <h3 id={`starter-${t.id}-h`} className="m-0 text-[19px] font-extrabold tracking-[-0.01em]">
                  {t.name}
                </h3>
                <span className="font-mono text-[10.5px] text-muted">{t.tech}</span>
              </div>
              <p className="m-0 text-[14px] leading-normal text-ink-2 [text-wrap:pretty]">{t.description}</p>
              <ul className="m-0 mt-auto flex list-none flex-col gap-1.5 p-0">
                {t.strengths.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-[13px] font-semibold">
                    <span aria-hidden="true" className="h-[5px] w-[5px] bg-ink" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="truncate bg-ink px-3.5 py-2.5 font-mono text-[11px] text-[#EDEDE8]">
              <span className="text-code-add">$ </span>
              {t.command}
            </div>
            <Link
              href={`/build?fw=${t.framework}`}
              className="flex h-[46px] items-center justify-between border-t border-ink bg-white px-3.5 font-mono text-[11px] font-semibold !text-ink transition-colors hover:bg-signal hover:!text-white hover:!no-underline"
              aria-label={`Start with ${t.short}: open the builder with ${t.name} preselected`}
            >
              START WITH {t.short}
              <span aria-hidden="true">▸</span>
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

const JOURNEY = [
  { n: "01 · EXPLORE", where: "PLAYGROUND", title: "See it work", desc: "Watch a simulated agent plan, call a tool and stay within its limits.", href: "/playground", primary: false },
  { n: "02 · IDEATE", where: "INSPIRATION", title: "Find your angle", desc: "Spin up a real problem in research, health, policy or campus life.", href: "/inspiration", primary: false },
  { n: "03 · BUILD", where: "BUILDER", title: "Get a starter", desc: "Pick a framework and capabilities. See exactly what your starter contains.", href: "/build", primary: true },
];

function Journey() {
  return (
    <section aria-labelledby="journey-h" className="flex flex-col gap-3.5">
      <SectionHeading
        eyebrow="05 · GETTING STARTED"
        id="journey-h"
        title="Explore. Ideate. Build."
        aside={
          <span className="text-[13px] text-muted">
            Know what you want? <Link href="/build">Skip straight to the builder ▸</Link>
          </span>
        }
      />
      <div className="diagram-dots rounded-[4px] border border-ink p-[clamp(14px,2.4vw,28px)]">
        <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,250px),1fr))] gap-7 p-0">
          {JOURNEY.map((j, i) => (
            <li key={j.n} className="relative min-w-0">
              {i < 2 && <span aria-hidden="true" className="absolute left-full top-1/2 hidden h-0.5 w-7 -translate-y-1/2 bg-ink min-[1120px]:block" />}
              <Link
                href={j.href}
                className="flex min-h-[170px] w-full flex-col gap-2.5 rounded-[4px] border-[1.5px] border-ink p-4 text-left transition-colors hover:!border-signal hover:!no-underline"
                style={{ background: j.primary ? COLORS.ink : "#FFFFFF", color: j.primary ? "#EDEDE8" : COLORS.ink }}
              >
                <span className="flex w-full justify-between font-mono text-[10.5px] font-medium tracking-[0.04em] opacity-75">
                  <span>{j.n}</span>
                  <span>{j.where} ▸</span>
                </span>
                <span className="wide mt-auto text-[24px] tracking-[-0.03em]">{j.title}</span>
                <span className="text-[14px] leading-[1.45] opacity-85">{j.desc}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
