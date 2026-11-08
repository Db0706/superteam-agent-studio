import type { TrackConfig, TrackId } from "./schema";

/**
 * The four starters, one per framework. Order here is display order. These are starting
 * points for any track: the event's official tracks (Build and Policy) live in the database.
 */
export const TRACKS: TrackConfig[] = [
  {
    id: "web",
    abbr: "N",
    name: "AI Web Apps",
    tech: "NEXT.JS",
    short: "NEXT.JS",
    framework: "next",
    command: "npx next dev",
    description: "Assistants, research tools and copilots in the browser, with streaming, tools and retrieval.",
    strengths: ["Fast to demo", "Streaming AI UI", "Easy to deploy"],
  },
  {
    id: "mobile",
    abbr: "RN",
    name: "AI Mobile Apps",
    tech: "REACT NATIVE · EXPO · RUNS IN THE BROWSER",
    short: "EXPO",
    framework: "expo",
    command: "npm run web",
    description: "AI features people carry with them: camera, voice and on-the-go assistants.",
    strengths: ["Consumer reach", "Device features", "Offline-friendly"],
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
    description: "Agents that plan, call tools, remember context and act within limits you set.",
    strengths: ["Tool use", "Memory", "Guardrails"],
  },
  {
    id: "services",
    abbr: "TS",
    name: "AI Services & APIs",
    tech: "NODE.JS · TYPESCRIPT",
    short: "NODE.JS",
    framework: "node",
    command: "npm run dev",
    description: "Backends that other apps and agents call: model gateways, evaluators, matching and data services.",
    strengths: ["API design", "Composability", "Reliability"],
  },
];

export const TRACK_MAP: Record<TrackId, TrackConfig> = Object.fromEntries(
  TRACKS.map((t) => [t.id, t]),
) as Record<TrackId, TrackConfig>;

export const TRACK_LABEL: Record<TrackId, string> = {
  web: "AI Web Apps",
  mobile: "AI Mobile Apps",
  agents: "Autonomous Agents",
  services: "AI Services & APIs",
};
