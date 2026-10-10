## Spending controls

The agent that pays runs in the companion server, so its limits do too, next to the key they protect. Limits enforced inside an app could be switched off by whoever installs it. Before every payment the companion checks:

- **Per-payment cap** (`MAX_PAYMENT_USD`, default `0.10`): anything more expensive is refused before it is signed.
- **Total budget** (`AGENT_BUDGET_USD`, default `1.00`): once this much has been spent, further payments are refused.
- **Only devnet USDC**: prices in any other token are refused.

Set them in `companion-server/.env.local`. The running total resets when the companion restarts. Details and code: *Spending controls* in `companion-server/README.md`.

**Test it (no wallet needed):** `cd companion-server && npm run test:spending`
