import { z } from "zod";

/**
 * ASRP/1: the Agent Studio Race Protocol. How the verifier talks to a participant's app.
 *
 *   GET  {app}/agent-studio/v1/health  -> HealthResponse
 *   POST {app}/agent-studio/v1/tasks   -> TaskResponse        (body: TaskRequest)
 *
 * Every verifier request carries `Authorization: Bearer <project verifier token>` so the app
 * can ignore anyone else, and a fresh `nonce` the app must echo back. The app may use any AI
 * model or none: the protocol fixes the envelope, never the model.
 *
 * Tools and data sources in a task are the platform's reference challenge services. The app
 * calls them with the task's challenge token; the service records each call, and that record
 * (not the app's own claim) is the evidence a tool was really used.
 */

export const PROTOCOL = "asrp/1" as const;
export const HEALTH_PATH = "/agent-studio/v1/health";
export const TASKS_PATH = "/agent-studio/v1/tasks";

export const taskTypeSchema = z.enum(["respond", "extract", "use_tools", "answer_from_source", "converse", "run_workflow"]);
export type TaskType = z.infer<typeof taskTypeSchema>;

export const toolSpecSchema = z.object({
  name: z.string(),
  description: z.string(),
  /** POST JSON here with `Authorization: Bearer <challengeToken>`. */
  url: z.url(),
  inputSchema: z.record(z.string(), z.unknown()),
});
export type ToolSpec = z.infer<typeof toolSpecSchema>;

export const taskRequestSchema = z.object({
  protocol: z.literal(PROTOCOL),
  nonce: z.string().min(16),
  attempt: z.object({ id: z.string(), layer: z.string(), number: z.number().int() }),
  task: z.object({
    type: taskTypeSchema,
    /** Natural-language instruction or structured input, depending on the task type. */
    input: z.union([z.string(), z.record(z.string(), z.unknown())]),
    /** JSON Schema the output data must match (extract, run_workflow). */
    schema: z.record(z.string(), z.unknown()).optional(),
    /** Conversation id for multi-turn tasks. Keep context per session id, never across them. */
    sessionId: z.string().optional(),
    tools: z.array(toolSpecSchema).optional(),
    source: z.object({ url: z.url(), description: z.string() }).optional(),
    challengeToken: z.string().optional(),
    limits: z
      .object({ maxToolCalls: z.number().int().optional(), maxSpendUsd: z.number().optional(), timeoutMs: z.number().int().optional() })
      .optional(),
  }),
});
export type TaskRequest = z.infer<typeof taskRequestSchema>;

export const errorCodeSchema = z.enum(["invalid_input", "upstream_unavailable", "upstream_timeout", "limit_exceeded", "unauthorized", "internal"]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const taskOkSchema = z.object({
  protocol: z.literal(PROTOCOL),
  nonce: z.string(),
  status: z.literal("ok"),
  output: z.object({
    /** Natural-language answer, if the task has one. */
    text: z.string().optional(),
    /** Structured result (must match `task.schema` when one is given). */
    data: z.unknown().optional(),
    /** What the app says its tools returned. Checked against the tool service's own records. */
    toolResults: z.array(z.object({ tool: z.string(), result: z.unknown() })).optional(),
  }),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const taskErrorSchema = z.object({
  protocol: z.literal(PROTOCOL),
  nonce: z.string().optional(),
  status: z.literal("error"),
  error: z.object({ code: errorCodeSchema, message: z.string() }),
});

export const taskResponseSchema = z.discriminatedUnion("status", [taskOkSchema, taskErrorSchema]);
export type TaskResponse = z.infer<typeof taskResponseSchema>;
export type TaskOk = z.infer<typeof taskOkSchema>;

export const healthResponseSchema = z.object({
  protocol: z.literal(PROTOCOL),
  status: z.enum(["ready", "starting"]),
  name: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
