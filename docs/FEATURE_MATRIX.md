# Feature matrix

Status on `main` (24 October 2026). **Built** means working end to end against a real database and covered by tests. Production runs on Vercel (site), Supabase (database and sign-in) and Railway (verification worker, two instances in Europe); rehearsals on production cover every race layer except the two that need a real team, which the student walkthrough covers.

| Area | Feature | Status | Where | Tested by |
| --- | --- | --- | --- | --- |
| Accounts | Email code sign-in, sessions, sign-out | Built (custom SMTP still to set up on production) | `/login`, `src/proxy.ts` | `scripts/team-journey.mts` |
| | Roles per event (participant, mentor, judge, organiser), platform admins | Built | `event_roles`, Admin → Participants | `ops.test.ts` |
| | Luma CSV import, matched to accounts by email; check-in | Built | Admin → Participants | `luma-import.test.ts`, browser |
| Teams | Create, invite code, join, leave; app URL and verifier token (rotatable) | Built | `/team` | `race.test.ts`, load test |
| Tournament engine | Survival, ranked (top N / %), checkpoint, hybrid; any number of layers and timings | Built | `src/core/tournament` | unit + `race.test.ts` |
| | Points race: build stages (open all sprint) and timed challenges, points from the first verified pass | Built | Points race template | `points.test.ts`, production rehearsal |
| | Teams can enter a running race until an elimination round is decided (points races: all sprint) | Built | `join_tournament`, `/race` | `points.test.ts`, `race.test.ts`, team walkthrough |
| | Server state machine, exactly-once decisions, database clock | Built | `scheduler.ts` | `race.test.ts`, rehearsal |
| | Pause/resume, extend, suspend eliminations, reinstate, override, reprocess, cancel (audited) | Built | Control room | `race.test.ts`, rehearsal |
| | Rehearsals at speed with fixture teams, including the on-chain payment stage | Built | Builder → Create rehearsal, `scripts/rehearse.mts` | `rehearsal.test.ts`, production rehearsals |
| Verification | ASRP/1 protocol, 11 verifier plugins, hidden per-attempt data, signed receipts | Built | `src/core/verification` | unit + `race.test.ts` |
| | SSRF-safe outbound client | Built | `safe-fetch.ts` | unit |
| | Durable job queue, leases, retries, ERROR blocks layers | Built | `jobs.ts`, worker | `race.test.ts`, load test |
| | Admin review of attempts with evidence | Built | Control room | `race.test.ts` |
| Admin | Tournament builder (layers, verifiers, validation, publish, schedule) | Built | Admin → Tournaments | Browser check |
| | Control room, CSV export | Built | `/admin/tournaments/[id]/control` | Browser check |
| | Command centre overview (worker health, queue, counts) | Built | `/admin` | Browser check |
| | Readiness checklist (worker, race setup, rehearsal, people; things to confirm) | Built | Admin → Readiness | Browser check |
| | Points & finalists: award/revoke, change layer points mid-race, finalists chosen on the day, team universities | Built | Admin → Points & finalists | `points.test.ts`, organiser walkthrough |
| | Announcements (by audience) | Built | Admin → Announcements, `/race`, `/display` | Browser check |
| | Audit log | Built | Admin → Audit log | `ops.test.ts` |
| Live | Participant race page (countdown, instructions, attempts, feedback, receipts) | Built | `/race` | Browser check |
| | Venue display (layers, teams, activity, announcements, winners, leaderboard) | Built | `/display` | Organiser walkthrough (1080p) |
| | Live leaderboard, Cambridge vs Oxford by average points per team, finalists | Built | `/leaderboard` | `points.test.ts`, walkthroughs |
| Event ops | Mentor requests: ask, claim, resolve, escalate; queue health | Built | `/mentor`, Admin → Mentors | `ops.test.ts`, browser |
| | Submissions for Build and Policy tracks, receipts, audited reopen | Built | `/submit`, Admin → Submissions | `ops.test.ts`, browser |
| | Judging: rubrics (weights to 100, confirm), even assignment, independent scoring, conflicts, clarifications, weighted results, guarded winner publishing | Built | `/judge`, Admin → Judging | `ops.test.ts`, `judging.test.ts` |
| Site | AI-first landing from the event database | Built | `/` | e2e |
| | AI Capability Lab (SIMULATED / REAL INTEGRATION / VERIFIED) with the payment agent simulation | Built | `/playground` | e2e |
| | Builder ZIPs: Next.js, Node, Python, Expo with Gemini, race adapter, payments, spending, paid API, Pay.sh, wallet | Built | `/build` | ZIP smoke tests, scaffold matrix 30/30 |
| | Race adapter passes the real verifier | Built | scaffolds `race` module | `scaffold-adapter.test.ts` |
| | Race memory helper (Upstash Redis on serverless hosting) | Built | scaffolds `race/memory` | starter tests (Upstash simulated) |
| | `payUsdc`: devnet USDC transfer with memo for the payment stage | Built | scaffolds `payments/transfer` | starter tests, local validator and live devnet payment through the platform verifier |
| Scale | 300 participants polling, burst submissions, 8 workers (local); 60 fixture teams on production, 660 verifications, 0 errors | Built | `REHEARSAL_TEAMS=60 scripts/rehearse.mts` | `npm run test:load`, production load rehearsal |
| Multi-event | Switch the active event with `ACTIVE_EVENT_SLUG`; all data is event-scoped | Built | | |
| Production | Vercel, Supabase, Railway worker (2 instances, EU) | Built. **To do:** custom SMTP (Postmark) and raised Auth rate limits | [DEPLOYMENT.md](DEPLOYMENT.md) | Production rehearsals |

## Known gaps

- Judging criteria, judges and team size for the Oxbridge AI Race aren't confirmed publicly; the database holds labelled samples until organisers confirm them.
- The rehearsal fixture apps answer deterministically without AI, on purpose: they test the platform, not models.
- Load on production: the 60-team rehearsal found tool-service calls taking about 3 s at peak because Vercel ran in Washington DC and the database is in Ireland; functions now run in Dublin. Re-run the 60-team rehearsal after any hosting change.
