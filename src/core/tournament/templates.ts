import { evenWindows, TOURNAMENT_SCHEMA, type LayerConfig, type TournamentConfig } from "./config";

/**
 * Starter templates. These are examples, not rules: organisers edit, reorder or delete any of
 * them in the builder, or start from a blank tournament.
 */

type LayerTemplate = Omit<LayerConfig, "timing">;

const SDK_DOCS = "https://github.com/Db0706/superteam-agent-studio/blob/main/docs/VERIFICATION_SDK.md";

export const LAYER_TEMPLATES: LayerTemplate[] = [
  {
    key: "first-intelligence",
    title: "First Intelligence",
    description: "Your app answers a fresh request through the verification protocol.",
    objective: "Call an AI model from your app and return its answer in the ASRP/1 envelope.",
    instructions:
      "Expose two endpoints on a public URL:\n\n- `GET /agent-studio/v1/health` returns `{ \"protocol\": \"asrp/1\", \"status\": \"ready\" }`\n- `POST /agent-studio/v1/tasks` answers `respond` tasks: put the answer in `output.text` and echo the request `nonce`.\n\nThe verifier asks questions with answers it can check, so any model works.",
    difficulty: "intro",
    capabilities: ["AI model call", "API contract"],
    prerequisites: [],
    resources: [{ label: "Verification protocol (ASRP/1)", url: SDK_DOCS }],
    hints: [{ afterAttempts: 2, text: "Check that you return HTTP 200 with JSON containing protocol, nonce, status: \"ok\" and output." }],
    outcome: "eliminate",
    advancement: { kind: "all_passing" },
    passingScore: 100,
    retries: { maxAttempts: null, cooldownSeconds: 20 },
    verifier: { plugin: "ai.respond", config: { cases: 2, timeoutMs: 20000 }, visibleCriteria: ["Health endpoint answers", "Envelope with echoed nonce", "Correct answers to fresh questions"] },
    weight: 1,
    achievement: { title: "First Intelligence" },
    feedback: { showCheckNames: true, showDetails: true },
  },
  {
    key: "structured-outputs",
    title: "Structured Outputs",
    description: "Return validated JSON that matches a schema.",
    objective: "Turn unstructured text into JSON matching `task.schema`, and reject malformed requests.",
    instructions: "Handle `extract` tasks: return `output.data` matching `task.schema` exactly (no extra fields). An `extract` task with no input and no schema must get HTTP 400 with `status: \"error\"` and `error.code: \"invalid_input\"`.",
    difficulty: "intro",
    capabilities: ["Structured output", "Validation"],
    prerequisites: ["first-intelligence"],
    resources: [{ label: "Verification protocol (ASRP/1)", url: SDK_DOCS }],
    hints: [{ afterAttempts: 2, text: "Validate your model's JSON against the schema before returning it, and retry once if it doesn't match." }],
    outcome: "eliminate",
    advancement: { kind: "all_passing" },
    passingScore: 80,
    retries: { maxAttempts: null, cooldownSeconds: 20 },
    verifier: { plugin: "ai.structured", config: { cases: 3, includeMalformed: true, timeoutMs: 25000 }, visibleCriteria: ["JSON matches the schema", "Correct values on held-out inputs", "Malformed requests rejected"] },
    weight: 1,
    achievement: { title: "Structured" },
    feedback: { showCheckNames: true, showDetails: true },
  },
  {
    key: "tool-calling",
    title: "Tool Calling",
    description: "Give your AI tools and use their results.",
    objective: "Call the platform's reference tools and answer from what they return.",
    instructions: "Handle `use_tools` tasks: each entry in `task.tools` has a URL. POST the tool input as JSON with `Authorization: Bearer <task.challengeToken>`. The data is fresh for every attempt and only the tools know it, and the tool service records every call.",
    difficulty: "core",
    capabilities: ["Tool calling", "Function calling"],
    prerequisites: ["structured-outputs"],
    resources: [{ label: "Verification protocol (ASRP/1)", url: SDK_DOCS }],
    hints: [{ afterAttempts: 2, text: "Pass the tool definitions to your model as functions, execute its calls against the tool URLs, then send the results back." }],
    outcome: "eliminate",
    advancement: { kind: "all_passing" },
    passingScore: 80,
    retries: { maxAttempts: null, cooldownSeconds: 30 },
    verifier: { plugin: "tools.invoke", config: { timeoutMs: 45000 }, visibleCriteria: ["Real tool calls recorded by the tool service", "Answer computed from tool results", "No invented tool results"] },
    weight: 1,
    achievement: { title: "Tool User" },
    feedback: { showCheckNames: true, showDetails: true },
  },
  {
    key: "external-knowledge",
    title: "External Knowledge",
    description: "Answer from a data source, and admit what it doesn't know.",
    objective: "Retrieve from a controlled knowledge source, cite it, and refuse to invent answers.",
    instructions: "Handle `answer_from_source` tasks: search with the `search_source` tool, answer from the results and return `{ \"answer\": string | null, \"sourceIds\": string[] }` in `output.data`. If the source has no answer, return `answer: null`.",
    difficulty: "core",
    capabilities: ["Retrieval", "Grounding"],
    prerequisites: ["tool-calling"],
    resources: [{ label: "Verification protocol (ASRP/1)", url: SDK_DOCS }],
    hints: [{ afterAttempts: 2, text: "Tell your model to answer only from the retrieved text and to return null when it isn't there." }],
    outcome: "eliminate",
    advancement: { kind: "all_passing" },
    passingScore: 75,
    retries: { maxAttempts: null, cooldownSeconds: 30 },
    verifier: { plugin: "knowledge.source", config: { questions: 2, includeUnanswerable: true, timeoutMs: 45000 }, visibleCriteria: ["Answers from the source", "Cites the right document", "Abstains when the source has no answer"] },
    weight: 1,
    achievement: { title: "Grounded" },
    feedback: { showCheckNames: true, showDetails: true },
  },
  {
    key: "memory-context",
    title: "Memory and Context",
    description: "Keep context across turns, and keep sessions apart.",
    objective: "Remember facts within a conversation and never leak them into another.",
    instructions: "Handle `converse` tasks: keep the history for each `task.sessionId` and answer later turns using earlier ones. Sessions must be isolated.",
    difficulty: "core",
    capabilities: ["Memory", "Session state"],
    prerequisites: ["external-knowledge"],
    resources: [{ label: "Verification protocol (ASRP/1)", url: SDK_DOCS }],
    hints: [{ afterAttempts: 2, text: "Store messages keyed by sessionId (a Map in memory is fine for the race) and send the whole history to the model each turn." }],
    outcome: "eliminate",
    advancement: { kind: "all_passing" },
    passingScore: 80,
    retries: { maxAttempts: null, cooldownSeconds: 30 },
    verifier: { plugin: "memory.multiturn", config: { checkIsolation: true, timeoutMs: 25000 }, visibleCriteria: ["Recalls earlier facts", "Handles unrelated turns", "Sessions are isolated"] },
    weight: 1,
    achievement: { title: "Remembers" },
    feedback: { showCheckNames: true, showDetails: true },
  },
  {
    key: "reliability",
    title: "Reliability",
    description: "Survive bad input, flaky tools, outages and timeouts.",
    objective: "Retry what can recover, report what can't, and never invent a result.",
    instructions:
      "The verifier will send invalid input (answer 400 `invalid_input`), make a tool fail twice before working (retry it), take a tool down (answer 503 `upstream_unavailable`) and make a tool slower than `task.limits.timeoutMs` (answer 504 `upstream_timeout` in time).",
    difficulty: "advanced",
    capabilities: ["Error handling", "Retries", "Timeouts"],
    prerequisites: ["memory-context"],
    resources: [{ label: "Verification protocol (ASRP/1)", url: SDK_DOCS }],
    hints: [{ afterAttempts: 2, text: "Wrap tool calls in a retry with backoff for 503s, and an AbortController timeout from task.limits.timeoutMs." }],
    outcome: "eliminate",
    advancement: { kind: "all_passing" },
    passingScore: 70,
    retries: { maxAttempts: null, cooldownSeconds: 45 },
    verifier: { plugin: "reliability.faults", config: { invalidInput: true, recoverableOutage: true, unrecoverableOutage: true, slowUpstream: true, appTimeoutMs: 5000 }, visibleCriteria: ["Invalid input rejected", "Recovers from transient failures", "Reports outages", "Times out cleanly"] },
    weight: 1,
    achievement: { title: "Resilient" },
    feedback: { showCheckNames: true, showDetails: true },
  },
  {
    key: "autonomous-workflow",
    title: "Autonomous Workflow",
    description: "Plan and run a multi-step task within limits.",
    objective: "Complete dependent steps in the right order without breaking the spending limit.",
    instructions: "Handle `run_workflow` tasks: check inventory, create a quote, and place an order only if the quote total is within `task.limits.maxSpendUsd`. Report every order in `output.data.orders`.",
    difficulty: "advanced",
    capabilities: ["Agents", "Planning", "Spending limits"],
    prerequisites: ["reliability"],
    resources: [{ label: "Verification protocol (ASRP/1)", url: SDK_DOCS }],
    hints: [{ afterAttempts: 2, text: "Read the quote's totalUsd before calling place_order, and stop if it's over the limit." }],
    outcome: "eliminate",
    advancement: { kind: "all_passing" },
    passingScore: 75,
    retries: { maxAttempts: null, cooldownSeconds: 45 },
    verifier: { plugin: "workflow.purchase", config: { maxToolCalls: 12, timeoutMs: 60000 }, visibleCriteria: ["Steps happen in dependency order", "Spending limit respected", "Accurate final report", "Tool-call limit respected"] },
    weight: 1,
    achievement: { title: "Autonomous" },
    feedback: { showCheckNames: true, showDetails: true },
  },
  {
    key: "final-mission",
    title: "Final Mission",
    description: "Everything, together.",
    objective: "Structured output, tools, memory and recovery working in one deployment.",
    instructions: "One scenario exercises every earlier capability. A pass earns your team's final signed verification receipt.",
    difficulty: "expert",
    capabilities: ["Structured output", "Tool calling", "Memory", "Reliability"],
    prerequisites: ["autonomous-workflow"],
    resources: [{ label: "Verification protocol (ASRP/1)", url: SDK_DOCS }],
    hints: [],
    outcome: "eliminate",
    advancement: { kind: "all_passing" },
    passingScore: 80,
    retries: { maxAttempts: null, cooldownSeconds: 60 },
    verifier: { plugin: "mission.final", config: { timeoutMs: 45000 }, visibleCriteria: ["Structured output", "Tool calling through a transient outage", "Multi-turn memory", "Outage reporting"] },
    weight: 2,
    achievement: { title: "Mission Complete" },
    feedback: { showCheckNames: true, showDetails: true },
  },
];

/** The sample eight-layer AI Race. Duration and interval are parameters, not constants. */
export function aiRaceTemplate(opts: { name?: string; intervalSeconds?: number; layers?: number; mode?: TournamentConfig["mode"] } = {}): TournamentConfig {
  const count = Math.min(opts.layers ?? LAYER_TEMPLATES.length, LAYER_TEMPLATES.length);
  const windows = evenWindows(count, opts.intervalSeconds ?? 30 * 60);
  return {
    schema: TOURNAMENT_SCHEMA,
    name: opts.name ?? "The AI Race",
    description: "Build an AI application one capability at a time. Every layer is verified automatically against your live app. Teams that miss a deadline leave the race but keep building for the event's tracks.",
    mode: opts.mode ?? "survival",
    participation: "team",
    timezone: "Europe/London",
    tieBreak: ["score_desc", "first_pass_at_asc", "attempts_asc"],
    countsTowardsJudging: false,
    layers: LAYER_TEMPLATES.slice(0, count).map((l, i) => ({ ...l, prerequisites: l.prerequisites.filter((p) => LAYER_TEMPLATES.slice(0, i).some((x) => x.key === p)), timing: windows[i] })),
  };
}

/** A rehearsal copy: the same layers with every window scaled down (e.g. 4 hours → 8 minutes). */
export function rehearsalConfig(cfg: TournamentConfig, speed: number): TournamentConfig {
  // Windows can't go below 60s, so cap the speed-up to keep every window in proportion.
  const shortest = Math.min(...cfg.layers.map((l) => l.timing.durationSeconds));
  const factor = Math.max(1, Math.min(speed, shortest / 60));
  return {
    ...cfg,
    name: `${cfg.name} (rehearsal ×${Math.round(factor * 10) / 10})`,
    layers: cfg.layers.map((l) => ({
      ...l,
      timing: { offsetSeconds: Math.round(l.timing.offsetSeconds / factor), durationSeconds: Math.max(60, Math.round(l.timing.durationSeconds / factor)) },
      retries: { ...l.retries, cooldownSeconds: Math.min(l.retries.cooldownSeconds, 5) },
    })),
  };
}
