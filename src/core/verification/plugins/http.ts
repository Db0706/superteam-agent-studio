import { z } from "zod";
import { validateJson, type JsonSchema } from "../json-schema";
import { check, type CheckResult, type VerifierPlugin } from "../plugin";

/**
 * Generic HTTP/API contract checks, configured entirely by the organiser (no code):
 * method, path, body, expected status, response schema, required text. Values can use
 * {{nonce}} and {{int:min:max}} placeholders, filled freshly for every attempt.
 */
const caseSchema = z.object({
  name: z.string().min(1).max(80),
  method: z.enum(["GET", "POST"]).default("GET"),
  path: z.string().regex(/^\/[^\s]*$/, "Paths start with /"),
  body: z.unknown().optional(),
  expectStatus: z.number().int().min(100).max(599).default(200),
  expectSchema: z.record(z.string(), z.unknown()).optional(),
  expectContains: z.string().max(200).optional(),
  hidden: z.boolean().default(false),
  weight: z.number().min(0).max(10).default(1),
});

const httpConfig = z.object({ cases: z.array(caseSchema).min(1).max(30), timeoutMs: z.number().int().min(1000).max(60000).default(15000) });

export const httpPlugin: VerifierPlugin<z.infer<typeof httpConfig>> = {
  id: "http.contract",
  name: "API contract",
  category: "api",
  description: "Calls the app's API with configured requests and checks status codes, response schemas and contents. Mark cases hidden to keep their details from participants.",
  participantHint: "Implement the API described in the layer instructions.",
  configSchema: httpConfig,
  defaultConfig: { cases: [{ name: "Health", method: "GET", path: "/agent-studio/v1/health", expectStatus: 200, hidden: false, weight: 1 }], timeoutMs: 15000 },
  async run(ctx, config) {
    const checks: CheckResult[] = [];
    const fill = (v: unknown, nonce: string): unknown => {
      if (typeof v === "string") return v.replace(/\{\{nonce\}\}/g, nonce).replace(/\{\{int:(\d+):(\d+)\}\}/g, (_m, a, b) => String(ctx.rng.int(Number(a), Number(b))));
      if (Array.isArray(v)) return v.map((x) => fill(x, nonce));
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, nonce)]));
      return v;
    };
    for (const [i, c] of config.cases.entries()) {
      const nonce = ctx.rng.id("n");
      const res = await ctx.raw(c.method, String(fill(c.path, nonce)), c.body === undefined ? undefined : JSON.stringify(fill(c.body, nonce)), config.timeoutMs);
      const problems: string[] = [];
      if (res.failure) problems.push(res.failure);
      else {
        if (res.status !== c.expectStatus) problems.push(`expected HTTP ${c.expectStatus}, got ${res.status}`);
        if (c.expectSchema) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(res.body);
            problems.push(...validateJson(parsed, c.expectSchema as JsonSchema).slice(0, 3));
          } catch {
            problems.push("response was not JSON");
          }
        }
        if (c.expectContains && !res.body.includes(String(fill(c.expectContains, nonce)))) problems.push("response did not contain the expected value");
      }
      ctx.evidence(`case${i}`, { case: c, status: res.status, body: res.body.slice(0, 2000) });
      const label = c.hidden ? `Hidden test ${i + 1}` : c.name;
      checks.push(check(`case${i}`, label, problems.length === 0, problems.length === 0 ? "Passed." : c.hidden ? "A hidden test failed." : problems.join("; "), { problems }, c.weight));
    }
    return { checks };
  },
};
