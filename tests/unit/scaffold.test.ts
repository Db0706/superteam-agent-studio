import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canDownload, GeneratorUnavailableError, getGenerator, ScaffoldRequestError, scaffoldGenerator } from "@/lib/project-builder/generator";
import { SCAFFOLD, ZIP_MODULES, zipAvailability } from "@/lib/scaffold/catalog";
import { composeScaffold, isForbiddenPath, VENDOR_DIR, type StudioManifest } from "@/lib/scaffold/compose";
import { createScaffoldHandler, MAX_BODY_BYTES } from "@/lib/scaffold/handler";
import { createRateLimiter } from "@/lib/scaffold/rate-limit";
import { crc32, createZip } from "@/lib/scaffold/zip";
import { listZipEntries } from "@/lib/scaffold/zip-entries";

const ROOT = join(process.cwd(), VENDOR_DIR);
const MODULES = ["gemini", "payments", "spending", "paidapi"];
const FULL = { name: "My Paid Agent", framework: "next", integrations: ["gemini", "payments", "spending", "paidapi"] };

type ComposeMjs = {
  compose(opts: { framework: string; modules: string[]; out: string; name?: string }): StudioManifest;
  catalog(): unknown;
};
const upstream = (): Promise<ComposeMjs> => import(/* @vite-ignore */ pathToFileURL(join(ROOT, "scripts/compose.mjs")).href);

const subsets = <T,>(xs: T[]): T[][] => xs.reduce<T[][]>((acc, x) => [...acc, ...acc.map((s) => [...s, x])], [[]]);

function walk(dir: string): string[] {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((p) => statSync(join(dir, p)).isFile())
    .sort();
}

const hasUnzip = (() => {
  try {
    execFileSync("unzip", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const tmp: string[] = [];
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), "scaffold-test-"));
  tmp.push(d);
  return d;
};
afterEach(() => {
  while (tmp.length) rmSync(tmp.pop()!, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("vendored scaffold repository", () => {
  it("is pinned to a commit", () => {
    expect(SCAFFOLD.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(SCAFFOLD.version).toBe(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version);
  });

  it("catalog.json is fresh (matches the templates)", async () => {
    const { catalog } = await upstream();
    expect(JSON.parse(readFileSync(join(ROOT, "catalog.json"), "utf8"))).toEqual(catalog());
  });

  it("only Next.js has templates, with the four verified modules", () => {
    expect(Object.keys(ZIP_MODULES)).toEqual(["next"]);
    expect(ZIP_MODULES.next).toEqual(expect.arrayContaining(MODULES));
  });

  it("contains no env file other than .env.example", () => {
    const files = walk(ROOT);
    expect(files.filter((f) => /(^|\/)\.env/.test(f))).toEqual(["templates/nextjs/base/.env.example"]);
    for (const line of readFileSync(join(ROOT, "templates/nextjs/base/.env.example"), "utf8").split("\n")) {
      expect(line.startsWith("#") || !/=./.test(line), line).toBe(true);
    }
  });
});

describe("composeScaffold", () => {
  it.each(subsets(MODULES).map((s) => [s.join("+") || "base", s] as const))("is byte-identical to compose.mjs for %s", async (_label, modules) => {
    const { compose } = await upstream();
    const out = join(tempDir(), "app");
    const expected = compose({ framework: "next", modules, out, name: "parity-app" });
    const actual = composeScaffold(ROOT, { framework: "next", modules, name: "parity-app" });
    expect(actual.manifest).toEqual(expected);
    expect(actual.files.map((f) => f.path)).toEqual(walk(out));
    for (const f of actual.files) expect(f.data.equals(readFileSync(join(out, f.path))), f.path).toBe(true);
    expect(actual.files.map((f) => f.path).sort()).toEqual(expected.files);
  });

  it("adds required modules", () => {
    const { manifest } = composeScaffold(ROOT, { framework: "next", modules: ["paidapi"] });
    expect(manifest.modules).toEqual(["payments", "spending", "paidapi"]);
    expect(manifest.autoAddedModules).toEqual(["payments", "spending"]);
  });

  it("keeps payments on Solana devnet and secrets empty", () => {
    const { files } = composeScaffold(ROOT, { framework: "next", modules: MODULES });
    const env = files.find((f) => f.path === ".env.example")!.data.toString("utf8");
    expect(env).toMatch(/^X402_NETWORK=solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1$/m);
    expect(env).toMatch(/^AGENT_PRIVATE_KEY=$/m);
    expect(env).toMatch(/^GEMINI_API_KEY=$/m);
    expect(files.some((f) => /(^|\/)\.env(?!\.example$)/.test(f.path))).toBe(false);
  });

  it("rejects unknown frameworks and modules", () => {
    expect(() => composeScaffold(ROOT, { framework: "expo", modules: [] })).toThrow(/Unknown framework/);
    expect(() => composeScaffold(ROOT, { framework: "next", modules: ["wallet"] })).toThrow(/Unknown module/);
  });

  it.each([".env.local", "a/.env", ".env.production", "../x", "/etc/passwd", "keys/agent.keypair.json", "a//b"])("forbids %s", (p) => {
    expect(isForbiddenPath(p)).toBe(true);
  });
  it.each([".env.example", "app/page.tsx", "lib/payments/config.ts"])("allows %s", (p) => {
    expect(isForbiddenPath(p)).toBe(false);
  });
});

describe("zip", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("round-trips through listZipEntries", () => {
    const zip = createZip([
      { path: "a/hello.txt", data: new TextEncoder().encode("hello ".repeat(50)) },
      { path: "a/x", data: new Uint8Array([1]) },
      { path: "a/ünï.md", data: new TextEncoder().encode("#") },
    ]);
    expect(listZipEntries(zip)).toEqual([
      { path: "a/hello.txt", bytes: 300 },
      { path: "a/x", bytes: 1 },
      { path: "a/ünï.md", bytes: 1 },
    ]);
  });

  it.runIf(hasUnzip)("is readable by unzip, with intact contents", () => {
    const { files } = composeScaffold(ROOT, { framework: "next", modules: MODULES });
    const dir = tempDir();
    const file = join(dir, "p.zip");
    writeFileSync(file, createZip(files.map((f) => ({ path: `p/${f.path}`, data: f.data }))));
    execFileSync("unzip", ["-tq", file]);
    execFileSync("unzip", ["-q", file, "-d", join(dir, "x")]);
    for (const f of files) expect(readFileSync(join(dir, "x/p", f.path)).equals(f.data), f.path).toBe(true);
  });
});

describe("zipAvailability", () => {
  it("allows verified Next.js selections", () => {
    expect(zipAvailability("next", [])).toEqual({ ok: true, modules: [] });
    expect(zipAvailability("next", MODULES)).toEqual({ ok: true, modules: MODULES });
  });
  it("explains why other frameworks stay previews", () => {
    for (const fw of ["expo", "python", "node"] as const) {
      const r = zipAvailability(fw, []);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/templates aren't built yet.*Only Next\.js/);
    }
  });
  it("explains capabilities without a template", () => {
    const r = zipAvailability("next", ["gemini", "wallet", "paysh"]);
    expect(r).toEqual({ ok: false, reason: expect.stringMatching(/Wallet Connection and .+ have no template yet/) });
  });
});

describe("POST /api/scaffold handler", () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("http://localhost/api/scaffold", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("returns a ZIP whose files match studio.manifest.json", async () => {
    const res = await createScaffoldHandler()(post(FULL));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="my-paid-agent.zip"');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-scaffold-commit")).toBe(SCAFFOLD.commit);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const paths = listZipEntries(bytes).map((e) => e.path);
    expect(paths.every((p) => p.startsWith("my-paid-agent/"))).toBe(true);
    const files = paths.map((p) => p.slice("my-paid-agent/".length));
    const { manifest } = composeScaffold(ROOT, { framework: "next", modules: MODULES, name: "my-paid-agent" });
    expect(files).toEqual(manifest.files);
    expect(files).not.toContain(".env.local");
    expect(files).toContain(".env.example");
  });

  it("is deterministic", async () => {
    const h = createScaffoldHandler();
    const a = new Uint8Array(await (await h(post(FULL))).arrayBuffer());
    const b = new Uint8Array(await (await h(post(FULL))).arrayBuffer());
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it.each([
    ["non-JSON content type", post(FULL, { "content-type": "text/plain" }), 415],
    ["malformed JSON", post("{nope"), 400],
    ["extra fields", post({ ...FULL, out: "/tmp/x" }), 400],
    ["unknown framework", post({ ...FULL, framework: "rails" }), 400],
    ["bad name", post({ ...FULL, name: "9" }), 400],
    ["N/A capability", post({ ...FULL, framework: "python", integrations: ["wallet"] }), 400],
    ["oversized body", post({ ...FULL, name: "x".repeat(MAX_BODY_BYTES) }), 413],
    ["framework without templates", post({ ...FULL, framework: "expo", integrations: ["gemini"] }), 422],
    ["capability without a template", post({ ...FULL, integrations: ["wallet"] }), 422],
  ])("rejects %s", async (_label, req, status) => {
    const res = await createScaffoldHandler()(req);
    expect(res.status).toBe(status);
    expect(res.headers.get("content-type")).toMatch(/json/);
    expect(typeof (await res.json()).error).toBe("string");
  });

  it("rate limits per client with Retry-After", async () => {
    const h = createScaffoldHandler({ limiter: createRateLimiter({ perClient: 2, global: 100, windowMs: 60_000 }) });
    expect((await h(post(FULL))).status).toBe(200);
    expect((await h(post(FULL))).status).toBe(200);
    const limited = await h(post(FULL));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await limited.json()).retryable).toBe(true);
    expect((await h(post(FULL, { "x-forwarded-for": "198.51.100.1" }))).status).toBe(200);
  });
});

describe("rate limiter", () => {
  it("caps globally and resets each window", () => {
    let t = 0;
    const rl = createRateLimiter({ perClient: 5, global: 2, windowMs: 1000, now: () => t });
    expect(rl.take("a").ok).toBe(true);
    expect(rl.take("b").ok).toBe(true);
    expect(rl.take("c")).toEqual({ ok: false, retryAfterSec: 1 });
    t = 1000;
    expect(rl.take("c").ok).toBe(true);
  });
});

describe("scaffoldGenerator", () => {
  it("is the active generator and reports Next.js as verified", async () => {
    expect(getGenerator()).toBe(scaffoldGenerator);
    const templates = await scaffoldGenerator.listTemplates();
    expect(templates.find((t) => t.framework === "next")).toMatchObject({ status: "verified", supportedIntegrations: expect.arrayContaining(MODULES) });
    expect(templates.filter((t) => t.framework !== "next").every((t) => t.status === "provisional")).toBe(true);
  });

  it("can download Next.js selections only", () => {
    expect(canDownload(scaffoldGenerator, { name: "a-b-c", framework: "next", integrations: ["gemini"] })).toBe(true);
    expect(canDownload(scaffoldGenerator, { name: "a-b-c", framework: "expo", integrations: [] })).toBe(false);
    expect(canDownload(scaffoldGenerator, { name: "a-b-c", framework: "next", integrations: ["wallet"] })).toBe(false);
  });

  it("downloads through the API route", async () => {
    const handler = createScaffoldHandler();
    const fetchMock = vi.fn((url: string, init: RequestInit) => handler(new Request(new URL(url, "http://localhost"), init)));
    vi.stubGlobal("fetch", fetchMock);
    const result = await scaffoldGenerator.generateProject(FULL as never);
    expect(fetchMock).toHaveBeenCalledWith("/api/scaffold", expect.objectContaining({ method: "POST" }));
    expect(result.filename).toBe("my-paid-agent.zip");
    expect(result.generatorVersion).toBe(SCAFFOLD.version);
    expect(result.archive.type).toBe("application/zip");
    expect(result.manifest.map((f) => f.path)).toContain("studio.manifest.json");
  });

  it("refuses selections without templates before calling the server", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(scaffoldGenerator.generateProject({ name: "a-b-c", framework: "python", integrations: [] })).rejects.toBeInstanceOf(GeneratorUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces server errors with retry hints", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Too many downloads. Try again in 30s.", retryable: true }, { status: 429 })));
    const err = await scaffoldGenerator.generateProject(FULL as never).catch((e) => e);
    expect(err).toBeInstanceOf(ScaffoldRequestError);
    expect(err).toMatchObject({ status: 429, retryable: true, message: "Too many downloads. Try again in 30s." });

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    await expect(scaffoldGenerator.generateProject(FULL as never)).rejects.toMatchObject({ retryable: true, status: 0 });
  });
});
