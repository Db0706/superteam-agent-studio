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
    points: 100,
    category: "challenge",
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
    points: 100,
    category: "challenge",
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
    points: 200,
    category: "challenge",
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
    points: 200,
    category: "challenge",
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
    hints: [{ afterAttempts: 2, text: "Store messages keyed by sessionId and send the whole history to the model each turn. On Vercel or other serverless hosting, keep the history in a store, not a variable: each turn can reach a different instance. The starter's `memory` helper (race/memory) does this with a free Upstash Redis database." }],
    outcome: "eliminate",
    advancement: { kind: "all_passing" },
    passingScore: 80,
    retries: { maxAttempts: null, cooldownSeconds: 30 },
    verifier: { plugin: "memory.multiturn", config: { checkIsolation: true, timeoutMs: 25000 }, visibleCriteria: ["Recalls earlier facts", "Handles unrelated turns", "Sessions are isolated"] },
    weight: 1,
    points: 200,
    category: "challenge",
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
    points: 300,
    category: "challenge",
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
    points: 300,
    category: "challenge",
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
    points: 400,
    category: "challenge",
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

const stage = (s: Pick<LayerTemplate, "key" | "title" | "description" | "objective" | "instructions" | "capabilities" | "verifier" | "points"> & Partial<LayerTemplate>): LayerTemplate => ({
  difficulty: "intro",
  prerequisites: [],
  resources: [{ label: "Verification protocol (ASRP/1)", url: SDK_DOCS }],
  hints: [],
  outcome: "checkpoint",
  advancement: { kind: "all_passing" },
  passingScore: 100,
  retries: { maxAttempts: null, cooldownSeconds: 30 },
  weight: 1,
  category: "build_stage",
  feedback: { showCheckNames: true, showDetails: true },
  ...s,
});

/**
 * Build stages: milestones of a team's own product, each confirmed by the platform itself. In a
 * points race they stay open for the whole build sprint and can be done in any order. Points are
 * samples until the organisers set them.
 */
export const BUILD_STAGES: LayerTemplate[] = [
  stage({
    key: "app-live",
    title: "App live",
    description: "Your app is deployed and connected to the race.",
    objective: "Deploy to a public https:// URL with the race adapter and paste the URL on your team page.",
    instructions: "Add the **AI Race adapter** module from the Builder (or implement `GET /agent-studio/v1/health` yourself), deploy, and paste the URL on your team page. Press **Run verification** to confirm.",
    capabilities: ["Deployment"],
    verifier: { plugin: "app.live", config: {}, visibleCriteria: ["App answers the health check at its public URL"] },
    points: 50,
  }),
  stage({
    key: "idea-locked",
    title: "Idea locked in",
    description: "Your project has a name and a problem it solves.",
    objective: "Save a submission draft with a title and a problem statement.",
    instructions: "On the **Submit** page, give your project a title and describe the problem it solves (at least a couple of sentences), then save the draft. Press **Run verification** here to confirm.",
    capabilities: ["Product"],
    verifier: { plugin: "platform.idea", config: { minProblemChars: 60 }, visibleCriteria: ["Draft has a title", "Problem statement saved"] },
    points: 50,
  }),
  stage({
    key: "ai-feature",
    title: "AI feature working",
    description: "Your app answers with a real model.",
    objective: "Handle `respond` tasks through the race adapter with your AI model.",
    instructions: "Write the `respond` handler in your race adapter so it answers `task.input` with your model, in `output.text`. The verifier asks fresh questions with checkable answers.",
    capabilities: ["AI model call"],
    verifier: { plugin: "ai.respond", config: { cases: 2, timeoutMs: 20000 }, visibleCriteria: ["Health endpoint answers", "Envelope with echoed nonce", "Correct answers to fresh questions"] },
    points: 100,
    difficulty: "core",
  }),
  stage({
    key: "agent-tools",
    title: "Agent uses tools",
    description: "Your agent calls real tools and uses what they return.",
    objective: "Handle `use_tools` tasks by calling the tools in the task.",
    instructions: "Write the `use_tools` handler: decide which of `task.tools` to call, call them with `task.challengeToken`, and use their results in your answer. The tool service records every call, so invented results fail.",
    capabilities: ["Tool calling"],
    verifier: { plugin: "tools.invoke", config: { timeoutMs: 45000 }, visibleCriteria: ["Real tool calls recorded by the tool service", "Answer computed from tool results", "No invented tool results"] },
    points: 150,
    difficulty: "core",
  }),
  stage({
    key: "onchain-payment",
    title: "On-chain payment",
    description: "Your agent makes a real payment on Solana devnet.",
    objective: "Pay the requested devnet USDC amount with the requested memo and return the transaction signature.",
    instructions: "Handle the `run_workflow` task: pay the amount in the instructions to the address given, with the memo given, on **Solana devnet** (test money only), and return `{ \"signature\": \"…\" }` in `output.data`. The verifier confirms the transaction on chain. The Payments module in the Builder has `payUsdc(signer, { to, amountUsdc, memo })`, which does all of this; your agent wallet needs devnet SOL for fees (faucet.solana.com) and devnet USDC (faucet.circle.com, Solana Devnet).",
    capabilities: ["Payments", "Solana devnet"],
    verifier: { plugin: "payments.devnet_settlement", config: { minAmountUsdc: 0.01, timeoutMs: 60000 }, visibleCriteria: ["Payment settled on devnet", "Right amount, address and memo"] },
    points: 150,
    difficulty: "advanced",
  }),
  stage({
    key: "submitted",
    title: "Submitted",
    description: "Your project is in for judging.",
    objective: "Make a final submission to an official track.",
    instructions: "Complete every required field on the **Submit** page and press **Submit**. You'll get a receipt code. Then press **Run verification** here.",
    capabilities: ["Product"],
    verifier: { plugin: "platform.submitted", config: { track: "any" }, visibleCriteria: ["Final submission received"] },
    points: 100,
  }),
];

/**
 * A points race: nobody is eliminated. Challenges open one after another in timed windows; build
 * stages stay open for the whole sprint. Every pass adds the layer's points to the live
 * leaderboard. Challenges come first so each closes and finalises as its window ends.
 */
export function pointsRaceTemplate(opts: { name?: string; sprintSeconds?: number; challengeIntervalSeconds?: number; challenges?: number } = {}): TournamentConfig {
  const sprint = opts.sprintSeconds ?? 7 * 3600;
  // "AI feature working" and "Agent uses tools" are build stages, so those two challenges aren't repeated.
  const pool = LAYER_TEMPLATES.filter((l) => l.key !== "first-intelligence" && l.key !== "tool-calling");
  const count = Math.max(0, Math.min(opts.challenges ?? pool.length, pool.length));
  const interval = Math.max(60, Math.min(opts.challengeIntervalSeconds ?? 45 * 60, Math.floor(sprint / Math.max(1, count))));
  const windows = evenWindows(count, interval);
  return {
    schema: TOURNAMENT_SCHEMA,
    name: opts.name ?? "The AI Race",
    description:
      "Score points two ways: build stages of your own product (open all sprint, any order) and timed challenges. Every pass is verified automatically against your live app and adds to the live leaderboard. Nobody is eliminated. Points shown are samples until the organisers confirm them.",
    mode: "checkpoint",
    participation: "team",
    timezone: "Europe/London",
    tieBreak: ["score_desc", "first_pass_at_asc", "attempts_asc"],
    countsTowardsJudging: false,
    layers: [
      ...pool.slice(0, count).map((l, i) => ({ ...l, outcome: "checkpoint" as const, prerequisites: [], timing: windows[i] })),
      ...BUILD_STAGES.map((l) => ({ ...l, timing: { offsetSeconds: 0, durationSeconds: sprint } })),
    ],
  };
}
