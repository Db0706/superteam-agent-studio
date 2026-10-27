import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventSlug, rpc, rpcError, signedInUser, startHarness, type Harness } from "./harness";

/** The Google Sheets connection: organiser-only, and the encrypted token never readable from the table. */
let h: Harness;
let eventId: string;
let organiser: SupabaseClient;
let stranger: SupabaseClient;

beforeAll(async () => {
  h = await startHarness({ scope: "google" });
  const [ev] = await h.sql<{ id: string }[]>`
    insert into public.events (slug, name, short_name, status, starts_at, details)
    values (${eventSlug(h)}, 'Google Event', 'Google', 'published', now(), '{}') returning id`;
  eventId = ev.id;
  const org = await signedInUser(h, "organiser");
  await h.sql`insert into public.event_roles (event_id, user_id, role) values (${eventId}, ${org.id}, 'organiser')`;
  organiser = org.client;
  stranger = (await signedInUser(h, "stranger")).client;
});

afterAll(async () => {
  await h?.close();
});

describe("google connection", () => {
  it("only organisers save, read, update and clear it", async () => {
    expect(await rpcError(stranger, "google_connection_save", { p_event: eventId, p_email: "x@y.z", p_token_enc: "enc" })).toBeTruthy();
    await rpc(organiser, "google_connection_save", { p_event: eventId, p_email: " Org@Example.com ", p_token_enc: "enc-1" });
    await rpc(organiser, "google_sheet_set", { p_event: eventId, p_id: "sheet-1", p_url: "https://docs.google.com/x" });
    expect(await rpc(organiser, "google_connection_get", { p_event: eventId })).toEqual([{ google_email: "org@example.com", refresh_token_enc: "enc-1", spreadsheet_id: "sheet-1", spreadsheet_url: "https://docs.google.com/x" }]);
    expect(await rpcError(stranger, "google_connection_get", { p_event: eventId })).toBeTruthy();
    const { data } = await stranger.from("google_connections").select("*");
    expect(data ?? []).toHaveLength(0);
    await rpc(organiser, "google_connection_clear", { p_event: eventId });
    expect(await rpc(organiser, "google_connection_get", { p_event: eventId })).toEqual([]);
  });
});
