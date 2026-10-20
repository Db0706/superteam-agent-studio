import { InfrastructureError } from "@/core/verification/plugin";
import type { Sql } from "../db";
import type { EngineEnv } from "../env";
import { runAttempt, type AttemptResult } from "./verify";

/**
 * Durable verification queue in Postgres.
 *
 *  claim:    FOR UPDATE SKIP LOCKED, so concurrent workers never take the same job; expired
 *            leases (a crashed worker) are claimable again.
 *  complete: the result is written only if this worker still holds the lease, in the same
 *            transaction that marks the job done, so a retried or duplicated job can't
 *            overwrite a newer result.
 *  failure:  our infrastructure failing is retried with backoff; after max_tries the attempt
 *            ends as ERROR, which blocks layer finalisation until an organiser acts. It is never
 *            turned into a participant failure.
 */

const LEASE_SECONDS = 180;

export interface ClaimedJob {
  id: string;
  attempt_id: string;
  tries: number;
  max_tries: number;
}

export async function claimJob(sql: Sql, workerId: string): Promise<ClaimedJob | null> {
  const [job] = await sql<ClaimedJob[]>`
    update public.verification_jobs j set
      status = 'leased', lease_owner = ${workerId}, lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS}),
      tries = j.tries + 1, updated_at = now()
    where j.id = (
      select id from public.verification_jobs
      where (status = 'queued' and run_after <= now()) or (status = 'leased' and lease_expires_at < now())
      order by run_after, id
      limit 1
      for update skip locked
    )
    returning j.id::text as id, j.attempt_id, j.tries, j.max_tries`;
  if (!job) return null;
  await sql`update public.verification_attempts set status = 'running', started_at = coalesce(started_at, now()) where id = ${job.attempt_id} and status in ('queued', 'running')`;
  return job;
}

export async function completeJob(sql: Sql, job: ClaimedJob, workerId: string, result: AttemptResult): Promise<boolean> {
  return sql.begin(async (tx) => {
    const [held] = await tx`
      update public.verification_jobs set status = 'done', lease_expires_at = null, last_error = null, updated_at = now()
      where id = ${job.id} and lease_owner = ${workerId} and status = 'leased' returning id`;
    if (!held) return false;
    const [updated] = await tx<{ id: string; tournament_id: string; participant_id: string; layer_key: string; event_id: string; simulation: boolean }[]>`
      update public.verification_attempts a set status = ${result.status}, score = ${result.score},
        feedback = ${tx.json(result.feedback as never)}, evidence = ${tx.json(result.evidence as never)}, finished_at = now()
      from public.layer_runs r, public.tournaments t
      where a.id = ${job.attempt_id} and a.status in ('queued', 'running') and r.id = a.layer_run_id and t.id = a.tournament_id
      returning a.id, a.tournament_id, a.participant_id, r.layer_key, t.event_id, t.simulation`;
    if (!updated) return false; // reviewed or reprocessed meanwhile
    if (result.receipt) {
      await tx`
        insert into public.verification_receipts (attempt_id, tournament_id, participant_id, layer_key, payload, signature)
        values (${job.attempt_id}, ${updated.tournament_id}, ${updated.participant_id}, ${updated.layer_key}, ${tx.json(result.receipt.payload as never)}, ${result.receipt.signature})
        on conflict (attempt_id) do nothing`;
    }
    await tx`
      insert into public.activity_events (event_id, tournament_id, kind, is_public, payload)
      select ${updated.event_id}, ${updated.tournament_id}, ${`attempt.${result.status}`}, ${!updated.simulation},
             jsonb_build_object('layer', ${updated.layer_key}::text, 'name', tp.display_name, 'score', ${result.score}::numeric)
      from public.tournament_participants tp where tp.id = ${updated.participant_id}`;
    return true;
  });
}

export async function failJob(sql: Sql, job: ClaimedJob, workerId: string, error: unknown): Promise<"retry" | "dead"> {
  const message = error instanceof Error ? error.message : String(error);
  const dead = job.tries >= job.max_tries;
  await sql.begin(async (tx) => {
    const [held] = await tx`
      update public.verification_jobs set
        status = ${dead ? "dead" : "queued"}, lease_owner = null, lease_expires_at = null, last_error = ${message.slice(0, 1000)},
        run_after = now() + make_interval(secs => ${Math.min(60, 5 * 2 ** job.tries)}), updated_at = now()
      where id = ${job.id} and lease_owner = ${workerId} and status = 'leased' returning id`;
    if (!held) return;
    if (dead) {
      await tx`
        update public.verification_attempts set status = 'error', finished_at = now(),
          feedback = ${tx.json([{ id: "infrastructure", label: "Verification could not run", passed: false, message: "The verifier hit an internal problem. This does not count against you: the organisers have been alerted and will rerun or review it." }] as never)},
          evidence = jsonb_build_object('infrastructureError', ${message.slice(0, 1000)}::text)
        where id = ${job.attempt_id} and status in ('queued', 'running')`;
    } else {
      await tx`update public.verification_attempts set status = 'queued' where id = ${job.attempt_id} and status = 'running'`;
    }
  });
  return dead ? "dead" : "retry";
}

/** Claims and runs one job. Returns false when the queue was empty. */
export async function processOneJob(sql: Sql, env: EngineEnv, workerId: string, log: (msg: string, data?: Record<string, unknown>) => void = () => {}): Promise<boolean> {
  const job = await claimJob(sql, workerId);
  if (!job) return false;
  const started = Date.now();
  try {
    const result = await runAttempt(sql, env, job.attempt_id);
    const written = await completeJob(sql, job, workerId, result);
    log("attempt.verified", { attempt: job.attempt_id, status: result.status, score: result.score, ms: Date.now() - started, written });
  } catch (err) {
    // Participant-caused problems are checks, not exceptions; anything thrown is ours.
    const infra = err instanceof InfrastructureError ? err : new InfrastructureError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    const outcome = await failJob(sql, job, workerId, infra);
    log("attempt.infrastructure_error", { attempt: job.attempt_id, outcome, error: infra.message });
  }
  return true;
}
