# Connecting your app to the AI Race (ASRP/1)

The AI Race verifies your app by calling it. You expose two endpoints on a public URL, put that URL on your team page, and press **Run verification** on the race page. The verifier sends fresh test tasks; your app answers them. Use any language, framework and AI model: the protocol fixes the envelope, never the model.

## 1. Endpoints

| Method | Path | Answer |
| --- | --- | --- |
| `GET` | `/agent-studio/v1/health` | `200 { "protocol": "asrp/1", "status": "ready", "name": "your app" }` |
| `POST` | `/agent-studio/v1/tasks` | The task result envelope (below) |

Both get `Authorization: Bearer <verifier token>`. Find the token on your team page and reject calls without it (401), so only the verifier can run tasks.

Your URL must be public `https://`. Deploy it (Vercel, Railway, Render, Fly…) or run a tunnel to your laptop (ngrok, Cloudflare Tunnel). The verifier does not follow redirects, so use the final URL. Private and local addresses are refused.

## 2. The task request

```json
{
  "protocol": "asrp/1",
  "nonce": "5f0c…",                      // echo this back
  "attempt": { "id": "…", "layer": "tool-calling", "number": 3 },
  "task": {
    "type": "respond | extract | use_tools | answer_from_source | converse | run_workflow",
    "input": "natural-language instruction, or an object",
    "schema": { … },                    // extract / run_workflow: JSON Schema your output.data must match
    "sessionId": "sess-…",              // converse: keep history per session id, and only for it
    "tools": [{ "name": "lookup_record", "description": "…", "url": "https://…/tools/lookup_record", "inputSchema": { … } }],
    "source": { "url": "https://…/source", "description": "…" },
    "challengeToken": "…",              // send as Bearer when calling the tools/source
    "limits": { "maxToolCalls": 12, "maxSpendUsd": 300, "timeoutMs": 5000 }
  }
}
```

## 3. Your answer

Success (HTTP 200):

```json
{
  "protocol": "asrp/1",
  "nonce": "5f0c…",
  "status": "ok",
  "output": {
    "text": "natural-language answer",
    "data": { … },                      // structured result, matching task.schema when given
    "toolResults": [{ "tool": "lookup_record", "result": { … } }]
  },
  "meta": { "model": "any model you like" }
}
```

Error (HTTP 4xx/5xx):

```json
{ "protocol": "asrp/1", "nonce": "5f0c…", "status": "error", "error": { "code": "invalid_input", "message": "…" } }
```

| Code | When | HTTP |
| --- | --- | --- |
| `invalid_input` | The task is missing what it needs (e.g. an `extract` with no input or schema, a `use_tools` with no tools) | 400 |
| `unauthorized` | Missing or wrong verifier token | 401 |
| `upstream_unavailable` | A tool kept failing after retries | 503 (or 502) |
| `upstream_timeout` | A tool didn't answer within `limits.timeoutMs` | 504 |
| `limit_exceeded` | Doing the task would break a limit | 403 or 422 |
| `internal` | Anything else | 500 |

Keep responses under 256 KB and answer within the layer's time limit (usually 20 to 60 seconds).

## 4. Calling tools

`task.tools[].url` points at the platform's reference tool service. Call it with:

```
POST <tool url>
Authorization: Bearer <task.challengeToken>
Content-Type: application/json

{ …tool input… }
```

The data behind the tools is fresh for every attempt and only the tools know it, and the service records every call. That record, not your `toolResults`, is the evidence: inventing tool results fails the layer. A `503` means "try again"; retry with a short backoff.

## 5. What each built-in layer checks

| Layer | Task types | Passes when |
| --- | --- | --- |
| First Intelligence | `respond` | Health is ready; envelope with echoed nonce; correct answers to fresh questions |
| Structured Outputs | `extract` | `output.data` matches `task.schema` exactly, with correct values; malformed request → 400 `invalid_input` |
| Tool Calling | `use_tools` | The tool service recorded the calls; the answer uses their results; no invented results |
| External Knowledge | `answer_from_source` | Answers come from the source and cite `sourceIds`; `answer: null` when the source has no answer |
| Memory and Context | `converse` | Later turns recall earlier facts; another `sessionId` can't see them. On serverless hosting (Vercel) keep history in a store such as Upstash Redis, not a variable: each turn can reach a different instance |
| Reliability | `use_tools` | 400 on invalid input; recovers from transient 503s; 503 `upstream_unavailable` when a tool stays down; 504 `upstream_timeout` within `limits.timeoutMs` |
| Autonomous Workflow | `run_workflow` | `check_inventory` → `create_quote` → `place_order` in order, never over `limits.maxSpendUsd`, accurate `output.data.orders` |
| Final Mission | all of the above | Everything at once |

In a **points race** there are also build stages, open for the whole sprint in any order:

| Build stage | Task types | Passes when |
| --- | --- | --- |
| App live | (health only) | `GET /agent-studio/v1/health` answers at your public URL with your verifier token |
| Idea locked in | none: read from the platform | Your team's Submit draft has a title and a problem statement |
| AI feature working | `respond` | Correct answers to fresh questions, in the envelope with the echoed nonce |
| Agent uses tools | `use_tools` | Real tool calls recorded by the tool service, answer computed from their results |
| On-chain payment | `run_workflow` | A real devnet USDC transfer of at least the amount, to the address, with the memo from the task; return `{ "signature" }`. The starters' `payUsdc` does this; the wallet needs devnet SOL and USDC |
| Submitted | none: read from the platform | Your team has made a final submission on the Submit page |

If the platform's own tool service is slow during an attempt that fails, the attempt is retried automatically: it never counts against you.

Organisers can change, remove or replace layers; the race page always shows the current layer's instructions and what must work.

## 6. Minimal Node.js (Express) adapter

```ts
import express from "express";
const app = express();
app.use(express.json({ limit: "1mb" }));
const TOKEN = process.env.AGENT_STUDIO_VERIFIER_TOKEN!; // from your team page

const authed = (req: express.Request) => req.headers.authorization === `Bearer ${TOKEN}`;

app.get("/agent-studio/v1/health", (req, res) => {
  if (!authed(req)) return res.status(401).end();
  res.json({ protocol: "asrp/1", status: "ready", name: "my-agent" });
});

app.post("/agent-studio/v1/tasks", async (req, res) => {
  const { nonce, task } = req.body ?? {};
  const fail = (status: number, code: string, message: string) => res.status(status).json({ protocol: "asrp/1", nonce, status: "error", error: { code, message } });
  if (!authed(req)) return fail(401, "unauthorized", "unknown caller");
  try {
    const output = await solve(task); // your AI logic: call your model, tools, memory…
    res.json({ protocol: "asrp/1", nonce, status: "ok", output });
  } catch (err) {
    fail(500, "internal", String(err));
  }
});
app.listen(3000);
```

## 7. Minimal Python (FastAPI) adapter

```python
import os
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()
TOKEN = os.environ["AGENT_STUDIO_VERIFIER_TOKEN"]

def authed(req: Request) -> bool:
    return req.headers.get("authorization") == f"Bearer {TOKEN}"

@app.get("/agent-studio/v1/health")
def health(req: Request):
    if not authed(req):
        return JSONResponse(status_code=401, content={})
    return {"protocol": "asrp/1", "status": "ready", "name": "my-agent"}

@app.post("/agent-studio/v1/tasks")
async def tasks(req: Request):
    body = await req.json()
    nonce, task = body.get("nonce"), body.get("task", {})
    def fail(status, code, message):
        return JSONResponse(status_code=status, content={"protocol": "asrp/1", "nonce": nonce, "status": "error", "error": {"code": code, "message": message}})
    if not authed(req):
        return fail(401, "unauthorized", "unknown caller")
    try:
        output = await solve(task)  # your AI logic
        return {"protocol": "asrp/1", "nonce": nonce, "status": "ok", "output": output}
    except Exception as err:
        return fail(500, "internal", str(err))
```

## 8. Testing before you submit

On your team page, **Test connection** calls your health endpoint exactly as the verifier will. On the race page every attempt shows check-by-check feedback ("Tool invocation failed: expected two successful lookup_record calls…"); hidden test inputs are never shown.

## 9. Fairness

- Your attempt's time is recorded by the database when you press the button. If you submit before the deadline, it counts, even if verification finishes after.
- If the verifier itself fails, your attempt shows "Verification hit a problem on our side". That never counts against you: organisers rerun or review it.
- Each passed attempt gets a signed receipt tied to your team, the layer and the rules version.
