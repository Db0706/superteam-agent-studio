# On-chain bonus challenges (Operation, Minesweeper)

Two optional puzzles on **Solana devnet**, three tiers each (Operation 30/50/70, Minesweeper 90/80/30). Each team solves its own puzzle with its registered wallet; Agent Studio's `bureau.chain` verifier reads devnet and awards the points. No server of ours is involved.

## What's deployed (devnet)

| Constant | Value |
| --- | --- |
| Program ID (`bureau_registry`) | `H2wWqEUUbQ3LJGWLAYyLK8vop4zxeX69r1cXeNpY4XXk` |
| CRED mint (6 decimals) | `AwPoLn4inVqixYn9Uab2JonLBqdKZDC6poXHtjWcBnG3` |
| Presentation account | `HdMsqBdAW8mbrhJzHztqr1XVP1km3fXWHm7u8DpJeD9e` |
| Salt | `830797a34fd3` |

- The program is Speedbuild 2026's `packages/bureau-registry` (commit `9203d5f`) with only `declare_id!` changed to the address above, built with `cargo-build-sbf` (no IDL published, on purpose) and initialised with a code window of 4500 slots.
- Authority and upgrade authority: the throwaway devnet wallet `31NmqqGmupVi3PaQ9KvH71U6VnMUDBmgDEYtSLzFqX9z` (key in `~/.config/agent-studio/devnet-e2e-payer.json`). It also holds the CRED mint authority and pays for team setup.
- Setup state (CRED mint key, salt, each team's clearance account) is in `~/.config/agent-studio/bureau/state.json`. Keep it: the seed script needs it.

## Running it on the day

1. **Create the race:** Admin → Tournaments → Set up the hackathon, tick Bonus challenges, paste the four constants, challenges open 20 minutes after the start for 2 hours.
2. **Teams register wallets** on their team page (it shows each team's Challenge ID).
3. **At about 11:50, seed every registered team** (funds each wallet with 0.02 SOL and 1 CRED, creates its records; safe to re-run for late teams):

   ```bash
   cd ~/Desktop/SuperteamAgent/superteam-agent-studio && set -a && . ./.env.production.local && set +a && DATABASE_URL="$DATABASE_URL_WORKER" npx tsx scripts/bureau-setup.mts seed
   ```

   It prints one line per team (`✓`, or `✗` with the reason) and the authority's remaining SOL. A team that registers later: run it again.
4. Teams press **Run verification** on each tier. Tiers unlock in order.

## Faucet failed? Send test SOL yourself

```bash
cd ~/Desktop/SuperteamAgent/superteam-agent-studio && npx tsx scripts/devnet-sol.mts <their address>
```

Sends 0.05 devnet SOL from the organiser wallet (several addresses at once is fine; `--sol 0.1` for more, up to 0.5). Devnet only. It prints the organiser wallet's remaining balance.

## Rate limits

Public devnet (`api.devnet.solana.com`) answers "Too Many Requests" quickly. The verifier retries and treats an outage as our problem (never the team's fail), but checks get slower. For the day, a free devnet RPC key (Helius, QuickNode) helps: set it as `SOLANA_DEVNET_RPC_URL` on the Railway worker and in the setup form's "Devnet RPC address" so students use it too.

## Proven end to end (25 Oct, 04:00)

A throwaway test team was seeded from the local database, solved all six tiers with a reference solver using only the briefs, and pressed Run verification on each tier in order: the worker checked devnet and all six **passed**, adding 350 points on the leaderboard. A transaction from a different wallet was refused.

The reference solver is kept privately in `~/.config/agent-studio/bureau/bureau-solve.mts`, outside this public repo: never share it with participants.
