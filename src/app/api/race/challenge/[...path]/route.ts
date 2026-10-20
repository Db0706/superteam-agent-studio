import type { NextRequest } from "next/server";
import { handleChallengeRequest } from "@/server/challenge/service";
import { getSql } from "@/server/db";

/**
 * Reference challenge services (tools and knowledge source) called by participants' apps during
 * verification. Every call is recorded server-side; that record is the verification evidence.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/race/challenge/[...path]">) {
  const { path } = await ctx.params;
  if (!process.env.DATABASE_URL) return Response.json({ error: "challenge services are not configured" }, { status: 503 });
  return handleChallengeRequest(request, getSql(), path.join("/"));
}
