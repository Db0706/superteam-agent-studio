import type { IntegrationId } from "./integrations";

/**
 * The AI Capability Lab's rows. Each capability says where it is simulated in the lab, which starter
 * modules give real working code for it, and which race verifier checks it. The page derives the
 * SIMULATED / REAL INTEGRATION / VERIFIED labels from these links, so a label only shows when the
 * thing behind it exists.
 */
export interface LabCapability {
  id: string;
  name: string;
  description: string;
  /** Anchor of a simulation on the lab page. */
  simulation: string | null;
  /** Starter modules with real code for this capability (the Builder link preselects them). */
  integrations: IntegrationId[];
  /** Verifier plugin that checks it against a live app. */
  verifier: string;
}

export const LAB_CAPABILITIES: LabCapability[] = [
  {
    id: "model",
    name: "Call an AI model",
    description: "Send a prompt to a model from your server and return its answer.",
    simulation: null,
    integrations: ["gemini", "race"],
    verifier: "ai.respond",
  },
  {
    id: "structured",
    name: "Structured output",
    description: "Turn messy text into JSON that matches a schema, and reject bad requests.",
    simulation: null,
    integrations: ["race"],
    verifier: "ai.structured",
  },
  {
    id: "tools",
    name: "Tool calling",
    description: "Decide which tools to call, call them for real and use what they return.",
    simulation: null,
    integrations: ["race"],
    verifier: "tools.invoke",
  },
  {
    id: "knowledge",
    name: "Grounded answers",
    description: "Answer from a knowledge source, cite it, and say when the answer isn't there.",
    simulation: null,
    integrations: ["race"],
    verifier: "knowledge.source",
  },
  {
    id: "memory",
    name: "Memory and context",
    description: "Remember earlier turns in a conversation without leaking them into another.",
    simulation: null,
    integrations: ["race"],
    verifier: "memory.multiturn",
  },
  {
    id: "reliability",
    name: "Reliability",
    description: "Validate input, retry transient failures and fail clearly within a time limit.",
    simulation: null,
    integrations: ["race"],
    verifier: "reliability.faults",
  },
  {
    id: "autonomy",
    name: "Autonomous workflow within limits",
    description: "Plan several steps toward a goal and never spend past the limit you were given.",
    simulation: "agent-simulation",
    integrations: ["race", "spending"],
    verifier: "workflow.purchase",
  },
  {
    id: "payments",
    name: "Agent payments",
    description: "Pay for, or charge for, an API call in a single request, on Solana devnet.",
    simulation: "agent-simulation",
    integrations: ["payments", "spending", "paidapi"],
    verifier: "payments.devnet_settlement",
  },
];
