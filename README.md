# Agent Studio

An open-source platform for running AI hackathons. It gives teams working starter code, checks what they build automatically, and gives organisers everything they need on the day: sign-up, teams, a live race leaderboard, mentors, judging and a public winners page.

Built for the **Oxford and Cambridge AI Race** (King's College, Cambridge, October 2026), run with Superteam UK. Fork it and run your own event.

## What's in it

**For teams**
- **Starter builder:** working starter code in four frameworks (Next.js web apps, React Native / Expo mobile apps that also run in the browser, Python agents, Node.js APIs), downloaded as a ZIP with the plug-ins you pick:
  - AI with Google Gemini
  - agent payments on Solana devnet (x402), wallet connection, spending limits, a paid API example, Pay.sh
  - the AI Race adapter, which lets the platform test the team's live app
- **AI Lab and guide:** each AI capability explained, with the starter code for it and how the race checks it.
- **Team workspace:** join with an event code, create or join a team (up to 4), connect the app, submit to a track.

**The AI Race**
- Points race: build steps (app live, AI integration, tool use, an agentic payment on Solana devnet, submission) and optional challenges, each **verified automatically** against the team's running app with fresh test data, so results can't be copied or faked.
- Optional on-chain challenges on Solana devnet.
- Live leaderboard with a Cambridge vs Oxford score, and a venue screen.

**For organisers** (Admin)
- Checklist, people and roles, event code, race setup and a control room (extend, reopen, pause), points and finalists, submissions, announcements and an audit log.
- **Judging:** rubrics, judge assignments, and judging in **Google Sheets**: create a sheet for the judges in one click, then publish the winners straight from it.
- Public **winners page** and winners on the leaderboard.

## How it fits together

| Part | Runs on | What it does |
| --- | --- | --- |
| Web app (`src/`) | Vercel | Next.js 16 (App Router), React 19, Tailwind 4 |
| Database (`supabase/`) | Supabase (Postgres) | Data, sign-in by email code, row-level security; every write goes through checked SQL functions |
| Verification worker (`worker/`) | Railway or any Node 22 host | Runs the race: schedules steps and verifies each attempt against the team's app |
| Starters (`vendor/agent-studio-scaffolds`) | bundled | A pinned copy of [agent-studio-scaffolds](https://github.com/Db0706/agent-studio-scaffolds) |

More detail: [platform architecture](docs/PLATFORM_ARCHITECTURE.md) · [security model](docs/SECURITY.md) · [how a race works](docs/TOURNAMENT_RULES.md) · [connecting an app to the race](docs/VERIFICATION_SDK.md).

## Run it locally

You need Node 20.9+ (22 recommended), Docker and the [Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
npm install
cp .env.example .env.local     # fill in from docs/ENVIRONMENT.md
npm run db:start               # local Supabase, applies supabase/migrations
npm run db:seed                # the sample event
npm run dev                    # the site, http://localhost:3000
npm run worker                 # the race worker, in a second terminal
```

The landing page, builder, AI Lab and guide work without a database; the platform pages say so until Supabase is connected.

| Command | What it does |
| --- | --- |
| `npm run check` | Type check, lint, unit tests and a production build |
| `npm test` | Unit tests |
| `npm run test:integration` | Database tests (needs `npm run db:start`) |

## Deploy your own

1. Create a Supabase project and push the migrations.
2. Deploy the web app to Vercel and the worker to Railway, with the environment variables in [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md).
3. Edit your event in `supabase/seed.sql` (name, dates, venue, tracks), or set `ACTIVE_EVENT_SLUG`.

Step by step: [deployment](docs/DEPLOYMENT.md). Running the day: [event-day guide](docs/EVENT_DAY.md), [recovery runbook](docs/RUNBOOK.md). Optional: [Google Sheets judging](docs/GOOGLE_SHEETS.md), [on-chain challenges](docs/ONCHAIN_CHALLENGES.md).

## Contributing

Contributions are welcome. Fork the repository, make your change on a branch, run `npm run check`, and open a pull request describing what it does and why.

## Licence

[MIT](LICENSE)
