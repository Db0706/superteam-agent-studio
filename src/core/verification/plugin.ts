import type { z } from "zod";
import type { TaskOk, TaskRequest, TaskResponse, ToolSpec } from "./protocol";

export type { TaskOk };

/**
 * Verifier plugins: one per verification type. A plugin drives a participant's app through
 * ASRP/1 and reports checks. It never decides "passed" itself; the engine scores the checks.
 *
 * Two kinds of failure, kept apart on purpose:
 *  - the participant's app misbehaves -> a failed check with safe, actionable feedback;
 *  - our own infrastructure fails (challenge store down, etc.) -> throw InfrastructureError,
 *    the job is retried, and if it keeps failing the attempt ends as ERROR (never as a fail).
 */

export class InfrastructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InfrastructureError";
  }
}

export interface CheckResult {
  id: string;
  /** Shown to participants: what was checked, in plain words. */
  label: string;
  passed: boolean;
  weight: number;
  /** Safe, actionable feedback. Never hidden inputs or expected values. */
  message: string;
  /** Organiser-only detail (inputs, expected values, raw snippets). */
  detail?: Record<string, unknown>;
}

export interface AppCall {
  /** The app's response parsed as an ASRP envelope, if it parsed. */
  response: TaskResponse | null;
  httpStatus: number | null;
  /** Why the call failed before an envelope was available. */
  failure: string | null;
  nonce: string;
  nonceEchoed: boolean;
  elapsedMs: number;
  /** Truncated raw body, for organiser evidence. */
  raw: string;
}

export interface ChallengeSession {
  id: string;
  token: string;
  /** Tool specs pointing at the reference tool service for this session. */
  tools(names: string[]): ToolSpec[];
  sourceUrl: string;
}

export interface ToolInvocation {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  status: number;
  receivedAt: string;
}

export interface VerifierContext {
  attempt: { id: string; layerKey: string; number: number };
  /** Deterministic per attempt (seeded from the attempt id and a server secret). */
  rng: Rng;
  callApp(task: TaskRequest["task"], opts?: { timeoutMs?: number }): Promise<AppCall>;
  checkHealth(): Promise<{ ok: boolean; message: string; elapsedMs: number }>;
  /** Start a reference-service session holding hidden facts and fault behaviour. */
  createSession(kind: string, facts: Record<string, unknown>, behaviour?: Record<string, unknown>): Promise<ChallengeSession>;
  invocations(sessionId: string): Promise<ToolInvocation[]>;
  /** A plain HTTP request to a path on the app (for API-contract checks), through the same safe client. */
  raw(method: "GET" | "POST", path: string, body: string | undefined, timeoutMs: number): Promise<{ status: number | null; body: string; failure: string | null }>;
  /** Record organiser-only evidence. */
  evidence(key: string, value: unknown): void;
  /** The platform's own records about this team (for build-stage checks). Null for rehearsal fixtures. */
  team(): Promise<TeamRecord | null>;
}

export interface TeamRecord {
  name: string;
  submissions: { track: string; status: string; title: string; fields: Record<string, unknown> }[];
}

export interface VerifierOutcome {
  checks: CheckResult[];
  /** Set when a human must decide (subjective criteria or ambiguous AI output). */
  reviewReason?: string;
}

export interface VerifierPlugin<C = unknown> {
  id: string;
  name: string;
  /** Plain-language summary for the layer editor. */
  description: string;
  category: "ai" | "api" | "tools" | "knowledge" | "memory" | "reliability" | "workflow" | "payments" | "human";
  configSchema: z.ZodType<C>;
  defaultConfig: C;
  /** What participants should build, in a sentence; shown when the layer opens. */
  participantHint: string;
  run(ctx: VerifierContext, config: C): Promise<VerifierOutcome>;
}

export interface Rng {
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  id(prefix: string): string;
}

/** Score 0–100 from weighted checks. */
export function scoreChecks(checks: CheckResult[]): number {
  const total = checks.reduce((a, c) => a + c.weight, 0);
  if (total <= 0) return 0;
  return Math.round((checks.filter((c) => c.passed).reduce((a, c) => a + c.weight, 0) / total) * 10_000) / 100;
}

export const check = (id: string, label: string, passed: boolean, message: string, detail?: Record<string, unknown>, weight = 1): CheckResult => ({
  id,
  label,
  passed,
  weight,
  message,
  ...(detail ? { detail } : {}),
});

/** Feedback for a call that never produced a valid envelope. */
export function callProblem(call: AppCall): string | null {
  if (call.failure) return call.failure;
  if (!call.response) return `The app answered HTTP ${call.httpStatus} without a valid ASRP/1 JSON envelope.`;
  if (!call.nonceEchoed) return "The response did not echo the request's nonce.";
  return null;
}
