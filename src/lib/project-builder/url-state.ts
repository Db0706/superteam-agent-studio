import { FW_ORDER, isIntegrationId, type IntegrationId } from "@/config/integrations";
import type { FrameworkId } from "@/config/schema";

/**
 * Builder configuration <-> URL query string, so a configuration can be shared
 * as a link: /build?name=my-agent&fw=python&caps=gemini,payments
 */

export interface BuilderConfig {
  name: string;
  framework: FrameworkId;
  integrations: IntegrationId[];
}

export const DEFAULT_BUILDER: BuilderConfig = {
  name: "my-first-ai-agent",
  framework: "next",
  integrations: ["gemini", "payments"],
};

const isFramework = (x: string | null): x is FrameworkId => !!x && (FW_ORDER as string[]).includes(x);

export function parseBuilderParams(search: string | URLSearchParams, fallback: BuilderConfig = DEFAULT_BUILDER): BuilderConfig {
  const p = typeof search === "string" ? new URLSearchParams(search) : search;
  const name = p.get("name");
  const fw = p.get("fw");
  const caps = p.get("caps");
  return {
    name: name !== null ? name.slice(0, 80) : fallback.name,
    framework: isFramework(fw) ? fw : fallback.framework,
    integrations:
      caps !== null
        ? [...new Set(caps.split(",").map((c) => c.trim()).filter(isIntegrationId))]
        : fallback.integrations,
  };
}

export function hasBuilderParams(search: string): boolean {
  const p = new URLSearchParams(search);
  return p.has("name") || p.has("fw") || p.has("caps");
}

export function serializeBuilderParams(cfg: BuilderConfig): string {
  const p = new URLSearchParams();
  p.set("name", cfg.name);
  p.set("fw", cfg.framework);
  p.set("caps", cfg.integrations.join(","));
  return p.toString();
}
