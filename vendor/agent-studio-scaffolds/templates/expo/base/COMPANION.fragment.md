## Companion server (`companion-server/`)

Some features in this app need secrets (a Gemini API key, a devnet wallet key). Those can't live in the app, so Agent Studio added a **companion server**: a small Node.js service in `companion-server/` that holds the keys and does that work. The app calls it over HTTP. It has its own README, `.env.example` and `package.json`.

**Run both** (two terminals):

```bash
# terminal 1: the companion server
npm run companion:install         # once: installs companion-server's packages
cp companion-server/.env.example companion-server/.env.local   # then fill it in (see companion-server/README.md)
npm run companion                 # starts it on port 3000

# terminal 2: the app
npm start
```

**How the app finds it:** during development the app calls port 3000 on the computer running `npm start` (the address Expo already uses for the QR code). Check it from your phone's browser: `http://<your computer's IP>:3000` should answer with JSON. If it doesn't, your computer's firewall may be blocking port 3000, or the phone is on a different Wi-Fi.

**Port 3000 already in use?** (for example by another project): start the companion on another port with `PORT=3300 npm run companion`, and point the app at it in this app's `.env.local`: `EXPO_PUBLIC_COMPANION_URL=http://10.0.2.2:3300` on the Android emulator, or `http://<your computer's IP>:3300` on a phone. Then restart `npm start`. The home screen's **Companion server** light shows ONLINE once the app can reach it.

**For a release build:** deploy `companion-server/` to any Node.js host (see its README), then set `EXPO_PUBLIC_COMPANION_URL=https://your-server.example.com` in this app's `.env.local` before building. Android release builds only allow `https://`.

> ⚠️ The companion's endpoints have no login. Anyone who can reach it can use your Gemini quota or make its agent spend its (devnet, test-money) budget. Add authentication before you share it widely.
