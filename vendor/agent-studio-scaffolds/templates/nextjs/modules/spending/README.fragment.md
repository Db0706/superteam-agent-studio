## Spending controls

An agent that pays automatically needs limits. Before every payment the buyer checks:

- **Per-payment cap** (`MAX_PAYMENT_USD`, default `0.10`): anything more expensive is refused before it is signed.
- **Total budget** (`AGENT_BUDGET_USD`, default `1.00`): once this much has been spent, further payments are refused.
- **Only devnet USDC**: prices in any other token are refused.

A payment counts against the budget as soon as it is signed. It is handed back if the seller rejects it. If the network fails halfway, it stays counted, so the budget is never under-counted. The running total is kept in memory and **resets when the server or script restarts**. Save it to a database if you need it to persist.

**Code:** `lib/spending/policy.ts` (reads the limits), `lib/spending/tracker.ts` (the running total), `lib/spending/attach.ts` (plugs the limits into the x402 client, alongside x402's own built-in per-payment cap).

**Test it (no wallet needed):** `npm run test:spending`
