# Feature matrix

Status on branch `platform-2.0` (20 October 2026). **Built** means working end to end against a real database and covered by tests; **local** means tested on the local Supabase stack but not yet on the production project, which doesn't exist yet.

| Area | Feature | Status | Where | Tested by |
| --- | --- | --- | --- | --- |
| Accounts | Email code sign-in, sessions, sign-out | Built, local | `/login`, `src/proxy.ts` | Browser check |
| | Roles per event (participant, mentor, judge, organiser), platform admins | Built | `event_roles`, Admin → Participants | `ops.test.ts` |
| | Luma CSV import, matched to accounts by email; check-in | Built | Admin → Participants | `luma-import.test.ts`, browser |
| Teams | Create, invite code, join, leave; app URL and verifier token (rotatable) | Built | `/team` | `race.test.ts`, load test |
| Tournament engine | Survival, ranked (top N / %), checkpoint, hybrid; any number of layers and timings | Built | `src/core/tournament` | unit + `race.test.ts` |
| | Server state machine, exactly-once decisions, database clock | Built | `scheduler.ts` | `race.test.ts`, rehearsal |
| | Pause/resume, extend, suspend eliminations, reinstate, override, reprocess, cancel (audited) | Built | Control room | `race.test.ts`, rehearsal |
| | Rehearsals at speed with fixture teams | Built | Builder → Create rehearsal | `rehearsal.test.ts` (real clock) |
| Verification | ASRP/1 protocol, 11 verifier plugins, hidden per-attempt data, signed receipts | Built | `src/core/verification` | unit + `race.test.ts` |
| | SSRF-safe outbound client | Built | `safe-fetch.ts` | unit |
| | Durable job queue, leases, retries, ERROR blocks layers | Built | `jobs.ts`, worker | `race.test.ts`, load test |
| | Admin review of attempts with evidence | Built | Control room | `race.test.ts` |
| Admin | Tournament builder (layers, verifiers, validation, publish, schedule) | Built | Admin → Tournaments | Browser check |
| | Control room, CSV export | Built | `/admin/tournaments/[id]/control` | Browser check |
| | Command centre overview (worker health, queue, counts) | Built | `/admin` | Browser check |
| | Announcements (by audience) | Built | Admin → Announcements, `/race`, `/display` | Browser check |
| | Audit log | Built | Admin → Audit log | `ops.test.ts` |
| Live | Participant race page (countdown, instructions, attempts, feedback, receipts) | Built | `/race` | Browser check |
| | Venue display (layers, teams, activity, announcements, winners) | Built | `/display` | Browser check |
| Event ops | Mentor requests: ask, claim, resolve, escalate; queue health | Built | `/mentor`, Admin → Mentors | `ops.test.ts`, browser |
| | Submissions for Build and Policy tracks, receipts, audited reopen | Built | `/submit`, Admin → Submissions | `ops.test.ts`, browser |
| | Judging: rubrics (weights to 100, confirm), even assignment, independent scoring, conflicts, clarifications, weighted results, guarded winner publishing | Built | `/judge`, Admin → Judging | `ops.test.ts`, `judging.test.ts` |
| Site | AI-first landing from the event database | Built | `/` | e2e |
| | AI Capability Lab (SIMULATED / REAL INTEGRATION / VERIFIED) with the payment agent simulation | Built | `/playground` | e2e |
| | Builder ZIPs: Next.js, Node, Python, Expo with Gemini, race adapter, payments, spending, paid API, Pay.sh, wallet | Built | `/build` | ZIP smoke tests, scaffold matrix 30/30 |
| | Race adapter passes the real verifier | Built | scaffolds `race` module | `scaffold-adapter.test.ts` |
| Scale | 300 participants polling, burst submissions, 8 workers | Built, local | | `npm run test:load` |
| Multi-event | Switch the active event with `ACTIVE_EVENT_SLUG`; all data is event-scoped | Built | | |
| Production | Supabase project, SMTP, Vercel env, worker host | **Not started**: needs the organisers' accounts | [DEPLOYMENT.md](DEPLOYMENT.md) | |

## Known gaps

- Judging criteria, judges and team size for the Oxbridge AI Race aren't confirmed publicly; the database holds labelled samples until organisers confirm them.
- The rehearsal fixture apps answer deterministically without AI, on purpose: they test the platform, not models.
- Not load-tested against hosted Supabase (only the local stack), because the production project doesn't exist yet. Run `npm run test:load` against a staging project before the event.
