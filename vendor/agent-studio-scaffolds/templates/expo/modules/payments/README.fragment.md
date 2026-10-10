## Internet-native payments (x402 on Solana devnet)

**What it is:** [x402](https://www.x402.org) brings back the HTTP status code `402 Payment Required`. A server answers "this costs $0.01"; the caller pays and repeats the request; the server checks the payment and responds. No sign-ups, cards or API keys. Programs (like AI agents) can pay for things on their own.

**No real money.** Only **Solana devnet** (a test network with free, worthless tokens) is allowed. The companion server refuses any other network on purpose.

**Where it runs:** charging and paying both happen in the **companion server**, because paying needs a wallet key and a key inside an app can be extracted. The app only reads prices: `lib/payments/client.ts` has `checkPrice(path)`, which calls a companion endpoint without paying and decodes the `PAYMENT-REQUIRED` header (base64 JSON: network, token, amount, receiving address).

**Setup:** follow *Internet-native payments* in **`companion-server/README.md`**. Run its commands inside that folder:

```bash
cd companion-server
npm run keygen -- --pay-to   # where payments arrive (seller)
npm run keygen               # the companion's own agent wallet (buyer)
npm run wallets              # after getting faucet USDC: should show ✓ for both
```

> ⚠️ `AGENT_PRIVATE_KEY` lives only in `companion-server/.env.local`. Never copy it into the app or an `EXPO_PUBLIC_` variable.

To let *people* pay from their own wallet app (instead of the companion's agent), you need a wallet connection such as Solana Mobile Wallet Adapter. That isn't part of this template yet.
