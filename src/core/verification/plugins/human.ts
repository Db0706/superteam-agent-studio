import { z } from "zod";
import { check, type VerifierPlugin } from "../plugin";

/**
 * Human-reviewed verification for subjective criteria (originality, research quality,
 * governance proposals). The attempt goes to the organisers' review queue; no automatic
 * pass or fail. The app's health is checked so reviewers know it was reachable.
 */
const humanConfig = z.object({ rubric: z.string().min(1).max(2000).default("Reviewer judges the layer's objective against the instructions."), requireHealthyApp: z.boolean().default(false) });

export const humanPlugin: VerifierPlugin<z.infer<typeof humanConfig>> = {
  id: "human.review",
  name: "Human review",
  category: "human",
  description: "Sends each attempt to a reviewer queue. Use for subjective criteria; nothing is decided automatically.",
  participantHint: "A reviewer will look at your work against the layer instructions.",
  configSchema: humanConfig,
  defaultConfig: { rubric: "Reviewer judges the layer's objective against the instructions.", requireHealthyApp: false },
  async run(ctx, config) {
    const checks = [];
    if (config.requireHealthyApp) {
      const h = await ctx.checkHealth();
      checks.push(check("health", "App reachable for review", h.ok, h.message, undefined, 0));
    }
    return { checks, reviewReason: config.rubric };
  },
};
