import type { NextRequest } from "next/server";
import { getSql } from "@/server/db";
import { devnetPayerFromEnv } from "@/server/fixtures/devnet-payer";
import { type FixtureMemory, handleFixture, isFixtureVariant } from "@/server/fixtures/reference-app";

// Serverless: successive turns can reach different instances, so history lives in the database
// (as a participant's app would keep it in Redis or similar).
const dbMemory: FixtureMemory = {
  async get(key) {
    const [row] = await getSql()<{ history: string[] }[]>`select history from public.fixture_memory where key = ${key}`;
    return row?.history ?? [];
  },
  async set(key, history) {
    await getSql()`insert into public.fixture_memory (key, history) values (${key}, ${getSql().json(history)})
      on conflict (key) do update set history = excluded.history, updated_at = now()`;
  },
};

/**
 * Fixture apps for rehearsals (no AI model: deterministic reference implementations and
 * deliberately broken variants). Served only when FIXTURES_ENABLED=true.
 */
async function handle(request: NextRequest, ctx: RouteContext<"/api/race/fixtures/[variant]/[...path]">) {
  if (process.env.FIXTURES_ENABLED !== "true") return Response.json({ error: "fixtures are disabled" }, { status: 404 });
  const { variant, path } = await ctx.params;
  if (!isFixtureVariant(variant)) return Response.json({ error: "unknown fixture" }, { status: 404 });
  return handleFixture(request, variant, `/${path.join("/")}`, null, dbMemory, devnetPayerFromEnv());
}

export const GET = handle;
export const POST = handle;
