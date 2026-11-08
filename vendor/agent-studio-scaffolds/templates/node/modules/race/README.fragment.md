## AI Race adapter

**What you get:** the two endpoints the AI Race verifier calls, `GET /agent-studio/v1/health` and `POST /agent-studio/v1/tasks`, already speaking the race protocol (ASRP/1): they check the verifier token, echo the nonce and wrap your answers. `GET /race` shows which task types you've built.

**What you build:** the AI logic, one function per task type in `src/race/handlers.ts`. Each race layer tests one capability (answering with a model, structured output, tool calling, knowledge, memory, reliability, workflows). They all start as "not built yet" and return a clear error until you write them. `src/race/tools.ts` has `callTool` and `searchSource` for calling the race's tools.

**Setup:**

1. On Agent Studio, open your team page and copy the **verifier token** into `.env.local` as `AGENT_STUDIO_VERIFIER_TOKEN`, then restart `npm run dev`.
2. Write `handlers.respond` (the first layer), for example with the Gemini module: `respond: async (task) => ({ text: await askGemini(String(task.input)) })`.
3. Try it locally: `npm run race:try -- respond "What is 6 x 7?"`.
4. Deploy (for example to Railway or Render, adding the same env var) and paste the public URL on your team page. Then press **Run verification** on the race page.

**Memory on serverless hosting:** the Memory and Context layer checks that your app remembers earlier turns of a conversation. On Vercel (and other serverless hosts) each request can reach a different instance, so history kept in a variable is lost between turns, even though it works locally. Use `memory` from `src/race/memory.ts` and connect a free Upstash Redis database: on Vercel, **Storage → Upstash for Redis → Connect** to your project (it adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`), or create one at upstash.com and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Without them, `memory` keeps history in the process, which is fine locally and on an always-on server.

**Tests:** `npm run test:race` checks the protocol handling offline. The race verifier checks your AI logic with fresh inputs on every attempt, so answers can't be hard-coded.

**If it fails:** 401 means the token in your environment doesn't match your team page (rotate it there and copy again). "doesn't handle … yet" means that handler is still the placeholder. The full protocol is in the [verification guide](https://github.com/Db0706/superteam-agent-studio/blob/main/docs/VERIFICATION_SDK.md).
