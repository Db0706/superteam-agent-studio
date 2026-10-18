## Pay.sh

**What it is:** [Pay.sh](https://pay.sh) is a free, open-source tool from the Solana Foundation. Its `pay` command pays HTTP 402 charges for you, using the same x402 protocol as your companion server. It keeps its own wallet on your computer, so nothing about it goes into the app.

**Where it runs:** on your computer, against the companion server. Install it once with `brew install pay` (macOS) or `npm install -g @solana/pay`, then follow *Pay.sh* in **`companion-server/README.md`**. Run its commands inside that folder:

```bash
cd companion-server
npm run paysh              # pays the companion's GET /premium-data once from your Pay.sh wallet
npm run paysh -- wallet    # shows that wallet's devnet address and USDC balance
```

**Let Claude Code use your API:** run `pay claude` in `companion-server/`. Claude Code can then pay for the companion's paid endpoints while it helps you build.
