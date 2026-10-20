import { decideLayer, type ParticipantInput } from "@/core/tournament/advancement";
import { layerSchema, tournamentConfigSchema } from "@/core/tournament/config";
import type postgres from "postgres";
import type { Sql } from "../db";

/**
 * The tournament state machine, driven from the server clock (Postgres now()).
 *
 *   tournament  scheduled → running → completed          (paused / cancelled by organisers)
 *   layer       scheduled → open → closing → finalising → closed
 *   participant registered → active → qualified | eliminated → completed
 *
 * tick() is safe to call from any number of workers, as often as you like: it takes a
 * transaction-level advisory lock (other callers skip that tick), and every UPDATE is guarded by
 * the state it expects, so repeating a tick never repeats an effect. Nothing depends on a
 * browser being open, and a late tick only delays transitions, it never changes their outcome:
 * timeliness is decided by each attempt's submitted_at, not by when the tick runs.
 */

const SCHEDULER_LOCK = 4_242_001;
/** Wait after a deadline before finalising, so attempts committed right at the deadline are seen. */
const CLOSING_GRACE_SECONDS = 3;

export interface TickReport {
  ran: boolean;
  started: number;
  opened: number;
  closing: number;
  finalising: number;
  finalised: number;
  blocked: number;
  completed: number;
}

export async function tick(
  sql: Sql,
  log: (msg: string, data?: Record<string, unknown>) => void = () => {},
  opts: { closingGraceSeconds?: number } = {},
): Promise<TickReport> {
  const grace = opts.closingGraceSeconds ?? CLOSING_GRACE_SECONDS;
  const report: TickReport = { ran: false, started: 0, opened: 0, closing: 0, finalising: 0, finalised: 0, blocked: 0, completed: 0 };
  const ran = await sql.begin(async (tx) => {
    const [{ locked }] = await tx<{ locked: boolean }[]>`select pg_try_advisory_xact_lock(${SCHEDULER_LOCK}) as locked`;
    if (!locked) return false;

    const started = await tx<{ id: string; event_id: string; simulation: boolean; name: string }[]>`
      update public.tournaments set status = 'running', started_at = now(), updated_at = now()
      where status = 'scheduled' and starts_at <= now() returning id, event_id, simulation, name`;
    for (const t of started) {
      await tx`update public.tournament_participants set state = 'active' where tournament_id = ${t.id} and state = 'registered'`;
      await tx`insert into public.activity_events (event_id, tournament_id, kind, is_public, payload) values (${t.event_id}, ${t.id}, 'tournament.started', ${!t.simulation}, ${tx.json({ name: t.name })})`;
    }
    report.started = started.length;

    const opened = await tx<{ tournament_id: string; layer_key: string; deadline_at: Date }[]>`
      update public.layer_runs r set state = 'open', opened_at = now()
      from public.tournaments t
      where t.id = r.tournament_id and t.status = 'running' and r.state = 'scheduled' and r.opens_at <= now()
      returning r.tournament_id, r.layer_key, r.deadline_at`;
    report.opened = opened.length;
    for (const o of opened) await emit(tx, o.tournament_id, "layer.opened", { layer: o.layer_key, deadline: o.deadline_at.toISOString() });

    const closing = await tx<{ tournament_id: string; layer_key: string }[]>`
      update public.layer_runs r set state = 'closing', closing_at = now()
      from public.tournaments t
      where t.id = r.tournament_id and t.status = 'running' and r.state = 'open' and r.deadline_at <= now()
      returning r.tournament_id, r.layer_key`;
    report.closing = closing.length;
    for (const c of closing) await emit(tx, c.tournament_id, "layer.closing", { layer: c.layer_key });

    const finalising = await tx`
      update public.layer_runs r set state = 'finalising', finalising_at = now()
      from public.tournaments t
      where t.id = r.tournament_id and t.status = 'running' and r.state = 'closing'
        and r.deadline_at + make_interval(secs => ${grace}) <= now()
      returning r.id`;
    report.finalising = finalising.length;
    return true;
  });
  if (!ran) return report;
  report.ran = true;

  // Finalise layers in position order, one transaction each.
  const ready = await sql<{ id: string }[]>`
    select r.id from public.layer_runs r join public.tournaments t on t.id = r.tournament_id
    where r.state = 'finalising' and t.status = 'running'
      and not exists (select 1 from public.layer_runs e where e.tournament_id = r.tournament_id and e.position < r.position and e.state <> 'closed')
    order by r.tournament_id, r.position`;
  for (const { id } of ready) {
    const outcome = await finaliseLayer(sql, id);
    if (outcome === "closed") report.finalised++;
    else if (outcome === "blocked") report.blocked++;
    log("layer.finalise", { layerRun: id, outcome });
  }

  const completed = await sql<{ id: string; event_id: string; simulation: boolean }[]>`
    update public.tournaments t set status = 'completed', completed_at = now(), updated_at = now()
    where t.status = 'running'
      and exists (select 1 from public.layer_runs r where r.tournament_id = t.id)
      and not exists (select 1 from public.layer_runs r where r.tournament_id = t.id and r.state <> 'closed')
    returning t.id, t.event_id, t.simulation`;
  for (const t of completed) {
    await sql`update public.tournament_participants set state = 'completed' where tournament_id = ${t.id} and state in ('active', 'qualified')`;
    await sql`insert into public.activity_events (event_id, tournament_id, kind, is_public, payload) values (${t.event_id}, ${t.id}, 'tournament.completed', ${!t.simulation}, '{}'::jsonb)`;
  }
  report.completed = completed.length;
  return report;
}

async function emit(tx: Sql | postgres.TransactionSql, tournamentId: string, kind: string, payload: Record<string, unknown>) {
  await tx`
    insert into public.activity_events (event_id, tournament_id, kind, is_public, payload)
    select event_id, id, ${kind}, not simulation, ${tx.json(payload as never)} from public.tournaments where id = ${tournamentId}`;
}

/** Decides one layer. Exactly once: decisions and the CLOSED state commit together. */
export async function finaliseLayer(sql: Sql, layerRunId: string): Promise<"closed" | "blocked" | "skipped"> {
  return sql.begin(async (tx) => {
    const [run] = await tx<{ id: string; tournament_id: string; layer_key: string; version: number; deadline_at: Date; state: string }[]>`
      select id, tournament_id, layer_key, version, deadline_at, state from public.layer_runs where id = ${layerRunId} for update`;
    if (!run || run.state !== "finalising") return "skipped";
    const [t] = await tx<{ event_id: string; simulation: boolean; eliminations_suspended: boolean; config: unknown }[]>`
      select t.event_id, t.simulation, t.eliminations_suspended, v.config
      from public.tournaments t join public.tournament_versions v on v.tournament_id = t.id and v.version = ${run.version}
      where t.id = ${run.tournament_id} for update of t`;
    const config = tournamentConfigSchema.parse(t.config);
    const layer = layerSchema.parse(config.layers.find((l) => l.key === run.layer_key));

    const participants = await tx<{ id: string; name: string; state: ParticipantInput["state"] }[]>`
      select id, display_name as name, state from public.tournament_participants where tournament_id = ${run.tournament_id} order by id`;
    const attempts = await tx<{ id: string; participant_id: string; status: string; score: string | null; submitted_at: Date; attempt_no: number }[]>`
      select id, participant_id, status, score, submitted_at, attempt_no from public.verification_attempts
      where layer_run_id = ${run.id} and submitted_at < ${run.deadline_at}`;
    const byParticipant = new Map<string, ParticipantInput["attempts"]>();
    for (const a of attempts) {
      const list = byParticipant.get(a.participant_id) ?? [];
      list.push({ id: a.id, status: a.status as never, score: a.score === null ? null : Number(a.score), submittedAt: a.submitted_at.toISOString(), attemptNo: a.attempt_no });
      byParticipant.set(a.participant_id, list);
    }

    const result = decideLayer({
      config,
      layer,
      eliminationsSuspended: t.eliminations_suspended,
      participants: participants.map((p) => ({ ...p, attempts: byParticipant.get(p.id) ?? [] })),
    });

    if (result.status === "blocked") {
      // Tell organisers once per minute at most; nobody is decided until this is resolved.
      await tx`
        insert into public.activity_events (event_id, tournament_id, kind, is_public, payload)
        select ${t.event_id}, ${run.tournament_id}, 'layer.waiting', false, ${tx.json({ layer: run.layer_key, waitingOn: result.waitingOn } as never)}
        where not exists (
          select 1 from public.activity_events where tournament_id = ${run.tournament_id} and kind = 'layer.waiting'
            and payload ->> 'layer' = ${run.layer_key} and created_at > now() - interval '1 minute')`;
      return "blocked";
    }

    let qualified = 0;
    let eliminated = 0;
    for (const d of result.decisions) {
      const [inserted] = await tx<{ id: string }[]>`
        insert into public.advancement_decisions (tournament_id, layer_run_id, participant_id, decision, reason, best_attempt_id, score, rank)
        values (${run.tournament_id}, ${run.id}, ${d.participantId}, ${d.decision}, ${d.reason}, ${d.bestAttemptId}, ${d.score}, ${d.rank})
        on conflict (layer_run_id, participant_id) do nothing returning id`;
      if (!inserted) continue; // already decided (reprocessing after an override)
      if (d.decision === "eliminated") {
        eliminated++;
        await tx`update public.tournament_participants set state = 'eliminated', eliminated_layer_key = ${run.layer_key}, eliminated_at = now() where id = ${d.participantId} and state in ('active', 'qualified')`;
      } else if (d.decision === "qualified") {
        qualified++;
        await tx`update public.tournament_participants set state = 'qualified' where id = ${d.participantId} and state = 'active'`;
      }
      if ((d.decision === "qualified" || d.decision === "checkpoint_passed") && layer.achievement) {
        await tx`insert into public.achievements (tournament_id, participant_id, layer_key, title) values (${run.tournament_id}, ${d.participantId}, ${run.layer_key}, ${layer.achievement.title}) on conflict do nothing`;
      }
      const name = participants.find((p) => p.id === d.participantId)?.name ?? "";
      await tx`insert into public.activity_events (event_id, tournament_id, kind, is_public, payload) values (${t.event_id}, ${run.tournament_id}, ${`participant.${d.decision}`}, ${!t.simulation}, ${tx.json({ layer: run.layer_key, title: layer.title, name, rank: d.rank } as never)})`;
    }
    await tx`update public.layer_runs set state = 'closed', closed_at = now() where id = ${run.id}`;
    await tx`insert into public.activity_events (event_id, tournament_id, kind, is_public, payload) values (${t.event_id}, ${run.tournament_id}, 'layer.closed', ${!t.simulation}, ${tx.json({ layer: run.layer_key, title: layer.title, qualified, eliminated, decided: result.decisions.length } as never)})`;
    return "closed";
  });
}

