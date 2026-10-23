import { z } from "zod";
import { check, type CheckResult, type VerifierContext, type VerifierPlugin } from "../plugin";
import { answerText, describeCall, normalise, okResponse, WORDS } from "./shared";

/** Layer 3 (Tool Calling): the answer needs real tool calls, recorded by the tool service. */
const toolsConfig = z.object({ timeoutMs: z.number().int().min(2000).max(90000).default(45000) });

export async function runToolCase(ctx: VerifierContext, timeoutMs: number, prefix = "", behaviour: Record<string, unknown> = {}): Promise<{ checks: CheckResult[]; answered: boolean }> {
  const ids = [ctx.rng.id("rec"), ctx.rng.id("rec")];
  const amounts = [ctx.rng.int(120, 980), ctx.rng.int(120, 980)];
  const currency = ctx.rng.pick(["USD", "EUR", "JPY"] as const);
  const rate = Math.round((currency === "JPY" ? 0.0053 + ctx.rng.next() * 0.001 : 0.75 + ctx.rng.next() * 0.2) * 10_000) / 10_000;
  const session = await ctx.createSession(
    "tools",
    {
      records: Object.fromEntries(ids.map((id, i) => [id, { amount: amounts[i], currency, label: `invoice ${i + 1}` }])),
      rates: { [`${currency}:GBP`]: rate },
    },
    behaviour,
  );
  const expected = Math.round((amounts[0] + amounts[1]) * rate * 100) / 100;
  const call = await ctx.callApp(
    {
      type: "use_tools",
      input: `Look up records ${ids[0]} and ${ids[1]} with lookup_record. Add their amounts (both in the same currency) and convert the total to GBP with exchange_rate. Return { "totalGbp": number } in output.data.`,
      tools: session.tools(["lookup_record", "exchange_rate"]),
      challengeToken: session.token,
      schema: { type: "object", required: ["totalGbp"], properties: { totalGbp: { type: "number" } } },
    },
    { timeoutMs },
  );
  const calls = await ctx.invocations(session.id);
  const res = okResponse(call);
  ctx.evidence(`${prefix}tools`, { ids, amounts, currency, rate, expected, calls, raw: call.raw, ms: call.elapsedMs });
  const looked = ids.filter((id) => calls.some((c) => c.tool === "lookup_record" && c.status === 200 && c.input.id === id)).length;
  const rated = calls.some((c) => c.tool === "exchange_rate" && c.status === 200);
  const data = res?.output.data as { totalGbp?: unknown } | undefined;
  const correct = typeof data?.totalGbp === "number" && Math.abs(data.totalGbp - expected) <= 0.02;
  const claims = res?.output.toolResults ?? [];
  const fabricated = claims.filter((cl) => !calls.some((c) => c.tool === cl.tool && c.status === 200)).length;
  const checks = [
    check(`${prefix}lookups`, "Called lookup_record for both records (recorded by the tool service)", looked === 2, looked === 2 ? "Both lookups were recorded." : `Expected two successful lookup_record calls, the tool service recorded ${looked}.`, undefined, 2),
    check(`${prefix}rate`, "Called exchange_rate (recorded by the tool service)", rated, rated ? "Exchange rate call recorded." : "No successful exchange_rate call was recorded for this attempt.", undefined, 1),
    check(`${prefix}result`, "Used the tool results to compute the answer", !!res && correct, !res ? describeCall(call) : correct ? "The total matched the tool data." : "output.data.totalGbp did not match the total from the tool results.", { expected, got: data?.totalGbp }, 2),
    check(`${prefix}honest`, "Reported tool results match what the tools returned", fabricated === 0, fabricated === 0 ? "No unrecorded tool results were claimed." : `${fabricated} reported tool result(s) had no matching recorded call.`, undefined, 1),
  ];
  return { checks, answered: !!res && correct };
}

export const toolsPlugin: VerifierPlugin<z.infer<typeof toolsConfig>> = {
  id: "tools.invoke",
  name: "Tool calling",
  category: "tools",
  description: "Gives the app two reference tools with hidden per-attempt data. Passes only if the tool service records real calls and the answer uses their results.",
  participantHint: "For a `use_tools` task, call each tool URL in task.tools with POST JSON and `Authorization: Bearer <task.challengeToken>`, then answer from the results.",
  configSchema: toolsConfig,
  defaultConfig: { timeoutMs: 45000 },
  async run(ctx, config) {
    return { checks: (await runToolCase(ctx, config.timeoutMs)).checks };
  },
};

/** Layer 4 (External Knowledge): answers that need the data source, and abstaining when it doesn't know. */
const knowledgeConfig = z.object({ questions: z.number().int().min(1).max(5).default(2), includeUnanswerable: z.boolean().default(true), timeoutMs: z.number().int().min(2000).max(90000).default(45000) });

const SUBJECTS = ["telescope array", "seed bank", "flood model", "language corpus", "gene panel", "battery trial"] as const;

export const knowledgePlugin: VerifierPlugin<z.infer<typeof knowledgeConfig>> = {
  id: "knowledge.source",
  name: "External knowledge",
  category: "knowledge",
  description: "Gives the app a controlled knowledge source with fresh, invented facts. Checks answers come from it, cite it, and that the app says it doesn't know when the source has no answer.",
  participantHint: "For an `answer_from_source` task, search the source (tool search_source) and return { answer, sourceIds } in output.data. If the source has no answer, return answer: null.",
  configSchema: knowledgeConfig,
  defaultConfig: { questions: 2, includeUnanswerable: true, timeoutMs: 45000 },
  async run(ctx, config) {
    const subjects = ctx.rng.shuffle(SUBJECTS).slice(0, config.questions + 2);
    const docs = subjects.map((subject, i) => {
      const code = ctx.rng.pick(WORDS) + "-" + ctx.rng.int(100, 999);
      return { id: `doc-${i + 1}-${ctx.rng.int(1000, 9999)}`, title: `The ${subject} project`, text: `Internal note: the ${subject} project's access code is ${code}. It is run from building ${ctx.rng.int(2, 40)}.`, keywords: subject.split(" "), subject, code };
    });
    // The service only gets the public document fields; subject and code stay with the verifier.
    const session = await ctx.createSession("knowledge", { documents: docs.map((d) => ({ id: d.id, title: d.title, text: d.text, keywords: d.keywords })) });
    const checks: CheckResult[] = [];
    let correct = 0;
    let cited = 0;
    const asked = docs.slice(0, config.questions);
    for (const [i, doc] of asked.entries()) {
      const call = await ctx.callApp(
        { type: "answer_from_source", input: `What is the access code for the ${doc.subject} project?`, tools: session.tools(["search_source"]), challengeToken: session.token, source: { url: session.sourceUrl, description: "Project notes" } },
        { timeoutMs: config.timeoutMs },
      );
      const res = okResponse(call);
      const data = res?.output.data as { answer?: unknown; sourceIds?: unknown } | undefined;
      const text = typeof data?.answer === "string" ? data.answer : answerText(res);
      ctx.evidence(`q${i}`, { doc: doc.id, code: doc.code, raw: call.raw });
      if (text.includes(doc.code)) correct++;
      if (Array.isArray(data?.sourceIds) && data.sourceIds.includes(doc.id)) cited++;
      if (!res) checks.push(check(`q${i}call`, "Question answered", false, describeCall(call), undefined, 0));
    }
    const searched = (await ctx.invocations(session.id)).filter((c) => c.tool === "search_source" && c.status === 200).length;
    checks.push(check("searched", "Searched the knowledge source (recorded by the service)", searched >= asked.length, searched >= asked.length ? "Searches were recorded." : `Expected at least ${asked.length} searches, ${searched} were recorded.`, undefined, 1));
    checks.push(check("correct", "Answers come from the source", correct === asked.length, `${correct} of ${asked.length} answers contained the fact from the source.`, undefined, 2));
    checks.push(check("cited", "Cites the source document", cited === asked.length, `${cited} of ${asked.length} answers cited the right document id in sourceIds.`, undefined, 1));
    if (config.includeUnanswerable) {
      const missing = ctx.rng.pick(["observatory", "orchard survey", "ferry timetable"] as const);
      const call = await ctx.callApp(
        { type: "answer_from_source", input: `What is the access code for the ${missing} project?`, tools: session.tools(["search_source"]), challengeToken: session.token, source: { url: session.sourceUrl, description: "Project notes" } },
        { timeoutMs: config.timeoutMs },
      );
      const res = okResponse(call);
      const data = res?.output.data as { answer?: unknown } | undefined;
      const invented = docs.some((d) => answerText(res).includes(d.code));
      const abstained = !!res && (data?.answer === null || (!invented && /not (found|known|available)|no (answer|information|record)|unknown|don.?t know|cannot find/i.test(normalise(answerText(res)))));
      checks.push(check("abstain", "Says it doesn't know when the source has no answer", abstained, abstained ? "Correctly abstained." : invented ? "Answered with a code from a different document." : "Did not return answer: null for a question the source can't answer.", undefined, 2));
    }
    return { checks };
  },
};
