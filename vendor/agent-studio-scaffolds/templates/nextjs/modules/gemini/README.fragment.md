## Gemini AI

**What you get:** `/chat`, a page where you type a question, and `POST /api/chat`, a server route that asks Google Gemini using the official [`@google/genai`](https://www.npmjs.com/package/@google/genai) SDK.

**Setup (2 minutes, free):**

1. Go to https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key** and copy it.
3. In `.env.local` set `GEMINI_API_KEY=your-key`, then restart `npm run dev`.

**Try it:** open http://localhost:3000/chat, or from a terminal:

```bash
curl -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d '{"prompt":"Say hi"}'
```

**How it works:** the browser calls *your* server (`/api/chat`); only the server talks to Gemini, so the key never reaches the browser. The code is in `lib/ai/gemini.ts`. To use a different model set `GEMINI_MODEL` (default `gemini-flash-latest`).

**If it fails:** "GEMINI_API_KEY is not set" means `.env.local` is missing the key or you didn't restart the dev server. A 502 means Gemini rejected the call; the terminal running `npm run dev` shows the reason (often an invalid key or a free-tier rate limit).
