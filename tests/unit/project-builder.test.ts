import { describe, expect, it } from "vitest";
import { FW_ORDER, INTEGRATIONS, dependentsOf, normalizeIntegrations, statusOf } from "@/config/integrations";
import { codeFor } from "@/lib/project-builder/code";
import { GeneratorUnavailableError, canDownload, getGenerator, previewGenerator, previewManifest, validateConfiguration } from "@/lib/project-builder/generator";
import { deriveProject, slugify, validateName } from "@/lib/project-builder/project";
import { DEFAULT_BUILDER, parseBuilderParams, serializeBuilderParams } from "@/lib/project-builder/url-state";

describe("validateName", () => {
  it.each([
    ["", "Give your project a name to continue."],
    ["   ", "Give your project a name to continue."],
    ["ab", "Use at least 3 letters or numbers."],
    ["!!", "Use at least 3 letters or numbers."],
    ["9 lives", "Start with a letter."],
    ["a".repeat(41), "Keep it under 40 characters."],
  ])("rejects %j", (raw, error) => {
    expect(validateName(raw).error).toBe(error);
  });

  it("slugifies per the design rules", () => {
    expect(slugify("My Cool_Agent!!")).toBe("my-cool-agent");
    expect(slugify("--a  b--c--")).toBe("a-b-c");
    expect(validateName("My Cool Agent")).toEqual({ id: "my-cool-agent", error: null, formatted: true });
    expect(validateName("research-agent")).toEqual({ id: "research-agent", error: null, formatted: false });
  });
});

describe("deriveProject", () => {
  it("Next.js + Gemini + Payments matches the verified scaffold template", () => {
    const p = deriveProject({ id: "my-first-ai-agent", framework: "next", integrations: ["gemini", "payments"] });
    expect(p.stats).toEqual({ files: 19, packages: 14, env: 7 });
    expect(p.deps.find((d) => d.name === "@x402/next")?.version).toBe("2.28.0");
    expect(p.env.map((e) => e.key)).toContain("AGENT_PRIVATE_KEY");
    expect(p.manifest).toBe("package.json");
    expect(p.needsCompanion).toBe(false);
    expect(p.files.map((f) => f.path)).toContain("lib/ai/gemini.ts");
  });

  it("Python never shows a package.json and uses requirements.txt", () => {
    const p = deriveProject({ id: "agent", framework: "python", integrations: ["gemini", "payments", "spending"] });
    expect(p.manifest).toBe("requirements.txt");
    expect(p.files.some((f) => f.path.endsWith("package.json"))).toBe(false);
    expect(p.setup.some((s) => s.cmd.includes("pip install"))).toBe(true);
  });

  it("Expo + secret-bearing capability adds a companion server and keeps the key out of the app", () => {
    const p = deriveProject({ id: "mobile-app", framework: "expo", integrations: ["gemini", "wallet"] });
    expect(p.needsCompanion).toBe(true);
    expect(p.files.map((f) => f.path)).toContain("companion-server/src/index.ts");
    const gemini = p.env.find((e) => e.key === "GEMINI_API_KEY")!;
    expect(gemini.file).toBe("companion-server/.env.example");
    const rpc = p.env.find((e) => e.key === "EXPO_PUBLIC_SOLANA_RPC_URL")!;
    expect(rpc.file).toBe(".env.example");
    expect(p.companions[0]).toMatchObject({ kind: "included", name: "companion-server/" });
  });

  it("drops N/A integrations and only shows folders for selected modules", () => {
    const p = deriveProject({ id: "svc", framework: "node", integrations: ["wallet", "paidapi"] });
    expect(p.valid).toEqual(["paidapi"]);
    expect(p.files.some((f) => f.path.includes("wallet"))).toBe(false);
    expect(p.files.some((f) => f.path.includes("gemini"))).toBe(false);
  });

  it("de-duplicates shared packages and env vars", () => {
    const p = deriveProject({ id: "x", framework: "node", integrations: ["payments", "paidapi"] });
    const names = p.deps.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("produces a tree with box-drawing guides rooted at the project id", () => {
    const p = deriveProject({ id: "tree-test", framework: "next", integrations: [] });
    const lines = codeFor("tree", p, "tree-test", "next");
    expect(lines[0].segs[0].t).toBe("tree-test/");
    expect(lines.slice(1).every((l) => /^[│ ]*[├└]─ $/.test(l.segs[0].t))).toBe(true);
  });

  it("marks unconfirmed packages as to-confirm", () => {
    const p = deriveProject({ id: "x", framework: "node", integrations: ["paysh"] });
    const lines = codeFor("deps", p, "x", "node");
    expect(lines.some((l) => l.note === "to confirm")).toBe(true);
  });
});

describe("compatibility catalog", () => {
  it("covers every framework for every integration and is marked provisional", () => {
    for (const i of INTEGRATIONS) {
      expect(i.implementationStatus).toBe("provisional");
      for (const fw of FW_ORDER) expect(["ok", "server", "unverified", "na"]).toContain(statusOf(i.id, fw));
    }
  });
  it("only claims verified templates for Next.js", () => {
    const verified = INTEGRATIONS.filter((i) => i.verifiedOn.length).map((i) => i.id);
    expect(verified.sort()).toEqual(["gemini", "paidapi", "payments", "spending"]);
    for (const i of INTEGRATIONS) expect(i.verifiedOn.every((fw) => fw === "next")).toBe(true);
  });
  it("switches on required capabilities, in dependency order", () => {
    expect(normalizeIntegrations(["paidapi"], "next")).toEqual(["paidapi", "payments", "spending"]);
    expect(normalizeIntegrations(["gemini", "spending"], "next")).toEqual(["gemini", "spending", "payments"]);
    expect(normalizeIntegrations(["gemini", "payments"], "next")).toEqual(["gemini", "payments"]);
    // N/A capabilities are dropped, not completed.
    expect(normalizeIntegrations(["wallet", "gemini"], "python")).toEqual(["gemini"]);
  });
  it("finds what must be switched off with a requirement", () => {
    expect(dependentsOf("payments", ["gemini", "payments", "spending", "paidapi"])).toEqual(["spending", "paidapi"]);
    expect(dependentsOf("spending", ["payments", "spending", "paidapi"])).toEqual(["paidapi"]);
    expect(dependentsOf("gemini", ["gemini", "payments"])).toEqual([]);
  });
  it("never claims a wallet for Python agents or Node services", () => {
    expect(statusOf("wallet", "python")).toBe("na");
    expect(statusOf("wallet", "node")).toBe("na");
  });
});

describe("generator adapter", () => {
  it("validates selections", () => {
    expect(validateConfiguration({ name: "ok-name", framework: "next", integrations: ["gemini"] }).ok).toBe(true);
    const bad = validateConfiguration({ name: "x", framework: "python", integrations: ["wallet"] });
    expect(bad.ok).toBe(false);
    expect(bad.issues.map((i) => i.field)).toEqual(expect.arrayContaining(["name", "integrations"]));
    const warn = validateConfiguration({ name: "pay-agent", framework: "python", integrations: ["payments"] });
    expect(warn.issues.some((i) => i.severity === "warning")).toBe(true);
    const needs = validateConfiguration({ name: "paid-app", framework: "next", integrations: ["paidapi"] });
    expect(needs.issues).toContainEqual(expect.objectContaining({ severity: "warning", message: expect.stringContaining("needs Internet-Native Payments and Spending Controls") }));
    const complete = validateConfiguration({ name: "paid-app", framework: "next", integrations: ["payments", "spending", "paidapi"] });
    expect(complete.issues.some((i) => i.message.includes("needs"))).toBe(false);
  });

  it("the Phase 1 adapter cannot produce a ZIP", async () => {
    expect(getGenerator()).toBe(previewGenerator);
    expect(canDownload(previewGenerator)).toBe(false);
    await expect(previewGenerator.generateProject({ name: "a-b-c", framework: "next", integrations: [] })).rejects.toBeInstanceOf(GeneratorUnavailableError);
    const templates = await previewGenerator.listTemplates();
    expect(templates.map((t) => t.framework)).toEqual(FW_ORDER);
    expect(templates.every((t) => t.status === "provisional")).toBe(true);
  });

  it("previews the manifest without generating anything", () => {
    const m = previewManifest({ name: "demo", framework: "node", integrations: ["paidapi"] });
    expect(m.map((f) => f.path)).toContain("src/routes/premium-data.ts");
  });
});

describe("builder URL state", () => {
  it("round-trips", () => {
    const cfg = { name: "campus-market", framework: "expo" as const, integrations: ["gemini" as const, "wallet" as const] };
    expect(parseBuilderParams(serializeBuilderParams(cfg))).toEqual(cfg);
  });
  it("ignores unknown values and falls back", () => {
    expect(parseBuilderParams("fw=cobol&caps=gemini,evil")).toEqual({ ...DEFAULT_BUILDER, integrations: ["gemini"] });
  });
});
