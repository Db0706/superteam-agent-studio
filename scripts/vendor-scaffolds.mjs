#!/usr/bin/env node
// Vendors a pinned copy of the scaffold repository (Db0706/agent-studio-scaffolds)
// into vendor/agent-studio-scaffolds. The ZIP route only ever reads this copy,
// so the site needs no GitHub token and no network access at runtime.
//
//   node scripts/vendor-scaffolds.mjs                       # ../agent-studio-scaffolds at HEAD
//   node scripts/vendor-scaffolds.mjs --source <dir> --ref <commit|tag>
//   node scripts/vendor-scaffolds.mjs --check               # fail if vendor/ differs from the pinned commit
//
// Only committed content is copied (`git archive`), never the working tree, so
// local .env.local files or keypairs in the scaffold checkout cannot leak in.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = join(SITE, "vendor/agent-studio-scaffolds");
const REPO = "https://github.com/Db0706/agent-studio-scaffolds";
const PATHS = ["templates", "scripts/compose.mjs", "package.json", "catalog.json", "VERIFICATION.md"];
/** Anything that could hold a secret. `.env.example` is the only env file a template may ship. */
const FORBIDDEN = [/(^|\/)\.env(?!\.example$)[^/]*$/, /\.pem$/, /keypair\.json$/, /(^|\/)node_modules\//];

const { values } = parseArgs({
  options: {
    source: { type: "string", default: join(SITE, "../agent-studio-scaffolds") },
    ref: { type: "string" },
    check: { type: "boolean", default: false },
  },
});

const git = (...args) => execFileSync("git", ["-C", resolve(values.source), ...args], { encoding: "utf8" }).trim();

function listFiles(dir) {
  return readdirSync(dir, { recursive: true })
    .map((p) => String(p))
    .filter((p) => statSync(join(dir, p)).isFile())
    .map((p) => p.split("\\").join("/"))
    .sort();
}

function extract(ref) {
  const dir = mkdtempSync(join(tmpdir(), "scaffolds-"));
  const tar = execFileSync("git", ["-C", resolve(values.source), "archive", "--format=tar", ref, "--", ...PATHS]);
  execFileSync("tar", ["-x", "-C", dir], { input: tar });
  for (const file of listFiles(dir)) {
    if (FORBIDDEN.some((re) => re.test(file))) throw new Error(`Refusing to vendor ${file}: it may contain secrets`);
  }
  return dir;
}

function sameTree(a, b) {
  const fa = listFiles(a).filter((f) => f !== "VENDOR.json");
  const fb = listFiles(b).filter((f) => f !== "VENDOR.json");
  if (fa.join("\n") !== fb.join("\n")) return false;
  return fa.every((f) => readFileSync(join(a, f)).equals(readFileSync(join(b, f))));
}

if (values.check) {
  const pinned = JSON.parse(readFileSync(join(DEST, "VENDOR.json"), "utf8"));
  const tmp = extract(pinned.commit);
  const ok = sameTree(tmp, DEST);
  rmSync(tmp, { recursive: true });
  if (!ok) {
    console.error(`vendor/agent-studio-scaffolds does not match ${pinned.commit}. Re-run: node scripts/vendor-scaffolds.mjs --ref ${pinned.commit}`);
    process.exit(1);
  }
  console.log(`vendor/agent-studio-scaffolds matches ${pinned.commit} (v${pinned.version})`);
} else {
  const commit = git("rev-parse", `${values.ref ?? "HEAD"}^{commit}`);
  const tmp = extract(commit);
  const version = JSON.parse(readFileSync(join(tmp, "package.json"), "utf8")).version;
  const vendor = {
    repository: REPO,
    commit,
    version,
    committedAt: git("show", "-s", "--format=%cI", commit),
    files: listFiles(tmp).length,
  };
  writeFileSync(join(tmp, "VENDOR.json"), JSON.stringify(vendor, null, 2) + "\n");
  if (existsSync(DEST)) rmSync(DEST, { recursive: true });
  cpSync(tmp, DEST, { recursive: true });
  rmSync(tmp, { recursive: true });
  console.log(`Vendored ${REPO}@${commit.slice(0, 7)} (v${version}, ${vendor.files} files) into ${relative(process.cwd(), DEST)}`);
}
