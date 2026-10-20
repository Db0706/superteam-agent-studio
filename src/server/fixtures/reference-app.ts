import { HEALTH_PATH, PROTOCOL, TASKS_PATH, taskRequestSchema, type TaskRequest } from "@/core/verification/protocol";

/**
 * Fixture apps for rehearsals and automated tests. NOT AI: they solve the built-in layers
 * deterministically by parsing the verifier's task text, so organisers can rehearse a whole
 * tournament without real teams, and tests can prove the verifier passes and fails for real
 * reasons. Every variant goes through exactly the same verification as a participant's app.
 *
 *   reference      implements every layer correctly
 *   no-envelope    answers in plain text (fails from layer 1)
 *   fabricator     invents tool results instead of calling tools (fails from layer 3)
 *   no-memory      stateless conversations (fails from layer 5)
 *   leaky-memory   one memory shared by every session (fails layer 5's isolation check)
 *   fragile        no retries and no timeouts (fails layer 6)
 *   overspender    ignores the spending limit (fails layer 7)
 *   offline        health check fails and tasks error (fails everything)
 *
 * Mounted at /api/race/fixtures/{variant} when FIXTURES_ENABLED=true, and in the test server.
 */

export const FIXTURE_VARIANTS = ["reference", "no-envelope", "fabricator", "no-memory", "leaky-memory", "fragile", "overspender", "offline"] as const;
export type FixtureVariant = (typeof FIXTURE_VARIANTS)[number];
export const isFixtureVariant = (v: string): v is FixtureVariant => (FIXTURE_VARIANTS as readonly string[]).includes(v);

const memories = new Map<string, string[]>();
const SHARED = "__shared__";

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

class UpstreamError extends Error {
  constructor(public code: "upstream_unavailable" | "upstream_timeout", message: string) {
    super(message);
  }
}

export async function handleFixture(req: Request, variant: FixtureVariant, path: string, expectedToken: string | null): Promise<Response> {
  if (expectedToken && req.headers.get("authorization") !== `Bearer ${expectedToken}`) return reply(401, { protocol: PROTOCOL, status: "error", error: { code: "unauthorized", message: "unknown caller" } });
  if (path === HEALTH_PATH) {
    if (variant === "offline") return reply(503, { error: "down" });
    return reply(200, { protocol: PROTOCOL, status: "ready", name: `fixture:${variant}`, capabilities: ["fixture", "no-ai-model"] });
  }
  if (path !== TASKS_PATH || req.method !== "POST") return reply(404, { error: "not found" });
  if (variant === "offline") return reply(500, { error: "internal" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply(400, { protocol: PROTOCOL, status: "error", error: { code: "invalid_input", message: "body must be JSON" } });
  }
  const parsed = taskRequestSchema.safeParse(body);
  if (!parsed.success) return reply(400, { protocol: PROTOCOL, status: "error", error: { code: "invalid_input", message: "not an ASRP/1 task" } });
  const request = parsed.data;
  const error = (status: number, code: string, message: string) => reply(status, { protocol: PROTOCOL, nonce: request.nonce, status: "error", error: { code, message } });
  try {
    const output = await solve(request, variant);
    if (output === "invalid") return error(400, "invalid_input", "the task is missing required input");
    if (variant === "no-envelope") return new Response(output.text ?? JSON.stringify(output.data), { status: 200, headers: { "content-type": "text/plain" } });
    return reply(200, { protocol: PROTOCOL, nonce: request.nonce, status: "ok", output, meta: { model: "fixture (no AI model)" } });
  } catch (err) {
    if (err instanceof UpstreamError) return error(err.code === "upstream_timeout" ? 504 : 503, err.code, err.message);
    return error(500, "internal", err instanceof Error ? err.message : "failed");
  }
}

type Output = { text?: string; data?: unknown; toolResults?: { tool: string; result: unknown }[] };

async function solve(req: TaskRequest, variant: FixtureVariant): Promise<Output | "invalid"> {
  const { task } = req;
  const input = typeof task.input === "string" ? task.input : "";
  const tools = new Map((task.tools ?? []).map((t) => [t.name, t.url]));
  const timeoutMs = task.limits?.timeoutMs ?? 20_000;
  const results: { tool: string; result: unknown }[] = [];

  const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const url = tools.get(name);
    if (!url) throw new Error(`no tool ${name}`);
    const tries = variant === "fragile" ? 1 : 4;
    for (let attempt = 1; attempt <= tries; attempt++) {
      const controller = new AbortController();
      const timer = variant === "fragile" ? null : setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${task.challengeToken}` }, body: JSON.stringify(args), signal: controller.signal });
      } catch {
        throw new UpstreamError("upstream_timeout", `${name} did not answer within ${timeoutMs}ms`);
      } finally {
        if (timer) clearTimeout(timer);
      }
      const json = (await res.json()) as Record<string, unknown>;
      if (res.status === 503) {
        if (attempt === tries) throw new UpstreamError("upstream_unavailable", `${name} is unavailable`);
        await new Promise((r) => setTimeout(r, 50 * attempt));
        continue;
      }
      results.push({ tool: name, result: json });
      return { ...json, _status: res.status };
    }
    throw new UpstreamError("upstream_unavailable", `${name} is unavailable`);
  };

  switch (task.type) {
    case "respond": {
      const sum = /What is (\d+) plus (\d+)/.exec(input);
      if (sum) return { text: String(Number(sum[1]) + Number(sum[2])) };
      const word = /word "([^"]+)"/.exec(input);
      return { text: word ? word[1].toUpperCase() : "I don't know." };
    }
    case "extract": {
      if (!input || !task.schema) return "invalid";
      // The task is an instruction, a blank line, then the text itself.
      return { data: extractPerson(input.split("\n\n").at(-1) ?? input) };
    }
    case "use_tools": {
      if (!task.tools?.length || !input) return "invalid";
      if (/exchange rate from USD to GBP/.test(input)) {
        const r = await call("exchange_rate", { from: "USD", to: "GBP" });
        return { data: { rate: r.rate }, toolResults: results };
      }
      if (/Look up record slow/.test(input)) {
        const r = await call("lookup_record", { id: "slow" });
        return { data: { amount: r.amount }, toolResults: results };
      }
      const ids = input.match(/rec-[0-9a-f]{10}/g) ?? [];
      if (variant === "fabricator") return { data: { totalGbp: 1000 }, toolResults: ids.map((id) => ({ tool: "lookup_record", result: { id, amount: 500 } })) };
      const records = [];
      for (const id of ids) records.push(await call("lookup_record", { id }));
      const currency = String(records[0]?.currency ?? "USD");
      const rate = Number((await call("exchange_rate", { from: currency, to: "GBP" })).rate);
      const total = records.reduce((a, r) => a + Number(r.amount), 0);
      return { data: { totalGbp: Math.round(total * rate * 100) / 100 }, toolResults: results };
    }
    case "answer_from_source": {
      const subject = /for the (.+?) project/.exec(input)?.[1] ?? input;
      const found = (await call("search_source", { query: subject })) as { results?: { id: string; title: string; text: string }[] };
      const doc = found.results?.find((d) => d.title.toLowerCase().includes(subject.toLowerCase()));
      const code = doc ? /access code is ([a-z]+-\d+)/.exec(doc.text)?.[1] : undefined;
      return { data: { answer: code ?? null, sourceIds: doc ? [doc.id] : [] }, toolResults: results };
    }
    case "converse": {
      const key = variant === "leaky-memory" ? SHARED : (task.sessionId ?? "default");
      const history = variant === "no-memory" ? [] : (memories.get(key) ?? []);
      history.push(input);
      if (variant !== "no-memory") memories.set(key, history.slice(-50));
      const all = history.join("\n");
      if (/capital of Japan/i.test(input)) return { text: "Tokyo." };
      if (/codename/i.test(input) && /\?/.test(input)) {
        const m = /codename is ([a-z]+-\d+)/i.exec(all);
        return { text: m ? `Your project codename is ${m[1]}.` : "I don't know your codename yet." };
      }
      if (/which room/i.test(input)) {
        const m = /demo is in (room \d+)/i.exec(all);
        return { text: m ? `Your demo is in ${m[1]}.` : "I don't know which room." };
      }
      return { text: "Noted." };
    }
    case "run_workflow": {
      const m = /We need (\d+) × (\S+) and (\d+) × (\S+)\. .*\$(\d+)/.exec(input);
      if (!m) return "invalid";
      const budget = Number(m[5]);
      const orders = [];
      for (const [qty, sku] of [[Number(m[1]), m[2]], [Number(m[3]), m[4]]] as const) {
        await call("check_inventory", { sku });
        const quote = await call("create_quote", { sku, quantity: qty });
        if (Number(quote.totalUsd) > budget && variant !== "overspender") {
          orders.push({ sku, quantity: qty, status: "refused" });
          continue;
        }
        const order = await call("place_order", { quoteId: quote.quoteId });
        orders.push(order._status === 200 ? { sku, quantity: qty, status: "placed", orderId: order.orderId } : { sku, quantity: qty, status: "refused" });
      }
      return { data: { orders }, toolResults: results };
    }
  }
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function extractPerson(text: string): Record<string, unknown> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = /(\d{4}-\d{2}-\d{2})/.exec(text)?.[1];
  const dmy = /(\d{1,2}) ([A-Z][a-z]+) (\d{4})/.exec(text);
  const mdy = /([A-Z][a-z]+) (\d{1,2}), (\d{4})/.exec(text);
  const date = iso ?? (dmy ? `${dmy[3]}-${pad(MONTHS.indexOf(dmy[2].toLowerCase()) + 1)}-${pad(Number(dmy[1]))}` : mdy ? `${mdy[3]}-${pad(MONTHS.indexOf(mdy[1].toLowerCase()) + 1)}-${pad(Number(mdy[2]))}` : "");
  const name = /^([A-Z][a-zá-ú]+ [A-Z][a-z]+),/.exec(text)?.[1] ?? /employed ([A-Z][a-zá-ú]+ [A-Z][a-z]+)/.exec(text)?.[1] ?? /Name: ([^.]+)\./.exec(text)?.[1] ?? "";
  const age = Number(/, (\d{2}),/.exec(text)?.[1] ?? /aged (\d{2})/.exec(text)?.[1] ?? /Age (\d{2})/.exec(text)?.[1] ?? 0);
  const org = /the ([A-Z][^,.]+?) (?:as a|has employed)/.exec(text)?.[1] ?? /at ([A-Z][^.]+)\. Name/.exec(text)?.[1] ?? "";
  const role = /as a ([a-z ]+) on/.exec(text)?.[1] ?? /role of ([a-z ]+)\./.exec(text)?.[1] ?? /starter: ([a-z ]+) at/.exec(text)?.[1] ?? "";
  return { name, age, organisation: org, role, startDate: date };
}
