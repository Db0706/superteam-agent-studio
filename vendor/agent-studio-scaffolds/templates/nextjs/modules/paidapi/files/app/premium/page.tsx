"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Json = Record<string, unknown>;

export default function PremiumPage() {
  const [output, setOutput] = useState<Json | null>(null);
  const [spending, setSpending] = useState<Json | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/buy")
      .then((r) => r.json())
      .then((d: Json) => setSpending((d.spending as Json) ?? d))
      .catch(() => {});
  }, []);

  // Step 1: call the paid API without paying, to see the 402 + PAYMENT-REQUIRED header.
  async function tryWithoutPaying() {
    setLoading(true);
    try {
      const res = await fetch("/api/premium");
      const header = res.headers.get("PAYMENT-REQUIRED");
      setOutput({
        status: res.status,
        paymentRequired: header ? (JSON.parse(atob(header)) as Json) : null,
        body: await res.json().catch(() => null),
      });
    } finally {
      setLoading(false);
    }
  }

  // Step 2: ask our server-side agent to pay for it (its devnet key never leaves the server).
  async function buyAsAgent() {
    setLoading(true);
    try {
      const res = await fetch("/api/buy", { method: "POST" });
      const data = (await res.json()) as Json;
      setOutput(data);
      if (data.spending) setSpending(data.spending as Json);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <p><Link href="/">← Home</Link></p>
      <h1>Paid API</h1>
      <p className="muted">
        <code>/api/premium</code> costs a few cents of <strong>devnet test USDC</strong> per call (no real money).
      </p>
      {spending && (
        <p>
          Agent budget: spent ${String(spending.spentUsd)} of ${String(spending.budgetUsd)} · max $
          {String(spending.maxPaymentUsd)} per payment
        </p>
      )}
      <button onClick={tryWithoutPaying} disabled={loading}>1. Call without paying</button>{" "}
      <button onClick={buyAsAgent} disabled={loading}>2. Let the agent pay</button>
      {output && <pre>{JSON.stringify(output, null, 2)}</pre>}
    </>
  );
}
