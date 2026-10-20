import { z } from "zod";
import { check, type CheckResult, type VerifierContext, type VerifierPlugin } from "../plugin";
import { runToolCase } from "./tools";

/** Layer 6 (Reliability): bad input, a recoverable outage, an unrecoverable outage, a timeout. */
const reliabilityConfig = z.object({
  invalidInput: z.boolean().default(true),
  recoverableOutage: z.boolean().default(true),
  unrecoverableOutage: z.boolean().default(true),
  slowUpstream: z.boolean().default(true),
  /** How long the app is allowed before it must give up on a slow tool. */
  appTimeoutMs: z.number().int().min(1000).max(20000).default(5000),
});

function expectError(call: { response: unknown; httpStatus: number | null; failure: string | null }, codes: string[], statusOk: (s: number) => boolean) {
  const r = call.response as { status?: string; error?: { code?: string } } | null;
  const ok = !!r && r.status === "error" && !!r.error?.code && codes.includes(r.error.code) && call.httpStatus !== null && statusOk(call.httpStatus);
  const got = call.failure ?? (r ? `HTTP ${call.httpStatus}, status ${r.status}${r.error?.code ? `, code ${r.error.code}` : ""}` : `HTTP ${call.httpStatus} without an envelope`);
  return { ok, got };
}

export async function runOutageCase(ctx: VerifierContext, appTimeoutMs: number, prefix = ""): Promise<CheckResult> {
  const session = await ctx.createSession("tools", { records: { [ctx.rng.id("rec")]: { amount: 10 } }, rates: {} }, { down: ["exchange_rate"] });
  const call = await ctx.callApp(
    { type: "use_tools", input: "Get the exchange rate from USD to GBP with exchange_rate and return { rate }.", tools: session.tools(["exchange_rate"]), challengeToken: session.token, limits: { timeoutMs: appTimeoutMs } },
    { timeoutMs: appTimeoutMs + 8000 },
  );
  const r = expectError(call, ["upstream_unavailable"], (s) => s === 502 || s === 503);
  ctx.evidence(`${prefix}outage`, { raw: call.raw, calls: await ctx.invocations(session.id) });
  return check(`${prefix}outage`, "Reports an unavailable tool instead of inventing a result", r.ok, r.ok ? "Returned upstream_unavailable." : `Expected HTTP 502/503 with code upstream_unavailable when the tool is down. Got ${r.got}.`, undefined, 2);
}

export const reliabilityPlugin: VerifierPlugin<z.infer<typeof reliabilityConfig>> = {
  id: "reliability.faults",
  name: "Reliability",
  category: "reliability",
  description: "Sends invalid input, makes a tool fail twice before recovering, takes a tool down completely, and makes a tool too slow. Checks the app recovers or reports the right error each time.",
  participantHint: "Retry tool calls that return 503, answer invalid tasks with 400 invalid_input, report a tool that stays down as 503 upstream_unavailable, and give up on a tool slower than task.limits.timeoutMs with 504 upstream_timeout.",
  configSchema: reliabilityConfig,
  defaultConfig: { invalidInput: true, recoverableOutage: true, unrecoverableOutage: true, slowUpstream: true, appTimeoutMs: 5000 },
  async run(ctx, config) {
    const checks: CheckResult[] = [];
    if (config.invalidInput) {
      const call = await ctx.callApp({ type: "use_tools", input: { unexpected: true } }, { timeoutMs: 15000 });
      const r = expectError(call, ["invalid_input"], (s) => s >= 400 && s < 500);
      checks.push(check("invalid", "Rejects invalid input with invalid_input", r.ok, r.ok ? "Invalid input rejected." : `Expected HTTP 4xx with code invalid_input for a use_tools task with no tools. Got ${r.got}.`, undefined, 1));
    }
    if (config.recoverableOutage) {
      const { checks: inner, answered } = await runToolCase(ctx, 45000, "retry.", { failFirst: { tools: ["lookup_record"], count: 2 } });
      checks.push(check("retry", "Recovers from a tool that fails twice then works", answered, answered ? "Retried and produced the right answer." : `Did not recover from two 503s. ${inner.find((c) => !c.passed)?.message ?? ""}`, undefined, 2));
    }
    if (config.unrecoverableOutage) checks.push(await runOutageCase(ctx, config.appTimeoutMs));
    if (config.slowUpstream) {
      const session = await ctx.createSession("tools", { records: { slow: { amount: 1 } } }, { delayMs: { tools: ["lookup_record"], ms: config.appTimeoutMs + 10000 } });
      const started = Date.now();
      const call = await ctx.callApp(
        { type: "use_tools", input: "Look up record slow with lookup_record and return its amount.", tools: session.tools(["lookup_record"]), challengeToken: session.token, limits: { timeoutMs: config.appTimeoutMs } },
        { timeoutMs: config.appTimeoutMs + 9000 },
      );
      const tookMs = Date.now() - started;
      const r = expectError(call, ["upstream_timeout"], (s) => s === 504 || s === 503 || s === 502);
      const quick = tookMs <= config.appTimeoutMs + 6000;
      checks.push(check("timeout", "Gives up on a slow tool within the time limit", r.ok && quick, r.ok && quick ? "Timed out cleanly with upstream_timeout." : !quick ? `Took ${Math.round(tookMs / 1000)}s; the limit was ${config.appTimeoutMs / 1000}s.` : `Expected HTTP 504 with code upstream_timeout. Got ${r.got}.`, { tookMs }, 1));
    }
    return { checks };
  },
};
