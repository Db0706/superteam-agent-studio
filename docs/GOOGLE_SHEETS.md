# Judging in Google Sheets

Admin → 6 · Judging → **Google Sheet** creates a judging sheet in the organiser's Google Drive (one tab per track, one row per final submission, a column per rubric criterion, a weighted **Total /100**, **Notes** and a **Place** drop-down), shares it with every judge, and later reads the **Place** column back to publish the winners. Nothing is typed twice.

The site only ever gets the `drive.file` permission: it can see and edit **only the files it created**, never anything else in the Drive.

## One-time setup (about 10 minutes)

1. Go to **console.cloud.google.com** and create a project (for example "Agent Studio").
2. **APIs & Services → Library**: enable **Google Sheets API** and **Google Drive API**.
3. **Google Auth Platform → Branding**: app name "Agent Studio", your email as support and developer contact. **Audience**: External. Then **Publish app** (status "In production"). Without this, Google signs you out of the connection every 7 days. `drive.file` is not a sensitive scope, so publishing needs no Google review.
4. **Clients → Create client → Web application**. Under **Authorised redirect URIs** add:
   - `https://superteam-agent-studio.vercel.app/api/google/callback`
   - `http://localhost:3101/api/google/callback` (local testing)
5. Copy the **Client ID** and **Client secret** into Vercel (Production), then redeploy:

   ```bash
   cd ~/Desktop/SuperteamAgent/superteam-agent-studio
   vercel env add GOOGLE_CLIENT_ID production
   vercel env add GOOGLE_CLIENT_SECRET production
   openssl rand -base64 32 | vercel env add GOOGLE_TOKEN_KEY production
   vercel --prod
   ```

   `GOOGLE_TOKEN_KEY` encrypts the stored Google access. It lives only in Vercel; keep it, because changing it means connecting Google again.

## Using it

1. **Connect Google** (once per event): sign in with the Google account that should own the sheet.
2. **Create judging sheet**: makes the sheet and emails every judge (the People page's judges) an edit link.
3. Judges score each criterion (the cell refuses numbers above the maximum), and agree a **Place**: Winner, Runner-up or Honourable mention.
4. **Check the sheet**: shows what would be published, with any problems (two winners in a track, a renamed column).
5. **Publish winners from the sheet**: sets the places, clears places the sheet leaves empty. The winners page and leaderboard update.

Don't rename, move or delete columns; column A (hidden) links each row to its submission. Add comments in **Notes**. **Create a new sheet** if submissions change after the sheet was made.
