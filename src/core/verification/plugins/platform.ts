import { z } from "zod";
import { check, type VerifierPlugin } from "../plugin";

/**
 * Build-stage checks for points races. They confirm a stage from things the platform can see for
 * itself: the team's app answering at its public URL, and the team's own submission records.
 * Nothing is taken on the team's word.
 */

const healthConfig = z.object({});

export const appLivePlugin: VerifierPlugin<z.infer<typeof healthConfig>> = {
  id: "app.live",
  name: "App is live",
  category: "api",
  description: "Checks the team's app answers the race health check at its public URL with the team's verifier token.",
  participantHint: "Deploy your app to a public https:// URL, add the race adapter, and paste the URL on your team page.",
  configSchema: healthConfig,
  defaultConfig: {},
  async run(ctx) {
    const h = await ctx.checkHealth();
    return { checks: [check("health", "App answers at its public URL", h.ok, h.message)] };
  },
};

const ideaConfig = z.object({
  /** Minimum characters in the problem statement for the idea to count as locked in. */
  minProblemChars: z.number().int().min(1).max(2000).default(60),
});

export const ideaPlugin: VerifierPlugin<z.infer<typeof ideaConfig>> = {
  id: "platform.idea",
  name: "Idea locked in",
  category: "human",
  description: "Checks the team has a submission draft (either track) with a title and a problem statement of at least the configured length.",
  participantHint: "On the Submit page, give your project a title and describe the problem it solves, then save the draft.",
  configSchema: ideaConfig,
  defaultConfig: { minProblemChars: 60 },
  async run(ctx, config) {
    const team = await ctx.team();
    if (!team) return { checks: [check("team", "Belongs to a team", false, "Only teams can lock in an idea.")] };
    const best = team.submissions.find((s) => s.title.trim() && String(s.fields.problem ?? "").trim().length >= config.minProblemChars);
    const any = team.submissions.find((s) => s.title.trim());
    ctx.evidence("submissions", team.submissions.map((s) => ({ track: s.track, status: s.status, title: s.title, problemChars: String(s.fields.problem ?? "").trim().length })));
    return {
      checks: [
        check("title", "Project has a title", !!any, any ? "Title saved." : "Save a draft on the Submit page with your project's title."),
        check("problem", `Problem described (at least ${config.minProblemChars} characters)`, !!best, best ? "Problem statement saved." : `Describe the problem in at least ${config.minProblemChars} characters and save the draft.`),
      ],
    };
  },
};

const submittedConfig = z.object({ track: z.enum(["any", "build", "policy"]).default("any") });

export const submittedPlugin: VerifierPlugin<z.infer<typeof submittedConfig>> = {
  id: "platform.submitted",
  name: "Final submission in",
  category: "human",
  description: "Checks the team has made a final submission (with a receipt) to an official track.",
  participantHint: "Complete every required field on the Submit page and press Submit. You'll get a receipt code.",
  configSchema: submittedConfig,
  defaultConfig: { track: "any" },
  async run(ctx, config) {
    const team = await ctx.team();
    if (!team) return { checks: [check("team", "Belongs to a team", false, "Only teams can submit.")] };
    const final = team.submissions.find((s) => s.status === "submitted" && (config.track === "any" || s.track === config.track));
    ctx.evidence("submissions", team.submissions.map((s) => ({ track: s.track, status: s.status })));
    const where = config.track === "any" ? "a track" : `the ${config.track} track`;
    return { checks: [check("final", `Final submission to ${where}`, !!final, final ? "Final submission received." : `Submit your project to ${where} on the Submit page.`)] };
  },
};
