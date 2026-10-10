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

This is **provisional** and has not been validated against real templates. For each framework it defines the base files, packages, scripts, env file and use case. Each integration has:

`id`, `name`, `description`, `tech`, `external` service, `compatibility[framework]` (`ok` RDY · `server` +SRV · `unverified` UNV · `na` N/A), a `reasons` string for each framework, `worksWith`, `prerequisites`, `implementationStatus`, and `files`, `packages` and `env` for each framework.

Rules the builder enforces:
- **Expo plus a +SRV capability** (Gemini, Payments, Paid API) adds a `companion-server/`. Secret env vars are written to `companion-server/.env.example`; only `EXPO_PUBLIC_*` values stay in the app. **Gemini and payment secrets never go in Android client code.**
- **N/A combinations** can't be switched on. Switching framework unplugs them and shows a notice.
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

## Scaffold generator integration (Phase 2)

`src/lib/project-builder/generator.ts` defines the boundary:

```ts
interface ScaffoldGenerator {
  capabilities: ("preview" | "zip")[];
  listTemplates(): Promise<TemplateSummary[]>;
  validateSelection(config: ProjectConfiguration): Promise<ValidationResult>;
  generateProject(config: ProjectConfiguration): Promise<GenerateResult>; // { archive: Blob, filename, manifest, generatorVersion }
}
```

- Today `getGenerator()` returns `previewGenerator`. It validates the selection, lists templates (all `provisional`), and **throws `GeneratorUnavailableError`** from `generateProject`. The UI shows **"Generator integration coming next"**, and the **ZIP · SOON** button stays disabled until a generator has the `zip` capability.
- To connect Phase 2:
  1. Implement an HTTP-backed `ScaffoldGenerator`, for example `POST /api/scaffold` proxying to the scaffold repository's generator, with rate limiting and abuse controls.
  2. Return it from `getGenerator()`.
  3. In `ProjectBuilder.tsx`'s Output, wire the ZIP button to `generateProject` and trigger the download. Add an error/retry state; `GenState` already includes `"error"`.
  4. Replace the provisional catalog with the repository's template manifest, or validate the catalog against it.

## Known limitations

- All event details, prizes, dates, the venue and the host role are placeholders (PROPOSED / SAMPLE / TBC). The "AGENT STUDIO by Superteam" wordmark and the "ST" tile are placeholder brand marks; replace them with approved assets.
- The GitHub links point to `https://github.com/` until the repository exists (`src/config/site.ts`).
- The compatibility matrix and package versions are illustrative.
- No accounts, persistence beyond `localStorage`, analytics, real payments, AI inference or downloads, all by design for this phase.

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
