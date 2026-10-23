import type { VerifierPlugin } from "./plugin";
import { respondPlugin, structuredPlugin } from "./plugins/ai";
import { httpPlugin } from "./plugins/http";
import { humanPlugin } from "./plugins/human";
import { memoryPlugin } from "./plugins/memory";
import { missionPlugin } from "./plugins/mission";
import { paymentPlugin } from "./plugins/payments";
import { reliabilityPlugin } from "./plugins/reliability";
import { knowledgePlugin, toolsPlugin } from "./plugins/tools";
import { workflowPlugin } from "./plugins/workflow";

/** Every verifier an organiser can attach to a layer. Adding one here makes it available in the builder. */
export const VERIFIERS: VerifierPlugin<never>[] = [
  respondPlugin,
  structuredPlugin,
  toolsPlugin,
  knowledgePlugin,
  memoryPlugin,
  reliabilityPlugin,
  workflowPlugin,
  missionPlugin,
  httpPlugin,
  paymentPlugin,
  humanPlugin,
] as unknown as VerifierPlugin<never>[];

export function getVerifier(id: string): VerifierPlugin<unknown> | undefined {
  return VERIFIERS.find((v) => v.id === id) as VerifierPlugin<unknown> | undefined;
}

/** Validates a layer's verifier settings with the plugin's own schema. */
export function validateVerifierConfig(id: string, config: unknown): { ok: true; config: unknown } | { ok: false; message: string } {
  const plugin = getVerifier(id);
  if (!plugin) return { ok: false, message: `Unknown verifier "${id}".` };
  const parsed = plugin.configSchema.safeParse(config ?? {});
  if (!parsed.success) return { ok: false, message: parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("; ") };
  return { ok: true, config: parsed.data };
}
