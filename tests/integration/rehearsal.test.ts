import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiRaceTemplate, rehearsalConfig } from "@/core/tournament/templates";
import { processOneJob } from "@/server/engine/jobs";
import { tick } from "@/server/engine/scheduler";
import { configHash, eventSlug, rpc, signedInUser, startHarness, validated, type Harness } from "./harness";

/**
 * A full 4-hour, 8-layer AI Race rehearsed in real time at ×30 (60-second windows), driven by the
 * real scheduler and worker loops: no clock tricks. Fixture teams are submitted automatically,
 * the organiser pauses, resumes and extends a layer mid-race, and the outcome has to match what
 * each fixture app really does.
 *
 * Takes about 9 minutes, so it is opt-in: REHEARSAL=1 npm run test:integration
 */
const RUN = process.env.REHEARSAL === "1";

const FIXTURES = [
  ["Atlas", "reference"],
  ["Bravo", "reference"],
  ["Echo", "fabricator"],
  ["Borealis", "no-memory"],
  ["Cirrus", "fragile"],
  ["Fornax", "overspender"],
  ["Ghost", "offline"],
] as const;

let h: Harness;
let organiser: SupabaseClient;
let rehearsalId: string;
let stop = false;
const loops: Promise<void>[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!RUN)("rehearsal: an accelerated 4-hour race on the real clock", () => {
  beforeAll(async () => {
    h = await startHarness({ scope: "rehearsal" });
    const [ev] = await h.sql<{ id: string }[]>`
      insert into public.events (slug, name, short_name, status, starts_at, details)
      values (${eventSlug(h)}, 'Rehearsal Test', 'Rehearsal', 'published', now(), '{}') returning id`;
    const org = await signedInUser(h, "organiser");
    await h.sql`insert into public.event_roles (event_id, user_id, role) values (${ev.id}, ${org.id}, 'organiser')`;
    organiser = org.client;

    // The real race as organisers would build it: 8 layers, 30 minutes each.
    const real = validated(aiRaceTemplate({ intervalSeconds: 1800, layers: 8 }));
    const realId = await rpc<string>(organiser, "create_tournament", { p_event: ev.id, p_name: real.name, p_config: real });
    const cfg = validated(rehearsalConfig(real, 30));
    expect(cfg.layers.every((l) => l.timing.durationSeconds === 60)).toBe(true);
    rehearsalId = await rpc<string>(organiser, "duplicate_tournament", { p_id: realId, p_name: cfg.name, p_simulation: true, p_config: cfg });
    await rpc(organiser, "publish_tournament", { p_id: rehearsalId, p_config: cfg, p_hash: configHash(cfg), p_note: "rehearsal" });
    for (const [name, variant] of FIXTURES) {
      await rpc(organiser, "add_fixture_participant", { p_id: rehearsalId, p_name: name, p_endpoint: `${h.host.url}/api/race/fixtures/${variant}` });
    }
    await rpc(organiser, "schedule_tournament", { p_id: rehearsalId, p_starts_at: new Date(Date.now() + 2000).toISOString() });

    // The worker, as deployed: a scheduler tick every second and four job slots.
    loops.push(
      (async () => {
        while (!stop) {
          await tick(h.sql);
          await sleep(1000);
        }
      })(),
    );
    for (let i = 0; i < 4; i++) {
      loops.push(
        (async () => {
          while (!stop) if (!(await processOneJob(h.sql, h.env, `rehearsal-${i}`))) await sleep(300);
        })(),
      );
    }
  }, 120_000);

  afterAll(async () => {
    stop = true;
    await Promise.all(loops);
    await h?.close();
  });

  it("runs to completion with the right eliminations, surviving a pause and an extension", async () => {
    const layerState = async (key: string) => (await h.sql<{ state: string; id: string; deadline_at: Date }[]>`select id, state, deadline_at from public.layer_runs where tournament_id = ${rehearsalId} and layer_key = ${key}`)[0];

    // Pause during layer 2 for 5 seconds: every remaining window moves by the paused time.
    while ((await layerState("structured-outputs"))?.state !== "open") await sleep(500);
    const before = await layerState("final-mission");
    await rpc(organiser, "pause_tournament", { p_id: rehearsalId, p_reason: "rehearsal pause" });
    await sleep(5000);
    await rpc(organiser, "resume_tournament", { p_id: rehearsalId });
    const after = await layerState("final-mission");
    const shift = (after.deadline_at.getTime() - before.deadline_at.getTime()) / 1000;
    expect(shift).toBeGreaterThanOrEqual(5);
    expect(shift).toBeLessThan(8);

    // Extend layer 4 by 10 seconds, shifting the rest.
    while ((await layerState("external-knowledge"))?.state !== "open") await sleep(500);
    const l4 = await layerState("external-knowledge");
    await rpc(organiser, "extend_layer", { p_layer_run: l4.id, p_seconds: 10, p_shift_following: true, p_reason: "rehearsal extension" });
    expect((await layerState("external-knowledge")).deadline_at.getTime() - l4.deadline_at.getTime()).toBe(10_000);

    // Wait for the end.
    for (;;) {
      const [t] = await h.sql<{ status: string }[]>`select status from public.tournaments where id = ${rehearsalId}`;
      if (t.status === "completed") break;
      expect(["running", "paused"]).toContain(t.status);
      await sleep(2000);
    }

    const people = await h.sql<{ name: string; state: string; out: string | null }[]>`
      select display_name as name, state, eliminated_layer_key as out from public.tournament_participants where tournament_id = ${rehearsalId}`;
    const outcome = Object.fromEntries(people.map((p) => [p.name, p.state === "completed" ? "completed" : p.out]));
    expect(outcome).toEqual({
      Atlas: "completed",
      Bravo: "completed",
      Ghost: "first-intelligence",
      Echo: "tool-calling",
      Borealis: "memory-context",
      Cirrus: "reliability",
      Fornax: "autonomous-workflow",
    });

    // Every layer decided exactly once, nothing stuck in ERROR, and rehearsal news stays private.
    const [{ n }] = await h.sql<{ n: number }[]>`
      select count(*)::int as n from public.advancement_decisions d join public.layer_runs r on r.id = d.layer_run_id where r.tournament_id = ${rehearsalId}`;
    expect(n).toBe(2 * 8 + 1 + 3 + 5 + 6 + 7);
    const [{ errors }] = await h.sql<{ errors: number }[]>`select count(*)::int as errors from public.verification_attempts where tournament_id = ${rehearsalId} and status = 'error'`;
    expect(errors).toBe(0);
    const [{ leaked }] = await h.sql<{ leaked: number }[]>`select count(*)::int as leaked from public.activity_events where tournament_id = ${rehearsalId} and is_public`;
    expect(leaked).toBe(0);
  }, 900_000);
});
