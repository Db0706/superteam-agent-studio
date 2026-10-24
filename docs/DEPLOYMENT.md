# Deployment

Three pieces: a **Supabase** project (Postgres, Auth, Realtime), the **Next.js app** on Vercel, and the **verification worker** (Railway or any Node 22 host). Variables are in [ENVIRONMENT.md](ENVIRONMENT.md). Nothing here runs automatically: each step is done by whoever runs the event.

## 1. Supabase

1. Create a project in the EU (London or Frankfurt) region. New projects use **asymmetric JWT signing keys**; keep them, because the app verifies sessions locally with them (`auth.getClaims()`), so page loads don't each call the auth server.
2. Apply the schema from this repo: `supabase link --project-ref <ref>`, then `supabase db push`. That runs every file in `supabase/migrations/` in order: tables, RLS, functions, grants and the Realtime publication.
3. Load the event: `DATABASE_URL=<direct connection string> npm run db:seed`. It inserts the Oxford and Cambridge AI Race with only the facts confirmed on the public Luma page, plus **sample** judging rubrics that organisers must replace and confirm.
4. **Auth → URL configuration:** Site URL = your production origin; add `https://<origin>/auth/callback` to the redirect URLs.
5. **Auth → Email templates:** paste `supabase/templates/magic_link.html` into both *Magic link* and *Confirm signup*, with the subject "Your Agent Studio sign-in code". The templates show the 6-digit code (`{{ .Token }}`) as well as a link, because many university mail systems open links in scanners that use them up.
6. **Auth → SMTP:** set up custom SMTP (Resend, Postmark, SES…). Supabase's built-in mailer only sends a handful of emails an hour, far too few for about 130 participants signing in on the morning.
7. **Auth → Rate limits:** raise **sign-ups and sign-ins** (default 30 per 5 minutes **per IP**) to at least 300, and **token verifications** to match. On the day most people sign in from the venue Wi-Fi, which is one public IP.
8. First admin: sign in once on the deployed site, then in the SQL editor run `insert into public.platform_admins (user_id) select id from auth.users where email = '<you>';`. From then on, give roles on **Admin → Participants**.

## 2. App (Vercel)

1. Import the repository and set the variables from ENVIRONMENT.md for Production (and Preview if you want previews connected to a separate Supabase project; never point previews at the event database).
2. `DATABASE_URL` is the **transaction pooler** string (port 6543) with `DATABASE_POOL_SIZE=3`.
3. `CHALLENGE_BASE_URL` and `NEXT_PUBLIC_SITE_URL` are the production origin. Participants' apps call `/api/race/challenge/*` during the race, so that path must stay public (no Vercel password protection on production).
4. Deploy, then check: the landing page shows the event from the database, `/race` loads, signing in sends a code.

Functions run in **Dublin (`dub1`)**, set in `vercel.json`, next to the Supabase database in eu-west-1. Vercel's default (Washington DC) put every database query across the Atlantic: in a 60-team load rehearsal each call to the race's tool service took about 3 seconds at peak, enough to time out correct apps on the outage checks. If the database ever moves region, move this with it.

## 3. Worker (Railway or similar)

1. New service from this repository. `railway.json` sets everything: no build step, start command `npm run worker`, two replicas in Europe (Amsterdam, near the Supabase database in Ireland), always restart.
2. Variables: `DATABASE_URL` (the **transaction pooler**, port 6543: the session pooler's client limit is too low for two workers; the worker only uses transaction-scoped locks, so transaction pooling is safe), `CHALLENGE_BASE_URL`, `RECEIPT_SIGNING_KEY`, `VERIFIER_SEED_SECRET`, `FIXTURE_SECRET` (the **same values** as Vercel: the app's challenge services and the worker must agree), `WORKER_CONCURRENCY=16`, `NODE_ENV=production`, and `NPM_CONFIG_INCLUDE=dev` (the worker runs TypeScript with `tsx`, a dev dependency).
3. Two replicas: the scheduler takes an advisory lock each tick and jobs are leased, so two workers never decide the same thing twice; if one dies, the other carries on. A worker started anywhere else (for example `npm run worker` on a laptop with the production `DATABASE_URL`) is an equally safe emergency backup.
4. Check **Admin → Overview**: the worker panel shows a heartbeat within a few seconds.

## 4. Before the event

- Run a **rehearsal on production**: open the race in **Admin → Tournaments**, choose *Create rehearsal* (×30 runs a 4-hour race in about 9 minutes), add fixture teams, schedule it, and watch it finish in the control room. Rehearsals are hidden from participants and the venue screen. `FIXTURES_ENABLED=true` must be set on Vercel for this.
- Import the approved list from Luma on **Admin → Participants** (CSV export).
- Give organiser, mentor and judge roles on the same page.
- Open `/display` on the venue machine and leave it full screen.
- Follow [EVENT_DAY.md](EVENT_DAY.md). Keep [RUNBOOK.md](RUNBOOK.md) open.

## Rolling back

- App: Vercel → Deployments → promote the previous deployment. No data changes.
- Worker: redeploy the previous build. In-flight jobs are leased and re-run when their lease expires (3 minutes).
- Database: migrations only add things and are applied deliberately; there is no automatic down-migration. Supabase's point-in-time recovery (paid plans) or the daily backup is the last resort. Don't run `supabase db reset` against production: it deletes everything.
