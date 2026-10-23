# Agent Studio 2.0: platform architecture

Agent Studio is an AI development and competition platform: discover ideas, build AI applications, test capabilities, compete in automatically verified tournaments, and submit to an event's official tracks. The flagship event is the Oxford and Cambridge AI Race (25 October 2026, King's College, Cambridge).

## System overview

```
 Browser (participants, mentors, judges, organisers, venue screen)
   │  Supabase Auth session (cookies via @supabase/ssr)
   ▼
 Next.js 16 app on Vercel  ──────────────── supabase-js as the user (RLS + permission-checked functions)
   │  /api/race/challenge/*  reference tool & knowledge services (trusted evidence)
   │  /api/race/fixtures/*   fixture apps for rehearsals (FIXTURES_ENABLED only)
   │  /api/scaffold          project ZIP generator (unchanged)
   ▼
 Supabase Postgres  ◄──── verification worker (Railway, Node 22): scheduler + job queue
   events, teams, tournaments, layer_runs, attempts, jobs, receipts, decisions, …
   Realtime publication: activity_events, layer_runs, tournament_participants, tournaments
   ▲
   └──── participant apps (anywhere on the public internet) ◄── worker calls them over ASRP/1
```

## Boundaries

| Layer | Code | Rule |
| --- | --- | --- |
| Pure domain | `src/core/**` | No I/O except `safe-fetch.ts`. Shared by app, worker and tests. |
| Server modules | `src/server/**` | `server-only`. Privileged DB access (`DATABASE_URL`) only in the worker, challenge services and admin reads. |
| Database | `supabase/migrations/**` | The authority for permissions, the clock and state transitions. |
| App | `src/app/**`, `src/components/**` | Reads as the user. Writes only through database functions (`callRpc`). |
| Worker | `worker/main.ts` | Runs `tick()` and `processOneJob()`; scale horizontally. |

## Data model (key tables)

- **events**, **event_tracks** (official Build/Policy tracks), **event_roles** (participant, mentor, judge, organiser), **platform_admins**, **registrations** (approved attendees from the Luma CSV, matched to accounts by email).
- **profiles**, **teams**, **team_members** (one team per person per event), **team_invites**, **projects** (repo, demo, the app URL the verifier calls, the verifier token).
- **tournaments** (draft config + status), **tournament_versions** (frozen published configs), **layer_runs** (one per layer: the layer state machine with absolute times), **tournament_participants** (team, individual or rehearsal fixture).
- **verification_attempts** (server `submitted_at`, status, score, participant-safe `feedback`, organiser-only `evidence`), **verification_jobs** (durable queue with leases), **verification_receipts** (HMAC-signed), **challenge_sessions** (hidden per-attempt test data), **tool_invocations** (trusted call log), **advancement_decisions** (unique per participant per layer), **achievements**.
- **activity_events** (live feed; `is_public` rows are spectator-safe), **announcements**, **mentor_requests**, **submissions**, **submission_artifacts**, **judging_rubrics**, **judge_assignments**, **judging_scores**, **winners**, **audit_logs**, **worker_heartbeats**.

## Permissions

- RLS on every table. Browsers have no INSERT/UPDATE/DELETE on runtime tables; they call `SECURITY DEFINER` functions that check `auth.uid()`, roles and team membership, use `now()`, and write audit records for organiser actions in the same transaction.
- Column grants hide `verification_attempts.evidence` and `projects.verifier_token`; organisers read evidence through `attempt_evidence()`, teams read their token through `project_verifier_token()`.
- Spectators (anon) see published, non-rehearsal tournaments, their layer runs, participant names/states, decisions and public activity only.

## Tournament engine

- Config contract: `src/core/tournament/config.ts` (`agent-studio.tournament/1`). Modes: survival, ranked (top N / top %), checkpoint, hybrid (per-layer outcome). Nothing about layer count, timing or rules is hardcoded.
- Publishing freezes the config as a new version. Scheduling creates `layer_runs` with absolute times. Rules are locked from then on; emergency controls (pause/resume, extend, suspend eliminations, reinstate, override, reprocess, cancel) are audited database functions.
- State machine: `src/server/engine/scheduler.ts` `tick()` under an advisory lock; every update is guarded by the expected state. Finalisation decides a layer in one transaction with the unique `(layer_run, participant)` constraint: exactly-once advancement.
- Fairness: an attempt's `submitted_at` (database clock) decides timeliness. A layer waits in FINALISING until every on-time attempt has a result. Infrastructure errors and human-review items block the layer for organiser action, never silently deciding anyone.

## Verification engine

- Protocol: ASRP/1 (`src/core/verification/protocol.ts`, `docs/VERIFICATION_SDK.md`).
- Plugins: `src/core/verification/catalogue.ts`. Built-in: `ai.respond`, `ai.structured`, `tools.invoke`, `knowledge.source`, `memory.multiturn`, `reliability.faults`, `workflow.purchase`, `mission.final`, `http.contract`, `payments.devnet_settlement`, `human.review`.
- Hidden per-attempt data from a seeded RNG (attempt id + server secret). Tool evidence comes from the platform's own `tool_invocations` log, never from the app's claims.
- Outbound calls only through `safe-fetch.ts`: public addresses only, socket pinned to the checked IP, no redirects, size and time limits.
- No participant code runs on our infrastructure: verification is black-box over HTTP.

## Realtime and reliability

- Supabase Realtime on `activity_events`, `layer_runs`, `tournament_participants`, `tournaments`; every live view also polls (5–10 s) so a dropped socket only delays updates.
- Worker heartbeats in `worker_heartbeats`; the command centre shows queue depth and worker freshness.
- See `docs/RUNBOOK.md` for outage procedures.
