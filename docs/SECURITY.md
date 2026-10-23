# Security model

## Who can do what

- **Row-level security on every table.** Browsers hold only the anon key and the user's session. They can read what the policies allow and nothing else.
- **No direct writes to runtime tables.** INSERT, UPDATE and DELETE are revoked from browser roles on tournaments, attempts, jobs, receipts, decisions, teams, projects, submissions, judging, winners, mentor requests and audit logs. Every change goes through a `SECURITY DEFINER` database function that checks `auth.uid()`, the caller's event role or team membership, and the current state, using the database clock (`now()`).
- **Organiser actions are audited in the same transaction** they happen in (`audit_logs`: who, what, when, why). The internal helpers that write audit and activity rows (`write_audit`, `emit`, the audit trigger) can't be called by browser roles (checked by `tests/integration/ops.test.ts`).
- **Hidden columns.** Column grants hide `verification_attempts.evidence` (hidden test inputs and expected answers) and `projects.verifier_token`. Organisers read evidence through `attempt_evidence()`; a team reads its own token through `project_verifier_token()`.
- **Roles are per event**: participant (only people on the approved Luma list), mentor, judge, organiser, plus platform admins. Judges only see submissions assigned to them and only their own scores. Rubrics can only change through `save_rubric`, which validates weights and refuses to change criteria once final scores exist.
- **Spectators** (not signed in, e.g. the venue screen) see published, non-rehearsal races: layer times, team names and states, decisions and public activity. Never attempts, feedback, evidence or contact details.

## Sign-in

- Email one-time codes through Supabase Auth; no passwords. Accounts are matched to the Luma list by email, so only approved attendees get participant access.
- Sessions are verified on the server with `auth.getClaims()` (the project's asymmetric signing keys). The database re-checks the same token on every query.

## Verifying participants' apps

- **No participant code runs on our infrastructure.** Verification is black-box over HTTP to the team's own deployment.
- **Outbound requests go only through `safe-fetch.ts`:** public addresses only (private, loopback, link-local, CGNAT, multicast and metadata ranges are blocked for IPv4 and IPv6), the socket is pinned to the address that was checked (so DNS rebinding can't redirect it), redirects are never followed, and responses are limited in size and time. `VERIFIER_ALLOW_PRIVATE_TARGETS` (for local testing) is refused in production.
- **Each team has a verifier token** sent as a Bearer token, so their app can ignore anyone else. Teams can rotate it.
- **Hidden test data is fresh per attempt**, derived from the attempt id and `VERIFIER_SEED_SECRET`, so answers can't be shared or hard-coded.
- **Tool use is proven by our records, not the app's claims.** The reference tool services log every call with the attempt's challenge token; inventing tool results fails the layer.
- **Receipts are HMAC-signed** (`RECEIPT_SIGNING_KEY`) and bound to the attempt, so a passed result can't be forged or replayed.

## Fairness safeguards

- Timeliness is decided by the database clock at submission, never by how long verification takes.
- Infrastructure errors and items needing human review block a layer for an organiser; they never eliminate anyone automatically.
- AI judgement is never the only authority for subjective decisions: those go to human review, with the evidence.
- Each team gets exactly one decision per layer (a unique constraint), decided in one transaction.

## Secrets

- Secrets live only in the host's environment settings and git-ignored `.env.local` files. The repository's `.env.example` has names only.
- The service-role key is used only by tests on a local stack; the deployed app and worker never use it.
- The scaffold vendor step refuses to copy files that look like they contain secrets.

## Reporting a problem

Contact the organisers at the event, or open an issue in the repository without including any secret values.
