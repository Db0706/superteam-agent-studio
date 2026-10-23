import { z } from "zod";
import type { VerifierPlugin } from "../plugin";
import { runStructuredCases } from "./ai";
import { runMemoryCase } from "./memory";
import { runOutageCase } from "./reliability";
import { runToolCase } from "./tools";

/** Layer 8 (Final Mission): structured output, tools, memory and recovery in one scenario. */
const missionConfig = z.object({ timeoutMs: z.number().int().min(5000).max(120000).default(45000) });

export const missionPlugin: VerifierPlugin<z.infer<typeof missionConfig>> = {
  id: "mission.final",
  name: "Final mission",
  category: "workflow",
  description: "One scenario that combines structured output, tool calling through a recovering outage, multi-turn memory and error reporting. A pass earns the final signed receipt.",
  participantHint: "Everything from the earlier layers has to work together in the same deployment.",
  configSchema: missionConfig,
  defaultConfig: { timeoutMs: 45000 },
  async run(ctx, config) {
    const structured = await runStructuredCases(ctx, 1, config.timeoutMs, "mission.structured.");
    const tools = await runToolCase(ctx, config.timeoutMs, "mission.tools.", { failFirst: { tools: ["exchange_rate"], count: 1 } });
    const memory = await runMemoryCase(ctx, config.timeoutMs, true, "mission.memory.");
    const outage = await runOutageCase(ctx, 5000, "mission.");
    return { checks: [...structured, ...tools.checks, ...memory, outage] };
  },
};
