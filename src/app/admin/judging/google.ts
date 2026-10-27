"use server";

import { refresh } from "next/cache";
import { parseTab, PLACES, type SheetResult, type SheetSubmission, type Track } from "@/core/judging/sheet";
import type { RubricCriterion } from "@/core/judging/results";
import { createSupabaseServer } from "@/lib/supabase/server";
import { callRpc, type ActionResult } from "@/server/actions/rpc";
import { getActiveEvent } from "@/server/dal/viewer";
import { accessToken, GoogleError } from "@/server/google/client";
import { decrypt } from "@/server/google/crypto";
import { createJudgingSheet, readTabs, shareWith } from "@/server/google/sheets";

const TRACKS: Track[] = ["build", "policy"];
const UNI: Record<string, string> = { cambridge: "Cambridge", oxford: "Oxford", mixed: "Mixed", other: "Other" };

async function connection() {
  const event = await getActiveEvent();
  if (!event) throw new GoogleError("No active event.");
  const r = await callRpc<{ google_email: string; refresh_token_enc: string; spreadsheet_id: string | null; spreadsheet_url: string | null }[]>("google_connection_get", { p_event: event.id });
  if (!r.ok) throw new GoogleError(r.error);
  const c = r.data?.[0];
  if (!c) throw new GoogleError("Connect Google first.");
  return { event, c, token: await accessToken(decrypt(c.refresh_token_enc)) };
}

const fail = (err: unknown): { ok: false; error: string } => ({ ok: false, error: err instanceof GoogleError ? err.message : "Something went wrong talking to Google. Try again." });

/** Final submissions per track, with team, university, members and links, in the order judges see them. */
async function sheetData(eventId: string) {
  const s = await createSupabaseServer();
  const [{ data: rubrics }, { data: subs }, { data: members }, { data: board }] = await Promise.all([
    s.from("judging_rubrics").select("track, criteria").eq("event_id", eventId),
    s.from("submissions").select("id, track, title, fields, team_id, teams(name)").eq("event_id", eventId).eq("status", "submitted").order("submitted_at"),
    s.rpc("public_team_members", { p_event: eventId }),
    s.rpc("event_leaderboard", { p_event: eventId }),
  ]);
  const membersOf = new Map(((members ?? []) as { team_id: string; members: string[] }[]).map((m) => [m.team_id, m.members ?? []]));
  const uniOf = new Map(((board ?? []) as { team_id: string; university: string }[]).map((b) => [b.team_id, b.university]));
  return TRACKS.map((track) => ({
    track,
    criteria: ((rubrics ?? []).find((r) => r.track === track)?.criteria ?? []) as RubricCriterion[],
    submissions: (subs ?? [])
      .filter((x) => x.track === track)
      .map((x): SheetSubmission => {
        const f = (x.fields ?? {}) as Record<string, string>;
        return {
          id: x.id,
          project: x.title,
          team: (x.teams as unknown as { name: string } | null)?.name ?? "",
          university: UNI[uniOf.get(x.team_id) ?? ""] ?? "",
          members: membersOf.get(x.team_id) ?? [],
          links: [f.repo, f.demo, f.document].filter(Boolean),
        };
      }),
  }));
}

export async function disconnectGoogle(): Promise<ActionResult<null>> {
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No active event." };
  const r = await callRpc<null>("google_connection_clear", { p_event: event.id });
  if (r.ok) refresh();
  return r;
}

/** Creates the judging sheet in the organiser's Drive and shares it with every judge. */
export async function createSheet(): Promise<ActionResult<{ url: string; shared: number; failed: string[] }>> {
  try {
    const { event, token } = await connection();
    const tracks = (await sheetData(event.id)).filter((t) => t.submissions.length);
    if (!tracks.length) return { ok: false, error: "There are no final submissions to judge yet." };
    const { id, url } = await createJudgingSheet(token, `${event.name}: judging`, tracks);
    const saved = await callRpc("google_sheet_set", { p_event: event.id, p_id: id, p_url: url });
    if (!saved.ok) return saved;
    const s = await createSupabaseServer();
    const { data: roles } = await s.from("event_roles").select("user_id").eq("event_id", event.id).eq("role", "judge");
    const ids = (roles ?? []).map((r) => r.user_id);
    const { data: profiles } = ids.length ? await s.from("profiles").select("email").in("id", ids) : { data: [] };
    const emails = [...new Set((profiles ?? []).map((p) => String(p.email).toLowerCase()).filter(Boolean))];
    const failed = await shareWith(token, id, emails, `Judging sheet for ${event.name}. Score each project, agree a Place (${PLACES.join(", ")}), and the organisers will publish the winners from it.`);
    refresh();
    return { ok: true, data: { url, shared: emails.length - failed.length, failed } };
  } catch (err) {
    return fail(err);
  }
}

export interface SyncPreview {
  tracks: { track: Track; results: SheetResult[]; problems: string[] }[];
}

/** Reads the sheet back and returns what would be published. Changes nothing. */
export async function previewSheet(): Promise<ActionResult<SyncPreview>> {
  try {
    const { event, c, token } = await connection();
    if (!c.spreadsheet_id) return { ok: false, error: "Create the judging sheet first." };
    const data = await sheetData(event.id);
    const values = await readTabs(token, c.spreadsheet_id, TRACKS);
    return {
      ok: true,
      data: {
        tracks: data
          .filter((t) => t.submissions.length)
          .map((t) => ({ track: t.track, ...parseTab(t.criteria, values[t.track], new Set(t.submissions.map((x) => x.id))) })),
      },
    };
  } catch (err) {
    return fail(err);
  }
}

/** Publishes the places from the sheet: sets each Winner / Runner-up / Honourable mention, and clears places the sheet leaves empty. */
export async function publishFromSheet(): Promise<ActionResult<{ published: number; cleared: number }>> {
  const preview = await previewSheet();
  if (!preview.ok) return preview;
  const blocking = preview.data.tracks.flatMap((t) => t.problems.filter((p) => /more than one project|header row/.test(p)));
  if (blocking.length) return { ok: false, error: blocking[0] };
  const event = await getActiveEvent();
  if (!event) return { ok: false, error: "No active event." };
  let published = 0;
  let cleared = 0;
  const s = await createSupabaseServer();
  const { data: current } = await s.from("winners").select("track, place, submission_id").eq("event_id", event.id);
  for (const t of preview.data.tracks) {
    // Clear every place that changes first, so swapping two projects doesn't trip the one-place-per-project rule.
    for (const w of (current ?? []).filter((x) => x.track === t.track && x.place <= 3)) {
      const pick = t.results.find((r) => r.place === w.place);
      if (pick?.submissionId === w.submission_id) continue;
      const r = await callRpc("unpublish_winner", { p_event: event.id, p_track: t.track, p_place: w.place });
      if (!r.ok) return r;
      if (!pick) cleared++;
    }
    for (const place of [1, 2, 3]) {
      const pick = t.results.find((r) => r.place === place);
      if (!pick) continue;
      const r = await callRpc("publish_winner", { p_event: event.id, p_track: t.track, p_submission: pick.submissionId, p_place: place, p_title: PLACES[place - 1] });
      if (!r.ok) return { ok: false, error: `${pick.project}: ${r.error}` };
      published++;
    }
  }
  refresh();
  return { ok: true, data: { published, cleared } };
}
