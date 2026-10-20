import { answerTool, isToolName, type PriorCall, type SessionBehaviour, type SessionFacts } from "@/core/challenge/tools";
import type { Sql } from "../db";

/**
 * Reference challenge services: the tools and knowledge source participants' apps call during
 * verification. Mounted at /api/race/challenge/* (Next.js) and in the Node test/rehearsal server.
 *
 *   POST {base}/api/race/challenge/tools/{tool}   body: tool input JSON
 *   POST {base}/api/race/challenge/source          body: { query }   (same as tools/search_source)
 *   Authorization: Bearer <challenge token from the task>
 *
 * Every call is written to tool_invocations before the answer is sent. That table, written only
 * here, is the trusted evidence the verifier checks.
 */

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function handleChallengeRequest(req: Request, sql: Sql, pathAfterChallenge: string): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "use POST" });
  const tool = pathAfterChallenge === "source" ? "search_source" : pathAfterChallenge.replace(/^tools\//, "");
  if (!isToolName(tool)) return json(404, { error: "unknown tool" });
  const token = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return json(401, { error: "send Authorization: Bearer <challengeToken>" });
  let input: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 16_384) return json(413, { error: "input too large" });
    const parsed = text ? JSON.parse(text) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json(400, { error: "input must be a JSON object" });
    input = parsed as Record<string, unknown>;
  } catch {
    return json(400, { error: "input must be JSON" });
  }

  const result = await sql.begin(async (tx) => {
    const [session] = await tx<{ id: string; facts: SessionFacts; behaviour: SessionBehaviour; expires_at: Date }[]>`
      select id, facts, behaviour, expires_at from public.challenge_sessions where token = ${token}`;
    if (!session || session.expires_at.getTime() < Date.now()) return null;
    // Serialise calls within a session so "fail the first N calls" and ordering rules are exact.
    await tx`select pg_advisory_xact_lock(hashtext(${session.id}))`;
    const prior = await tx<PriorCall[]>`
      select tool, input, status, output from public.tool_invocations where session_id = ${session.id} order by id`;
    if (prior.length >= 200) return { answer: { status: 429, body: { error: "too many calls in this session" }, delayMs: 0 } };
    const answer = answerTool(tool, input, session.facts, session.behaviour, prior);
    await tx`
      insert into public.tool_invocations (session_id, tool, input, output, status)
      values (${session.id}, ${tool}, ${tx.json(input as never)}, ${tx.json(answer.body as never)}, ${answer.status})`;
    return { answer };
  });
  if (!result) return json(401, { error: "unknown or expired challenge token" });
  if (result.answer.delayMs) await new Promise((r) => setTimeout(r, Math.min(result.answer.delayMs, 30_000)));
  return json(result.answer.status, result.answer.body);
}
