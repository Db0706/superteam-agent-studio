# Implementation report: Agent Studio 2.0

20 October 2026, branch `platform-2.0` (draft PR #20), for the Oxford and Cambridge AI Race on 25 October 2026.

## What was built

The existing site (AI starters, Builder ZIPs, Inspiration, guide) was kept and extended into a competition platform. [FEATURE_MATRIX.md](FEATURE_MATRIX.md) lists every feature with its status and tests. In short:

- **Platform core:** Supabase auth with email codes, RLS on every table, writes only through audited database functions, per-event roles, Luma CSV import.
- **Tournament engine:** four modes, any layers and timings from config, a server-side state machine with exactly-once decisions on the database clock, emergency controls, and rehearsals that run on their own.
- **Verification engine:** ASRP/1, 11 verifier plugins, hidden per-attempt test data, tool evidence from our own call log, signed receipts, an SSRF-safe client, and a durable job queue where errors block a layer rather than eliminate anyone.
- **Interfaces:** admin builder and control room, command centre, live race page, venue display.
- **Event operations:** mentor support, Build/Policy submissions, judging portal with guarded winner publishing, announcements.
- **AI-first site:** landing from the event database, AI Capability Lab with honest labels, 36 new AI-first ideas, and a race adapter module for all four starter frameworks (scaffolds v0.11.0).

## How it was checked

| Check | Result |
| --- | --- |
| Lint, types, 204 unit tests | Pass |
| Playwright, desktop and mobile (40) | Pass |
| Integration tests on a real Supabase stack: full 8-layer race with real verification, event ops and permissions (20) | Pass locally and in CI on a fresh stack |
| Real-clock rehearsal: 4-hour race at ×30, real scheduler and worker, pause and extension | Pass (8.4 minutes) |
| Load test: 300 participants, 75 teams, burst submissions, 8 workers | Pass: read p95 182 ms, submit p95 266 ms, each layer verified in under 1 s |
| Scaffold matrix (30 combinations) and ZIP smoke tests | Pass |
| A composed starter with the race adapter against the real verifier | Passes layer 1 once `respond` is written; fails clearly when it isn't |

## Problems found and fixed along the way

- Rehearsals had no way to submit for fixture teams, so every fixture would have been eliminated at layer 1.
- The audit trigger made deleting an event fail.
- Internal helpers (`emit`, `write_audit`) were callable by any signed-in user.
- Every request called the auth server twice; now tokens are verified locally.
- Rubric edits weren't validated and could change criteria after final scores existed.

## Not done, and why

- **Production deployment.** It needs the organisers' Supabase, SMTP, Vercel and worker-host accounts. Steps are in [DEPLOYMENT.md](DEPLOYMENT.md). Raise the Auth sign-in rate limit: the default (30 per 5 minutes per IP) is too low for a venue on one Wi-Fi.
- **Load test against hosted Supabase.** It can only run once a staging project exists.
- **Official judging criteria, judges and team size** aren't public yet. The database has clearly labelled samples; winners can't be published until criteria are confirmed.
