import type { TrackConfig, TrackId } from "./schema";

/**
 * The four proposed hackathon tracks. Order here is display order.
 * Events choose which of these they run (see `events.ts`), so a track can be
 * dropped for one event without touching any component.
 */
export const TRACKS: TrackConfig[] = [
  {
    id: "web",
    abbr: "N",
    name: "Web Applications",
    tech: "NEXT.JS",
    short: "NEXT.JS",
    framework: "next",
    command: "npx next dev",
    description: "Build AI-powered web applications and internet-native payment experiences.",
    judgedOn: ["Product polish", "Payment experience", "Real user value"],
  },
  {
    id: "mobile",
    abbr: "RN",
    name: "Consumer Mobile",
    tech: "REACT NATIVE · EXPO · ANDROID",
    short: "EXPO",
    framework: "expo",
    command: "npx expo run:android",
    description: "Build mobile applications with strong consumer adoption potential.",
    judgedOn: ["Consumer appeal", "Onboarding", "Mobile payments"],
    note: "Standout apps may suit future Solana Mobile distribution. A possible pathway, not a guarantee.",
  },
  {
    id: "agents",
    abbr: "Py",
    name: "Autonomous Agents",
    tech: "PYTHON",
    short: "PYTHON",
    framework: "python",
    command: "python -m agent",
    description: "Build autonomous systems that discover and purchase digital services within defined budgets.",
    judgedOn: ["Autonomy", "Budget safety", "Reliability"],
  },
  {
    id: "services",
    abbr: "TS",
    name: "Services & Markets",
    tech: "NODE.JS · TYPESCRIPT",
    short: "NODE.JS",
    framework: "node",
    command: "npm run dev",
    description: "Build paid APIs, intelligent backend services, service markets and automated matching systems.",
    judgedOn: ["API design", "Pricing model", "Composability"],
  },
];

export const TRACK_MAP: Record<TrackId, TrackConfig> = Object.fromEntries(
  TRACKS.map((t) => [t.id, t]),
) as Record<TrackId, TrackConfig>;

export const TRACK_LABEL: Record<TrackId, string> = {
  web: "Web Applications",
  mobile: "Consumer Mobile",
  agents: "Autonomous Agents",
  services: "Services & Markets",
};
