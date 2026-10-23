# Authoring layers and verifiers

A race is a list of **layers** in a tournament config (`agent-studio.tournament/1`, `src/core/tournament/config.ts`). Each layer points at a **verifier plugin** that tests the team's live app. Organisers build races in **Admin → Tournaments** without code; new kinds of check need a plugin.

## Layers (no code)

In the Builder, each layer has:

| Field | What it does |
| --- | --- |
| Title, description, objective, instructions | What participants see. Instructions are Markdown shown when the layer opens. |
| Capabilities, difficulty, resources, hints | Labels, links, and hints that unlock after N failed attempts. |
| Timing | Opens at an offset from the race start, for a duration (minimum 60 seconds). |
| Outcome and advancement | In hybrid races: eliminate or checkpoint. Who advances: everyone passing, top N, or top %. |
| Passing score | 0 to 100; a verified attempt at or above it passes. |
| Retries | Maximum attempts (or unlimited) and the cooldown between them. |
| Verifier | The plugin, its settings, and the plain-language criteria shown to teams. |
| Prerequisites | Earlier layers that must be passed first. |

Publishing validates everything, including each plugin's own settings, and freezes the config as a new version. Rules lock when the race is scheduled.

**Always rehearse a changed race** (*Create rehearsal* in the Builder) with fixture teams that pass and fail for known reasons before publishing it to participants.

## Built-in verifiers

| Plugin | Checks |
| --- | --- |
| `ai.respond` | Health, envelope with echoed nonce, correct answers to fresh questions |
| `ai.structured` | JSON matching a schema on held-out inputs; malformed requests rejected |
| `tools.invoke` | Real calls to reference tools (from our call log), results used, nothing invented |
| `knowledge.source` | Answers from a knowledge source with citations; `null` when it isn't there |
| `memory.multiturn` | Facts recalled across turns; no leaks between sessions |
| `reliability.faults` | Input validation, retries on transient failures, clear errors and time limits |
| `workflow.purchase` | Ordered multi-step tool use within a spending limit |
| `mission.final` | A combined task across the earlier capabilities |
| `http.contract` | A plain HTTP API contract (status codes, JSON shape) |
| `payments.devnet_settlement` | A real devnet payment to the organiser's address, confirmed on chain |
| `human.review` | Sends the attempt to an organiser to decide, with the evidence |

## Writing a verifier plugin

1. Add a file in `src/core/verification/plugins/` exporting a `VerifierPlugin` (`src/core/verification/plugin.ts`):
   - `id`, `name`, `description`, `category`, `participantHint`;
   - `configSchema` (zod) and `defaultConfig`: settings organisers can change in the Builder;
   - `run(ctx, config)` returning `{ checks }`.
2. Register it in `src/core/verification/catalogue.ts`. It then appears in the Builder.
3. Inside `run`:
   - Generate test data with `ctx.rng` only. It's seeded per attempt with a server secret, so every attempt is fresh and reproducible for organisers, but unpredictable for teams.
   - Talk to the app with `ctx.callApp(task)` (ASRP/1) or `ctx.raw()` (plain HTTP). Both go through the SSRF-safe client.
   - For tool use, create a session with `ctx.createSession(kind, facts, behaviour)` and judge by `ctx.invocations(sessionId)`, the tool service's own record, never by what the app claims.
   - Return one `CheckResult` per thing checked: a plain `label`, `passed`, a `weight`, a `message` that helps the team fix it **without revealing hidden inputs or expected values**, and organiser-only `detail`.
   - Record anything an organiser might need to judge an appeal with `ctx.evidence(key, value)`.
   - If **our** side fails (a database error, a challenge service down), throw `InfrastructureError`. The job is retried and, if it keeps failing, the attempt ends as ERROR, which blocks the layer for an organiser. Never turn our failures into a team's failed check.
4. Plugins never decide pass or fail. The engine scores the weighted checks against the layer's passing score.
5. Add tests: a fixture app variant in `src/server/fixtures/reference-app.ts` that passes, and at least one that fails for the reason the plugin targets, then an integration test that races them (see `tests/integration/race.test.ts`).

## Subjective judgement

Anything that needs taste (quality of writing, usefulness, design) is not an automatic elimination. Use `human.review`, or keep it for track judging. AI may help an organiser look, but it is never the only authority for a subjective elimination.
