# Implementation plan and workstreams

Branch: `platform-2.0` (integration branch). Live event: 25 October 2026. `main` stays deployable throughout; platform routes need Supabase and show a "not connected" notice without it.

## Baseline (2026-10-20, main @ 2c54652)

Lint, tsc, 196 unit tests, 40 Playwright tests and the scaffold ZIP smoke test all pass. Working today: Dashboard, Playground (simulated), Build (real ZIPs for Next.js, Node, Python, Expo with Gemini, payments, spending, paid API, wallet, Pay.sh), Inspiration (250 ideas), First 10 Minutes guide.

## Contracts (agree before parallel work)

| Contract | Where |
| --- | --- |
| Database schema, RLS, functions | `supabase/migrations/2026102000000{1,2}_*.sql` |
| Tournament config | `src/core/tournament/config.ts` |
| Verification protocol (ASRP/1) | `src/core/verification/protocol.ts` |
| Verifier plugin interface | `src/core/verification/plugin.ts` |
| Viewer / roles (DAL) | `src/server/dal/viewer.ts` |
| Server actions → DB functions | `src/server/actions/rpc.ts` (`callRpc`) |
| Page gating | `src/components/platform/Gate.tsx` |
| Admin sections | `src/app/admin/AdminNav.tsx` |

Changing a contract needs a note in this file and the integration branch updated first.

## Workstreams and file ownership

| # | Workstream | Owns |
| --- | --- | --- |
| 1 | Architecture & integration | `docs/**`, `src/app/layout.tsx`, `src/components/shell/**`, `src/app/admin/layout.tsx`, `AdminNav.tsx` |
| 2 | Auth, teams, persistence | `supabase/**`, `src/lib/supabase/**`, `src/server/dal/**`, `src/app/login`, `src/app/auth`, `src/app/team` |
| 3 | AI-first UI & navigation | `src/app/page.tsx`, `src/components/dashboard/**`, `src/components/playground/**`, `src/components/inspiration/**` |
| 4 | Tournament administration | `src/app/admin/tournaments/**`, `src/components/admin/tournaments/**` |
| 5 | State machine & scheduling | `src/server/engine/scheduler.ts`, `src/core/tournament/**` |
| 6 | Verification engine & worker | `src/core/verification/**`, `src/core/challenge/**`, `src/server/engine/{verify,jobs}.ts`, `worker/**` |
| 7 | SDK & starter integration | `docs/VERIFICATION_SDK.md`, `packages/**`, scaffold adapters |
| 8 | Live participant & venue UI | `src/app/race/**`, `src/app/display/**`, `src/components/race/**` |
| 9 | Submissions, judging, mentoring | `src/app/{submit,mentor,judge}/**`, `src/app/admin/{mentors,submissions,judging}/**`, `src/components/ops/**` |
| 10 | Security, infra, QA | `tests/**`, `.github/**`, `docs/RUNBOOK.md`, load tests |

Integration tests share the local Supabase database: each test file passes its own `scope` to `startHarness()` and only deletes its own rows.

## Phases

1. **Core infrastructure** ✅ migrations, RLS, functions, DAL, auth, admin shell.
2. **Tournament engine** ✅ config, modes, state machine, scheduling, advancement, pause/resume/extend/reinstate/override, rehearsal configs.
3. **Verification engine** ✅ protocol, safe client, plugins for 8 layers + API contract + devnet settlement + human review, challenge services, receipts, queue, retries.
4. **AI-first frontend** ✅ landing from the event database, navigation, AI Capability Lab labels, Inspiration categories, race adapter in the Builder.
5. **Tournament interfaces** ✅ race dashboard, team workspace, venue display, admin builder, control room.
6. **Event operations** ✅ mentors, Luma CSV import, submissions, judging, announcements, command centre.
7. **Hardening** ✅ permission tests, deadline and concurrency tests, 300-user load test, real-clock rehearsal, runbook. Remaining: production setup (needs the organisers' accounts) and a load test against hosted Supabase.
