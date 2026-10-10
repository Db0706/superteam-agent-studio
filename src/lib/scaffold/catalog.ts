import { FRAMEWORKS, INTEGRATION_MAP, isIntegrationId, type IntegrationId } from "@/config/integrations";
import type { FrameworkId } from "@/config/schema";
import catalogJson from "../../../vendor/agent-studio-scaffolds/catalog.json";
import vendorJson from "../../../vendor/agent-studio-scaffolds/VENDOR.json";

/**
 * What the vendored scaffold repository can actually build. Safe for client
 * code: it only reads the catalog metadata, never template contents.
 * Update with `node scripts/vendor-scaffolds.mjs`.
 */

export const SCAFFOLD = {
  repository: vendorJson.repository,
  commit: vendorJson.commit,
  version: vendorJson.version,
} as const;

interface CatalogEntry {
  framework: string;
  modules: { id: string }[];
}

/** Capabilities with a real template, per framework. Frameworks without templates are absent. */
export const ZIP_MODULES: Partial<Record<FrameworkId, IntegrationId[]>> = Object.fromEntries(
  (catalogJson as CatalogEntry[]).map((c) => [c.framework, c.modules.map((m) => m.id).filter(isIntegrationId)]),
);

export type ZipAvailability = { ok: true; modules: IntegrationId[] } | { ok: false; reason: string };

/** Whether a selection can be downloaded as a ZIP, and why not when it can't. */
export function zipAvailability(framework: FrameworkId, integrations: readonly string[]): ZipAvailability {
  const supported = ZIP_MODULES[framework];
  if (!supported) {
    return { ok: false, reason: `${FRAMEWORKS[framework]?.name ?? framework} templates aren't built yet, so this stays a preview. Only Next.js downloads today.` };
  }
  const missing = [...new Set(integrations)].filter((id) => !(supported as string[]).includes(id));
  if (missing.length) {
    const names = missing.map((id) => (isIntegrationId(id) ? INTEGRATION_MAP[id].name : `“${id}”`)).join(" and ");
    return { ok: false, reason: `${names} ${missing.length > 1 ? "have" : "has"} no template yet. Switch ${missing.length > 1 ? "them" : "it"} off to download a ZIP.` };
  }
  return { ok: true, modules: [...new Set(integrations)] as IntegrationId[] };
}
