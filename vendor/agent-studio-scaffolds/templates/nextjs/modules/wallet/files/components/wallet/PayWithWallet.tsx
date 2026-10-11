"use client";

import { useWalletAccountTransactionSigner } from "@solana/react";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import type { UiWalletAccount } from "@wallet-standard/react";
import { useState } from "react";
import { WALLET_CHAIN } from "./WalletProvider";

// x402 CAIP-2 id for Solana devnet: the same network the paid API charges on.
const X402_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
// Refuse any single payment above this, whatever the server asks for.
const MAX_PAYMENT = "$0.10";

/** Buys /api/premium with the connected wallet. The wallet asks the visitor to approve each payment. */
export function PayWithWallet({ account }: { account: UiWalletAccount }) {
  // The official hook turns the connected wallet into a @solana/kit signer, which x402 accepts as is.
  const signer = useWalletAccountTransactionSigner(account, WALLET_CHAIN);
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    setResult(null);
    try {
      const client = new x402Client()
        .register(X402_DEVNET, new ExactSvmScheme(signer, { rpcUrl: RPC_URL }))
        .setSpendControls({ maxAmountPerPayment: MAX_PAYMENT });
      const payingFetch = wrapFetchWithPayment(fetch, client);
      const res = await payingFetch("/api/premium");
      const receipt = res.headers.get("PAYMENT-RESPONSE");
      setResult({
        status: res.status,
        ...(res.status === 402 ? { error: paymentError(res) } : {}),
        receipt: receipt ? decodePaymentResponseHeader(receipt) : null,
        body: await res.json().catch(() => null),
      });
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={pay} disabled={busy}>
        {busy ? "Waiting for your wallet…" : "Buy premium data with my wallet"}
      </button>
      <p className="muted">Max {MAX_PAYMENT} per payment · devnet test USDC only</p>
      {result !== null && <pre>{JSON.stringify(result, null, 2)}</pre>}
    </>
  );
}

/** Why the server still answered 402 after the wallet signed (e.g. the wallet has no devnet USDC yet). */
function paymentError(res: Response): string {
  const header = res.headers.get("PAYMENT-REQUIRED");
  if (!header) return "Payment required";
  try {
    const reason = decodePaymentRequiredHeader(header).error ?? "Payment required";
    return /insufficient|simulation_failed/.test(reason)
      ? `${reason} (usually the wallet has no devnet USDC yet: get some at https://faucet.circle.com)`
      : reason;
  } catch {
    return "Payment required (could not decode PAYMENT-REQUIRED header)";
  }
}
