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

/** Published constants for the on-chain challenges, from the challenge setup (deploy script). */
export interface OnchainConstants {
  programId: string;
  credMint: string;
  presentationAccount: string;
  salt: string;
  rpcUrl?: string;
}

/**
 * The on-chain bonus challenges (Operation, Minesweeper), three tiers each. Each team solves its
 * own puzzle on Solana devnet with its registered wallet; the bureau.chain verifier reads the
 * chain. Tiers chain: tier 2 needs tier 1, tier 3 needs tier 2.
 */
export function onchainChallenges(k: OnchainConstants): LayerTemplate[] {
  const rpc = k.rpcUrl ?? "https://api.devnet.solana.com";
  const consts = `Published constants: RPC \`${rpc}\` · program \`${k.programId}\` · CRED mint \`${k.credMint}\` · presentation account \`${k.presentationAccount}\` · salt \`${k.salt}\`. Your **Challenge ID** is on your team page; register your team wallet there too. Only transactions signed by that wallet count.`;
  const verifier = (challenge: "operation" | "minesweeper", tier: 1 | 2 | 3, visibleCriteria: string[]) => ({
    plugin: "bureau.chain",
    config: { challenge, tier, programId: k.programId, credMint: k.credMint, presentationAccount: k.presentationAccount, rpcUrl: rpc, codeWindowSlots: 4500, fastSlots: 150, timeoutMs: 60000 },
    visibleCriteria,
  });
  const base = (l: Pick<LayerTemplate, "key" | "title" | "description" | "objective" | "instructions" | "capabilities" | "verifier" | "points" | "difficulty"> & Partial<LayerTemplate>): LayerTemplate =>
    stage({ category: "challenge", retries: { maxAttempts: null, cooldownSeconds: 60 }, resources: [], ...l });
  const opBrief =
    "Find your verification record at the program address derived from the seeds `claim` and your Challenge ID **in lowercase**. Its raw bytes have no schema: bytes 41–49 are the **clearance nonce** (u64, little-endian) and bytes 49–81 are your **clearance account** (32-byte address).";
  const msBrief =
    "Find your holdings record at the address derived from `holdings` and your Challenge ID (**not** lowercased). Bytes 8–40 are the **registrar key**. Call the program's `mint_code(challenge_id: string, memo_hash: [u8; 32])` (no IDL is published) with `memo_hash = sha256(utf8(Challenge ID) || utf8(salt))`. In the same transaction include the registrar key as the first extra (remaining) account, the instructions sysvar `Sysvar1nstructions1111111111111111111111111`, and an SPL Memo with the lowercase hex of `memo_hash`. The code is written to the record derived from `deed` and your Challenge ID: operative (4-byte length + string), clearance_code (8 bytes), issued_slot (u64), presented (bool).";
  return [
    base({
      key: "operation-1", title: "Operation · Found it", difficulty: "core", points: 30,
      description: "Bonus challenge: decode your on-chain record and pay your clearance account.",
      objective: "Send any amount of CRED from your team wallet to your clearance account.",
      instructions: `${opBrief}\n\nProve you found it: send **any** amount of CRED to your clearance account, signed by your team wallet. Then press **Run verification**.\n\n${consts}`,
      capabilities: ["Solana", "Program-derived addresses", "Decoding bytes"],
      verifier: verifier("operation", 1, ["CRED from your wallet reached your clearance account"]),
      hints: [{ afterAttempts: 3, text: "The address seed is the Challenge ID in lowercase. The clearance account is the 32 bytes from offset 49, read as a Solana address." }],
    }),
    base({
      key: "operation-2", title: "Operation · Exact", difficulty: "core", points: 50, prerequisites: ["operation-1"],
      description: "Bonus challenge: pay the exact clearance fee.",
      objective: "Send exactly 1000 + (nonce mod 9000) base units of CRED.",
      instructions: `${opBrief}\n\nPay the **exact clearance fee**: \`1000 + (clearance_nonce mod 9000)\` CRED **base units** (not whole tokens), from your team wallet to your clearance account. Then press **Run verification**.\n\n${consts}`,
      capabilities: ["Solana", "Little-endian decoding", "SPL tokens"],
      verifier: verifier("operation", 2, ["CRED from your wallet reached your clearance account", "Pays the exact clearance fee"]),
      hints: [{ afterAttempts: 3, text: "The nonce is 8 raw bytes, little-endian: not text and not hex. Read it as an unsigned 64-bit integer. The fee is in base units (CRED has 6 decimals)." }],
    }),
    base({
      key: "operation-3", title: "Operation · Verified", difficulty: "core", points: 70, prerequisites: ["operation-2"],
      description: "Bonus challenge: the exact fee with the right memo, in one transaction.",
      objective: "Send the exact fee with the memo sha256(Challenge ID ‖ nonce LE).hex[:16] in the same transaction.",
      instructions: `${opBrief}\n\nSend the exact fee **and** an SPL Memo in the **same transaction**. The memo is the first 16 hex characters of \`sha256(utf8(Challenge ID) || nonce as 8 little-endian bytes)\`. Then press **Run verification**.\n\n${consts}`,
      capabilities: ["Solana", "Hashing", "Transactions with several instructions"],
      verifier: verifier("operation", 3, ["CRED from your wallet reached your clearance account", "Pays the exact clearance fee", "The exact fee and the right memo in one transaction"]),
      hints: [{ afterAttempts: 3, text: "The address seed is lowercased but the memo uses the Challenge ID exactly as shown. Hash the raw nonce bytes, not a string. Keep the first 16 hex characters." }],
    }),
    base({
      key: "minesweeper-1", title: "Minesweeper · Minted", difficulty: "advanced", points: 90,
      description: "Bonus challenge: call the program directly to mint your clearance code.",
      objective: "Call mint_code with the registrar key as a remaining account and the memo in the same transaction.",
      instructions: `${msBrief}\n\nWhen the call succeeds, your code record exists. Press **Run verification**.\n\n${consts}`,
      capabilities: ["Solana", "Raw Anchor instructions", "Remaining accounts"],
      verifier: verifier("minesweeper", 1, ["A clearance code was minted for your team"]),
      hints: [{ afterAttempts: 3, text: "The 8-byte instruction identifier is the first 8 bytes of sha256(\"global:mint_code\"). Strings are encoded as a 4-byte little-endian length then the bytes. If the program refuses, check both traps: the registrar key as the first remaining account, and the memo in the same transaction." }],
    }),
    base({
      key: "minesweeper-2", title: "Minesweeper · Presented", difficulty: "advanced", points: 80, prerequisites: ["minesweeper-1"],
      description: "Bonus challenge: read your code from chain and present it in time.",
      objective: "Send 1 base unit of CRED to the presentation account with the memo <Challenge ID>:<code>, within the code's window.",
      instructions: `${msBrief}\n\nThe code doesn't come back from the call: **read it from your code record**. Then present it: send **1 base unit** of CRED to the presentation account with the memo \`<Challenge ID>:<code>\`, within about 30 minutes of chain time after minting. Missed it? Mint a fresh code and try again. Then press **Run verification**.\n\n${consts}`,
      capabilities: ["Solana", "Decoding bytes", "Memos"],
      verifier: verifier("minesweeper", 2, ["A clearance code was minted for your team", "Code presented in time"]),
      hints: [{ afterAttempts: 3, text: "The code record starts with an 8-byte discriminator, then a 4-byte length and the operative string; the 8-byte code comes right after. Present the current code: re-minting replaces it." }],
    }),
    base({
      key: "minesweeper-3", title: "Minesweeper · Fast hands", difficulty: "advanced", points: 30, prerequisites: ["minesweeper-2"],
      description: "Bonus challenge: mint, read and present within about a minute.",
      objective: "Present a fresh code within about one minute of minting it.",
      instructions: `${msBrief}\n\n**Fast hands:** script the whole chain (mint, read, present) so the presentation lands within about one minute (150 slots) of minting. Then press **Run verification**.\n\n${consts}`,
      capabilities: ["Solana", "Scripting"],
      verifier: verifier("minesweeper", 3, ["A clearance code was minted for your team", "Code presented in time", "Presented within about a minute of minting"]),
    }),
  ];
}

export interface HackathonOptions {
  name?: string;
  /** Total length of the hackathon (the build sprint). */
  sprintSeconds?: number;
  /** The six build stages of the team's own product, open all sprint. */
  buildStages?: boolean;
  /** Optional challenges on top of the build stages. */
  bonusChallenges?: boolean;
  /**
   * Which challenges: "ai" = the six AI capability challenges (Structured Outputs … Final Mission),
   * checked against the team's app and unlocking one at a time, in order; "onchain" = the Solana
   * puzzles (Operation and Minesweeper, three tiers each).
   */
  challengeSet?: "ai" | "onchain";
  /** Published constants for the on-chain challenges (required when they're on). */
  onchain?: OnchainConstants;
  /** When the bonus challenges open, in seconds after the start. */
  challengeOffsetSeconds?: number;
  /** How long the bonus challenges stay open, from the start. */
  challengeWindowSeconds?: number;
  /** The organiser's devnet address for the on-chain payment build stage. */
  payTo?: string;
}

/** Points for the hackathon format, as published to students ("How the points work": 1,300 build + 700 challenges). */
export const HACKATHON_BUILD_POINTS: Record<string, number> = { "idea-locked": 50, "app-live": 150, "ai-feature": 200, "agent-tools": 300, "onchain-payment": 400, submitted: 200 };
const HACKATHON_BUILD_ORDER = ["idea-locked", "app-live", "ai-feature", "agent-tools", "onchain-payment", "submitted"];
export const HACKATHON_AI_CHALLENGE_POINTS: Record<string, number> = { "structured-outputs": 50, "external-knowledge": 100, "memory-context": 100, reliability: 100, "autonomous-workflow": 150, "final-mission": 200 };

/** The six AI capability challenges, unlocking one at a time in order (each needs the one before). */
export function aiChallenges(): LayerTemplate[] {
  const keys = Object.keys(HACKATHON_AI_CHALLENGE_POINTS);
  return keys.map((key, i) => {
    const l = LAYER_TEMPLATES.find((x) => x.key === key)!;
    return { ...l, category: "challenge" as const, outcome: "checkpoint" as const, points: HACKATHON_AI_CHALLENGE_POINTS[key], prerequisites: i ? [keys[i - 1]] : [] };
  });
}

/**
 * The simple hackathon format: a timed build sprint where points come from build stages of the
 * team's product, plus bonus points from optional challenges open during the first part of the
 * sprint. Either part can be switched off. Nobody is eliminated.
 */
export function hackathonTemplate(opts: HackathonOptions = {}): TournamentConfig {
  const sprint = opts.sprintSeconds ?? 7 * 3600;
  const withStages = opts.buildStages ?? true;
  const withChallenges = opts.bonusChallenges ?? true;
  const offset = Math.max(0, Math.min(opts.challengeOffsetSeconds ?? 0, sprint - 60));
  const window = Math.max(60, Math.min(opts.challengeWindowSeconds ?? 2 * 3600, sprint - offset));
  const set = opts.challengeSet ?? "onchain";
  const challenges = !withChallenges
    ? []
    : set === "ai"
      ? aiChallenges().map((l) => ({ ...l, timing: { offsetSeconds: offset, durationSeconds: window } }))
      : onchainChallenges(opts.onchain ?? { programId: "", credMint: "", presentationAccount: "", salt: "" }).map((l) => ({ ...l, timing: { offsetSeconds: offset, durationSeconds: window } }));
  const stages = withStages
    ? HACKATHON_BUILD_ORDER.map((key) => BUILD_STAGES.find((l) => l.key === key)!).map((l) => {
        const layer = { ...l, points: HACKATHON_BUILD_POINTS[l.key] ?? l.points, timing: { offsetSeconds: 0, durationSeconds: sprint } };
        if (l.key === "onchain-payment") Object.assign(layer, { title: "Agentic end-to-end payment", description: "Your agent pays for something on its own, on Solana devnet." });
        if (l.key === "onchain-payment" && opts.payTo) layer.verifier = { ...l.verifier, config: { ...l.verifier.config, payTo: opts.payTo } };
        return layer;
      })
    : [];
  const parts = [withStages && "points for the build stages of your own product (open all day, any order)", withChallenges && (set === "ai" ? "points from six optional AI challenges that unlock one at a time, in order" : "bonus points from two optional on-chain challenges (Operation and Minesweeper, three tiers each)")].filter(Boolean);
  return {
    schema: TOURNAMENT_SCHEMA,
    name: opts.name ?? "The AI Race",
    description: `Score ${parts.join(", plus ")}. Every pass is checked automatically against your live app and adds to the live leaderboard. Nobody is eliminated.`,
    mode: "checkpoint",
    participation: "team",
    timezone: "Europe/London",
    tieBreak: ["score_desc", "first_pass_at_asc", "attempts_asc"],
    countsTowardsJudging: true,
    layers: [...challenges, ...stages],
  };
}
