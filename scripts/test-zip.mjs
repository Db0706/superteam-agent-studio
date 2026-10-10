#!/usr/bin/env node
// `npm run test:zip`: builds the site, serves it with `next start` on a free port, runs the ZIP smoke test
// against it and stops the server. Extra arguments go to the smoke script (case names, --live-402).
// Pass --skip-build to reuse an existing .next build.

import { execSync, spawn } from "node:child_process";
import { createServer } from "node:net";

const argv = process.argv.slice(2);
const skipBuild = argv.includes("--skip-build");
const smokeArgs = argv.filter((a) => a !== "--skip-build");

if (!skipBuild) execSync("npm run build", { stdio: "inherit" });

const port = await new Promise((resolve, reject) => {
  const srv = createServer().listen(0, "127.0.0.1", () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
  srv.on("error", reject);
});

const server = spawn("npx", ["next", "start", "-p", String(port), "-H", "127.0.0.1"], { stdio: ["ignore", "inherit", "inherit"] });
const stop = () => server.kill();
process.on("SIGINT", () => (stop(), process.exit(130)));
process.on("SIGTERM", () => (stop(), process.exit(143)));

let code = 1;
try {
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (server.exitCode !== null) throw new Error(`next start exited with ${server.exitCode}`);
    try {
      await fetch(base);
      break;
    } catch {
      if (Date.now() > deadline) throw new Error("next start did not become ready");
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  code = await new Promise((resolve) => {
    spawn(process.execPath, ["scripts/smoke-scaffold-zip.mjs", base, ...smokeArgs], { stdio: "inherit" }).on("exit", (c) => resolve(c ?? 1));
  });
} catch (err) {
  console.error(err.message);
} finally {
  stop();
}
process.exit(code);
