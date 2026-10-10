import { FRAMEWORKS, FW_ORDER, INTEGRATIONS, INTEGRATION_MAP, statusOf, type IntegrationId } from "@/config/integrations";
import type { FrameworkId } from "@/config/schema";
import { deriveProject, validateName } from "./project";

/**
 * Scaffold generator adapter: the boundary between this website and the
 * future open-source scaffold repository (Phase 2).
 *
 * The UI only talks to a `ScaffoldGenerator`. Today the only implementation is
 * `previewGenerator`, which validates and describes a configuration but
 * deliberately cannot produce a ZIP. Phase 2 adds an implementation backed by
 * the scaffold repository (e.g. `POST /api/scaffold`) and swaps it in through
 * `getGenerator()`, with no component changes needed.
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
  generateProject(config: ProjectConfiguration): Promise<GenerateResult>;
}

export class GeneratorUnavailableError extends Error {
  constructor() {
    super("The scaffold generator is not connected yet. This build shows a configuration preview only.");
    this.name = "GeneratorUnavailableError";
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
    const missing = INTEGRATION_MAP[id].worksWith.filter(
      (w) => !seen.has(w) && statusOf(w, config.framework) !== "na",
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
  async generateProject() {
    throw new GeneratorUnavailableError();
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
  // Phase 2: return an HTTP-backed adapter when the scaffold service is configured, e.g.
  //   if (process.env.NEXT_PUBLIC_SCAFFOLD_API_URL) return createHttpGenerator(process.env.NEXT_PUBLIC_SCAFFOLD_API_URL)
  return previewGenerator;
}

export function canDownload(gen: ScaffoldGenerator): boolean {
  return gen.capabilities.includes("zip");
}
