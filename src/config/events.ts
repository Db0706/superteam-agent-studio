import type { EventConfig } from "./schema";

/**
 * University hackathon events.
 *
 * HONESTY RULE: nothing here is confirmed. Every field carries a status
 * (PROPOSED / SAMPLE / TBC) that the UI shows next to it. Only change a status
 * to CONFIRMED once organisers have signed it off in writing. Do not add
 * sponsors, mentors or prize amounts that have not been agreed.
 *
 * To add an event: copy one object, give it a unique `id` and `code`, and
 * choose which tracks it runs. The header switch and Dashboard pick it up
 * automatically.
 */

const SAMPLE_JUDGING: EventConfig["judging"] = {
  status: "SAMPLE",
  criteria: [
    { name: "Technical execution", weight: 30, detail: "It runs, end to end, on devnet." },
    { name: "Use of payments", weight: 25, detail: "Payments are essential, not bolted on." },
    { name: "Real user value", weight: 25, detail: "Someone would actually use it." },
    { name: "Demo & clarity", weight: 20, detail: "Explained in two minutes." },
  ],
};

const PROPOSED_RULES: EventConfig["rules"] = {
  status: "PROPOSED",
  items: [
    "Build during the event. Open-source starters are allowed.",
    "Teams of 1-4. Beginners are welcome.",
    "Test funds and devnet only. No real money changes hands.",
    "Never commit API keys or wallet keys.",
    "Submit a public repository and a short demo video.",
  ],
};

const SHARED_LINKS: EventConfig["links"] = [
  { label: "Event brief", meta: "PDF · SOON", href: null },
  { label: "Starter repository", meta: "GITHUB ↗", href: "https://github.com/" },
  { label: "Community chat", meta: "AT KICK-OFF", href: null },
  { label: "Submission portal", meta: "OPENS AT KICK-OFF", href: null },
];

const ALL_TRACKS: EventConfig["tracks"] = [
  { id: "web", prize: "£2,500", prizeStatus: "SAMPLE" },
  { id: "mobile", prize: "£2,500", prizeStatus: "SAMPLE" },
  { id: "agents", prize: "£2,500", prizeStatus: "SAMPLE" },
  { id: "services", prize: "£2,500", prizeStatus: "SAMPLE" },
];

export const EVENTS: EventConfig[] = [
  {
    id: "cambridge",
    code: "CAM",
    shortName: "Cambridge · Oxbridge",
    name: "Agent Studio · Cambridge",
    status: "proposed",
    host: { name: "Superteam UK", role: "PROPOSED HOST · PENDING APPROVAL", initials: "ST" },
    university: {
      name: "University of Cambridge",
      value: "University of Cambridge",
      sub: "Open to Cambridge and Oxford students",
      status: "PROPOSED",
    },
    month: "Feb 2027",
    dates: { value: "Sat 13 to Sun 14 Feb 2027", sub: "Two days, in person", status: "SAMPLE" },
    deadline: { value: "Sun 14 Feb, 12:00 GMT", sub: "Projects submitted via GitHub", status: "SAMPLE" },
    prizePool: { value: "£10,000", sub: "Split across the four tracks", status: "SAMPLE" },
    format: { value: "30 hours · teams of 1-4", sub: "Beginners welcome", status: "PROPOSED" },
    venue: { value: "Cambridge, to be confirmed", sub: "Announced after approval", status: "TBC" },
    tracks: ALL_TRACKS,
    judging: SAMPLE_JUDGING,
    rules: PROPOSED_RULES,
    bounties: [],
    mentors: [],
    sponsors: [],
    sponsorDisclaimer: "No sponsorships or funding commitments are confirmed yet.",
    links: SHARED_LINKS,
  },
  {
    id: "imperial",
    code: "ICL",
    shortName: "Imperial College London",
    name: "Agent Studio · Imperial",
    status: "proposed",
    host: { name: "Superteam UK", role: "PROPOSED HOST · PENDING APPROVAL", initials: "ST" },
    university: {
      name: "Imperial College London",
      value: "Imperial College London",
      sub: "Open to Imperial and London students",
      status: "PROPOSED",
    },
    month: "Mar 2027",
    dates: { value: "Sat 6 to Sun 7 Mar 2027", sub: "Two days, in person", status: "SAMPLE" },
    deadline: { value: "Sun 7 Mar, 12:00 GMT", sub: "Projects submitted via GitHub", status: "SAMPLE" },
    prizePool: { value: "£10,000", sub: "Split across the four tracks", status: "SAMPLE" },
    format: { value: "30 hours · teams of 1-4", sub: "Beginners welcome", status: "PROPOSED" },
    venue: { value: "South Kensington, to be confirmed", sub: "Announced after approval", status: "TBC" },
    tracks: ALL_TRACKS,
    judging: SAMPLE_JUDGING,
    rules: PROPOSED_RULES,
    bounties: [],
    mentors: [],
    sponsors: [],
    sponsorDisclaimer: "No sponsorships or funding commitments are confirmed yet.",
    links: SHARED_LINKS,
  },
];

export function getEvent(id: string | null | undefined): EventConfig {
  return EVENTS.find((e) => e.id === id) ?? EVENTS[0];
}

export function isEventId(id: string | null | undefined): id is string {
  return !!id && EVENTS.some((e) => e.id === id);
}
