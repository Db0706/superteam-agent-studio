import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiRaceTemplate } from "@/core/tournament/templates";
import { configHash, drainJobs, eventSlug, rpc, signedInUser, startHarness, validated, type Harness } from "./harness";

/**
 * The scaffolds' race adapter against the real verifier: a composed Node starter with the `race`
 * module is started twice, once with `respond` written and once untouched, and both race layer 1.
 *
 * Opt-in, because it needs a composed project from the agent-studio-scaffolds repo:
 *   node scripts/verify.mjs node-race          (in agent-studio-scaffolds)
 *   SCAFFOLD_APP_DIR=…/agent-studio-scaffolds/out/node-race npm run test:integration
 *
 * The written handler is a deterministic stand-in for a model, so the test needs no API key: it
 * proves the adapter's plumbing (token, nonce, envelope, routing) satisfies the verifier.
 */
const APP_DIR = process.env.SCAFFOLD_APP_DIR;

const STAND_IN = `respond: async (task) => {
    const q = String(task.input);
    const sum = /What is (\\d+) plus (\\d+)/.exec(q);
    if (sum) return { text: String(Number(sum[1]) + Number(sum[2])) };
    const word = /the word "([^"]+)"/.exec(q);
    return { text: word ? word[1].toUpperCase() : "I don't know." };
  },`;

let h: Harness;
let eventId: string;
let tournamentId: string;
const apps: ChildProcess[] = [];
const dirs: string[] = [];
const teams: Record<string, { client: Awaited<ReturnType<typeof signedInUser>>["client"]; teamId: string }> = {};

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = createServer().listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });

async function startApp(token: string, writeRespond: boolean): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "race-adapter-"));
  dirs.push(dir);
  // APFS clone: fast copy including node_modules.
  execFileSync("cp", ["-cR", `${APP_DIR}/.`, dir]);
  const handlers = join(dir, "src/race/handlers.ts");
  const src = readFileSync(handlers, "utf8");
  if (writeRespond) {
    const patched = src.replace('respond: notYet("respond", "handlers.respond"),', STAND_IN);
    expect(patched).not.toBe(src);
    writeFileSync(handlers, patched);
  }
  const port = await freePort();
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], { cwd: dir, env: { ...process.env, PORT: String(port), AGENT_STUDIO_VERIFIER_TOKEN: token }, stdio: "ignore" });
  apps.push(child);
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(url);
      return url;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error("scaffold app did not start");
}

describe.skipIf(!APP_DIR)("scaffold race adapter against the real verifier", () => {
  beforeAll(async () => {
    h = await startHarness({ scope: "adapter" });
    const [ev] = await h.sql<{ id: string }[]>`
      insert into public.events (slug, name, short_name, status, starts_at, details)
      values (${eventSlug(h)}, 'Adapter Test', 'Adapter', 'published', now(), '{}') returning id`;
    eventId = ev.id;
    const org = await signedInUser(h, "organiser");
    await h.sql`insert into public.event_roles (event_id, user_id, role) values (${eventId}, ${org.id}, 'organiser')`;
    for (const name of ["built", "unbuilt"]) {
      await h.sql`insert into public.registrations (event_id, email, full_name, ticket, status) values (${eventId}, ${`${name}@${h.domain}`}, ${name}, 'hackathon', 'approved')`;
      const u = await signedInUser(h, name);
      const teamId = await rpc<string>(u.client, "create_team", { p_event: eventId, p_name: name, p_track: "build" });
      const token = await rpc<string>(u.client, "project_verifier_token", { p_team: teamId });
      const url = await startApp(token, name === "built");
      await rpc(u.client, "update_project", { p_team: teamId, p_name: name, p_repo: null, p_demo: null, p_endpoint: url });
      teams[name] = { client: u.client, teamId };
    }
    const config = validated(aiRaceTemplate({ intervalSeconds: 1800, layers: 1 }));
    tournamentId = await rpc<string>(org.client, "create_tournament", { p_event: eventId, p_name: "Adapter race", p_config: config });
    await rpc(org.client, "publish_tournament", { p_id: tournamentId, p_config: config, p_hash: configHash(config), p_note: "v1" });
    for (const t of Object.values(teams)) await rpc(t.client, "join_tournament", { p_id: tournamentId });
    await rpc(org.client, "schedule_tournament", { p_id: tournamentId, p_starts_at: new Date().toISOString() });
    const { tick } = await import("@/server/engine/scheduler");
    await tick(h.sql, undefined, { closingGraceSeconds: 0 });
  }, 120_000);

  afterAll(async () => {
    for (const a of apps) a.kill();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    await h?.close();
  });

  it("passes First Intelligence once respond is written, and explains itself when it isn't", async () => {
    for (const [name, t] of Object.entries(teams)) await rpc(t.client, "submit_attempt", { p_id: tournamentId, p_layer_key: "first-intelligence", p_request_id: `adapter-${name}` });
    await drainJobs(h);
    const rows = await h.sql<{ name: string; status: string; score: number; feedback: { label: string; passed: boolean; message: string }[] }[]>`
      select tp.display_name as name, a.status, a.score, a.feedback from public.verification_attempts a
      join public.tournament_participants tp on tp.id = a.participant_id where a.tournament_id = ${tournamentId}`;
    const built = rows.find((r) => r.name === "built")!;
    const unbuilt = rows.find((r) => r.name === "unbuilt")!;
    expect(built.status, JSON.stringify(built.feedback)).toBe("passed");
    expect(Number(built.score)).toBe(100);
    expect(unbuilt.status).toBe("failed");
    expect(unbuilt.feedback.find((f) => f.label.startsWith("Health"))?.passed).toBe(true);
    expect(unbuilt.feedback.some((f) => /doesn't handle "respond" tasks yet/.test(f.message))).toBe(true);
  });
});
