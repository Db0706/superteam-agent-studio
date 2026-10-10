import { FRAMEWORKS, FW_ORDER, INTEGRATIONS, INTEGRATION_MAP, statusOf, type IntegrationId } from "@/config/integrations";
import type { FrameworkId } from "@/config/schema";
import { SCAFFOLD, ZIP_MODULES, zipAvailability, type ZipAvailability } from "@/lib/scaffold/catalog";
import { listZipEntries } from "@/lib/scaffold/zip-entries";
import { deriveProject, validateName } from "./project";

/**
 * Scaffold generator adapter: the boundary between this website and the
 * scaffold repository (Db0706/agent-studio-scaffolds).
 *
 * The UI only talks to a `ScaffoldGenerator`. `scaffoldGenerator` builds real
 * ZIPs through `POST /api/scaffold`, which composes a pinned, vendored copy of
 * the scaffold repository. Selections it has no templates for (every framework
 * except Next.js, and capabilities without a template) stay previews:
 * `zipAvailability` says why. `previewGenerator` is the no-ZIP fallback.
 */

export interface ProjectConfiguration {
  /** Slugified project name, used as folder and package name. */
  name: string;
  framework: FrameworkId;
  integrations: IntegrationId[];
  /** Free-form per-template options, reserved for the scaffold repository. */
  options?: Record<string, string | number | boolean>;
}

export interface TemplateSummary {
  framework: FrameworkId;
  name: string;
  tech: string;
  supportedIntegrations: IntegrationId[];
  /** "provisional" until the scaffold repository's CI has built this combination. */
  status: "provisional" | "verified";
}

export type IssueSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: IssueSeverity;
  field: "name" | "framework" | "integrations";
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export interface GeneratedFile {
  path: string;
  bytes?: number;
}

export interface GenerateResult {
  archive: Blob;
  filename: string;
  manifest: GeneratedFile[];
  generatorVersion: string;
}

export type GeneratorCapability = "preview" | "zip";

export interface ScaffoldGenerator {
  readonly id: string;
  readonly capabilities: readonly GeneratorCapability[];
  listTemplates(): Promise<TemplateSummary[]>;
  validateSelection(config: ProjectConfiguration): Promise<ValidationResult>;
  /** Whether `generateProject` can build this selection, and why not when it can't. */
  zipAvailability(config: ProjectConfiguration): ZipAvailability;
  generateProject(config: ProjectConfiguration): Promise<GenerateResult>;
}

export class GeneratorUnavailableError extends Error {
  constructor(message = "The scaffold generator is not connected yet. This build shows a configuration preview only.") {
    super(message);
    this.name = "GeneratorUnavailableError";
  }
}

/** The scaffold service refused or failed. `retryable` errors are worth a retry button. */
export class ScaffoldRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ScaffoldRequestError";
  }
}

/** Shared, synchronous validation, used by every adapter and by the UI. */
export function validateConfiguration(config: ProjectConfiguration): ValidationResult {
  const issues: ValidationIssue[] = [];
  const name = validateName(config.name);
  if (name.error) issues.push({ severity: "error", field: "name", message: name.error });
  if (!FW_ORDER.includes(config.framework)) {
    issues.push({ severity: "error", field: "framework", message: "Choose one framework." });
    return { ok: false, issues };
  }
  const seen = new Set<IntegrationId>();
  for (const id of config.integrations) {
    const def = INTEGRATION_MAP[id];
    if (!def) {
      issues.push({ severity: "error", field: "integrations", message: `Unknown capability “${id}”.` });
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const st = statusOf(id, config.framework);
    if (st === "na") issues.push({ severity: "error", field: "integrations", message: `${def.name} is not available for ${FRAMEWORKS[config.framework].tech}.` });
    if (st === "unverified") issues.push({ severity: "warning", field: "integrations", message: `${def.name} is unverified with ${FRAMEWORKS[config.framework].tech}.` });
    if (st === "server") issues.push({ severity: "info", field: "integrations", message: `${def.name} adds a companion server so secrets never ship in the app.` });
  }
  for (const id of seen) {
    const required = INTEGRATION_MAP[id].requires.filter(
      (r) => !seen.has(r) && statusOf(r, config.framework) !== "na",
    );
    if (required.length) {
      issues.push({
        severity: "warning",
        field: "integrations",
        message: `${INTEGRATION_MAP[id].name} needs ${required.map((r) => INTEGRATION_MAP[r].name).join(" and ")}. Switch ${required.length > 1 ? "them" : "it"} on too.`,
      });
    }
    const missing = INTEGRATION_MAP[id].worksWith.filter(
      (w) => !seen.has(w) && !required.includes(w) && statusOf(w, config.framework) !== "na",
    );
    if (missing.length) {
      issues.push({
        severity: "info",
        field: "integrations",
        message: `${INTEGRATION_MAP[id].name} is designed to work with ${missing.map((m) => INTEGRATION_MAP[m].name).join(", ")}.`,
      });
    }
  }
  if (seen.has("payments") && !seen.has("spending") && config.framework === "python") {
    issues.push({ severity: "warning", field: "integrations", message: "Autonomous agents that pay should switch on Spending Controls." });
  }
  return { ok: !issues.some((i) => i.severity === "error"), issues };
}

/** The Phase 1 adapter: honest preview, no archive. */
export const previewGenerator: ScaffoldGenerator = {
  id: "preview",
  capabilities: ["preview"],
  async listTemplates() {
    return FW_ORDER.map((fw) => ({
      framework: fw,
      name: FRAMEWORKS[fw].name,
      tech: FRAMEWORKS[fw].tech,
      supportedIntegrations: INTEGRATIONS.filter((i) => statusOf(i.id, fw) !== "na").map((i) => i.id),
      status: "provisional" as const,
    }));
  },
  async validateSelection(config) {
    return validateConfiguration(config);
  },
  zipAvailability() {
    return { ok: false, reason: "The scaffold generator is not connected in this build, so this stays a preview." };
  },
  async generateProject() {
    throw new GeneratorUnavailableError();
  },
};

export const SCAFFOLD_ENDPOINT = "/api/scaffold";

/** Real ZIPs from the vendored scaffold repository, via `POST /api/scaffold`. */
export const scaffoldGenerator: ScaffoldGenerator = {
  id: "agent-studio-scaffolds",
  capabilities: ["preview", "zip"],
  async listTemplates() {
    return FW_ORDER.map((fw) => {
      const verified = ZIP_MODULES[fw];
      return {
        framework: fw,
        name: FRAMEWORKS[fw].name,
        tech: FRAMEWORKS[fw].tech,
        supportedIntegrations: verified ?? INTEGRATIONS.filter((i) => statusOf(i.id, fw) !== "na").map((i) => i.id),
        status: verified ? ("verified" as const) : ("provisional" as const),
      };
    });
  },
  async validateSelection(config) {
    return validateConfiguration(config);
  },
  zipAvailability(config) {
    return zipAvailability(config.framework, config.integrations);
  },
  async generateProject(config) {
    const zip = zipAvailability(config.framework, config.integrations);
    if (!zip.ok) throw new GeneratorUnavailableError(zip.reason);
    let res: Response;
    try {
      res = await fetch(SCAFFOLD_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: config.name, framework: config.framework, integrations: config.integrations }),
      });
    } catch {
      throw new ScaffoldRequestError("Couldn't reach the generator. Check your connection and try again.", 0, true);
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string; retryable?: boolean } | null;
      throw new ScaffoldRequestError(body?.error ?? `The generator failed (HTTP ${res.status}).`, res.status, body?.retryable ?? res.status >= 500);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const filename = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `${validateName(config.name).id}.zip`;
    return {
      archive: new Blob([bytes], { type: "application/zip" }),
      filename,
      manifest: listZipEntries(bytes).map((e) => ({ path: e.path.replace(/^[^/]+\//, ""), bytes: e.bytes })),
      generatorVersion: res.headers.get("x-scaffold-version") ?? SCAFFOLD.version,
    };
  },
};

/**
 * Files the generator *would* produce. Lets the UI show an accurate manifest
 * without pretending anything was generated.
 */
export function previewManifest(config: ProjectConfiguration): GeneratedFile[] {
  return deriveProject({ id: config.name, framework: config.framework, integrations: config.integrations }).files.map((f) => ({ path: f.path }));
}

export function getGenerator(): ScaffoldGenerator {
  return scaffoldGenerator;
}

/** True when `gen` produces ZIPs at all, and, given a selection, can build that one. */
export function canDownload(gen: ScaffoldGenerator, config?: ProjectConfiguration): boolean {
  return gen.capabilities.includes("zip") && (!config || gen.zipAvailability(config).ok);
}
