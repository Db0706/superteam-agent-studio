import { cookies } from "next/headers";
import { callRpc } from "@/server/actions/rpc";
import { exchangeCode, GoogleError } from "@/server/google/client";
import { encrypt } from "@/server/google/crypto";
import { getActiveEvent, getViewer, hasRole } from "@/server/dal/viewer";

/** GET /api/google/callback: Google sends the organiser back here with a one-time code. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (status: string) => Response.redirect(new URL(`/admin/judging?google=${status}`, request.url), 303);
  const jar = await cookies();
  const expected = jar.get("google_oauth_state")?.value;
  jar.delete({ name: "google_oauth_state", path: "/api/google" });
  if (url.searchParams.get("error")) return back("cancelled");
  if (!expected || url.searchParams.get("state") !== expected) return back("expired");
  const event = await getActiveEvent();
  const viewer = event ? await getViewer(event.id) : null;
  if (!event || !hasRole(viewer, "organiser")) return back("not-organiser");
  try {
    const t = await exchangeCode(url.searchParams.get("code") ?? "", new URL("/api/google/callback", request.url).toString());
    const saved = await callRpc("google_connection_save", { p_event: event.id, p_email: t.email, p_token_enc: encrypt(t.refreshToken) });
    return back(saved.ok ? "connected" : "failed");
  } catch (err) {
    console.error("Google connect failed:", err instanceof GoogleError ? err.message : err);
    return back("failed");
  }
}
