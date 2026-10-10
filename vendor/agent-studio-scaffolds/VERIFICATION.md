# Verification record

Date: 2026-10-10 · Machine: macOS (Darwin 25), Node 22.13.1, npm 10.9.2 · Scaffold version 0.2.0 (Next.js results first recorded for 0.1.0, re-run with the node framework)

## Verified package versions (exact pins)

Checked against the npm registry and PyPI on 2026-10-10. The x402 behaviour was read from the published package source/types, not from blog posts.

| Package | Pinned | Why this version |
| --- | --- | --- |
| `next` | 16.3.8 | `@x402/next@2.28.0` peer-requires `next >=16.2.6`. 16.4.0 came out the day before testing, so the previous patch is used. |
| `react` / `react-dom` | 19.3.0 | latest |
| `typescript` | 5.9.3 | latest 5.x. TypeScript 7.0 (the native port) exists but was not tested with Next. |
| `@types/react`, `@types/react-dom` | 19.3.0 | |
| `@types/node` | 22.20.5 | matches Node 22 LTS |
| `server-only` | 0.0.1 | build-time guard for secret-holding modules |
| `@google/genai` | 2.28.0 | official Google Gen AI SDK (GA, major version 2). Needs Node ≥ 20. |
| `@x402/core` | 2.28.0 | x402 V2 core. Imported directly for `HTTPFacilitatorClient` and header codecs. |
| `@x402/next` | 2.28.0 | `withX402` route wrapper, `x402ResourceServer` |
| `@x402/fetch` | 2.28.0 | `wrapFetchWithPayment`, `x402Client` |
| `@x402/svm` | 2.28.0 | Solana `exact` scheme (`@x402/svm/exact/server`, `@x402/svm/exact/client`) |
| `@solana/kit` | 5.5.1 | Must be **5.x**: `@x402/svm` depends on `@solana-program/token@0.9`, `token-2022@0.6.1` and `compute-budget@0.11`, which all peer-require `@solana/kit ^5`. Kit 6.x causes peer conflicts. |
| `tsx` | 4.23.15 | runs `scripts/*.ts` (keygen, wallets, pay, tests); in node also `npm run dev` (`tsx watch`) and `examples/client.ts` |
| `express` (node) | 5.2.1 | `@x402/express@2.28.0` peer-requires `express ^4 \|\| ^5`. 5.3.0 came out the day before testing, so the previous release is used. |
| `@types/express` (node) | 5.0.6 | latest; `@x402/express`'s own `.d.ts` imports Express types |
| `@x402/express` (node) | 2.28.0 | `paymentMiddleware(routes, x402ResourceServer)`. Depends on `@x402/core ~2.28.0` and `@x402/extensions ~2.28.0`. `@x402/paywall` is an optional peer (browser paywall UI only; not used). |

Not used, for reference: `x402`, `x402-next` and `x402-fetch` 1.2.0 on npm are the **legacy V1** packages. `@x402/paywall` is an *optional* peer of `@x402/next`, only needed for the browser paywall UI on page routes. `@x402/hono` 2.28.0 exists (not tested here). PyPI `x402` 2.25.0 (extras: `svm`, `fastapi`, `httpx`, …; Python ≥ 3.10) and PyPI `google-genai` 2.29.0 exist (not tested). `pay.sh` is not a package on npm.

## x402 V2 facts confirmed

| Fact | Value | How confirmed |
| --- | --- | --- |
| Solana devnet CAIP-2 id | `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` | `@x402/svm` README + live facilitator `/supported` |
| Headers (V2) | `PAYMENT-REQUIRED` (server → client, base64 JSON), `PAYMENT-SIGNATURE` (client → server), `PAYMENT-RESPONSE` (settlement receipt) | `@x402/core` source; observed on the wire. V1 used `X-PAYMENT` / `X-PAYMENT-RESPONSE`. |
| Test facilitator | `https://x402.org/facilitator` | `GET /supported` on 2026-10-10 lists `{x402Version:2, scheme:"exact", network:"solana:EtWT…"}` with `feePayer CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5` |
| Devnet USDC mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | `@x402/svm` default assets; appears in our 402 response |
| Who pays SOL fees | the facilitator (`extra.feePayer`), so buyers need only USDC | `@x402/svm` exact client source |
| Destination token account | **not** created by the client. The `payTo` wallet must already hold a USDC token account. | `@x402/svm` exact client builds only `TransferChecked` + memo |
| Client spend controls | `x402Client.setSpendControls({ maxAmountPerPayment })`, default cap `$1`, default assets only. Hooks: `onBeforePaymentCreation` (can abort), `onAfterPaymentCreation`, `onPaymentCreationFailure`, `onPaymentResponse`. | `@x402/core` types and source |
| API routes | `withX402(handler, routeConfig, server)` settles only if the handler returns < 400. `paymentProxy` (Next 16 "proxy", formerly middleware) is for page routes. | `@x402/next` README |
| Express | `paymentMiddleware(routes, server, paywallConfig?, paywall?, syncFacilitatorOnStart = true)`. `routes` is keyed `"GET /path"` and matched against `req.path`. With `syncFacilitatorOnStart` it calls the facilitator's `/supported` **when the middleware is created** and retries on the next paid request if that fails. It buffers the handler's response and settles only if the status is < 400. | `@x402/express@2.28.0` README and `dist/esm/index.mjs` from the published tarball |

## What was tested: Next.js

| # | Test | Result |
| --- | --- | --- |
| 1 | `npm run verify`: compose + `npm install` + `tsc --noEmit` + `next build` (+ `npm run test:spending` when present) for **base**, **gemini**, **payments**, **payments+spending**, **full** (gemini+payments+spending+paidapi) | see matrix below |
| 2 | `npm run test:spending`: 4 unit tests (dollar parsing, policy validation, per-payment cap, budget/release/commit) and 4 integration tests that drive the **real** `x402Client` + `wrapFetchWithPayment` against a fake seller (settled payments count until the budget is exhausted; seller-rejected payments are refunded to the budget; price above the cap is refused before signing; unknown token refused) | 8/8 pass |
| 3 | Production server (`next start`) without a Gemini key: `POST /api/chat` returns 500 with a "GEMINI_API_KEY is not set" message; an empty prompt returns 400 | pass |
| 4 | `GET /api/premium` unpaid, against the **live** x402.org facilitator: 402, `PAYMENT-REQUIRED` decodes to x402Version 2, `exact`, Solana devnet, amount `10000` (= $0.01), devnet USDC mint, our `payTo`, facilitator `feePayer`; `Cache-Control: no-store` | pass |
| 5 | `POST /api/buy` and `npm run pay -- <url> 2` with an **unfunded** generated devnet key: the client fetched the mint from devnet RPC, built and signed the transaction, sent `PAYMENT-SIGNATURE`. The facilitator rejected it (`invalid_exact_svm_transaction_simulation_failed`, no USDC). The budget was correctly refunded (spent stays $0.00) and the reason plus a hint reaches the UI/CLI. | pass (expected rejection) |
| 6 | `MAX_PAYMENT_USD=0.005` with price $0.01: refused before signing | pass |
| 7 | `X402_NETWORK=<mainnet id>`: refused with a devnet-only error | pass |
| 8 | `/premium` page in a browser: "Call without paying" shows the decoded 402; "Let the agent pay" shows the result and the budget; no console errors other than the expected 402 | pass |
| 9 | Secret leakage: the agent secret and the strings `AGENT_PRIVATE_KEY`, `GEMINI_API_KEY`, `@google/genai` and `createKeyPairSignerFromBytes` do not appear in `.next/static` | pass |
| 10 | `server-only` guard: a `"use client"` page importing `lib/payments/client` makes `next build` fail | pass |
| 11 | `npm run keygen` / `npm run keygen -- --pay-to`: writes to `.env.local`, fills the empty line copied from `.env.example`, never overwrites an existing value; the key loads as a valid 64-byte signer (used in tests 5–7) | pass |

## What was tested: Node.js service (`--framework node`)

Same machine and date. Unless noted, the commands ran against `node dist/server.js` (the `npm start` build output).

| # | Test | Result |
| --- | --- | --- |
| N1 | `npm run verify`: compose + `npm install` + `tsc --noEmit` (src, scripts, examples) + `tsc -p tsconfig.build.json` (+ `npm run test:spending`) + **HTTP smoke test** for **base**, **gemini**, **payments**, **payments+spending**, **full**. The smoke test starts `node dist/server.js` on a free port with the key env vars removed and checks: `GET /` lists exactly the composed modules; unknown path → 404; gemini: empty prompt → 400, malformed JSON → 400, no key → 500 "GEMINI_API_KEY is not set"; paidapi: `GET /premium-data` → 500 "PAY_TO_ADDRESS is not set" (no facilitator call), `GET /api/buy` → budget 1.00, `POST /api/buy` → 400 "AGENT_PRIVATE_KEY is not set" | see matrix below |
| N2 | `npm run test:spending`: the same 8 tests as Next (4 unit, 4 driving the real `x402Client` + `wrapFetchWithPayment`) | 8/8 pass |
| N3 | `GET /premium-data` unpaid, against the **live** x402.org facilitator: 402, `PAYMENT-REQUIRED` decodes to x402Version 2, `exact`, `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`, amount `10000` (= $0.01), devnet USDC mint, our `payTo`, `extra.feePayer CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5`; `Cache-Control: no-store` | pass |
| N4 | `npm run pay -- <url> 2` and `POST /api/buy` with an **unfunded** generated devnet key: signed payment sent, facilitator rejected it (`invalid_exact_svm_transaction_simulation_failed`), budget refunded (spent stays $0.00, 0 payments), reason + "run npm run wallets" hint printed/returned | pass (expected rejection) |
| N5 | `MAX_PAYMENT_USD=0.005` with price $0.01: refused before signing (x402 `spendControls.maxAmountPerPayment`) | pass |
| N6 | `X402_NETWORK=<mainnet id>`: the buyer refuses with the devnet-only error; the server answers `GET /premium-data` with 500 and the same error | pass |
| N7 | `npm run keygen` / `npm run keygen -- --pay-to` write `.env.local`; the server and `examples/client.ts` load it; `npm run wallets` against devnet RPC reports "no devnet USDC account yet" for both unfunded wallets | pass |
| N8 | `npm run dev` (`tsx watch src/server.ts`): starts, discovers the `.ts` route files, `GET /` and `GET /premium-data` answer | pass |

## Matrix (`npm run verify`, final run)

```
PASS  next-base               install → typecheck → build
PASS  next-gemini             install → typecheck → build
PASS  next-payments           install → typecheck → build
PASS  next-payments-spending  install → typecheck → build → test:spending
PASS  next-full               install → typecheck → build → test:spending
PASS  node-base               install → typecheck → build → smoke
PASS  node-gemini             install → typecheck → build → smoke
PASS  node-payments           install → typecheck → build → smoke
PASS  node-payments-spending  install → typecheck → build → test:spending → smoke
PASS  node-full               install → typecheck → build → test:spending → smoke
```

## Not tested (needs things we don't have here)

- **A real Gemini call.** No `GEMINI_API_KEY` was used, so only the missing-key path was exercised. The SDK call (`ai.models.generateContent({ model, contents })` → `response.text`) follows the `@google/genai@2.28.0` README.
- **A settled devnet payment.** That needs devnet USDC from https://faucet.circle.com for the buyer *and* the seller address (to create its token account). The faucet is a web form with bot protection, so it wasn't automated. Everything up to the facilitator's verify step was exercised (test 5). The settle path, the `PAYMENT-RESPONSE` receipt and the budget commit on success are covered only by the offline integration test (test 2).
- **`npm run wallets`** against *funded* wallets. It was run live against devnet RPC with the two unfunded generated wallets: it correctly reported "no devnet USDC account yet" for both, and derived the same buyer address that `keygen` printed.
- `npm run dev` (Turbopack dev mode). Only `next build` + `next start` were run.
- Windows/Linux, Node 20 (CI runs `full` on Node 20 for both frameworks), deployment to Vercel or any Node host.
- Node: the same gaps as Next (no real Gemini call, no settled payment, no funded `npm run wallets`). The Express settle path (`PAYMENT-RESPONSE` header after a < 400 handler) was read from the `@x402/express` source, not exercised.
- Expo, Python, and the Wallet / Pay.sh capabilities.

## Known limitations (by design for a starter)

- The spending total lives in memory per process: it resets on restart, and serverless instances don't share it. Persist it for anything long-running.
- `/api/buy` has no authentication. Anyone who can reach the app can make its agent spend devnet test money, up to the budget. Same for the node service's `POST /api/buy`.
- Node `paidRoute("GET /path", …)` must be given the same method and path it is mounted on. `@x402/express` only charges requests matching that string and lets everything else through, so `paidRoute` answers 500 on a mismatch instead of serving the endpoint for free (tested by mounting it on the wrong path). Express-style `:param` segments work in both. `HEAD` requests to a paid `GET` route are not charged; Express sends headers only, no body.
- Only devnet USDC is priced. Other tokens are refused.
