/**
 * Public facts about the event the site is running, used when the database isn't configured
 * (for example a static preview). The database is the source of truth: keep this in step with
 * supabase/seed.sql, which takes the same facts from the public Luma page.
 */
export type FactStatus = "confirmed" | "proposed" | "sample" | "tbc";

export interface Fact<T = string> {
  value: T;
  status: FactStatus;
  note?: string;
}

export interface PublicEvent {
  name: string;
  shortName: string;
  timezone: string;
  startsAt: string | null;
  endsAt: string | null;
  source: { url: string; readAt: string } | null;
  venue: Fact & { address?: string };
  organisers: Fact<string[]>;
  supporters: Fact<string[]>;
  audience: Fact;
  agenda: Fact<{ start: string; end: string | null; title: string }[]>;
  prizes: Fact<string[]>;
  teams: Fact;
  judging: Fact;
  aiAssistance: Fact | null;
  travel: Fact | null;
  tracks: { track: "build" | "policy"; name: string; description: string; status: FactStatus; opensAt: string | null; closesAt: string | null }[];
}

export const FALLBACK_EVENT: PublicEvent = {
  name: "Oxford and Cambridge AI Race",
  shortName: "Oxbridge AI Race",
  timezone: "Europe/London",
  startsAt: "2026-10-25T09:30:00Z",
  endsAt: "2026-10-25T21:30:00Z",
  source: { url: "https://luma.com/Oxbridge-AI-Race", readAt: "2026-10-25" },
  venue: { value: "King's College, Cambridge · Keynes Hall", address: "King's Parade, Cambridge CB2 1ST", status: "confirmed" },
  organisers: { value: ["Kings Politics Cambridge", "AI3", "Solana Superteam UK", "Oxbridge AIx"], status: "confirmed" },
  supporters: { value: ["Cambridge Entrepreneurs Society", "Oxford Entrepreneurs", "OxVC", "OXAI"], status: "confirmed" },
  audience: {
    value: "Students, researchers and aspiring entrepreneurs from Oxford and Cambridge. Technical, non-technical and policy backgrounds are equally welcome. No prior AI or blockchain experience required.",
    status: "confirmed",
  },
  agenda: {
    status: "confirmed",
    note: "Programme subject to change.",
    value: [
      { start: "09:30", end: null, title: "Registration, breakfast and coffee" },
      { start: "10:00", end: "11:30", title: "Welcome, keynote, panels and competition launch" },
      { start: "11:30", end: "18:30", title: "Build sprint, mentoring and lunch" },
      { start: "18:30", end: "19:45", title: "Pitches, demos, judging and awards" },
      { start: "19:45", end: "21:30", title: "Dinner, drinks and networking" },
    ],
  },
  prizes: {
    status: "confirmed",
    note: "Prize details will be shared before the event.",
    value: ["Cash prizes of up to £1000 across winning teams", "Fast-track access to the Solana Scholars Programme", "Tickets to the Solana Breakpoint Conference"],
  },
  teams: { value: "Apply with a team or individually. Team size not stated.", status: "tbc" },
  judging: { value: "Criteria and judges to be announced.", status: "tbc" },
  aiAssistance: { value: "AI-assisted coding is encouraged. Existing research can be a starting point.", status: "confirmed" },
  travel: { value: "Return transport between Oxford and Cambridge is provided for Oxford students.", status: "confirmed" },
  tracks: [
    {
      track: "build",
      name: "Build Track",
      description:
        "Build an AI application: accelerate scientific discovery, improve research workflows, address institutional challenges, or explore AI × Solana applications such as agent payments, identity, provenance and verification.",
      status: "confirmed",
      opensAt: "2026-10-25T11:30:00Z",
      closesAt: "2026-10-25T18:30:00Z",
    },
    { track: "policy", name: "Policy Track", description: "Develop practical governance proposals alongside the technologies being built.", status: "confirmed", opensAt: "2026-10-25T11:30:00Z", closesAt: "2026-10-25T18:30:00Z" },
  ],
};

const asFact = <T,>(raw: unknown, fallback: Fact<T>): Fact<T> => {
  const r = raw as Partial<Fact<T>> | undefined;
  return r && r.value !== undefined && r.status ? (r as Fact<T>) : fallback;
};

/** Builds the public view from database rows, filling gaps from nothing but explicit TBC labels. */
export function eventFromDb(
  row: { name: string; short_name: string; timezone: string; starts_at: string | null; ends_at: string | null; details: Record<string, unknown> },
  tracks: { track: "build" | "policy"; name: string; description: string | null; status: FactStatus; submissions_open_at: string | null; submissions_close_at: string | null }[],
): PublicEvent {
  const d = row.details;
  const tbc = <T,>(value: T): Fact<T> => ({ value, status: "tbc" });
  return {
    name: row.name,
    shortName: row.short_name,
    timezone: row.timezone,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    source: (d.source as PublicEvent["source"]) ?? null,
    venue: asFact(d.venue, tbc("Venue to be announced")),
    organisers: asFact(d.organisers, tbc<string[]>([])),
    supporters: asFact(d.supporters, tbc<string[]>([])),
    audience: asFact(d.audience, tbc("")),
    agenda: asFact(d.agenda, tbc<PublicEvent["agenda"]["value"]>([])),
    prizes: asFact(d.prizes, tbc<string[]>([])),
    teams: asFact(d.teams, tbc("Team rules to be announced.")),
    judging: asFact(d.judging, tbc("Criteria and judges to be announced.")),
    aiAssistance: d.aiAssistance ? asFact(d.aiAssistance, tbc("")) : null,
    travel: d.travel ? asFact(d.travel, tbc("")) : null,
    tracks: tracks.map((t) => ({ track: t.track, name: t.name, description: t.description ?? "", status: t.status, opensAt: t.submissions_open_at, closesAt: t.submissions_close_at })),
  };
}
