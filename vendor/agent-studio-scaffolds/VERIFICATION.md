# Verification record

Date: 2026-10-10 · Machine: macOS (Darwin 25), Node 22.13.1, npm 10.9.2 · Scaffold version 0.8.0 (Next.js results first recorded for 0.1.0; node added in 0.2.0; python added in 0.3.0, Python 3.12.14 and 3.10.21; expo added in 0.4.0; next `wallet` module added in 0.5.0; next UI redesign in 0.6.0; expo UI redesign in 0.7.0; node and python landing pages in 0.8.0; `paysh` module for all four in 0.9.0; expo `wallet` module in 0.10.0; `race` adapter for all four in 0.11.0)

## Verified package versions (exact pins)

Checked against the npm registry and PyPI on 2026-10-10. The x402 behaviour was read from the published package source/types, not from blog posts.

| Package | Pinned | Why this version |
| --- | --- | --- |
| `next` | 16.4.2 | `@x402/next@2.28.0` peer-requires `next >=16.2.6`. 16.4.2 (2026-10-15) fixes critical advisories that affect 16.0.0 to 16.4.0 (unauthenticated RCE in image optimisation and `use cache`, a Server Actions DoS), so it is used despite being newer than two weeks. |
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
| `expo` (expo) | 57.0.25 | SDK 57 is the current SDK (`latest` dist-tag 57.0.27, published 2026-10-06). 57.0.25 (2026-09-24) is the newest patch at least two weeks old. SDK 58 is still `next`. The old catalog guess `~52.0.0` is three SDKs behind. |
| `react-native` (expo) | 0.86.3 | exactly what `expo@57.0.25`'s `bundledNativeModules.json` lists (0.87 is out but not for SDK 57) |
| `react` / `react-dom` (expo) | 19.2.3 | SDK 57's exact pin. `react-dom` is needed even for Android: `expo-router`'s web-only deps (`vaul`, `@radix-ui/*`) peer-require it, and without a pin npm picks `react-dom@19.3.0`, which conflicts with `react@19.2.3` (`ERESOLVE`, seen on a clean install) |
| `expo-router` (expo) | 57.0.23 | SDK range `~57.0.23`; published 2026-09-24 |
| `expo-constants`, `expo-linking`, `expo-status-bar` (expo) | 57.0.19, 57.0.11, 57.0.1 | expo-router peers / SDK ranges, newest patches at least two weeks old |
| `react-native-screens`, `react-native-safe-area-context` (expo) | 4.26.2, 5.7.0 | expo-router peers, inside SDK ranges `~4.26.0` / `~5.7.0` |
| `react-native-reanimated`, `react-native-worklets` (expo) | 4.5.1, 0.10.1 | not used by the app, but `expo-router` → `react-native-drawer-layout` peer-requires reanimated, so npm installs it anyway. Unpinned, npm chose reanimated 4.7.1 + worklets 0.13.0, which don't match SDK 57's native modules (`expo-modules-core` warns: worklets `^0.7.4 … ^0.10.0`). Pinned to the SDK's exact versions. |
| `typescript` / `@types/react` (expo) | 6.0.3 / 19.2.18 | what Expo's own SDK 57 TypeScript template uses (`~6.0.3`, `~19.2.2`). The companion server stays on 5.9.3 like the node template; they are separate projects. |
| `@x402/express` (node) | 2.28.0 | `paymentMiddleware(routes, x402ResourceServer)`. Depends on `@x402/core ~2.28.0` and `@x402/extensions ~2.28.0`. `@x402/paywall` is an optional peer (browser paywall UI only; not used). |

### Python (PyPI), checked 2026-10-10

`requirements.txt` pins the direct dependencies exactly; transitive versions are left to pip (the npm templates likewise pin only direct dependencies). Read from the published wheels/sdists and their metadata.

| Package | Pinned | Why this version |
| --- | --- | --- |
| `x402[httpx,svm]` | 2.25.0 | latest. The **V2** Python SDK (async `x402Client`, `x402ResourceServer`, FastAPI `payment_middleware`, `x402HttpxClient`, Solana `exact` scheme). Requires Python ≥ 3.10. The `fastapi` extra is **not** used: it pulls `fastapi[standard]` (fastapi-cli, cloud CLI, jinja2, …); the middleware only needs `fastapi`/`starlette`, pinned below. |
| `solana` | 0.38.0 | `x402[svm]` allows `>=0.36,<0.40`. 0.39.0 requires Python ≥ **3.11**, so 0.38.0 (Python ≥ 3.10) is pinned to keep 3.10 working. 0.38+ uses `httpx2` internally. |
| `solders` | 0.27.1 | `solana` 0.38 requires `solders >=0.23,<0.28`, so the latest 0.29.0 conflicts. Used directly for `Keypair` / `Pubkey` (keygen, address checks). |
| `httpx` | 0.28.1 | latest stable (1.0 is still dev releases); `x402[httpx]` needs ≥ 0.28.1. Used for the paying client and `wallets` RPC calls. |
| `fastapi` | 0.143.0 | latest |
| `uvicorn` | 0.54.0 | latest; plain (no `[standard]`), `--reload` uses StatReload |
| `python-dotenv` | 1.2.4 | loads `.env` without overriding real environment variables |
| `google-genai` | 2.29.0 | official Google Gen AI SDK, Python ≥ 3.10. `genai.Client(api_key=…).aio.models.generate_content(model=…, contents=…)` → `response.text` (signatures read from the installed package). |
| `pyright[nodejs]` (dev) | 1.1.414 | latest; the `nodejs` extra installs a Node binary wheel, so students don't need npm for the optional typecheck. Run on every python combination; it found a real Python ≤ 3.11 f-string syntax error during development. |

Not used, for reference: `x402`, `x402-next` and `x402-fetch` 1.2.0 on npm are the **legacy V1** packages. `@x402/paywall` is an *optional* peer of `@x402/next`, only needed for the browser paywall UI on page routes. `@x402/hono` 2.28.0 exists (not tested here). `pay.sh` is not a package on npm.

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

### x402 Python SDK 2.25.0 (read from the published wheel)

| Fact | Value |
| --- | --- |
| Headers | `x402.http.PAYMENT_REQUIRED_HEADER` = `PAYMENT-REQUIRED`, `PAYMENT_SIGNATURE_HEADER` = `PAYMENT-SIGNATURE`, `PAYMENT_RESPONSE_HEADER` = `PAYMENT-RESPONSE` (V1 `X-PAYMENT` still accepted). Codecs in `x402.http.utils` (`encode/decode_payment_required_header`, `…_payment_response_header`). |
| Client | `x402Client().register(network, ExactSvmClientScheme(KeypairSigner(keypair), rpc_url=…))`. Hooks: `on_before_payment_creation` (return `AbortResult(reason)` to abort → `PaymentAbortedError`), `on_after_payment_creation`, `on_payment_creation_failure`, `on_payment_response` (gets `settle_response` or the 402's `payment_required`). Sync or async hooks both work. |
| Spend controls | `set_spend_controls({"max_amount_per_payment": "$0.10"})`; default cap `$1`. By default **every** default asset is allowed, and on devnet that is USDC, USDG and PYUSD, so the template's before-hook also enforces devnet-USDC only (tested). |
| HTTP client | `x402HttpxClient(client, **httpx_kwargs)` (an `httpx.AsyncClient` with `x402AsyncTransport`). On 402 it creates the payload, retries once with `PAYMENT-SIGNATURE`, then runs the response hooks. Errors during payment creation surface as `x402.http.clients.httpx.PaymentError("Failed to handle payment: …")`. |
| Solana client scheme | Builds compute-limit, compute-price, `TransferChecked` and memo instructions with the facilitator's `extra.feePayer` as fee payer; partially signs with the buyer. Like TS it does **not** create the destination token account. Mint and blockhash lookups use the **synchronous** `solana` RPC client, so they briefly block the event loop. |
| FastAPI middleware | `payment_middleware(routes, x402ResourceServer, …, sync_facilitator_on_start=True)` is meant for `@app.middleware("http")`. With `sync_facilitator_on_start` it calls the facilitator's `/supported` synchronously when created and again on the first paid request, and on a fatal configuration error (`RouteConfigurationError`, `FacilitatorCapabilityError`) calls `os._exit(1)`. The template therefore builds it lazily, calls `server.initialize()` itself in a thread, checks `get_supported_kind(2, network, "exact")`, and passes `sync_facilitator_on_start=False`. Settles only if the handler returns < 400; buffers the body; adds `PAYMENT-RESPONSE`. Route keys are `"GET /path"` with `[param]` / `*` patterns. |
| Server scheme | `x402.mechanisms.svm.exact.ExactSvmServerScheme()`. Its type hints don't match the `SchemeNetworkServer` protocol in 2.25.0 (pyright error), though it works; the template has a targeted `pyright: ignore`. |

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

## What was tested: Python agent (`--framework python`)

Same machine and date, Python 3.12.14 unless noted. Commands ran in the composed `full` project with its own `.venv`.

| # | Test | Result |
| --- | --- | --- |
| P1 | `npm run verify`: compose + `python -m venv` + `pip install -r requirements-dev.txt` + `compileall` + `pyright` (0 errors) + `python -m unittest` + `python -m agent` + **HTTP smoke test** of `python -m agent serve` (same checks as N1: `GET /` lists the composed modules, 404, chat 400/400/500, `/premium-data` 500 "PAY_TO_ADDRESS is not set", `GET /api/buy` budget 1.00, `POST /api/buy` 400 "AGENT_PRIVATE_KEY is not set") for **base**, **gemini**, **payments**, **payments+spending**, **full** | see matrix below |
| P2 | `python-full` on **Python 3.10.21** with the same pins | pass |
| P3 | Tests: 3 base (home lists modules, routes load, CLI parses) + 4 spending unit tests + 5 integration tests driving the **real** `x402Client` + `x402AsyncTransport` against an `httpx.MockTransport` seller (budget exhausted after settled payments; seller rejection refunded; price above cap refused before signing; unknown token refused; devnet USDG refused although x402 allows it). Mutation check: removing the response hook, the USDC-only check or the refund each makes a test fail. | 12/12 pass |
| P4 | `GET /premium-data` unpaid, against the **live** x402.org facilitator: 402, `Cache-Control: no-store`, `PAYMENT-REQUIRED` decodes to x402Version 2, `exact`, `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`, amount `10000`, devnet USDC mint, our `payTo`, `extra.feePayer CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5`, `maxTimeoutSeconds 300` | pass |
| P5 | `python -m agent buy <url> -n 2` and `POST /api/buy` with an **unfunded** generated key: payment signed and sent, facilitator rejected it (`invalid_exact_svm_transaction_simulation_failed`), budget refunded (spent $0.00, 0 payments), hint to run `python -m agent wallets` | pass (expected rejection) |
| P6 | `MAX_PAYMENT_USD=0.005` with price $0.01: refused before signing by x402 `max_amount_per_payment` | pass |
| P7 | `X402_NETWORK=<mainnet id>`: `buy` refuses; the server answers `GET /premium-data` with 500 and the devnet-only error | pass |
| P8 | `python -m agent keygen` / `keygen --pay-to` write `.env`; `python -m agent wallets` against devnet RPC reports "no devnet USDC account yet" for both unfunded wallets | pass |
| P9 | `python -m agent serve --reload`: starts, reloads on file change; unknown path 404 JSON; gemini without key 500 "GEMINI_API_KEY is not set" | pass |
| P10 | Composer: next and node output for **all 32** module subsets is byte-identical to the v0.2.0 composer (run before the version bump; afterwards only `studio.manifest.json` `scaffoldVersion` reads 0.3.0) | pass |

## What was tested: AI Race adapter (`--modules race`, 0.11.0)

The `race` module speaks ASRP/1, the protocol the Agent Studio race verifier uses: token check, nonce echo, the answer envelope and routing by task type. The AI logic for each task type is left to the team (each handler starts as a placeholder that returns a clear error), because building those capabilities is the race. Next.js and Node share the same `protocol`/`adapter`/`handlers`/`tools` files; Python mirrors them; Expo puts the adapter in the companion server.

- **R1. Offline protocol tests.** `npm run test:race` (Next, Node, Expo companion) and `tests/test_race.py` (Python), 5 tests each: health needs the token (503 unset, 401 wrong), unknown callers get 401 `unauthorized`, malformed tasks 400 `invalid_input` with the nonce echoed, answers are wrapped with the echoed nonce, `TaskError` maps to the matching protocol error, unbuilt task types say so.
- **R2. HTTP smoke test** (Node, Python, Expo companion): health 401 without the token and 200 `ready` with it; tasks 401 with a wrong token, 400 for a malformed task, 500 with "not built yet" for `respond`; `GET /race` reports the token as set and every task type as not built.
- **R3. Against the real verifier.** `tests/integration/scaffold-adapter.test.ts` in superteam-agent-studio composes `node-race`, starts it twice with a real team's verifier token, and runs layer 1 (First Intelligence, `ai.respond`) through the real job queue, worker and verifier. With `respond` written (a deterministic stand-in for a model, so no key is needed) the attempt **passed 100/100**; untouched, it **failed** with health passing and the feedback "This app doesn't handle "respond" tasks yet".
- **Not tested:** a team's real model answering every layer (that is the race), and deployed hosts (Vercel function limits for long `run_workflow` tasks: the route sets `maxDuration = 60`).

## What was tested: Expo Wallet Connection (`--framework expo --modules wallet`, 0.10.0)

Official packages do the wallet work: `@solana-mobile/mobile-wallet-adapter-protocol(-kit)` 3.0.1 (Solana Mobile) on `@solana/kit` 8.5.0, which `@x402/svm` 2.28.0 accepts (peer `>=5.1.0`). Our code is a ~40-line adapter (`lib/wallet/mobileWallet.ts`) from MWA's `transact()` to a kit `TransactionPartialSigner`, plus `lib/wallet/crypto-polyfill.ts`, which gives kit `crypto.subtle.digest` and `crypto.getRandomValues` from `expo-crypto` (Hermes has no WebCrypto; without it kit fails with "No digest implementation could be found"). `expo-dev-client` 57.0.19 and `expo-crypto` 57.0.3 follow the SDK table and the two-week rule.

- **E9. Development build.** `expo prebuild` + `gradlew assembleDebug` (10 min first build, 4 min after adding `expo-crypto`), installed on the Android 16 (API 36) emulator. Expo Go can't load MWA's native module, which the README says.
- **E10. Connect.** With Solana Mobile's `fakewallet-v1-debug.apk` (from the official `@solana-mobile/mobile-wallet-adapter-protocol@3.0.1` release) installed, **Connect wallet** opened the wallet's "Authorize dapp" screen showing the app's name and `Cluster: devnet`; after Authorize the app showed the account as a base58 address.
- **E11. Pay.** **Buy premium data** fetched the companion's 402, built the x402 `exact` transaction in the app, opened the wallet's "Sign transaction(s)" screen (1 payload), and after Authorize retried with `PAYMENT-SIGNATURE`. The companion's facilitator answered `invalid_exact_svm_transaction_simulation_failed`, shown in the app with the faucet hint: the expected result for an unfunded wallet. fakewallet makes a new key every session, so a settled payment needs a real wallet app (Phantom, Solflare, Backpack) holding devnet USDC: not tested yet.
- **no-secrets.** `@x402/svm` imports all of `@solana/kit`, and Metro keeps unused exports, so kit's key loader is in the bundle without being called. For `wallet` the bundle check allows that one library name, and a new check fails if the app's own `app/`, `lib/` or `components/` code loads a key (tested by planting a `createKeyPairSignerFromBytes` import: caught).

Test environment notes: this machine's emulator had no working DNS (networks connected, never validated), so the run used `adb reverse` for Metro, the companion and a small local JSON-RPC relay to devnet, with `EXPO_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899`. On a phone with normal internet none of that is needed.

## What was tested: Pay.sh (`--modules paysh`, 0.9.0)

Pay.sh is the Solana Foundation's `pay` CLI (https://pay.sh, https://github.com/solana-foundation/pay, MIT). It is a command-line tool, not a library, so the starters call it and never bundle it. Tested with `pay 0.29.0` from Homebrew core on 2026-10-18.

- **PS1. `pay` pays our devnet x402 charges.** `pay curl http://localhost:<port>/premium-data` against a composed node `paidapi` service: `pay` read the x402 V2 `PAYMENT-REQUIRED` challenge for `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`, created a devnet wallet (`pay account list` shows it under `devnet:`), and retried with a `PAYMENT-SIGNATURE` carrying `x402Version: 2`, scheme `exact` on that network (seen through a logging proxy). The facilitator answered `invalid_exact_svm_transaction_simulation_failed` because the new wallet was empty, which is the expected result before funding.
- **PS2. Commands, Node and Next.js.** `npm run paysh` (pays the project's paid route; prints the "payment was refused, fund your Pay.sh wallet" hint on that failure), `npm run paysh -- wallet` (finds the devnet wallet in `pay account list`, reads its devnet USDC balance over RPC), `npm run paysh -- listing "Team Rocket"` (writes `pay-listing/providers/team-rocket/<name>/PAY.md`; `pay catalog check … --no-probe` reports "PAY.md check successful"). Typecheck and `npm run test:paysh` pass in `npm run verify`.
- **PS3. Commands, Python.** `python -m agent paysh`, `--wallet` and `--listing` behave the same; pyright 0 errors; `tests/test_paysh.py` passes (listing layout and field limits, wallet parsing, a clear message when `pay` is not installed).
- **PS4. A settled payment through `pay`.** Not tested yet: needs devnet USDC in the Pay.sh wallet from https://faucet.circle.com.

Not tested: `pay claude` (needs a Claude Code login), `--sandbox` (Pay.sh's hosted test network at `402.surfnet.dev` did not answer on 2026-10-18), and submitting a listing (the public catalog only accepts mainnet APIs).

## What was tested: Node.js and Python landing pages (0.8.0)

`GET /` answers by content negotiation: browsers (Accept `text/html`) get a page in the Agent Studio look listing every endpoint with copy-paste commands and next steps (`src/landing.ts`, `agent/landing.py`); everything else (curl's `*/*`, fetch, httpx, the Expo app's companion check, the smoke tests) gets the same JSON as before.

| # | Test | Result |
| --- | --- | --- |
| L1 | `npm run verify -- node python`: all ten combinations pass, including the HTTP smoke tests that read `GET /` as JSON | pass |
| L2 | curl without Accept → JSON `{service, modules}`; `Accept: text/html` → the page (node and python) | pass |
| L3 | python: `pyright` clean; new tests cover both answers of `GET /` (JSON for `*/*`, page for `text/html`) | pass |
| L4 | Browser (Chrome, 1440px): node and python pages render with the composed modules, commands on one line each (scrolling sideways when long), next steps adapted to the modules; python links FastAPI's `/docs` | pass |
| L5 | next and expo output byte-identical to 0.7.0 apart from `scaffoldVersion` | pass |

## What was tested: Next.js UI (0.6.0)

The Next.js base and its gemini, paidapi and wallet pages use the Agent Studio "Schematic" look (`app/globals.css`, `components/ui.tsx`, `components/Nav.tsx`).

| # | Test | Result |
| --- | --- | --- |
| U1 | `npm run verify -- next`: all six combinations pass, including the no-secrets scan of `.next/static` | pass |
| U2 | Fonts (Archivo, Martian Mono) load in the browser from Google Fonts, not through `next/font/google`. `next/font/google` failed some Turbopack builds intermittently ("next/font/google queries have exactly one entry"), and builds now need no font download | pass |
| U3 | Browser (`next start`, Chrome, 1440px and 375px): home lists the composed modules and next steps; `/premium` step 1 shows the live 402 price, pay-to address and network; step 2 shows a readable error when no agent key is set; the spending meter renders; `/chat` shows the missing-key hint; `/wallet` shows the no-wallet state; no horizontal scroll on mobile | pass |
| U4 | node, python and expo output is byte-identical to 0.5.0 apart from `scaffoldVersion` | pass |

## What was tested: Next.js Wallet Connection (`--framework next --modules wallet`)

Same machine and date. `wallet` requires `paidapi` (and so `payments` + `spending`).

| # | Test | Result |
| --- | --- | --- |
| W1 | `npm run verify -- next`: all six next combinations including `full-wallet` pass install → typecheck → build → tests → **no-secrets** (new: `.next/static`, everything a browser downloads, contains none of `GEMINI_API_KEY`, `AGENT_PRIVATE_KEY`, `@google/genai`, `createKeyPairSignerFromBytes`) | pass |
| W2 | Dependencies: `@solana/react` 5.5.1 is released with `@solana/kit` 5.5.1 (the version x402's Solana packages need), so one `@solana/kit` is installed. `useWalletAccountTransactionSigner` returns a Kit `TransactionModifyingSigner`, which x402's `ExactSvmScheme` accepts directly: no adapter code | pass |
| W3 | Browser (`next start`, Chrome): `/wallet` without any wallet installed shows "No Solana wallet found"; no console errors | pass |
| W4 | Browser, with a **Wallet Standard test wallet** injected into the page (devnet only, `standard:connect` / `standard:events` / `solana:signTransaction`, throwaway Ed25519 key): the page lists it via Wallet Standard discovery, connects, and "Buy premium data with my wallet" makes the wallet sign **exactly one** transaction; x402 retries with it and the **live** x402.org facilitator rejects it with `invalid_exact_svm_transaction_simulation_failed` (the test wallet has no devnet USDC), which the page explains. Same point as P5/N-series: everything up to settlement | pass |
| W5 | **Real wallet, settled on devnet** (2026-10-12): a project generated by the live Builder, a real browser wallet on devnet, `/wallet` → Buy premium data → approved in the wallet. Answer 200 with a PAYMENT-RESPONSE receipt; transaction [`66x87vdk…jUb`](https://explorer.solana.com/tx/66x87vdkTbzaT5FbJda2pKbSJKS5ggYkYHaNsozJEsiZHnp8X3sSo9e6cEg3STzBCYEr1AYYtrmaRK7iUjaH9jUb?cluster=devnet) is confirmed on devnet: success, fee payer = the x402.org facilitator, the user's wallet signed a `transferChecked` of 0.01 devnet USDC plus x402's memo, and **the wallet added no extra instructions** | pass |

## What was tested: Expo on the Android emulator, and the Expo UI (0.7.0)

Android emulator (Pixel-class, Android 16 / API 36), Expo Go installed by `expo start --android`, companion server on the same Mac.

| # | Test | Result |
| --- | --- | --- |
| E6 | The composed `gemini,paidapi` app bundles (1416 modules) and runs in Expo Go on Android: home lists the composed modules; screens navigate | pass |
| E7 | App ↔ companion over the emulator network (`EXPO_PUBLIC_COMPANION_URL=http://10.0.2.2:3300`): the Premium screen loads the agent budget from `GET /api/buy`; "Call without paying" shows the live x402 V2 402 (devnet, `exact`, 10000 = $0.01, facilitator fee payer); without `PAY_TO_ADDRESS` the app shows the companion's "not set" message | pass |
| E8 | Expo UI (Schematic look, `components/Screen.tsx`): home with a live companion status light (ONLINE/OFFLINE), "What's plugged in", Premium as two steps with readable price rows and a spending meter, Chat with prompt/answer panels; missing-key errors render as red notices with next steps | pass |

Not tested on Android: a settled agent payment from the companion (needs a funded `AGENT_PRIVATE_KEY`) and a live Gemini answer (needs a key). Both run entirely in the companion server, which is the node template.

## What was tested: Expo app + companion server (`--framework expo`)

Same machine and date.

| # | Test | Result |
| --- | --- | --- |
| E1 | `npm run verify`: compose + `npm install` + **sdk-versions** (every pin that expo's `bundledNativeModules.json` lists is inside the SDK's range; offline, unlike `expo install --check`) + `tsc --noEmit` + `expo export --platform android` + **no-secrets** for **base**, **gemini**, **payments**, **payments+spending**, **full**. For every combination except base, the generated `companion-server/` then gets the full node treatment: install, typecheck, build, `test:spending` (when present) and the HTTP smoke test (N1). | see matrix below |
| E2 | Companion composition: `companion-server/` is byte-identical to `compose --framework node` with the same modules (gemini → gemini; payments → payments; payments+spending → payments, spending; full → all four). A base-only expo app has no `companion-server/`, no `companion*` scripts and no `EXPO_PUBLIC_COMPANION_URL`. next/node output is byte-identical to before this change for all 32 module subsets. | pass |
| E3 | no-secrets: the exported Android bundle (Hermes bytecode, strings readable) contains none of `GEMINI_API_KEY`, `AGENT_PRIVATE_KEY`, `@google/genai`, `createKeyPairSignerFromBytes`, `companion-server/src`. As a control, app strings such as `10.0.2.2` and `PAYMENT-REQUIRED` are found. | pass |
| E4 | Metro `blockList`: an app screen importing `../companion-server/src/lib/ai/gemini` makes `expo export` fail with "Unable to resolve module" | pass |
| E5 | `npx expo install --check` (online) on the full app: it reports newer patches published since (`expo ~57.0.27`, `expo-router ~57.0.25`, …), which is why verify checks against the installed SDK's own table instead. `EXPO_OFFLINE=1 npx expo install --check` passes but did not catch a deliberately wrong `react-native-screens` pin in `package.json` (it checks installed versions), so it isn't used. | informational |

## Matrix (`npm run verify`, final run, 0.11.0)

```
PASS  next-base                 install → typecheck → build → no-secrets
PASS  next-gemini               install → typecheck → build → no-secrets
PASS  next-race                 install → typecheck → build → test:race → no-secrets
PASS  next-race-gemini          install → typecheck → build → test:race → no-secrets
PASS  next-payments             install → typecheck → build → no-secrets
PASS  next-payments-spending    install → typecheck → build → test:spending → no-secrets
PASS  next-full                 install → typecheck → build → test:spending → test:paysh → test:race → no-secrets
PASS  next-full-wallet          install → typecheck → build → test:spending → test:paysh → test:race → no-secrets
PASS  node-base                 install → typecheck → build → smoke
PASS  node-gemini               install → typecheck → build → smoke
PASS  node-race                 install → typecheck → build → test:race → smoke
PASS  node-race-gemini          install → typecheck → build → test:race → smoke
PASS  node-payments             install → typecheck → build → smoke
PASS  node-payments-spending    install → typecheck → build → test:spending → smoke
PASS  node-full                 install → typecheck → build → test:spending → test:paysh → test:race → smoke
PASS  python-base               venv → install → compile → typecheck → test → cli → smoke
PASS  python-gemini             venv → install → compile → typecheck → test → cli → smoke
PASS  python-race               venv → install → compile → typecheck → test → cli → smoke
PASS  python-race-gemini        venv → install → compile → typecheck → test → cli → smoke
PASS  python-payments           venv → install → compile → typecheck → test → cli → smoke
PASS  python-payments-spending  venv → install → compile → typecheck → test → cli → smoke
PASS  python-full               venv → install → compile → typecheck → test → cli → smoke
PASS  expo-base                 install → sdk-versions → typecheck → build → no-secrets
PASS  expo-gemini               install → sdk-versions → typecheck → build → no-secrets → companion:install → companion:typecheck → companion:build → companion:smoke
PASS  expo-race                 install → sdk-versions → typecheck → build → no-secrets → companion:install → companion:typecheck → companion:build → companion:test:race → companion:smoke
PASS  expo-race-gemini          install → sdk-versions → typecheck → build → no-secrets → companion:install → companion:typecheck → companion:build → companion:test:race → companion:smoke
PASS  expo-payments             install → sdk-versions → typecheck → build → no-secrets → companion:install → companion:typecheck → companion:build → companion:smoke
PASS  expo-payments-spending    install → sdk-versions → typecheck → build → no-secrets → companion:install → companion:typecheck → companion:build → companion:test:spending → companion:smoke
PASS  expo-full                 install → sdk-versions → typecheck → build → no-secrets → companion:install → companion:typecheck → companion:build → companion:test:spending → companion:test:paysh → companion:test:race → companion:smoke
PASS  expo-full-wallet          install → sdk-versions → typecheck → build → no-secrets → companion:install → companion:typecheck → companion:build → companion:test:spending → companion:test:paysh → companion:test:race → companion:smoke
```

The expo `build` step is `expo export --platform android` (29 files: one Hermes bundle, about 2.7 MB, plus expo-router's assets). The companion's `test:spending` is the same 8/8 as N2, and its smoke test is N1 (17 checks across the four companion combinations).

## Not tested (needs things we don't have here)

- **A real Gemini call.** No `GEMINI_API_KEY` was used, so only the missing-key path was exercised. The SDK call (`ai.models.generateContent({ model, contents })` → `response.text`) follows the `@google/genai@2.28.0` README.
- **A settled devnet payment.** That needs devnet USDC from https://faucet.circle.com for the buyer *and* the seller address (to create its token account). The faucet is a web form with bot protection, so it wasn't automated. Everything up to the facilitator's verify step was exercised (test 5). The settle path, the `PAYMENT-RESPONSE` receipt and the budget commit on success are covered only by the offline integration test (test 2).
- **`npm run wallets`** against *funded* wallets. It was run live against devnet RPC with the two unfunded generated wallets: it correctly reported "no devnet USDC account yet" for both, and derived the same buyer address that `keygen` printed.
- `npm run dev` (Turbopack dev mode). Only `next build` + `next start` were run.
- Windows/Linux, Node 20 (CI runs `full` on Node 20 for both frameworks), deployment to Vercel or any Node host.
- Node: the same gaps as Next (no real Gemini call, no settled payment, no funded `npm run wallets`). The Express settle path (`PAYMENT-RESPONSE` header after a < 400 handler) was read from the `@x402/express` source, not exercised.
- Python: the same gaps (no real Gemini call, no settled payment, no funded `wallets`). The FastAPI settle path was read from the x402 source, and exercised only offline via the client tests. Windows (`.venv\Scripts`) was not tested.
- Expo on a physical phone (the emulator run is E6–E8). Originally no Android SDK or emulator was used: the app was type-checked and bundled (`expo export`), not run. Expo Go for SDK 57 should load it; the screens' HTTP calls to the companion were not exercised from a phone. `lib/companion.ts`'s address logic (`EXPO_PUBLIC_COMPANION_URL` → Expo's `hostUri` → `10.0.2.2`) was read from the `expo-constants` types, not tested on a device.
- Expo: an installable build (EAS Build / `expo run:android`), iOS, and web (no `react-native-web`; the template is Android-first).
- Wallet Connection with more than one real wallet app. One real browser wallet settled a payment (W5) with no extra instructions added; other wallets may add their own instructions (e.g. transaction guards), which an x402 facilitator may reject. Worth a manual test with each of Phantom, Solflare and Backpack.
- A settled Expo wallet payment from a real wallet app (E11 reached the facilitator with fakewallet). Pay.sh: see PS4.

## Known limitations (by design for a starter)

- The spending total lives in memory per process: it resets on restart, and serverless instances don't share it. Persist it for anything long-running.
- `/api/buy` has no authentication. Anyone who can reach the app can make its agent spend devnet test money, up to the budget. Same for the node service's `POST /api/buy`.
- Node `paidRoute("GET /path", …)` must be given the same method and path it is mounted on. `@x402/express` only charges requests matching that string and lets everything else through, so `paidRoute` answers 500 on a mismatch instead of serving the endpoint for free (tested by mounting it on the wrong path). Express-style `:param` segments work in both. `HEAD` requests to a paid `GET` route are not charged; Express sends headers only, no body.
- Only devnet USDC is priced. Other tokens are refused.
- Python: the x402 Solana client does its RPC lookups synchronously, so a purchase briefly blocks the agent's event loop (and the FastAPI service when `POST /api/buy` runs). Fine for a starter; move purchases to a worker for anything busy. The service binds to `127.0.0.1` by default because `POST /api/buy` has no authentication.
- Expo: the app talks to the companion over plain `http://` in development (Expo Go allows it). Android release builds need `https://`, so the companion must be deployed behind TLS and `EXPO_PUBLIC_COMPANION_URL` set before building. The companion's endpoints have no authentication (see `/api/buy` above); a phone on the same Wi-Fi can reach it.
- Expo: without the Wallet Connection module, the companion's agent pays with its devnet key. With it, people pay from their own wallet app (Android only: Mobile Wallet Adapter doesn't exist on iOS), which needs a development build instead of Expo Go.
