# Superteam Agent Studio

A student-facing developer onboarding platform for university hackathons (Cambridge · Oxbridge and Imperial, proposed). It helps students with no blockchain background start building **AI applications with internet-native payments** (x402 on Solana).

This is the **design-approval build** for Superteam UK. It is a faithful Next.js implementation of the Claude Design prototype (`../design/design_handoff_agent_studio/`). Every payment, AI call and download is **simulated or deferred**, and is labelled that way in the UI.

| Page | Route | What it does |
|---|---|---|
| Dashboard | `/` | Hero, event spec, judging weights, rules, four tracks, getting started |
| Playground | `/playground` | A deterministic, in-browser simulation of an agent paying for services (x402 flow) |
| Build | `/build` | The **Project Builder**: name → framework → capabilities → live file preview → honest "generate" preview |
| Inspiration | `/inspiration` | An offline library of 250 project ideas with filters and a shuffle bag |

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next core-web-vitals + TS) |
| `npm test` | Vitest unit tests (pure logic) |
| `npm run test:e2e` | Playwright tests against a production build (desktop 1440px + mobile 390px). Run `npx playwright install chromium` first. |
| `npm run check` | typecheck + lint + unit + build |

Requires Node ≥ 20.9. There are no environment variables, no database and no external services.

## Technology

- **Next.js 16** (App Router, Turbopack, Cache Components). Every route prerenders as **static**.
- **React 19**, **TypeScript** (strict).
- **Tailwind CSS v4**. The design tokens live in `src/app/globals.css` (`@theme`), and the repeated "Schematic" primitives (`.module`, `.btn-primary`, `.status-code` …) are in `@layer components`.
- **next/font**: Archivo (with the `wdth` axis, for the 125% display type) and Martian Mono, self-hosted.
- **Zod 4** validates every config file. It runs on the server in the root layout, so a bad edit fails `next build`, and it never ships to the browser.
- **Vitest** (unit) and **Playwright** (end-to-end).

No UI component library is used. The design's components are recreated as small local primitives (`src/components/system`).

## Structure

```
src/
├── app/                      routes (server components that render one client component each)
│   ├── layout.tsx            fonts, header, footer, EventProvider, config validation
│   ├── page.tsx              Dashboard
│   ├── playground/ build/ inspiration/
│   ├── not-found.tsx
│   └── globals.css           design tokens + schematic component classes
├── components/
│   ├── system/               Module, Led, StatusCode, ConfirmationTag, CellMeter, SectionHeading
│   ├── shell/                AppHeader (desktop nav + <1120px MENU panel), Footer, EventContext
│   ├── dashboard/            Dashboard, RequestTrace (animated hero trace)
│   ├── playground/           Playground (flow, config, log, inspector), useSimulation
│   ├── builder/              ProjectBuilder (A-C, E, mobile bar), Preview (D schematic + code), useBuilder
│   └── inspiration/          Inspiration (filters, idea card, history)
├── config/                   ← edit content here
│   ├── schema.ts             Zod schemas + inferred types
│   ├── events.ts             hackathon events
│   ├── tracks.ts             the four tracks
│   ├── integrations.ts       frameworks + provisional integration catalog
│   ├── site.ts               GitHub URL, default event
│   └── validate.ts           validateAllConfig()
├── data/ideas.json           250 ideas
└── lib/                      pure, unit-tested logic (no React)
    ├── project-builder/      project.ts (derivations), code.ts (preview lines),
    │                         generator.ts (adapter contract), url-state.ts
    ├── simulation/           scenarios.ts, engine.ts (step generator), machine.ts (playback), http.ts (inspector)
    └── inspiration/ideas.ts  filtering + shuffle-bag selection
tests/unit/                   Vitest
tests/e2e/                    Playwright
```

**Boundaries:** business logic is in `src/lib` and content is in `src/config` / `src/data`. Components only render and wire state. State is local (`useState`/`useReducer`), with no global store.

## Event configuration (`src/config/events.ts`)

Each event is a typed object with these fields: `id`, `code`, `name`, `status`, `host`, `university`, `dates`, `deadline`, `prizePool`, `format`, `venue`, `tracks` (which tracks run and their prizes), `judging` (criteria and weights, which must total 100), `rules`, `bounties`, `mentors`, `sponsors` and `links`.

- **Honesty rule.** Every fact has a `status` (`PROPOSED` / `SAMPLE` / `TBC` / `CONFIRMED`), and the UI shows it beside the value. Only set `CONFIRMED` once organisers have signed off. No sponsors, mentors or bounties are listed because none are confirmed. Empty arrays render as "SPONSOR SLOT OPEN" / "MENTORS TBA", and bounties are hidden while the list is empty.
- **Adding an event.** Copy an object and give it a unique `id` and `code`. The header switch, the Dashboard switch and `?event=` all pick it up. The selected event is kept in `?event=` and `localStorage`.
- Links with `href: null` render as unavailable text instead of dead links.

## Track configuration (`src/config/tracks.ts`)

The four tracks (Web / Next.js, Consumer Mobile / Expo, Autonomous Agents / Python, Services & Markets / Node) each have a glyph, tech, command, description, three "judged on" items and an optional note. The order in an event's `tracks` array sets the display order, and removing a track from an event hides it. A track's "START WITH …" button opens `/build?fw=<framework>`.

## Integration catalog (`src/config/integrations.ts`)

The **Next.js**, **Node.js**, **Python** and **Expo** entries for Gemini, Payments, Spending Controls and Paid API match the real templates in `../agent-studio-scaffolds` (scaffold v0.4.0, verified 2026-10-10: x402 V2 2.28.0 on Solana devnet, `@google/genai` 2.28.0, Next 16.3.8, Express 5.2.1 with `@x402/express` 2.28.0; Python 3.10+ with `x402[httpx,svm]` 2.25.0, `google-genai` 2.29.0 and FastAPI 0.143.0; Expo SDK 57 apps bundled for Android with no secrets inside; see that repo's `VERIFICATION.md`). Wallet Connection is verified on Next.js only; Pay.sh is still **provisional**. For each framework the catalog defines the base files, packages, scripts, env file and use case. Each integration has:

`id`, `name`, `description`, `tech`, `external` service, `compatibility[framework]` (`ok` RDY · `server` +SRV · `unverified` UNV · `na` N/A), a `reasons` string for each framework, `worksWith` (advisory), `requires` (hard dependencies; the builder warns if they are off), `prerequisites`, `implementationStatus`, `verifiedOn` (frameworks with a verified template), and `files`, `packages` and `env` for each framework.

Rules the builder enforces:
- **Expo plus a +SRV capability** (Gemini, Payments, Spending, Paid API) adds a `companion-server/`, generated from the verified Node.js template with the same capabilities. Secret env vars are written to `companion-server/.env.example`; only `EXPO_PUBLIC_*` values stay in the app. **Gemini and payment secrets never go in Android client code.**
- **N/A combinations** can't be switched on. Switching framework unplugs them and shows a notice.
- **Required capabilities** follow automatically. Switching on Paid API also switches on Payments and Spending Controls, and switching off Payments also switches off what needs it. Both show a notice. Shared links and restored selections are completed the same way (`normalizeIntegrations` in `integrations.ts`).
- **Python** projects show `requirements.txt` and never `package.json`.
- The builder **never asks for credentials.** The project name is the only text input.

Package versions, the Pay.sh package name, and the x402 header and network ids are **illustrative**. Verify them against the current x402 V2 spec and the scaffold repository before launch, and keep the UNV labels until CI proves each combination.

## Playground simulation (`src/lib/simulation`)

- `scenarios.ts` has three scenarios. All hosts use the reserved `.example` TLD.
  - **A · Research Assistant**: an agent buys data.
  - **B · Trip Planner**: paid APIs that answer 402 before they fulfil a request.
  - **C · Agent Hires Agents**: agent to agent. It collects three offers, selects one by rating within a budget share, then pays.
- `engine.ts`: `buildSteps({scenario, budget, serviceDown})` is pure and deterministic, and keeps money in integer cents. Steps are `user`, `agent`, `service`, `offer`, `payreq` (402), `check`, `paid`, `result`, `error` and `done`. Each has a `stage` (0-4, with 5 for done) that drives the five flow nodes. Failure paths are over-budget decline, service down (503), and no acceptable offer.
- `machine.ts`: the playback reducer, with statuses **idle → running ⇄ paused → completed | failed**. Actions are `run`, `pause`, `step`, `tick` and `reset`. Any configuration change resets playback. Steps play every 1150 ms.
- `http.ts`: the Technical Inspector payloads. They follow the x402 V2 flow (`PAYMENT-REQUIRED` → `PAYMENT-SIGNATURE` → `PAYMENT-RESPONSE`, `x402Version: 2`, `scheme: "exact"`, Solana devnet CAIP-2 id, USDC atomic `amount`). They are labelled **illustrative, not exact SDK structures**. Signatures and receipts are **never fabricated**; they appear as labelled placeholders.
- Nothing touches the network, so a student session costs nothing to serve.

## Inspiration dataset (`src/data/ideas.json`)

There are 250 ideas across 26 industries, balanced across the four tracks (60-67 each) and three difficulty levels. Ideas #1-24 are the design's original samples. Each idea has these fields: `id`, `title`, `industry`, `track`, `difficulty`, `type`, `problem`, `challenge` ("the interesting part"), `direction` ("one possible direction") and two `angles`.

Selection uses a **shuffle bag**: no idea repeats in a session while unseen ideas still match the filters, and the bag refills when they run out. Filters are industry, track, difficulty and application type. The Space bar triggers Surprise Me unless focus is in a control. By design there is **no "build this" shortcut**, so ideas stay prompts rather than identical projects. A unit test validates the schema and uniqueness.

## Scaffold generator and ZIP download

`src/lib/project-builder/generator.ts` defines the boundary:

```ts
interface ScaffoldGenerator {
  capabilities: ("preview" | "zip")[];
  listTemplates(): Promise<TemplateSummary[]>;
  validateSelection(config: ProjectConfiguration): Promise<ValidationResult>;
  zipAvailability(config: ProjectConfiguration): { ok: true; modules } | { ok: false; reason: string };
  generateProject(config: ProjectConfiguration): Promise<GenerateResult>; // { archive: Blob, filename, manifest, generatorVersion }
}
```

- `getGenerator()` returns `scaffoldGenerator`, which builds real projects through **`POST /api/scaffold`** (`src/app/api/scaffold/route.ts`, logic in `src/lib/scaffold/handler.ts`). `zipAvailability(config)` says per selection whether a ZIP is possible and why not: only **Next.js** and **Node.js** have templates, and Wallet and Pay.sh have none yet, so those selections stay previews with a disabled **ZIP · PREVIEW ONLY** button that explains why. `listTemplates()` reports `next` and `node` as `verified` and the rest as `provisional`. A framework is downloadable only if it is in the vendored `catalog.json` *and* in `src/lib/scaffold/frameworks.ts` (the frameworks the in-memory composer can build), so re-vendoring a scaffold with a new framework never turns into a 500: it stays a preview until the port supports it. `previewGenerator` is the no-ZIP fallback.
- **Where templates come from.** A pinned copy of `Db0706/agent-studio-scaffolds` is vendored in `vendor/agent-studio-scaffolds/` (commit and version in `VENDOR.json`). The site needs no GitHub token and no network at runtime, and a deploy is reproducible. `next.config.ts` adds the folder to the route's output file tracing. To update it, commit in the scaffold repository, then:

  ```bash
  node scripts/vendor-scaffolds.mjs --ref <commit-or-tag>   # copies committed files only (git archive)
  node scripts/vendor-scaffolds.mjs --check                 # vendor/ still matches the pinned commit
  ```

  The script refuses any env file other than `.env.example`, keys and keypairs.
- **Composition.** `src/lib/scaffold/compose.ts` is an in-memory port of the scaffold repository's `scripts/compose.mjs`: nothing is written to disk. A unit test composes every module combination with both and requires byte-identical output and an identical `studio.manifest.json`, and another checks the vendored `catalog.json` is fresh. `src/lib/scaffold/zip.ts` writes the archive (deflate, deterministic timestamps, every file under `<project-name>/`).
- **Route guarantees.** JSON only (415), body ≤ 2 KB (413), strict schema and `validateConfiguration` (400), no template for the selection (422), composed project ≤ 2 MB, `Cache-Control: no-store`. Rate limit: 10 ZIPs per client per minute and 120 overall, in memory per server instance (429 with `Retry-After`). The client key comes from `x-forwarded-for`, so behind a proxy that does not set it every visitor shares one bucket. **The ZIP never contains `.env.local` or any secret**: only `.env.example` with empty placeholders, and payments are Solana devnet only. Paths are checked again before zipping.
- **End-to-end ZIP test.** Unit tests prove byte parity with the scaffold repository; `npm run test:zip` proves a downloaded ZIP actually works. It builds the site, runs `next start` on a free port, then for six cases (`node` + paidapi, `node` + gemini + paidapi, `next` full, `next` + wallet, `python` + gemini + paidapi, `expo` + gemini + paidapi) it calls `POST /api/scaffold`, unzips (needs `unzip`), and checks `studio.manifest.json` (framework, `scaffoldVersion` equal to `VENDOR.json`, `modules`, `autoAddedModules`), that no real env file was generated, and that the module list file exists. Then, per framework:
  - **next / node:** `npm install`, `typecheck`, `build` (and `test:spending` when present). Node services are started with no keys and probed over HTTP (`/`, `/premium-data`, `/api/buy`, `/api/chat`). Next.js browser bundles (`.next/static`) are scanned for secrets.
  - **python:** venv, `pip install -r requirements.txt`, `unittest`, `python -m agent`, then the same HTTP probes against `python -m agent serve`. Needs Python 3.10+ (`$PYTHON`, default `python3`).
  - **expo:** `npm install`, `typecheck`, `expo export` for Android, a secrets scan of the bundle, then the full Node treatment for its `companion-server/`.

  It needs npm and PyPI but no keys, wallets or facilitator. Options: `npm run test:zip -- --skip-build node-paidapi` reuses `.next` and runs matching cases; `--live-402` additionally checks `/premium-data` answers 402, which contacts the devnet facilitator, so it is off by default. The smoke script also runs standalone against any running site: `node scripts/smoke-scaffold-zip.mjs <base-url>`. CI (`.github/workflows/scaffold-zip.yml`) runs it, plus `vendor-scaffolds.mjs --check`, on every pull request; its `zip` job is a required check for merging to `main`. It takes several minutes and about 1 GB of disk.
- **UI.** After GENERATE PROJECT, **DOWNLOAD ZIP ↓** calls `generateProject` and saves `<name>.zip`. While it runs it shows BUILDING ZIP…; failures show `ZIP FAILED · <reason>` with **RETRY ZIP**. Any configuration change cancels a pending download.

## Event day: download capacity and limits

Load-tested 2026-10-17. One server instance builds a project ZIP in about 3–5 ms (200–400 ZIPs a second; 500 concurrent downloads finished in under 2 s using about 19 MB of memory). ZIPs are 28–49 KB. Capacity is not the constraint; the rate limit is.

- `POST /api/scaffold` allows **120 downloads a minute per IP** and **3,000 a minute per server instance** (`src/lib/scaffold/rate-limit.ts`). A whole venue often shares one public IP (eduroam, campus NAT), so the per-IP limit is sized for a room, not a person. It's an abuse brake, not a quota: it's in memory, per instance.
- To tune it on the day without a deploy of new code, set `SCAFFOLD_RATE_PER_IP` and/or `SCAFFOLD_RATE_GLOBAL` (positive integers) in the Vercel project's environment variables and redeploy. Invalid values fall back to the defaults instead of disabling the limit.
- When limited, the Builder shows "Too many downloads. Try again in Ns." with a retry; nothing else breaks.
- For a hard, site-wide limit across instances, add a rule in Vercel's Firewall.

## Known limitations

- All event details, prizes, dates, the venue and the host role are placeholders (PROPOSED / SAMPLE / TBC). The "AGENT STUDIO by Superteam" wordmark and the "ST" tile are placeholder brand marks; replace them with approved assets.
- The header and footer GitHub links point to this repository; the Dashboard's "Starter repository" link points to [agent-studio-scaffolds](https://github.com/Db0706/agent-studio-scaffolds) (`src/config/site.ts`, `src/config/events.ts`).
- The compatibility matrix and package versions are illustrative.
- No accounts, persistence beyond `localStorage`, analytics, real payments or AI inference, all by design for this phase. Downloads exist for all four frameworks (Next.js, Expo, Python, Node.js). Wallet Connection downloads for Next.js only (official `@solana/react` + Wallet Standard; not yet tested with a real wallet app); Wallet on Expo and Pay.sh stay previews until they have templates.

## Changes from the prototype (deliberate, minimal)

| Change | Why |
|---|---|
| Added **Judging · weighting** and **Ground rules** modules to the Dashboard event section, in the same module style | The brief requires judging criteria, rules and weightings to be configurable and shown |
| Scenario **Data Analyst** replaced by **Agent Hires Agents** (with a new `OFR` step) | The brief requires an agent-to-agent scenario (C) |
| The Generate animation reads "VALIDATING SELECTION… → PREPARING PREVIEW…" instead of "PACKAGING…" | Avoids implying a ZIP was built |
| The Generate result lists the env keys the student will add and says "Generator integration coming next" | The brief asks for required credentials and an honest pending state |
| Framework blurb gains a one-line recommended use case | The brief asks for an accurate description and use case for each framework |
| Flow nodes use short labels below 560px; the scenario kind sits on its own line | Long labels broke mid-word at 375px |
| Inspector payloads use real base64, a USDC mint and placeholder signatures | Accuracy, and no fabricated signatures |
| Inspiration pool label reads "n OF 250 IDEAS MATCH · OFFLINE LIBRARY" | The library is now complete |
| Footer "DESIGN HANDOFF" link removed | It pointed at a prototype file |
