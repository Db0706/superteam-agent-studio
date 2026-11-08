## Gemini AI

**What you get:** a **Gemini chat** screen (`app/chat.tsx`). It sends your question to the companion server's `POST /api/chat`, which asks Google Gemini with the official [`@google/genai`](https://www.npmjs.com/package/@google/genai) SDK. The Gemini key stays in `companion-server/.env.local`, never in the app.

**Setup (2 minutes, free):**

1. Go to https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key** and copy it.
3. In **`companion-server/.env.local`** (not the app's) set `GEMINI_API_KEY=your-key`, then restart `npm run companion`.

**Try it:** open the app, tap **Gemini chat**, ask a question.

**Code:** `lib/ai/client.ts` (the app side) and `companion-server/src/routes/chat.ts` + `companion-server/src/lib/ai/gemini.ts` (the server side).

**If it fails:** "Can't reach the companion server" means `npm run companion` isn't running or your phone can't reach your computer (see *Companion server* above). "GEMINI_API_KEY is not set" means `companion-server/.env.local` is missing the key or you didn't restart the companion. Anything else: the terminal running `npm run companion` shows the reason (often an invalid key or a free-tier rate limit).
