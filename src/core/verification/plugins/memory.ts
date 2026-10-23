import { z } from "zod";
import { check, type CheckResult, type VerifierContext, type VerifierPlugin } from "../plugin";
import { answerText, describeCall, okResponse, WORDS } from "./shared";

/** Layer 5 (Memory and Context): recall within a session, isolation between sessions. */
const memoryConfig = z.object({ checkIsolation: z.boolean().default(true), timeoutMs: z.number().int().min(2000).max(60000).default(25000) });

const SERVERLESS_HINT =
  " If it works locally but not deployed: on serverless hosting (such as Vercel) each turn can reach a different instance, so keep history in a store (the starter's lib/race/memory uses Upstash Redis when its env vars are set), not in a variable.";

export async function runMemoryCase(ctx: VerifierContext, timeoutMs: number, checkIsolation: boolean, prefix = ""): Promise<CheckResult[]> {
  const sessionA = ctx.rng.id("sess");
  const sessionB = ctx.rng.id("sess");
  const codename = `${ctx.rng.pick(WORDS)}-${ctx.rng.int(10, 99)}`;
  const room = `room ${ctx.rng.int(101, 499)}`;
  const turns = [
    { input: `Please remember two things for later. Our project codename is ${codename}. Our demo is in ${room}. Just confirm you have noted them.`, expect: null },
    { input: "Something unrelated: what is the capital of Japan? Answer briefly.", expect: "tokyo" },
    { input: "What is our project codename?", expect: codename },
    { input: "And which room is our demo in?", expect: room },
  ];
  const results: boolean[] = [];
  let failure: string | null = null;
  for (const [i, turn] of turns.entries()) {
    const call = await ctx.callApp({ type: "converse", input: turn.input, sessionId: sessionA }, { timeoutMs });
    const res = okResponse(call);
    ctx.evidence(`${prefix}turn${i}`, { input: turn.input, raw: call.raw });
    if (!res) failure ??= describeCall(call);
    if (turn.expect) results.push(!!res && answerText(res).toLowerCase().includes(turn.expect.toLowerCase()));
  }
  const recalled = results.slice(1).filter(Boolean).length;
  const checks = [
    check(`${prefix}recall`, "Recalls facts from earlier turns in the same session", recalled === 2, failure ?? (recalled === 2 ? "Both facts were recalled." : `${recalled} of 2 earlier facts were recalled correctly.${results[0] ? SERVERLESS_HINT : ""}`), { codename, room }, 3),
    check(`${prefix}context`, "Handles an unrelated turn without losing context", results[0] === true, results[0] ? "Answered the unrelated question." : "Did not answer the unrelated question correctly.", undefined, 1),
  ];
  if (checkIsolation) {
    const call = await ctx.callApp({ type: "converse", input: "What is our project codename?", sessionId: sessionB }, { timeoutMs });
    const res = okResponse(call);
    const leaked = answerText(res).toLowerCase().includes(codename.toLowerCase());
    checks.push(check(`${prefix}isolation`, "Keeps sessions separate", !!res && !leaked, !res ? describeCall(call) : leaked ? "A different session could see this session's facts." : "A new session did not see the earlier session's facts.", undefined, 2));
  }
  return checks;
}

export const memoryPlugin: VerifierPlugin<z.infer<typeof memoryConfig>> = {
  id: "memory.multiturn",
  name: "Memory and context",
  category: "memory",
  description: "Runs a fresh multi-turn conversation with invented facts, checks later turns recall them, and that another session can't see them.",
  participantHint: "For `converse` tasks, keep conversation history per task.sessionId, and only for that session id.",
  configSchema: memoryConfig,
  defaultConfig: { checkIsolation: true, timeoutMs: 25000 },
  async run(ctx, config) {
    return { checks: await runMemoryCase(ctx, config.timeoutMs, config.checkIsolation) };
  },
};
