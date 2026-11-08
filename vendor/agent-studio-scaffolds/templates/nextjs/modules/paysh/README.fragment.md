## Pay.sh

**What it is:** [Pay.sh](https://pay.sh) is a free, open-source tool from the Solana Foundation. Its `pay` command pays HTTP 402 charges for you, using the same x402 protocol as this app. It keeps its own wallet, separate from `AGENT_PRIVATE_KEY`, and it can let AI agents such as Claude Code pay for APIs while they work.

**Install it once:** `brew install pay` (macOS) or `npm install -g @solana/pay`. Check with `pay --version`.

**Try it** (with `npm run dev` running in another terminal):

```bash
npm run paysh              # pays GET /api/premium once from your Pay.sh wallet
npm run paysh -- wallet    # shows that wallet's devnet address and USDC balance
```

The first `npm run paysh` makes a Pay.sh devnet wallet and fails with "payment was refused", because the new wallet is empty. Run `npm run paysh -- wallet`, send that address devnet USDC at https://faucet.circle.com (choose **Solana Devnet**), then run `npm run paysh` again. You can also call `pay` directly: `pay curl http://localhost:3000/api/premium`.

**Let Claude Code use your API:** run `pay claude` in this folder. Claude Code starts with Pay.sh's tools and pays for x402 APIs it calls, such as `http://localhost:3000/api/premium`, from the same wallet.

**Pay.sh's test network:** add `--sandbox` to pay public demo APIs on Pay.sh's hosted test network, which funds a throwaway wallet for you: `npm run paysh -- https://debugger.pay.sh/mpp/quote/AAPL --sandbox`.

**Get listed:** `npm run paysh -- listing your-team` writes `pay-listing/providers/your-team/<this project>/PAY.md`, a listing for the Pay.sh catalog, and checks it with `pay catalog check`. Set `PAYSH_SERVICE_URL` to your deployed `https://` address first. The public catalog only lists APIs paid on Solana **mainnet**, so submit it to https://github.com/solana-foundation/pay-skills once your app takes real money.

**If it fails:**

| Message | Fix |
| --- | --- |
| `The pay CLI is not installed` | `brew install pay` or `npm install -g @solana/pay` |
| `The payment was refused` | Your Pay.sh wallet has no devnet USDC. `npm run paysh -- wallet`, then use the faucet. The seller address needs a USDC account too (see the payments setup) |
| `Could not connect to Surfpool` with `--sandbox` | Pay.sh's hosted test network is down. Leave out `--sandbox` and pay on devnet instead |
