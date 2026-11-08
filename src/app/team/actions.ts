"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { HEALTH_PATH, healthResponseSchema } from "@/core/verification/protocol";
import { isFailure, safeFetch } from "@/core/verification/safe-fetch";
import { callRpc, type ActionResult } from "@/server/actions/rpc";
import { getActiveEvent } from "@/server/dal/viewer";

/** Same rule as the worker: private targets only in local development with the flag set. */
const allowPrivateTargets = () => process.env.VERIFIER_ALLOW_PRIVATE_TARGETS === "true" && process.env.NODE_ENV !== "production";

const teamName = z.string().trim().min(2, "Team names need at least 2 characters.").max(60, "Keep the team name under 60 characters.");

export async function createTeam(_: unknown, form: FormData): Promise<ActionResult<string>> {
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No active event." };
  const name = teamName.safeParse(form.get("name"));
  if (!name.success) return { ok: false, error: name.error.issues[0].message };
  const track = form.get("track") === "policy" ? "policy" : "build";
  const r = await callRpc<string>("create_team", { p_event: event.id, p_name: name.data, p_track: track });
  if (r.ok) refresh();
  return r;
}

export async function joinTeam(_: unknown, form: FormData): Promise<ActionResult<string>> {
  const code = String(form.get("code") ?? "").trim();
  if (code.length < 6) return { ok: false, error: "Paste the full invite code from your captain." };
  const r = await callRpc<string>("join_team", { p_code: code });
  if (r.ok) refresh();
  return r;
}

export async function createInvite(teamId: string): Promise<ActionResult<string>> {
  return callRpc<string>("create_team_invite", { p_team: teamId });
}

export async function leaveTeam(teamId: string): Promise<ActionResult<null>> {
  const r = await callRpc<null>("leave_team", { p_team: teamId });
  if (r.ok) refresh();
  return r;
}

const url = z.union([z.literal(""), z.url({ protocol: /^https?$/, message: "Enter a full URL, like https://my-app.vercel.app" })]);

export async function saveProject(teamId: string, _: unknown, form: FormData): Promise<ActionResult<null>> {
  const fields = z
    .object({ name: z.string().trim().max(80), repo: url, demo: url, endpoint: url })
    .safeParse({ name: form.get("name") ?? "", repo: form.get("repo") ?? "", demo: form.get("demo") ?? "", endpoint: form.get("endpoint") ?? "" });
  if (!fields.success) return { ok: false, error: fields.error.issues[0].message };
  const local = localAddressHint(fields.data.endpoint);
  if (local) return { ok: false, error: local };
  const r = await callRpc<null>("update_project", { p_team: teamId, p_name: fields.data.name, p_repo: fields.data.repo, p_demo: fields.data.demo, p_endpoint: fields.data.endpoint });
  if (r.ok) refresh();
  return r;
}

/** The verifier runs on our servers, so an address that only works on the team's laptop can never pass. */
function localAddressHint(endpoint: string | null | undefined): string | null {
  if (!endpoint || allowPrivateTargets()) return null;
  let host = "";
  try {
    host = new URL(endpoint).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return null;
  }
  const local = host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0.0.0.0" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith(".local");
  return local
    ? "That address only works on your laptop, so the race can't reach it. Use a public https address: deploy your app (for example to Vercel), or run a tunnel such as `npx cloudflared tunnel --url http://localhost:3000` (use the port your app printed) and paste the https address it prints."
    : null;
}

export async function saveWallet(teamId: string, _: unknown, form: FormData): Promise<ActionResult<null>> {
  const wallet = String(form.get("wallet") ?? "").trim();
  if (wallet && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) return { ok: false, error: "That isn't a Solana address. Paste your wallet's public address (32 to 44 letters and numbers)." };
  const r = await callRpc<null>("set_project_wallet", { p_team: teamId, p_wallet: wallet });
  if (r.ok) refresh();
  return r;
}

export async function revealToken(teamId: string): Promise<ActionResult<string>> {
  return callRpc<string>("project_verifier_token", { p_team: teamId });
}

export async function rotateToken(teamId: string): Promise<ActionResult<string>> {
  return callRpc<string>("rotate_verifier_token", { p_team: teamId });
}

/**
 * Calls the team's app the way the verifier will: same safe client, same token, same health
 * contract. Only team members get a token back, so only they can run this for their app.
 */
export async function testConnection(teamId: string, endpoint: string): Promise<ActionResult<{ ok: boolean; message: string; ms: number }>> {
  const token = await callRpc<string>("project_verifier_token", { p_team: teamId });
  if (!token.ok) return token;
  const base = endpoint.trim().replace(/\/+$/, "");
  if (!base) return { ok: false, error: "Save your app's URL first." };
  const local = localAddressHint(base);
  if (local) return { ok: false, error: local };
  const res = await safeFetch(`${base}${HEALTH_PATH}`, { headers: { authorization: `Bearer ${token.data}` }, timeoutMs: 8000, allowPrivate: allowPrivateTargets() });
  if (isFailure(res)) return { ok: true, data: { ok: false, message: res.message, ms: res.elapsedMs } };
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(res.bodyText);
  } catch {
    /* not JSON */
  }
  const health = healthResponseSchema.safeParse(parsed);
  const ready = res.status === 200 && health.success && health.data.status === "ready";
  return {
    ok: true,
    data: {
      ok: ready,
      ms: res.elapsedMs,
      message: ready
        ? `Connected. ${health.data.name ? `Your app says it is "${health.data.name}". ` : ""}The verifier can reach it.`
        : res.status >= 300 && res.status < 400
          ? `Your app redirected (HTTP ${res.status}). The verifier does not follow redirects, so use the final URL.`
          : `Reached your app, but GET ${HEALTH_PATH} returned HTTP ${res.status} without { "protocol": "asrp/1", "status": "ready" }.`,
    },
  };
}

export async function joinWithCode(_: unknown, form: FormData): Promise<ActionResult<null>> {
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No active event." };
  const code = String(form.get("code") ?? "").trim();
  if (code.length < 4) return { ok: false, error: "Type the event code shown on the screen in the room." };
  const university = z.enum(["cambridge", "oxford", "other"]).safeParse(form.get("university"));
  if (!university.success) return { ok: false, error: "Choose Cambridge, Oxford or Other." };
  const r = await callRpc<null>("join_with_code", { p_event: event.id, p_code: code, p_university: university.data });
  if (r.ok) refresh();
  return r;
}
