import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { eventSlug, rpc, rpcError, signedInUser, startHarness, type Harness } from "./harness";

/** Joining with the event code shown in the room, for events without an imported guest list. */

let h: Harness;
let eventId: string;
let organiser: SupabaseClient;

beforeAll(async () => {
  h = await startHarness({ scope: "joincode" });
  const [ev] = await h.sql<{ id: string }[]>`
    insert into public.events (slug, name, short_name, status, starts_at, details)
    values (${eventSlug(h)}, 'Join Code Event', 'Join Code', 'published', now(), '{}') returning id`;
  eventId = ev.id;
  const org = await signedInUser(h, "organiser");
  await h.sql`insert into public.event_roles (event_id, user_id, role) values (${eventId}, ${org.id}, 'organiser')`;
  organiser = org.client;
});

afterAll(async () => {
  await h?.close();
});

describe("event join code", () => {
  it("only organisers set or read the code, and it isn't readable from the table", async () => {
    const stranger = await signedInUser(h, "stranger");
    expect(await rpcError(stranger.client, "set_join_code", { p_event: eventId, p_code: "HACKME" })).toBeTruthy();
    expect(await rpcError(organiser, "set_join_code", { p_event: eventId, p_code: "no" })).toMatch(/4 to 20/);
    await rpc(organiser, "set_join_code", { p_event: eventId, p_code: " oxbridge26 " });
    expect(await rpc(organiser, "event_join_code", { p_event: eventId })).toBe("OXBRIDGE26");
    expect(await rpcError(stranger.client, "event_join_code", { p_event: eventId })).toBeTruthy();
    const { data } = await stranger.client.from("event_join_codes").select("code");
    expect(data ?? []).toHaveLength(0);
  });

  it("a wrong code is refused; the right one makes a participant who can create a team", async () => {
    const carol = await signedInUser(h, "carol");
    expect(await rpcError(carol.client, "join_with_code", { p_event: eventId, p_code: "WRONG1", p_university: "oxford" })).toMatch(/isn't right/);
    expect(await rpcError(carol.client, "create_team", { p_event: eventId, p_name: "Gamma", p_track: "build" })).toBeTruthy();
    await rpc(carol.client, "join_with_code", { p_event: eventId, p_code: "oxbridge26", p_university: "oxford" });
    const [reg] = await h.sql`select ticket, status, university, source, user_id from public.registrations where event_id = ${eventId} and email = ${carol.email}`;
    expect(reg).toMatchObject({ ticket: "hackathon", status: "approved", university: "University of Oxford", source: "event_code", user_id: carol.id });
    await rpc(carol.client, "join_with_code", { p_event: eventId, p_code: "OXBRIDGE26", p_university: "cambridge" });
    const [again] = await h.sql`select university from public.registrations where event_id = ${eventId} and email = ${carol.email}`;
    expect(again.university).toBe("University of Oxford");
    expect(await rpc<string>(carol.client, "create_team", { p_event: eventId, p_name: "Gamma", p_track: "build" })).toBeTruthy();
  });

  it("declined and panel-only registrations still need an organiser", async () => {
    const dan = await signedInUser(h, "dan");
    const eve = await signedInUser(h, "eve");
    await h.sql`insert into public.registrations (event_id, email, full_name, ticket, status) values (${eventId}, ${dan.email}, 'Dan', 'hackathon', 'declined'), (${eventId}, ${eve.email}, 'Eve', 'panel', 'approved')`;
    expect(await rpcError(dan.client, "join_with_code", { p_event: eventId, p_code: "OXBRIDGE26", p_university: "other" })).toMatch(/declined/);
    expect(await rpcError(eve.client, "join_with_code", { p_event: eventId, p_code: "OXBRIDGE26", p_university: "other" })).toMatch(/panel/);
  });

  it("turning the code off stops new joins", async () => {
    await rpc(organiser, "set_join_code", { p_event: eventId, p_code: "" });
    const fay = await signedInUser(h, "fay");
    expect(await rpcError(fay.client, "join_with_code", { p_event: eventId, p_code: "OXBRIDGE26", p_university: "other" })).toMatch(/isn't right/);
  });
});
