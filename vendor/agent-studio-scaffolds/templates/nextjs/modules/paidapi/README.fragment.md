## Paid API example

**What you get:**

- `GET /api/premium`: an API route that costs `$0.01` (devnet USDC) per call. Change the price with `PAID_API_PRICE_USD`. Replace the handler in `app/api/premium/route.ts` with whatever you want to sell, such as Gemini output or data.
- `/premium`: a page with two buttons. **1. Call without paying** shows the `402` answer and the decoded `PAYMENT-REQUIRED` price. **2. Let the agent pay** asks your server's agent to buy it.
- `POST /api/buy`: the server-side agent. It pays with `AGENT_PRIVATE_KEY` within its spending limits and only ever buys from this app's own `/api/premium`. `GET /api/buy` shows the budget.
- `npm run pay`: the same buyer from the command line.

**Try it** (after the payments setup above, with `npm run dev` running in another terminal):

```bash
curl -i http://localhost:3000/api/premium          # 402 + PAYMENT-REQUIRED header
npm run pay                                        # pays once, prints the data + receipt
npm run pay -- http://localhost:3000/api/premium 5 # pays 5 times; watch the budget go down
```

A successful payment prints a `receipt` with a `transaction` id. Paste it into https://explorer.solana.com/?cluster=devnet to see it on-chain.

**If it fails:**

| Message | Fix |
| --- | --- |
| `PAY_TO_ADDRESS is not set` | Run `npm run keygen -- --pay-to`, then restart the dev server |
| `AGENT_PRIVATE_KEY is not set` | Run `npm run keygen` |
| `…simulation_failed…` or `insufficient_funds` | Run `npm run wallets`. The buyer needs devnet USDC, and the seller address needs a USDC account (send it faucet USDC once) |
| `…above the per-payment cap…` / `maxAmountPerPayment` | The price is higher than `MAX_PAYMENT_USD` |
| `…would exceed the budget…` | `AGENT_BUDGET_USD` is used up. Restart the server to reset it, or raise it |
