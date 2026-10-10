## Paid API example

**What you get:**

- In the companion server: `GET /premium-data`, an endpoint that costs `$0.01` (devnet USDC) per call, and `POST /api/buy`, the companion's own agent that buys it within its spending limits. Change the price with `PAID_API_PRICE_USD` in `companion-server/.env.local`, and replace the handler in `companion-server/src/routes/premium-data.ts` with whatever you want to sell.
- In the app: a **Premium data** screen (`app/premium.tsx`, using `lib/paidapi/client.ts`). **Check the price** calls `/premium-data` without paying and shows the decoded `PAYMENT-REQUIRED` price. **Let the agent pay** calls `POST /api/buy` and shows the data, the receipt and the remaining budget.

**Try it:** finish the payments setup in `companion-server/README.md`, start `npm run companion`, open the app and tap **Premium data**. Without funded wallets, step 2 shows the facilitator's reason (usually "insufficient funds") and the budget is not charged.

A successful payment shows a `receipt` with a `transaction` id. Paste it into https://explorer.solana.com/?cluster=devnet to see it on-chain.

**If it fails:** the *Paid API example* table in `companion-server/README.md` lists every message and its fix. Run those commands inside `companion-server/`.
