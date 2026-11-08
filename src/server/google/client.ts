import "server-only";

/**
 * Minimal Google OAuth + REST helpers (no SDK). Scope is drive.file: the app can only see and
 * change files it created itself, never the rest of the organiser's Drive.
 */
export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.file"];

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_TOKEN_KEY);
}

export function authUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", ...body }),
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; id_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new GoogleError(json.error === "invalid_grant" ? "Google access has expired or was removed. Connect Google again." : `Google sign-in failed: ${json.error_description ?? json.error ?? res.status}`);
  return json;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const t = await tokenRequest({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  if (!t.refresh_token) throw new GoogleError("Google didn't grant offline access. Remove the app at myaccount.google.com/permissions and connect again.");
  const payload = t.id_token ? JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString("utf8")) : {};
  return { accessToken: t.access_token!, refreshToken: t.refresh_token, email: String(payload.email ?? "") };
}

export async function accessToken(refreshToken: string): Promise<string> {
  return (await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" })).access_token!;
}

export class GoogleError extends Error {}

/** Calls a Google REST API and turns failures into readable messages. */
export async function google<T>(token: string, url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
    if (res.status === 404) throw new GoogleError("The judging sheet can't be found. It may have been deleted; create a new one.");
    if (res.status === 403) throw new GoogleError(`Google refused: ${msg}`);
    throw new GoogleError(`Google error: ${msg}`);
  }
  return json as T;
}
