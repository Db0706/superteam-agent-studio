## AI Race adapter

**What you get:** the two endpoints the AI Race verifier calls, `GET /agent-studio/v1/health` and `POST /agent-studio/v1/tasks`, already speaking the race protocol (ASRP/1): they check the verifier token, echo the nonce and wrap your answers. `GET /race` shows which task types you've built.

**What you build:** the AI logic, one function per task type in `agent/race/handlers.py`. Each race layer tests one capability (answering with a model, structured output, tool calling, knowledge, memory, reliability, workflows). They all start as "not built yet" and return a clear error until you write them. `agent/race/tools.py` has `call_tool` and `search_source` for calling the race's tools.

**Setup:**

1. On Agent Studio, open your team page and copy the **verifier token** into `.env` as `AGENT_STUDIO_VERIFIER_TOKEN`, then restart `python -m agent serve`.
2. Write the `respond` handler (the first layer), for example with the Gemini module: return `{"text": await ask_gemini(str(task["input"]))}`.
3. Try it locally: `python -m agent race respond "What is 6 x 7?"` (with `python -m agent serve` running).
4. Deploy (for example to Railway or Render, adding the same env var) and paste the public URL on your team page. Then press **Run verification** on the race page.

**Memory on serverless hosting:** the Memory and Context layer checks that your agent remembers earlier turns of a conversation. On serverless hosts each request can reach a different instance, so history kept in a variable is lost between turns, even though it works locally. Use `memory` from `agent/race/memory.py` and set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from a free Upstash Redis database (upstash.com). Without them, `memory` keeps history in the process, which is fine locally and on an always-on server (Railway, Render, Fly).

**Tests:** `python -m unittest discover -s tests -v` includes `tests/test_race.py`, which checks the protocol handling offline. The race verifier checks your AI logic with fresh inputs on every attempt, so answers can't be hard-coded.

**If it fails:** 401 means the token in your environment doesn't match your team page (rotate it there and copy again). "doesn't handle … yet" means that handler is still the placeholder. The full protocol is in the [verification guide](https://github.com/Db0706/superteam-agent-studio/blob/main/docs/VERIFICATION_SDK.md).
