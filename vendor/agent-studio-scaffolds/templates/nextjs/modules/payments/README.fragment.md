## Internet-native payments (x402 on Solana devnet)

**What it is:** [x402](https://www.x402.org) brings back the HTTP status code `402 Payment Required`. A server answers "this costs $0.01"; the caller pays and repeats the request; the server checks the payment and responds. No sign-ups, cards or API keys. Programs (like AI agents) can pay for things on their own.

**No real money.** This template only works on **Solana devnet**, a test network where tokens are free and worthless. It refuses any other network on purpose.

### Words you'll see

| Word | Meaning |
| --- | --- |
| Wallet / keypair | A public **address** (safe to share, like an account number) plus a **secret key** (like a password; never share it). |
| Devnet | Solana's test network. Free test tokens, no value. |
| USDC | A token worth $1 on mainnet. Here you use **devnet USDC**, which is free test money. |
| Facilitator | A service that checks a payment and submits it to Solana for you. This app uses the free test facilitator at `https://x402.org/facilitator`. It also pays the small network fee, so you don't need SOL. |
| `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE` | The HTTP headers x402 V2 uses for the price, the signed payment and the receipt. |

### Setup

1. **Where payments arrive (seller).** Run `npm run keygen -- --pay-to`. This puts a fresh devnet address in `PAY_TO_ADDRESS` in `.env.local`. (Or paste your own devnet address from a wallet app such as Phantom or Solflare.)
2. **Who pays (buyer/agent).** Run `npm run keygen`. This creates a throwaway devnet key in `AGENT_PRIVATE_KEY` and prints its address.
3. **Get free test USDC.** Go to https://faucet.circle.com, choose **Solana Devnet**, and request USDC for **both** addresses: the buyer (so it can pay) *and* the seller (so it has a USDC account to receive into; x402 does not create one for you).
4. **Check:** `npm run wallets` should show ✓ for both.
5. Restart `npm run dev`.

> ⚠️ `AGENT_PRIVATE_KEY` is a secret. Use a throwaway key made for this project, never a wallet that holds real money.

**Code:** `lib/payments/server.ts` (charge for a route with `paidRoute(...)`), `lib/payments/client.ts` (a `fetch` that pays automatically), `lib/payments/config.ts` (devnet-only settings).
