import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { canonicalJson, parseTournamentConfig, type TournamentConfig } from "@/core/tournament/config";
import { createSql, type Sql } from "@/server/db";
import { processOneJob } from "@/server/engine/jobs";
import { tick } from "@/server/engine/scheduler";
import type { EngineEnv } from "@/server/env";
import { startHost } from "@/server/http-host";
import { createHash } from "node:crypto";

/**
 * Test harness against the real local Supabase stack: real Postgres (with the migrations, RLS and
 * functions), real Supabase Auth users, real HTTP to fixture apps through the real verifier.
 * Time is accelerated by moving layer windows in the database, never by mocking the clock.
 */

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI sets env directly */
}

export const API_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54621";
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
export const DB_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54622/postgres";

export const TEST_DOMAIN = "race.test";

export interface Harness {
  sql: Sql;
  env: EngineEnv;
  host: { url: string; close: () => Promise<void> };
  admin: SupabaseClient;
  anon: SupabaseClient;
  close(): Promise<void>;
}

export async function startHarness(): Promise<Harness> {
  const sql = createSql(DB_URL, 20);
  await cleanDatabase(sql);
  const host = await startHost({ sql, fixtures: true });
  const env: EngineEnv = {
    challengeBaseUrl: host.url,
    receiptKey: "test-receipt-key-0123456789",
    seedSecret: "test-seed-secret-0123456789",
    allowPrivateTargets: true,
    fixtureSecret: "test-fixture-secret-0123456789",
  };
  const admin = createClient(API_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    sql,
    env,
    host,
    admin,
    anon,
    async close() {
      await host.close();
      await sql.end({ timeout: 5 });
    },
  };
}

export async function cleanDatabase(sql: Sql) {
  await sql`truncate public.events, public.audit_logs, public.worker_heartbeats, public.platform_admins cascade`;
  await sql`delete from auth.users where email like ${"%@" + TEST_DOMAIN}`;
}

/** Creates a confirmed user and returns a client signed in as them. */
export async function signedInUser(h: Harness, name: string): Promise<{ id: string; email: string; client: SupabaseClient }> {
  const email = `${name}@${TEST_DOMAIN}`;
  const password = `pw-${name}-0123456789`;
  const { data, error } = await h.admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name } });
  if (error) throw error;
  const client = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client };
}

/** Calls an RPC and throws its message on error. */
export async function rpc<T = unknown>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export async function rpcError(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<string> {
  const { error } = await client.rpc(fn, args);
  if (!error) throw new Error(`${fn} unexpectedly succeeded`);
  return error.message;
}

export function configHash(cfg: TournamentConfig): string {
  return createHash("sha256").update(canonicalJson(cfg)).digest("hex");
}

export function validated(cfg: unknown): TournamentConfig {
  const r = parseTournamentConfig(cfg);
  if (!r.ok) throw new Error(`invalid config: ${JSON.stringify(r.issues)}`);
  return r.config;
}

/** Runs verification jobs until the queue is empty, with N concurrent workers. */
export async function drainJobs(h: Harness, workers = 4): Promise<number> {
  let processed = 0;
  await Promise.all(
    Array.from({ length: workers }, async (_, i) => {
      while (await processOneJob(h.sql, h.env, `test-worker-${i}`)) processed++;
    }),
  );
  return processed;
}

/** Accelerated time: close the current layer now and open the next one immediately. */
export async function endLayer(h: Harness, tournamentId: string, layerKey: string) {
  const [run] = await h.sql<{ position: number }[]>`
    update public.layer_runs set deadline_at = clock_timestamp(), opens_at = least(opens_at, now() - interval '1 hour')
    where tournament_id = ${tournamentId} and layer_key = ${layerKey} returning position`;
  await h.sql`
    update public.layer_runs set opens_at = now() - interval '1 second', deadline_at = now() + interval '1 hour'
    where tournament_id = ${tournamentId} and position = ${run.position + 1}`;
}

// Grace 0: the harness only ends a layer after its own submissions have committed.
export const runTick = (h: Harness) => tick(h.sql, undefined, { closingGraceSeconds: 0 });
