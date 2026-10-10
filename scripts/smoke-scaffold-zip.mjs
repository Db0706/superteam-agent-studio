#!/usr/bin/env node
// End-to-end check of the ZIP download: POST /api/scaffold, unzip, then install, typecheck, build and test the
// generated project. Node projects are also started and probed over HTTP with no keys set.
// Needs node, `unzip` and network access to the npm registry. No API keys, wallets or facilitator calls.
//
//   node scripts/smoke-scaffold-zip.mjs http://localhost:3000 [--live-402]
//   node scripts/smoke-scaffold-zip.mjs http://localhost:3000 node-paidapi   # only matching cases
//
// --live-402 also checks that GET /premium-data answers 402 once PAY_TO_ADDRESS is set. Opt-in: the x402
// middleware contacts the devnet facilitator on startup.

import { execFileSync, execSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendor = JSON.parse(readFileSync(join(root, "vendor/agent-studio-scaffolds/VENDOR.json"), "utf8"));

const args = process.argv.slice(2);
const live402 = args.includes("--live-402");
const [baseArg, ...filters] = args.filter((a) => !a.startsWith("--"));
if (!baseArg) {
  console.error("usage: node scripts/smoke-scaffold-zip.mjs <site base url> [--live-402] [case-name...]");
  process.exit(2);
}
const base = baseArg.replace(/\/$/, "");

const CASES = [
  { name: "node-paidapi", framework: "node", integrations: ["paidapi"], modules: ["payments", "spending", "paidapi"], autoAdded: ["payments", "spending"] },
  { name: "node-gemini-paidapi", framework: "node", integrations: ["gemini", "paidapi"], modules: ["gemini", "payments", "spending", "paidapi"], autoAdded: ["payments", "spending"] },
  { name: "next-full", framework: "next", integrations: ["gemini", "payments", "spending", "paidapi"], modules: ["gemini", "payments", "spending", "paidapi"], autoAdded: [] },
];
const MODULE_LIST_FILE = { next: "lib/modules.ts", node: "src/modules.ts" };
// Env vars that would change what the generated service sees.
const UNSET_ENV = ["GEMINI_API_KEY", "PAY_TO_ADDRESS", "AGENT_PRIVATE_KEY", "X402_NETWORK", "X402_FACILITATOR_URL"];
const SLUG = "smoke-app";

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function runCase(c, work) {
  const res = await fetch(`${base}/api/scaffold`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: SLUG, framework: c.framework, integrations: c.integrations }),
  });
  if (res.status !== 200) throw new Error(`POST /api/scaffold returned ${res.status}: ${await res.text()}`);
  assert(res.headers.get("content-type") === "application/zip", `unexpected content-type ${res.headers.get("content-type")}`);
  const zipPath = join(work, `${c.name}.zip`);
  writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  const out = join(work, c.name);
  execFileSync("unzip", ["-q", zipPath, "-d", out]);
  const dir = join(out, SLUG);

  const manifest = JSON.parse(readFileSync(join(dir, "studio.manifest.json"), "utf8"));
  assert(manifest.framework === c.framework, `manifest framework ${manifest.framework}`);
  assert(manifest.scaffoldVersion === vendor.version, `manifest scaffoldVersion ${manifest.scaffoldVersion}, vendored ${vendor.version}`);
  assert(same(manifest.modules, c.modules), `manifest modules ${JSON.stringify(manifest.modules)}`);
  assert(same(manifest.autoAddedModules, c.autoAdded), `manifest autoAddedModules ${JSON.stringify(manifest.autoAddedModules)}`);
  assert(!existsSync(join(dir, ".env.local")), ".env.local must never be generated");
  assert(existsSync(join(dir, MODULE_LIST_FILE[c.framework])), `${MODULE_LIST_FILE[c.framework]} missing`);
  console.log(`  manifest ok (v${manifest.scaffoldVersion}, modules ${manifest.modules.join(",")})`);

  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
  for (const key of UNSET_ENV) delete env[key];
  for (const cmd of ["npm install --no-audit --no-fund", "npm run typecheck", "npm run build", "npm run test:spending"]) {
    console.log(`  $ ${cmd}`);
    execSync(cmd, { cwd: dir, stdio: "inherit", env });
  }
  if (c.framework === "node") await smokeNode(dir, manifest, env);
}

async function smokeNode(dir, manifest, baseEnv) {
  const port = await freePort();
  const env = { ...baseEnv, PORT: String(port) };
  const child = spawn(process.execPath, ["dist/server.js"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const url = `http://127.0.0.1:${port}`;
  const expect = async (label, res, status, check = () => true) => {
    const body = await res.json().catch(() => null);
    if (res.status !== status || !check(body)) throw new Error(`${label} returned ${res.status} ${JSON.stringify(body)} (expected ${status})\n${log}`);
    console.log(`  smoke ok: ${label} -> ${res.status}`);
  };
  try {
    await waitFor(`${url}/`, child, () => log);
    await expect("GET /", await fetch(`${url}/`), 200, (b) => same(b?.modules?.map((m) => m.id), manifest.modules));
    if (manifest.modules.includes("gemini")) {
      await expect(
        "POST /api/chat (no key)",
        await fetch(`${url}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"prompt":"hi"}' }),
        500,
        (b) => /GEMINI_API_KEY is not set/.test(b?.error),
      );
    }
    await expect("GET /premium-data (no PAY_TO_ADDRESS)", await fetch(`${url}/premium-data`), 500, (b) => /PAY_TO_ADDRESS is not set/.test(b?.error));
    await expect("GET /api/buy", await fetch(`${url}/api/buy`), 200, (b) => b?.spending?.budgetUsd === "1.00");
    await expect("POST /api/buy (no AGENT_PRIVATE_KEY)", await fetch(`${url}/api/buy`, { method: "POST" }), 400, (b) => /AGENT_PRIVATE_KEY is not set/.test(b?.error));
  } finally {
    child.kill();
  }
  if (live402) await live402Check(dir, baseEnv);
}

/** Opt-in: with PAY_TO_ADDRESS set the server must answer 402 (this contacts the devnet facilitator). */
async function live402Check(dir, baseEnv) {
  const port = await freePort();
  // A well-known devnet address (the System Program); nothing is ever sent to it by this check.
  const env = { ...baseEnv, PORT: String(port), PAY_TO_ADDRESS: "11111111111111111111111111111111" };
  const child = spawn(process.execPath, ["dist/server.js"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  try {
    await waitFor(`http://127.0.0.1:${port}/`, child, () => log);
    const res = await fetch(`http://127.0.0.1:${port}/premium-data`);
    assert(res.status === 402, `GET /premium-data with PAY_TO_ADDRESS returned ${res.status}, expected 402\n${log}`);
    console.log("  smoke ok: GET /premium-data (PAY_TO_ADDRESS set) -> 402");
  } finally {
    child.kill();
  }
}

async function waitFor(url, child, getLog) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited with ${child.exitCode}:\n${getLog()}`);
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`server did not answer on ${url}:\n${getLog()}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer().listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

const work = mkdtempSync(join(tmpdir(), "scaffold-zip-"));
const results = [];
for (const c of CASES) {
  if (filters.length && !filters.some((f) => c.name.includes(f))) continue;
  console.log(`\n=== ${c.name}`);
  try {
    await runCase(c, work);
    results.push({ name: c.name, ok: true });
  } catch (err) {
    console.error(err.message);
    results.push({ name: c.name, ok: false, error: err.message.split("\n")[0] });
  }
  // One installed project at a time keeps peak disk use low.
  rmSync(join(work, c.name), { recursive: true, force: true });
}
rmSync(work, { recursive: true, force: true });

console.log("\n=== Summary");
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok ? "" : `  (${r.error})`}`);
if (!results.length) {
  console.error("No case matches the given filters.");
  process.exit(1);
}
process.exit(results.some((r) => !r.ok) ? 1 : 0);
