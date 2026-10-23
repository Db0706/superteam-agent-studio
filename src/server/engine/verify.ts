import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { TOOL_CATALOGUE, type ToolName } from "@/core/challenge/tools";
import { layerSchema, type LayerConfig } from "@/core/tournament/config";
import { getVerifier } from "@/core/verification/catalogue";
import { InfrastructureError, scoreChecks, type AppCall, type CheckResult, type VerifierContext } from "@/core/verification/plugin";
import { HEALTH_PATH, healthResponseSchema, PROTOCOL, TASKS_PATH, taskResponseSchema, type TaskRequest } from "@/core/verification/protocol";
import { signReceipt, type ReceiptPayload } from "@/core/verification/receipts";
import { seededRng } from "@/core/verification/rng";
import { isFailure, safeFetch } from "@/core/verification/safe-fetch";
import type { Sql } from "../db";
import type { EngineEnv } from "../env";

/**
 * Runs one verification attempt end to end and returns the result to persist.
 * Does not write the attempt row itself: the job runner does that atomically with the job,
 * so a worker that lost its lease can never overwrite a newer result.
 */

export interface AttemptRow {
  id: string;
  tournament_id: string;
  layer_run_id: string;
  participant_id: string;
  attempt_no: number;
  version: number;
  submitted_at: Date;
  endpoint_url: string;
}

export interface AttemptResult {
  status: "passed" | "failed" | "review_required";
  score: number;
  feedback: { id: string; label: string; passed: boolean; message: string }[];
  evidence: Record<string, unknown>;
  receipt: { payload: ReceiptPayload; signature: string } | null;
}

const truncate = (s: string, n = 4000) => (s.length > n ? `${s.slice(0, n)}…[truncated]` : s);

/** Verifier token for fixture apps in rehearsals (they have no project row). */
export function fixtureToken(participantId: string, secret: string): string {
  return createHmac("sha256", secret).update(`fixture:${participantId}`).digest("hex").slice(0, 48);
}

export async function loadAttemptContext(sql: Sql, attemptId: string) {
  const [row] = await sql<
    (AttemptRow & { layer_key: string; config: { layers: unknown[] }; verifier_token: string | null; fixture_endpoint: string | null })[]
  >`
    select a.id, a.tournament_id, a.layer_run_id, a.participant_id, a.attempt_no, a.version, a.submitted_at, a.endpoint_url,
           r.layer_key, v.config, pr.verifier_token, tp.fixture_endpoint
    from public.verification_attempts a
    join public.layer_runs r on r.id = a.layer_run_id
    join public.tournament_versions v on v.tournament_id = a.tournament_id and v.version = a.version
    join public.tournament_participants tp on tp.id = a.participant_id
    left join public.projects pr on pr.team_id = tp.team_id
    where a.id = ${attemptId}`;
  if (!row) throw new InfrastructureError(`attempt ${attemptId} not found`);
  const rawLayer = (row.config.layers as { key: string }[]).find((l) => l.key === row.layer_key);
  const layer = layerSchema.parse(rawLayer);
  return { row, layer };
}

export async function runAttempt(sql: Sql, env: EngineEnv, attemptId: string): Promise<AttemptResult> {
  const { row, layer } = await loadAttemptContext(sql, attemptId);
  const plugin = getVerifier(layer.verifier.plugin);
  if (!plugin) throw new InfrastructureError(`unknown verifier ${layer.verifier.plugin}`);
  const pluginConfig = plugin.configSchema.parse(layer.verifier.config ?? {});
  const token = row.fixture_endpoint ? fixtureToken(row.participant_id, env.fixtureSecret) : (row.verifier_token ?? "");
  const base = row.endpoint_url.replace(/\/+$/, "");
  const evidence: Record<string, unknown> = { plugin: plugin.id, endpoint: base, startedAt: new Date().toISOString() };
  const sessions: string[] = [];

  const ctx: VerifierContext = {
    attempt: { id: row.id, layerKey: layer.key, number: row.attempt_no },
    rng: seededRng(row.id, env.seedSecret),
    async callApp(task, opts) {
      const nonce = randomBytes(16).toString("hex");
      const body: TaskRequest = { protocol: PROTOCOL, nonce, attempt: { id: row.id, layer: layer.key, number: row.attempt_no }, task };
      const res = await safeFetch(`${base}${TASKS_PATH}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${token}`, "x-agent-studio-protocol": PROTOCOL, "x-agent-studio-nonce": nonce },
        timeoutMs: opts?.timeoutMs ?? 20_000,
        allowPrivate: env.allowPrivateTargets,
      });
      if (isFailure(res)) return { response: null, httpStatus: null, failure: res.message, nonce, nonceEchoed: false, elapsedMs: res.elapsedMs, raw: "" } satisfies AppCall;
      if (res.status >= 300 && res.status < 400) {
        return { response: null, httpStatus: res.status, failure: `The app redirected (HTTP ${res.status}); the verifier does not follow redirects. Use the final URL.`, nonce, nonceEchoed: false, elapsedMs: res.elapsedMs, raw: "" };
      }
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(res.bodyText);
      } catch {
        /* not JSON */
      }
      const envelope = taskResponseSchema.safeParse(parsed);
      const response = envelope.success ? envelope.data : null;
      return { response, httpStatus: res.status, failure: res.truncated ? "The response was larger than 256 KB." : null, nonce, nonceEchoed: !!response && response.nonce === nonce, elapsedMs: res.elapsedMs, raw: truncate(res.bodyText, 2000) };
    },
    async checkHealth() {
      const res = await safeFetch(`${base}${HEALTH_PATH}`, { headers: { authorization: `Bearer ${token}` }, timeoutMs: 8000, allowPrivate: env.allowPrivateTargets });
      if (isFailure(res)) return { ok: false, message: res.message, elapsedMs: res.elapsedMs };
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(res.bodyText);
      } catch {
        /* not JSON */
      }
      const h = healthResponseSchema.safeParse(parsed);
      const ok = res.status === 200 && h.success && h.data.status === "ready";
      return { ok, message: ok ? "Health endpoint is ready." : `GET ${HEALTH_PATH} must return 200 with { "protocol": "asrp/1", "status": "ready" } (got HTTP ${res.status}).`, elapsedMs: res.elapsedMs };
    },
    async createSession(kind, facts, behaviour = {}) {
      const sessionToken = randomBytes(24).toString("base64url");
      try {
        const [s] = await sql<{ id: string }[]>`
          insert into public.challenge_sessions (attempt_id, token, kind, facts, behaviour, expires_at)
          values (${row.id}, ${sessionToken}, ${kind}, ${sql.json(facts as never)}, ${sql.json(behaviour as never)}, now() + interval '20 minutes')
          returning id`;
        sessions.push(s.id);
        return {
          id: s.id,
          token: sessionToken,
          sourceUrl: `${env.challengeBaseUrl}/api/race/challenge/source`,
          tools: (names: string[]) =>
            names.map((name) => {
              const def = TOOL_CATALOGUE[name as ToolName];
              return { name, description: def.description, url: `${env.challengeBaseUrl}/api/race/challenge/tools/${name}`, inputSchema: def.inputSchema };
            }),
        };
      } catch (err) {
        throw new InfrastructureError(`could not create challenge session: ${(err as Error).message}`);
      }
    },
    async invocations(sessionId) {
      try {
        const rows = await sql<{ tool: string; input: Record<string, unknown>; output: unknown; status: number; received_at: Date }[]>`
          select tool, input, output, status, received_at from public.tool_invocations where session_id = ${sessionId} order by id`;
        return rows.map((r) => ({ tool: r.tool, input: r.input, output: r.output, status: r.status, receivedAt: r.received_at.toISOString() }));
      } catch (err) {
        throw new InfrastructureError(`could not read tool invocations: ${(err as Error).message}`);
      }
    },
    async raw(method, path, body, timeoutMs) {
      const res = await safeFetch(`${base}${path}`, { method, body, headers: { authorization: `Bearer ${token}` }, timeoutMs, allowPrivate: env.allowPrivateTargets });
      if (isFailure(res)) return { status: null, body: "", failure: res.message };
      return { status: res.status, body: res.bodyText, failure: null };
    },
    evidence(key, value) {
      evidence[key] = value;
    },
  };

  const outcome = await plugin.run(ctx, pluginConfig as never);
  const checks: CheckResult[] = outcome.checks;
  const score = scoreChecks(checks);
  evidence.checks = checks;
  evidence.finishedAt = new Date().toISOString();
  evidence.sessions = sessions;
  const status: AttemptResult["status"] = outcome.reviewReason ? "review_required" : checks.length > 0 && score >= layer.passingScore ? "passed" : "failed";
  if (outcome.reviewReason) evidence.reviewReason = outcome.reviewReason;

  const feedback = toFeedback(checks, layer);
  let receipt: AttemptResult["receipt"] = null;
  if (status === "passed") {
    const payload: ReceiptPayload = {
      v: 1,
      receiptId: randomUUID(),
      tournamentId: row.tournament_id,
      configVersion: row.version,
      layerKey: layer.key,
      participantId: row.participant_id,
      attemptId: row.id,
      attemptNo: row.attempt_no,
      submittedAt: row.submitted_at.toISOString(),
      verifiedAt: new Date().toISOString(),
      score,
      status: "passed",
      checks: checks.map((c) => ({ id: c.id, passed: c.passed })),
    };
    receipt = { payload, signature: signReceipt(payload, env.receiptKey) };
  }
  return { status, score, feedback, evidence, receipt };
}

export function toFeedback(checks: CheckResult[], layer: Pick<LayerConfig, "feedback">): AttemptResult["feedback"] {
  return checks
    .filter((c) => c.weight > 0 || !c.passed)
    .map((c) => ({
      id: c.id,
      label: layer.feedback.showCheckNames ? c.label : "Check",
      passed: c.passed,
      message: layer.feedback.showDetails ? c.message : c.passed ? "Passed." : "Did not pass.",
    }));
}
