import postgres from "postgres";

/**
 * Privileged database access for the worker, the challenge services and server-only admin
 * reads. Uses DATABASE_URL (Supabase's connection string; on Vercel the transaction pooler on
 * port 6543). Browsers never get this connection; user actions go through supabase-js with the
 * user's own session, so RLS applies.
 */

export type Sql = postgres.Sql;

let shared: Sql | null = null;

export function getSql(): Sql {
  if (shared) return shared;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See docs/DEPLOYMENT.md.");
  shared = createSql(url);
  return shared;
}

export function createSql(url: string, max = Number(process.env.DATABASE_POOL_SIZE ?? 10)): Sql {
  return postgres(url, {
    max,
    // The Supabase transaction pooler doesn't support prepared statements.
    prepare: !/:6543\//.test(url),
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    types: { bigint: postgres.BigInt },
  });
}
