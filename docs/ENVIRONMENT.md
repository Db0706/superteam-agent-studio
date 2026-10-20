# Environment variables

Two processes read configuration: the **Next.js app** (Vercel) and the **verification worker** (`npm run worker`, Railway or any Node 22 host). Secrets live only in the host's environment settings and in your git-ignored `.env.local`. [`.env.example`](../.env.example) lists every variable with no values.

The site still works without Supabase: the landing page, AI Lab, Builder (ZIP downloads), Inspiration and the guide run as before, and platform pages show a "not connected" notice.

## Both the app and the worker

| Variable | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. On Vercel use Supabase's **transaction pooler** (port 6543; prepared statements are turned off automatically). The worker can use the session pooler (5432) or the direct connection. |
| `DATABASE_POOL_SIZE` | no | Connections per process (default 10). Use 3 on Vercel: each function instance opens its own pool. |
| `CHALLENGE_BASE_URL` | prod | Public `https://` address of the app. Tool and knowledge-source URLs in race tasks point at `{CHALLENGE_BASE_URL}/api/race/challenge/…`, so it must be reachable from the internet. Falls back to `NEXT_PUBLIC_SITE_URL`. |
| `RECEIPT_SIGNING_KEY` | prod | HMAC key for verification receipts (32+ random bytes). Changing it invalidates existing receipts. |
| `VERIFIER_SEED_SECRET` | prod | Seeds each attempt's hidden test data. Never share it: with it, someone could predict test inputs. |
| `FIXTURE_SECRET` | prod | Derives the verifier tokens of rehearsal fixture apps. |

In production (`NODE_ENV=production`) the three secrets must be set and at least 16 characters, or the process refuses to start. Generate them with `openssl rand -base64 32`.

## App only (Vercel)

| Variable | Required | What it is |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `https://<project>.supabase.co`. Public. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | The anon (publishable) key. Public: the database's row-level security does the protecting. |
| `NEXT_PUBLIC_SITE_URL` | yes | The site's public origin, e.g. `https://studio.example.org`. Used in sign-in links and fixture URLs. |
| `ACTIVE_EVENT_SLUG` | no | Which event the site runs (default `oxbridge-ai-race-2026`). Switch events without a deploy. |
| `FIXTURES_ENABLED` | no | `true` serves the rehearsal fixture apps at `/api/race/fixtures/*`. Needed for rehearsals on the deployed site; harmless otherwise (they're deterministic demo apps). |

## Worker only

| Variable | Required | What it is |
| --- | --- | --- |
| `WORKER_CONCURRENCY` | no | Verification jobs run at once per worker (default 8, max 64). The load test ran 75 teams per layer through 8 slots in under a second against fixture apps; real apps are slower, so 16 is a sensible event-day value. Run two workers for redundancy: the scheduler is protected by an advisory lock and jobs by leases. |

## Development and tests only

| Variable | What it is |
| --- | --- |
| `VERIFIER_ALLOW_PRIVATE_TARGETS=true` | Lets the verifier call `localhost` and private addresses (local fixture apps, the integration tests). The worker refuses to start with it in production. |
| `SUPABASE_SERVICE_ROLE_KEY` | Used only by the integration and load tests to create test users. The app and worker never use it. |
| `SCAFFOLD_APP_DIR` | Opt-in test of a composed scaffold against the real verifier (see `tests/integration/scaffold-adapter.test.ts`). |
| `REHEARSAL=1` | Opt-in real-clock rehearsal test (about 9 minutes). |
| `LOAD_TEAMS`, `LOAD_LAYERS`, `LOAD_WORKERS` | Load test size (`npm run test:load`). |
