## Gemini AI

**What you get:** your agent can ask Google Gemini, using the official [`google-genai`](https://pypi.org/project/google-genai/) SDK:

- `python -m agent ask "your question"` on the command line
- `POST /api/chat` on the HTTP service

**Setup (2 minutes, free):**

1. Go to https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key** and copy it.
3. In `.env` set `GEMINI_API_KEY=your-key`, then restart the service.

**Try it:**

```bash
python -m agent ask "Say hi"
curl -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d '{"prompt":"Say hi"}'
```

**How it works:** only your agent talks to Gemini, so the key never leaves your machine or server. The code is in `agent/ai/gemini.py` (call `await ask_gemini(prompt)` from your own code), `agent/routes/chat.py` and `agent/commands/ask.py`. To use a different model set `GEMINI_MODEL` (default `gemini-flash-latest`).

**If it fails:** "GEMINI_API_KEY is not set" means `.env` is missing the key or you didn't restart. A 502 means Gemini rejected the call; the terminal running the service shows the reason (often an invalid key or a free-tier rate limit).
