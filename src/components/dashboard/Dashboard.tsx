"use client";

import Link from "next/link";
import { useEvent } from "@/components/shell/EventContext";
import { Arrow, ConfirmationTag, COLORS, Led, Module, SectionHeading } from "@/components/system";
import { TRACK_MAP } from "@/config/tracks";
import type { EventConfig } from "@/config/schema";
import { RequestTrace } from "./RequestTrace";

export function Dashboard() {
  const { event } = useEvent();
  return (
    <div className="page-wrap flex flex-col gap-[clamp(48px,6vw,80px)] pb-20 pt-[clamp(32px,5vw,64px)]">
      <Hero />
      <EventSection event={event} />
      <Tracks event={event} />
      <Journey />
    </div>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-h" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,480px),1fr))] items-center gap-[clamp(28px,4vw,56px)]">
      <div className="flex min-w-0 flex-col gap-6">
        <h1 id="hero-h" className="display-xl">
          Build what the internet couldn&apos;t pay for before.
        </h1>
        <p className="m-0 max-w-[520px] text-[clamp(16px,1.4vw,19px)] leading-normal text-ink-2 [text-wrap:pretty]">
          Create intelligent applications that discover, access and pay for digital services, powered by internet-native payments.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/build" className="btn-primary">
            START BUILDING <Arrow />
          </Link>
          <Link href="/playground" className="btn-secondary">
            TRY THE PLAYGROUND
          </Link>
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-[18px] p-0 font-mono text-[10.5px] text-muted">
          <li>■ NO SIGN-UP</li>
          <li>■ NO CRYPTO KNOWLEDGE NEEDED</li>
          <li>■ OPEN-SOURCE STARTERS</li>
        </ul>
      </div>
      <RequestTrace />
    </section>
  );
}

function EventSection({ event }: { event: EventConfig }) {
  const { events, setEventId } = useEvent();
  const fields = [
    { label: "UNIVERSITY", ...event.university },
    { label: "DATES", ...event.dates },
    { label: "SUBMISSION DEADLINE", ...event.deadline },
    { label: "PRIZE POOL", ...event.prizePool },
    { label: "FORMAT", ...event.format },
    { label: "VENUE", ...event.venue },
  ];
  return (
    <section aria-labelledby="event-h" className="flex flex-col gap-3.5">
      <SectionHeading
        eyebrow="01 · THE HACKATHON"
        id="event-h"
        title={event.name}
        aside={
          <div role="group" aria-label="Choose event" className="flex overflow-hidden rounded-[4px] border border-ink bg-white">
            {events.map((e) => {
              const a = e.id === event.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={a}
                  onClick={() => setEventId(e.id)}
                  className="flex h-10 items-center gap-2 border-0 border-r border-ink px-3.5 text-[13px] font-bold last:border-r-0 max-[420px]:px-2.5 max-[420px]:text-[12px]"
                  style={{ background: a ? COLORS.ink : "#FFFFFF", color: a ? "#FFFFFF" : COLORS.ink }}
                >
                  <Led color={a ? COLORS.signal : COLORS.soft} size={7} />
                  {e.shortName}
                </button>
              );
            })}
          </div>
        }
      />
      <div className="flex flex-wrap items-stretch gap-3">
        <Module label={`EVENT SPEC · ${event.code}`} right="PENDING ORGANISER APPROVAL" className="flex-[2_1_600px]">
          <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))]">
            {fields.map((f) => (
              <div key={f.label} className="-mb-px -mr-px flex min-w-0 flex-col gap-[7px] border-b border-r border-hairline px-4 pb-[18px] pt-4">
                <div className="flex items-center justify-between gap-2">
                  <dt className="mono-label">{f.label}</dt>
                  <ConfirmationTag status={f.status} />
                </div>
                <dd className="m-0 flex flex-col gap-[7px]">
                  <span className="text-[16px] font-bold leading-[1.3]">{f.value}</span>
                  <span className="text-[13px] leading-[1.4] text-muted">{f.sub}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Module>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
          <Module label="LINKS">
            <ul className="m-0 list-none p-0">
              {event.links.map((l) => {
                const body = (
                  <>
                    <span>{l.label}</span>
                    <span className="font-mono text-[10.5px] font-normal text-muted">{l.meta}</span>
                  </>
                );
                const cls = "flex justify-between gap-3 border-b border-hairline px-3.5 py-3 text-[14px] font-semibold !text-ink";
                return (
                  <li key={l.label}>
                    {l.href ? (
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className={`${cls} hover:bg-strip hover:!no-underline`}>
                        {body}
                      </a>
                    ) : (
                      <span className={cls} aria-disabled="true" title="Not available yet">
                        {body}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Module>
          <Module label="HOST · MENTORS · SPONSORS" className="flex-1">
            <div className="flex flex-col gap-2.5 p-3.5">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="wide grid h-10 w-10 place-items-center rounded-[3px] bg-ink text-[13px] text-[#EDEDE8]">
                  {event.host.initials}
                </span>
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[14px] font-bold">{event.host.name}</span>
                  <span className="font-mono text-[10px] text-muted">{event.host.role}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {event.sponsors.length ? (
                  event.sponsors.map((s) => <Slot key={s.name} line1={s.name} line2={s.tier} solid />)
                ) : (
                  <Slot line1="SPONSOR SLOT" line2="OPEN" />
                )}
                {event.mentors.length ? (
                  event.mentors.map((m) => <Slot key={m.name} line1={m.name} line2={m.affiliation} solid />)
                ) : (
                  <Slot line1="MENTORS" line2="TBA" />
                )}
              </div>
              <span className="text-[12.5px] leading-[1.45] text-muted">{event.sponsorDisclaimer}</span>
            </div>
          </Module>
        </div>
      </div>
      <div className="flex flex-wrap items-stretch gap-3">
        <Module label="JUDGING · WEIGHTING" right={<ConfirmationTag status={event.judging.status} />} className="flex-[2_1_600px]">
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] p-0">
            {event.judging.criteria.map((c) => (
              <li key={c.name} className="-mb-px -mr-px flex flex-col gap-2 border-b border-r border-hairline px-4 pb-4 pt-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[15px] font-bold">{c.name}</span>
                  <span className="wide text-[22px] leading-none tracking-[-0.02em]">{c.weight}%</span>
                </div>
                <div aria-hidden="true" className="grid h-2 grid-cols-[repeat(20,1fr)] gap-[3px]">
                  {Array.from({ length: 20 }, (_, i) => (
                    <span key={i} className="rounded-[1px]" style={{ background: i < Math.round(c.weight / 5) ? COLORS.ink : COLORS.cell }} />
                  ))}
                </div>
                <span className="text-[13px] leading-[1.4] text-muted">{c.detail}</span>
              </li>
            ))}
          </ul>
        </Module>
        <Module label="GROUND RULES" right={<ConfirmationTag status={event.rules.status} />} className="flex-[1_1_300px]">
          <ol className="m-0 flex list-none flex-col gap-2 p-3.5">
            {event.rules.items.map((r, i) => (
              <li key={r} className="grid grid-cols-[22px_1fr] gap-2 text-[13.5px] leading-[1.45] text-ink-2">
                <span className="font-mono text-[10px] font-semibold leading-[20px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                {r}
              </li>
            ))}
          </ol>
          {event.bounties.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-hairline p-3.5">
              <span className="mono-label">BOUNTIES</span>
              {event.bounties.map((b) => (
                <div key={b.title} className="flex justify-between gap-2 text-[13px]">
                  <span className="font-semibold">{b.title}</span>
                  <span className="flex items-center gap-2">
                    {b.reward} <ConfirmationTag status={b.status} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </Module>
      </div>
    </section>
  );
}

function Slot({ line1, line2, solid }: { line1: string; line2: string; solid?: boolean }) {
  return (
    <span
      className="grid h-[52px] place-items-center rounded-[3px] text-center font-mono text-[10px] font-medium text-muted"
      style={{ border: solid ? "1px solid #161616" : "1.5px dashed #AFAFA8" }}
    >
      <span>
        {line1}
        <br />
        {line2}
      </span>
    </span>
  );
}

function Tracks({ event }: { event: EventConfig }) {
  return (
    <section aria-labelledby="tracks-h" className="flex flex-col gap-3.5">
      <SectionHeading
        eyebrow={`02 · ${["ONE", "TWO", "THREE", "FOUR", "FIVE"][event.tracks.length - 1] ?? event.tracks.length} TRACK${event.tracks.length === 1 ? "" : "S"}`}
        id="tracks-h"
        title="Pick how you like to build."
        aside={<span className="max-w-[360px] text-[13px] leading-[1.45] text-muted">Proposed configuration. Tracks and prizes may change after organiser approval.</span>}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,270px),1fr))] gap-3">
        {event.tracks.map((et, idx) => {
          const t = TRACK_MAP[et.id];
          return (
            <article key={t.id} id={`track-${t.id}`} aria-labelledby={`track-${t.id}-h`} className="module flex flex-col">
              <div className="module-strip">
                <span>TRACK {String(idx + 1).padStart(2, "0")}</span>
                <span className="text-muted">
                  {et.prize} · {et.prizeStatus}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-3 px-3.5 py-4">
                <span aria-hidden="true" className="wide text-[40px] leading-none tracking-[-0.04em]">
                  {t.abbr}
                </span>
                <div className="flex flex-col gap-1">
                  <h3 id={`track-${t.id}-h`} className="m-0 text-[19px] font-extrabold tracking-[-0.01em]">
                    {t.name}
                  </h3>
                  <span className="font-mono text-[10.5px] text-muted">{t.tech}</span>
                </div>
                <p className="m-0 text-[14px] leading-normal text-ink-2 [text-wrap:pretty]">{t.description}</p>
                {t.note && <div className="rounded-[3px] border border-ok-border bg-ok-tint px-2.5 py-[9px] text-[12.5px] leading-[1.45] text-ok-deep">{t.note}</div>}
                <div className="mt-auto flex flex-col gap-1.5">
                  <span className="mono-label">JUDGED ON</span>
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {t.judgedOn.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-[13px] font-semibold">
                        <span aria-hidden="true" className="h-[5px] w-[5px] bg-ink" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
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
          );
        })}
      </div>
    </section>
  );
}

const JOURNEY = [
  { n: "01 · EXPLORE", where: "PLAYGROUND", title: "See it work", desc: "Watch a simulated agent find a service, check its budget and pay.", href: "/playground", primary: false },
  { n: "02 · CONFIGURE", where: "INSPIRATION", title: "Find your angle", desc: "Spin up an unexpected problem and take it somewhere new.", href: "/inspiration", primary: false },
  { n: "03 · BUILD", where: "BUILDER", title: "Get a starter", desc: "Pick a framework and capabilities. See exactly what your starter contains.", href: "/build", primary: true },
];

function Journey() {
  return (
    <section aria-labelledby="journey-h" className="flex flex-col gap-3.5">
      <SectionHeading
        eyebrow="03 · GETTING STARTED"
        id="journey-h"
        title="Explore. Configure. Build."
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
