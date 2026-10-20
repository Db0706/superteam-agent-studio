import type { NextRequest } from "next/server";
import { handleFixture, isFixtureVariant } from "@/server/fixtures/reference-app";

/**
 * Fixture apps for rehearsals (no AI model: deterministic reference implementations and
 * deliberately broken variants). Served only when FIXTURES_ENABLED=true.
 */
async function handle(request: NextRequest, ctx: RouteContext<"/api/race/fixtures/[variant]/[...path]">) {
  if (process.env.FIXTURES_ENABLED !== "true") return Response.json({ error: "fixtures are disabled" }, { status: 404 });
  const { variant, path } = await ctx.params;
  if (!isFixtureVariant(variant)) return Response.json({ error: "unknown fixture" }, { status: 404 });
  return handleFixture(request, variant, `/${path.join("/")}`, null);
}

export const GET = handle;
export const POST = handle;
