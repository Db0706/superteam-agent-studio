## Paid API example

**What you get:**

- `GET /premium-data`: an endpoint that costs `$0.01` (devnet USDC) per call. Change the price with `PAID_API_PRICE_USD`. Replace the handler in `src/routes/premium-data.ts` with whatever you want to sell, such as Gemini output or data.
- `examples/client.ts` (`npm run pay`): a buyer program. It pays with `AGENT_PRIVATE_KEY` within its spending limits and prints the data and the receipt. Other agents can buy from your service the same way.
- `POST /api/buy`: the same buyer running inside your service. It only ever buys from this service's own `/premium-data`. `GET /api/buy` shows the budget.

**Try it** (after the payments setup above, with `npm run dev` running in another terminal):

```bash
curl -i http://localhost:3000/premium-data             # 402 + PAYMENT-REQUIRED header (the price)
npm run pay                                            # pays once, prints the data + receipt
npm run pay -- http://localhost:3000/premium-data 5    # pays 5 times; watch the budget go down
curl -X POST http://localhost:3000/api/buy             # the service's own agent pays once
```

The `PAYMENT-REQUIRED` header is base64 JSON. To read it: `curl -si http://localhost:3000/premium-data | grep -i payment-required | cut -d' ' -f2 | base64 -d`.

A successful payment prints a `receipt` with a `transaction` id. Paste it into https://explorer.solana.com/?cluster=devnet to see it on-chain.

**If it fails:**

| Message | Fix |
| --- | --- |
| `PAY_TO_ADDRESS is not set` | Run `npm run keygen -- --pay-to`, then restart the server |
| `AGENT_PRIVATE_KEY is not set` | Run `npm run keygen` |
| `…simulation_failed…` or `insufficient_funds` | Run `npm run wallets`. The buyer needs devnet USDC, and the seller address needs a USDC account (send it faucet USDC once) |
| `…above the per-payment cap…` / `maxAmountPerPayment` | The price is higher than `MAX_PAYMENT_USD` |
| `…would exceed the budget…` | `AGENT_BUDGET_USD` is used up. Restart the server (or script) to reset it, or raise it |
