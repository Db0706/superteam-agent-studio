## AI Race adapter

**What you get:** your **companion server** answers the two endpoints the AI Race verifier calls, `GET /agent-studio/v1/health` and `POST /agent-studio/v1/tasks`, already speaking the race protocol (ASRP/1): token check, nonce echo and the answer envelope. A **Race readiness** screen (`app/race.tsx`) shows what the verifier will find. The verifier tests the companion server, not the phone.

**What you build:** the AI logic, one function per task type in `companion-server/src/race/handlers.ts`. Each race layer tests one capability (answering with a model, structured output, tool calling, knowledge, memory, reliability, workflows). They start as "not built yet" and return a clear error until you write them. `companion-server/src/race/tools.ts` has `callTool` and `searchSource`.

**Setup:**

1. On Agent Studio, open your team page and copy the **verifier token** into **`companion-server/.env.local`** as `AGENT_STUDIO_VERIFIER_TOKEN`, then restart `npm run companion`.
2. Write `handlers.respond` (the first layer), for example with the Gemini module: `respond: async (task) => ({ text: await askGemini(String(task.input)) })` using `../lib/ai/gemini.js`.
3. Try it: in `companion-server/`, run `npm run race:try -- respond "What is 6 x 7?"`.
4. Deploy the companion server (Railway, Render, Fly…) or run a tunnel, and paste its public https:// URL on your team page. Then press **Run verification** on the race page.

**Memory on serverless hosting:** the Memory and Context layer checks that your companion server remembers earlier turns. If you deploy it to a serverless host (such as Vercel), history kept in a variable is lost between turns. Use `memory` from `companion-server/src/race/memory.ts` and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from a free Upstash Redis database (on Vercel, Storage → Upstash for Redis adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`, which also work). On an always-on server (Railway, Render, Fly) the in-process fallback is fine.

**Tests:** in `companion-server/`, `npm run test:race` checks the protocol handling offline. The race verifier checks your AI logic with fresh inputs on every attempt.
