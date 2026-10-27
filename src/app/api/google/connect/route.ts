import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { authUrl, googleConfigured } from "@/server/google/client";
import { getActiveEvent, getViewer, hasRole } from "@/server/dal/viewer";

/** GET /api/google/connect → Google's consent screen (organisers only). */
export async function GET(request: Request) {
  const back = new URL("/admin/judging", request.url);
  if (!googleConfigured()) return Response.redirect(`${back}?google=not-configured`, 303);
  const event = await getActiveEvent();
  const viewer = event ? await getViewer(event.id) : null;
  if (!event || !hasRole(viewer, "organiser")) return Response.redirect(new URL("/login?next=/admin/judging", request.url), 303);
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("google_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/google", maxAge: 600 });
  return Response.redirect(authUrl(new URL("/api/google/callback", request.url).toString(), state), 303);
}
