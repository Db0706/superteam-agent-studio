import { z } from "zod";
import { validateJson, type JsonSchema } from "../json-schema";
import { check, type CheckResult, type VerifierContext, type VerifierPlugin } from "../plugin";
import { answerText, containsNumber, describeCall, FIRST_NAMES, LAST_NAMES, normalise, okResponse, ORGS, pad, ROLES, WORDS } from "./shared";

/** Layer 1 (First Intelligence): the app answers fresh requests in the ASRP/1 envelope. */
const respondConfig = z.object({ cases: z.number().int().min(1).max(5).default(2), timeoutMs: z.number().int().min(2000).max(60000).default(20000) });

export const respondPlugin: VerifierPlugin<z.infer<typeof respondConfig>> = {
  id: "ai.respond",
  name: "AI responds",
  category: "ai",
  description: "Checks the app is reachable, answers fresh questions with correct answers, and uses the ASRP/1 envelope.",
  participantHint: "Expose /agent-studio/v1/health and /agent-studio/v1/tasks. For a `respond` task, answer `task.input` and put the answer in output.text.",
  configSchema: respondConfig,
  defaultConfig: { cases: 2, timeoutMs: 20000 },
  async run(ctx, config) {
    const checks: CheckResult[] = [];
    const health = await ctx.checkHealth();
    checks.push(check("health", "Health endpoint answers", health.ok, health.message, undefined, 1));
    let envelopes = 0;
    for (let i = 0; i < config.cases; i++) {
      const kind = i % 2 === 0 ? "sum" : "word";
      const a = ctx.rng.int(12, 97);
      const b = ctx.rng.int(12, 97);
      const word = ctx.rng.pick(WORDS);
      const question = kind === "sum" ? `What is ${a} plus ${b}? Answer with the number.` : `Reply with the word "${word}" written in capital letters.`;
      const call = await ctx.callApp({ type: "respond", input: question }, { timeoutMs: config.timeoutMs });
      const res = okResponse(call);
      ctx.evidence(`case${i}`, { question, status: call.httpStatus, ms: call.elapsedMs, raw: call.raw });
      if (res) envelopes++;
      const text = answerText(res);
      const correct = kind === "sum" ? containsNumber(text, a + b, 0) : text.includes(word.toUpperCase());
      checks.push(
        check(
          `answer${i}`,
          `Answers a fresh ${kind === "sum" ? "arithmetic" : "instruction"} question correctly`,
          !!res && correct,
          !res ? describeCall(call) : correct ? "Correct answer." : "The answer was not correct for the question asked.",
          { question, expected: kind === "sum" ? a + b : word.toUpperCase(), got: text.slice(0, 300) },
          2,
        ),
      );
    }
    checks.splice(1, 0, check("envelope", "Responses use the ASRP/1 envelope and echo the nonce", envelopes === config.cases, envelopes === config.cases ? "Every response used the envelope." : `${config.cases - envelopes} of ${config.cases} responses were not valid envelopes.`, undefined, 1));
    return { checks };
  },
};

/** Layer 2 (Structured Outputs): validated JSON that matches a schema, on held-out inputs. */
const PERSON_SCHEMA: JsonSchema = {
  type: "object",
  required: ["name", "age", "organisation", "role", "startDate"],
  additionalProperties: false,
  properties: {
    name: { type: "string", minLength: 3 },
    age: { type: "integer", minimum: 16, maximum: 100 },
    organisation: { type: "string" },
    role: { type: "string" },
    startDate: { type: "string", format: "date" },
  },
};

const structuredConfig = z.object({ cases: z.number().int().min(1).max(8).default(3), includeMalformed: z.boolean().default(true), timeoutMs: z.number().int().min(2000).max(60000).default(25000) });

export function personCase(ctx: VerifierContext) {
  const name = `${ctx.rng.pick(FIRST_NAMES)} ${ctx.rng.pick(LAST_NAMES)}`;
  const age = ctx.rng.int(22, 64);
  const org = ctx.rng.pick(ORGS);
  const role = ctx.rng.pick(ROLES);
  const startDate = `20${ctx.rng.int(18, 26)}-${pad(ctx.rng.int(1, 12))}-${pad(ctx.rng.int(1, 28))}`;
  const [y, m, d] = startDate.split("-").map(Number);
  const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1];
  const templates = [
    `${name}, ${age}, joined the ${org} as a ${role} on ${d} ${month} ${y}.`,
    `Since ${month} ${d}, ${y}, the ${org} has employed ${name} (aged ${age}) in the role of ${role}.`,
    `New starter: ${role} at ${org}. Name: ${name}. Age ${age}. First day ${startDate}.`,
  ];
  return { text: ctx.rng.pick(templates), expected: { name, age, organisation: org, role, startDate } };
}

export async function runStructuredCases(ctx: VerifierContext, cases: number, timeoutMs: number, prefix = ""): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  let schemaOk = 0;
  let valuesOk = 0;
  const messages: string[] = [];
  for (let i = 0; i < cases; i++) {
    const c = personCase(ctx);
    const call = await ctx.callApp(
      { type: "extract", input: `Extract the person described in this text as JSON matching the schema.\n\n${c.text}`, schema: PERSON_SCHEMA as Record<string, unknown> },
      { timeoutMs },
    );
    const res = okResponse(call);
    ctx.evidence(`${prefix}extract${i}`, { text: c.text, expected: c.expected, raw: call.raw, ms: call.elapsedMs });
    if (!res) {
      messages.push(describeCall(call));
      continue;
    }
    const problems = validateJson(res.output.data, PERSON_SCHEMA);
    if (problems.length) {
      messages.push(`Schema: ${problems.slice(0, 3).join("; ")}`);
      continue;
    }
    schemaOk++;
    const got = res.output.data as Record<string, unknown>;
    const wrong = (["name", "age", "organisation", "role", "startDate"] as const).filter((k) =>
      k === "age" ? got.age !== c.expected.age : !normalise(String(got[k])).includes(normalise(String(c.expected[k]))),
    );
    if (wrong.length) messages.push(`Wrong value for ${wrong.join(", ")} on a held-out input.`);
    else valuesOk++;
  }
  checks.push(check(`${prefix}schema`, "Output is JSON matching the schema", schemaOk === cases, schemaOk === cases ? `All ${cases} outputs matched the schema.` : `${schemaOk} of ${cases} matched. ${messages[0] ?? ""}`, { messages }, 2));
  checks.push(check(`${prefix}values`, "Extracted values are correct on held-out inputs", valuesOk === cases, valuesOk === cases ? "All values were correct." : `${valuesOk} of ${cases} were fully correct.`, { messages }, 2));
  return checks;
}

export const structuredPlugin: VerifierPlugin<z.infer<typeof structuredConfig>> = {
  id: "ai.structured",
  name: "Structured outputs",
  category: "ai",
  description: "Sends held-out texts and checks the app returns JSON that matches the given schema with the right values, and rejects malformed requests cleanly.",
  participantHint: "For an `extract` task, return output.data as JSON that matches task.schema. If the request is malformed, answer 400 with status \"error\" and code \"invalid_input\".",
  configSchema: structuredConfig,
  defaultConfig: { cases: 3, includeMalformed: true, timeoutMs: 25000 },
  async run(ctx, config) {
    const checks = await runStructuredCases(ctx, config.cases, config.timeoutMs);
    if (config.includeMalformed) {
      const call = await ctx.callApp({ type: "extract", input: "" }, { timeoutMs: config.timeoutMs });
      const r = call.response;
      const handled = !!r && r.status === "error" && r.error.code === "invalid_input" && call.httpStatus !== null && call.httpStatus >= 400 && call.httpStatus < 500;
      ctx.evidence("malformed", { status: call.httpStatus, raw: call.raw });
      checks.push(
        check("malformed", "Rejects a malformed request with invalid_input", handled, handled ? "Malformed request rejected correctly." : `Expected HTTP 4xx with error code invalid_input for an extract task with no input and no schema. ${call.failure ?? (r ? `Got HTTP ${call.httpStatus} status ${r.status}.` : `Got HTTP ${call.httpStatus}.`)}`, undefined, 1),
      );
    }
    return { checks };
  },
};
