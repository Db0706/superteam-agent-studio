## Paid API example

**What you get:**

- `GET /premium-data`: an endpoint that costs `$0.01` (devnet USDC) per call. Change the price with `PAID_API_PRICE_USD`. Replace the handler in `agent/routes/premium_data.py` with whatever you want to sell, such as Gemini output or data.
- `python -m agent buy`: the agent buys from a paid URL. It pays with `AGENT_PRIVATE_KEY` within its spending limits and prints the data and the receipt. It can buy from any x402 seller on Solana devnet the same way.
- `POST /api/buy`: the same buyer running inside your service. It only ever buys from this service's own `/premium-data`. `GET /api/buy` shows the budget.

**Try it** (after the payments setup above, with `python -m agent serve` running in another terminal):

```bash
curl -i http://localhost:3000/premium-data                      # 402 + PAYMENT-REQUIRED header (the price)
python -m agent buy                                             # pays once, prints the data + receipt
python -m agent buy http://localhost:3000/premium-data -n 5     # pays 5 times; watch the budget go down
curl -X POST http://localhost:3000/api/buy                      # the service's own agent pays once
```

The `PAYMENT-REQUIRED` header is base64 JSON. To read it: `curl -si http://localhost:3000/premium-data | grep -i payment-required | cut -d' ' -f2 | base64 -d`.

A successful payment prints a `receipt` with a `transaction` id. Paste it into https://explorer.solana.com/?cluster=devnet to see it on-chain.

**If it fails:**

| Message | Fix |
| --- | --- |
| `PAY_TO_ADDRESS is not set` | Run `python -m agent keygen --pay-to`, then restart the service |
| `AGENT_PRIVATE_KEY is not set` | Run `python -m agent keygen` |
| `…simulation_failed…` or `insufficient_funds` | Run `python -m agent wallets`. The agent needs devnet USDC, and the seller address needs a USDC account (send it faucet USDC once) |
| `…above the per-payment cap…` / `max_amount_per_payment` | The price is higher than `MAX_PAYMENT_USD` |
| `…would exceed the budget…` | `AGENT_BUDGET_USD` is used up. Restart the agent to reset it, or raise it |
