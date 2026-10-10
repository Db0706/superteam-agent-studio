/**
 * Playground scenarios. All hosts use the reserved `.example` TLD, so nothing
 * here points at a real service, and nothing is ever requested.
 *
 *   A · Agent purchases data      → research
 *   B · Paid digital service      → travel   (each API answers 402 before it fulfils)
 *   C · Agent-to-agent            → hire     (collects offers, picks one, pays)
 */

export interface Offer {
  agent: string;
  host: string;
  price: number;
  rating: number;
}

export interface ScenarioService {
  name: string;
  /** Lower-case noun used in "continues without …". */
  short: string;
  what: string;
  /** Fixed price in USD. Omitted when the price comes from `offers`. */
  price?: number;
  delivers: string;
  host: string;
  path: string;
  /** Agent-to-agent: competing offers from other agents. */
  offers?: Offer[];
  /** Agent-to-agent: lowest acceptable rating. */
  minRating?: number;
}

export interface Scenario {
  id: ScenarioId;
  letter: "A" | "B" | "C";
  kind: string;
  name: string;
  blurb: string;
  task: string;
  plan: string;
  /** Budget used by the LOW BUDGET outcome. */
  low: number;
  services: ScenarioService[];
  report: string;
  partial: string;
}

export type ScenarioId = "research" | "travel" | "hire";

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  research: {
    id: "research",
    letter: "A",
    kind: "Agent purchases data",
    name: "Research Assistant",
    blurb: "Buys company data and news",
    task: "Research three companies and prepare a short report.",
    plan: "Needs profiles and recent news for Northwind Energy, Atlas Robotics and Kite Health.",
    low: 0.35,
    services: [
      { name: "Company Profiles API", short: "company profiles", what: "Profiles for 3 companies", price: 0.3, delivers: "Three profiles: sector, headcount and funding history.", host: "api.profiles.example", path: "/v1/profiles?ids=northwind,atlas,kite" },
      { name: "Market News API", short: "recent news", what: "News from the last 30 days", price: 0.12, delivers: "14 relevant articles, summarised by company.", host: "api.marketnews.example", path: "/v2/news?companies=3&days=30" },
    ],
    report: "Report ready: Northwind Energy, Atlas Robotics and Kite Health, each summarised with recent developments. Two paid sources cited.",
    partial: "Report ready with a gap: company summaries are in, but recent news could not be added.",
  },
  travel: {
    id: "travel",
    letter: "B",
    kind: "Paid digital service",
    name: "Trip Planner",
    blurb: "Pays live APIs per request",
    task: "Find the best way from Cambridge to Edinburgh next Friday, under £80.",
    plan: "Needs live rail fares and seat availability for Friday departures.",
    low: 0.1,
    services: [
      { name: "Rail Fares API", short: "live fares", what: "Fares for 18 Friday departures", price: 0.08, delivers: "18 fares compared. Three come in under £80.", host: "api.railfares.example", path: "/v1/fares?from=CBG&to=EDB&day=fri" },
      { name: "Seat Availability API", short: "seat availability", what: "Live seat availability", price: 0.05, delivers: "Seats confirmed on the 09:12 and 11:40.", host: "api.seats.example", path: "/v1/availability?trains=3" },
    ],
    report: "Recommendation: the 09:12 via Peterborough, £64, seats available.",
    partial: "Recommendation with a caveat: cheapest fares found, but seats could not be checked.",
  },
  hire: {
    id: "hire",
    letter: "C",
    kind: "Agent-to-agent",
    name: "Agent Hires Agents",
    blurb: "Compares offers from other agents",
    task: "Translate our launch notes into Welsh and Spanish before tonight.",
    plan: "Needs two specialist translation agents. It will ask for offers, compare price and rating, and stay inside the budget.",
    low: 0.3,
    services: [
      {
        name: "Welsh translation",
        short: "the Welsh translation",
        what: "Welsh translation, 2 pages",
        delivers: "Welsh translation returned, with a glossary of 6 product terms.",
        host: "directory.agents.example",
        path: "/v1/translate?lang=cy&pages=2",
        minRating: 4,
        offers: [
          { agent: "cymraeg-agent", host: "cymraeg.agents.example", price: 0.4, rating: 4.9 },
          { agent: "polyglot-bot", host: "polyglot.agents.example", price: 0.25, rating: 4.3 },
          { agent: "quickling", host: "quickling.agents.example", price: 0.12, rating: 3.6 },
        ],
      },
      {
        name: "Spanish translation",
        short: "the Spanish translation",
        what: "Spanish translation, 2 pages",
        delivers: "Spanish translation returned and spot-checked by a second pass.",
        host: "directory.agents.example",
        path: "/v1/translate?lang=es&pages=2",
        minRating: 4,
        offers: [
          { agent: "mundo-agent", host: "mundo.agents.example", price: 0.3, rating: 4.8 },
          { agent: "polyglot-bot", host: "polyglot.agents.example", price: 0.2, rating: 4.3 },
          { agent: "rapido-ai", host: "rapido.agents.example", price: 0.08, rating: 3.4 },
        ],
      },
    ],
    report: "Both translations delivered and ready to publish. Two agents hired; every payment stayed inside the budget.",
    partial: "Partial delivery: one translation is ready, the other could not be bought within your rules.",
  },
};

export const SCENARIO_ORDER: ScenarioId[] = ["research", "travel", "hire"];

/** [label, sub-label, short label used below 560px] */
export const FLOW_STAGES: Array<[label: string, sub: string, short: string]> = [
  ["AI agent", "Works on your task", "Agent"],
  ["Paid service", "Has what it needs", "Service"],
  ["Payment request", "Asks for a small fee", "402"],
  ["Authorisation", "Checks budget, then pays", "Pay"],
  ["Result", "Delivers the data", "Result"],
];

export const STAGE_CAPTIONS = [
  "The agent reads the task and works out what information it needs.",
  "It finds a service that sells exactly that information.",
  "Instead of the data, the service replies with a price: HTTP 402 “Payment Required”.",
  "The agent compares the price with its remaining budget, then authorises the payment.",
  "Payment confirmed, the service delivers what was paid for.",
];

export const BUDGET_MIN = 0.05;
export const BUDGET_MAX = 2;
export const BUDGET_STEP = 0.05;
