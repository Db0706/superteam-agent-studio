import { z } from "zod";

/**
 * The tournament configuration contract (agent-studio.tournament/1).
 *
 * Organisers edit a draft of this in the admin builder. Publishing validates it with
 * `parseTournamentConfig` and freezes a copy in `tournament_versions`; the running
 * tournament only ever reads the frozen copy. Nothing here is hardcoded: number of
 * layers, durations, modes and elimination rules all come from the config.
 *
 * Pure module: imported by the Next.js app, the worker and the tests.
 */

export const TOURNAMENT_SCHEMA = "agent-studio.tournament/1" as const;

export const modeSchema = z.enum(["survival", "ranked", "checkpoint", "hybrid"]);
export type TournamentMode = z.infer<typeof modeSchema>;

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, "Use lowercase letters, numbers and hyphens");

/** How a layer's result is used. Survival forces "eliminate"; checkpoint forces "checkpoint". */
export const layerOutcomeSchema = z.enum(["eliminate", "checkpoint"]);

/** Who advances from an eliminating layer. */
export const advancementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all_passing") }),
  z.object({ kind: z.literal("top_n"), n: z.number().int().min(1).max(10_000) }),
  z.object({ kind: z.literal("top_percent"), percent: z.number().min(1).max(100) }),
]);
export type Advancement = z.infer<typeof advancementSchema>;

/** Deterministic tie-break order, shown to participants before the tournament starts. */
export const tieBreakSchema = z.enum(["score_desc", "first_pass_at_asc", "attempts_asc", "submitted_at_asc"]);

export const verifierRefSchema = z.object({
  /** Plugin id from the verifier catalogue (src/core/verification/catalogue.ts). */
  plugin: z.string().regex(/^[a-z][a-z0-9_.-]{1,63}$/),
  /** Plugin-specific settings, validated by that plugin's own schema at publish time. */
  config: z.record(z.string(), z.unknown()).default({}),
  /** Plain-language criteria shown to participants. Hidden test data never goes here. */
  visibleCriteria: z.array(z.string().min(1).max(200)).max(12).default([]),
});
export type VerifierRef = z.infer<typeof verifierRefSchema>;

export const layerSchema = z.object({
  key: slug,
  title: z.string().min(1).max(80),
  description: z.string().max(400).default(""),
  objective: z.string().max(400).default(""),
  /** Markdown shown to participants when the layer opens. */
  instructions: z.string().max(8000).default(""),
  difficulty: z.enum(["intro", "core", "advanced", "expert"]).default("core"),
  capabilities: z.array(z.string().min(1).max(40)).max(10).default([]),
  /** Layer keys that must be passed first. */
  prerequisites: z.array(slug).max(10).default([]),
  resources: z.array(z.object({ label: z.string().min(1).max(80), url: z.url() })).max(12).default([]),
  /** Hints unlock after a number of failed attempts. */
  hints: z.array(z.object({ afterAttempts: z.number().int().min(0).max(50), text: z.string().min(1).max(500) })).max(8).default([]),
  timing: z.object({
    /** Seconds from the tournament start when the layer opens. */
    offsetSeconds: z.number().int().min(0).max(14 * 24 * 3600),
    /** How long the layer stays open. */
    durationSeconds: z.number().int().min(60).max(7 * 24 * 3600),
  }),
  outcome: layerOutcomeSchema.default("eliminate"),
  advancement: advancementSchema.default({ kind: "all_passing" }),
  /** 0–100. A verified attempt at or above this passes. */
  passingScore: z.number().min(0).max(100).default(100),
  retries: z
    .object({
      /** null = unlimited attempts while the layer is open. */
      maxAttempts: z.number().int().min(1).max(200).nullable().default(null),
      cooldownSeconds: z.number().int().min(0).max(3600).default(30),
    })
    .default({ maxAttempts: null, cooldownSeconds: 30 }),
  verifier: verifierRefSchema,
  /** Weight of this layer in the overall standings. */
  weight: z.number().min(0).max(100).default(1),
  achievement: z.object({ title: z.string().min(1).max(60) }).optional(),
  feedback: z.object({ showCheckNames: z.boolean().default(true), showDetails: z.boolean().default(true) }).default({ showCheckNames: true, showDetails: true }),
});
export type LayerConfig = z.infer<typeof layerSchema>;

export const tournamentConfigSchema = z
  .object({
    schema: z.literal(TOURNAMENT_SCHEMA),
    name: z.string().min(1).max(100),
    description: z.string().max(2000).default(""),
    mode: modeSchema,
    participation: z.enum(["team", "individual"]).default("team"),
    timezone: z.string().min(1).default("Europe/London"),
    tieBreak: z.array(tieBreakSchema).min(1).max(4).default(["score_desc", "first_pass_at_asc", "attempts_asc"]),
    /** Whether tournament results feed the official judging. Off unless an organiser turns it on. */
    countsTowardsJudging: z.boolean().default(false),
    layers: z.array(layerSchema).min(1).max(50),
  })
  .superRefine((cfg, ctx) => {
    const keys = new Set<string>();
    cfg.layers.forEach((layer, i) => {
      if (keys.has(layer.key)) ctx.addIssue({ code: "custom", path: ["layers", i, "key"], message: `Duplicate layer key "${layer.key}"` });
      for (const p of layer.prerequisites) {
        if (!keys.has(p)) ctx.addIssue({ code: "custom", path: ["layers", i, "prerequisites"], message: `"${p}" must be an earlier layer` });
      }
      keys.add(layer.key);
      if (cfg.mode === "ranked" && layer.outcome === "eliminate" && layer.advancement.kind === "all_passing" && layer.passingScore === 0) {
        ctx.addIssue({ code: "custom", path: ["layers", i, "passingScore"], message: "Ranked layers need a passing score above 0 or a top-N rule" });
      }
    });
  });
export type TournamentConfig = z.infer<typeof tournamentConfigSchema>;

/** Effective outcome of a layer under the tournament mode. */
export function effectiveOutcome(mode: TournamentMode, layer: Pick<LayerConfig, "outcome">): "eliminate" | "checkpoint" {
  if (mode === "survival" || mode === "ranked") return "eliminate";
  if (mode === "checkpoint") return "checkpoint";
  return layer.outcome;
}

export type ConfigResult = { ok: true; config: TournamentConfig } | { ok: false; issues: { path: string; message: string }[] };

export function parseTournamentConfig(input: unknown): ConfigResult {
  const parsed = tournamentConfigSchema.safeParse(input);
  if (parsed.success) return { ok: true, config: parsed.data };
  return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
}

/** Lays out N equal back-to-back windows: the builder's "every 30 minutes for 4 hours" shortcut. */
export function evenWindows(count: number, intervalSeconds: number): { offsetSeconds: number; durationSeconds: number }[] {
  return Array.from({ length: count }, (_, i) => ({ offsetSeconds: i * intervalSeconds, durationSeconds: intervalSeconds }));
}

/** Total tournament length implied by the layers. */
export function tournamentSpanSeconds(cfg: Pick<TournamentConfig, "layers">): number {
  return Math.max(...cfg.layers.map((l) => l.timing.offsetSeconds + l.timing.durationSeconds));
}

/** Stable JSON for hashing and signing: object keys sorted, no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}
