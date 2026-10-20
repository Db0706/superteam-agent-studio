/**
 * Agent Studio verification worker. Runs the tournament scheduler and the verification queue.
 * Deploy on Railway (or any always-on Node host); run as many replicas as you like:
 * the scheduler takes an advisory lock and jobs are claimed with SKIP LOCKED.
 *
 *   npm run worker            (reads .env.local in development)
 *
 * Env: DATABASE_URL, CHALLENGE_BASE_URL, RECEIPT_SIGNING_KEY, VERIFIER_SEED_SECRET,
 *      FIXTURE_SECRET, WORKER_CONCURRENCY (default 8). See docs/ENVIRONMENT.md.
 */
import { hostname } from "node:os";
import { createSql } from "../src/server/db";
import { processOneJob } from "../src/server/engine/jobs";
import { tick } from "../src/server/engine/scheduler";
import { engineEnv } from "../src/server/env";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* production: env comes from the host */
}

const VERSION = "2.0.0";
const workerId = `${hostname()}:${process.pid}`;
const concurrency = Math.max(1, Math.min(64, Number(process.env.WORKER_CONCURRENCY ?? 8)));
const env = engineEnv();
const sql = createSql(process.env.DATABASE_URL ?? "", concurrency + 4);

const log = (msg: string, data: Record<string, unknown> = {}) => console.log(JSON.stringify({ t: new Date().toISOString(), worker: workerId, msg, ...data }));
let stopping = false;

async function schedulerLoop() {
  while (!stopping) {
    try {
      const r = await tick(sql, log);
      if (r.started || r.opened || r.closing || r.finalising || r.finalised || r.completed) log("scheduler.tick", { ...r });
    } catch (err) {
      log("scheduler.error", { error: (err as Error).message });
    }
    await sleep(1000);
  }
}

async function jobLoop(slot: number) {
  while (!stopping) {
    try {
      const worked = await processOneJob(sql, env, `${workerId}#${slot}`, log);
      if (!worked) await sleep(400 + Math.random() * 300);
    } catch (err) {
      log("jobs.error", { slot, error: (err as Error).message });
      await sleep(2000);
    }
  }
}

async function heartbeatLoop() {
  while (!stopping) {
    try {
      const [q] = await sql<{ queued: number; leased: number }[]>`
        select count(*) filter (where status = 'queued')::int as queued, count(*) filter (where status = 'leased')::int as leased from public.verification_jobs`;
      await sql`
        insert into public.worker_heartbeats (worker_id, kind, version, last_seen, info)
        values (${workerId}, 'verifier', ${VERSION}, now(), ${sql.json({ concurrency, ...q })})
        on conflict (worker_id) do update set last_seen = now(), info = excluded.info, version = excluded.version`;
    } catch (err) {
      log("heartbeat.error", { error: (err as Error).message });
    }
    await sleep(5000);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log("worker.stopping", { signal });
    stopping = true;
    // Leases on in-flight jobs expire and other workers pick them up.
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

log("worker.started", { version: VERSION, concurrency, challengeBaseUrl: env.challengeBaseUrl, allowPrivateTargets: env.allowPrivateTargets });
void schedulerLoop();
void heartbeatLoop();
for (let i = 0; i < concurrency; i++) void jobLoop(i);
