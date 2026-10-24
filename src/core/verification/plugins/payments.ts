import { z } from "zod";
import { check, InfrastructureError, type CheckResult, type VerifierPlugin } from "../plugin";
import { describeCall, okResponse } from "./shared";

/**
 * Optional: programmable payments on Solana devnet. The app must make a real devnet USDC
 * transfer to the organiser's address, with the attempt nonce in a memo, and return the
 * signature. The verifier reads the transaction from devnet RPC itself: an invented signature,
 * a simulation, a mainnet transfer or a replayed transaction never passes.
 */
const DEFAULT_RPC = "https://api.devnet.solana.com";
const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const MEMO_PROGRAMS = ["MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo"];

const paymentConfig = z.object({
  payTo: z
    .string({ error: "Enter your devnet receiving address (a Solana address)." })
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "That isn't a Solana address.")
    .refine((a) => !/^1+$/.test(a), "Enter your own devnet receiving address: 111… is a placeholder, not a wallet."),
  minAmountUsdc: z.number().min(0.000001).max(1000).default(0.01),
  rpcUrl: z.url().default("https://api.devnet.solana.com"),
  timeoutMs: z.number().int().min(5000).max(120000).default(60000),
});

interface ParsedIx { program?: string; programId?: string; parsed?: unknown }

export const paymentPlugin: VerifierPlugin<z.infer<typeof paymentConfig>> = {
  id: "payments.devnet_settlement",
  name: "Devnet payment settlement",
  category: "payments",
  description: "Asks the app to pay the organiser's address in devnet USDC with the attempt nonce as a memo, then confirms the settled transaction on devnet itself.",
  participantHint: "For a `run_workflow` task asking for a payment, send devnet USDC to the given address with the memo text given, and return { signature } in output.data.",
  configSchema: paymentConfig,
  defaultConfig: { payTo: "11111111111111111111111111111111", minAmountUsdc: 0.01, rpcUrl: DEFAULT_RPC, timeoutMs: 60000 },
  async run(ctx, config) {
    const memo = ctx.rng.id("agent-studio");
    const call = await ctx.callApp(
      { type: "run_workflow", input: `Pay ${config.minAmountUsdc} devnet USDC to ${config.payTo} with the memo "${memo}". Return { "signature": "<transaction signature>" } in output.data.`, limits: { maxSpendUsd: config.minAmountUsdc } },
      { timeoutMs: config.timeoutMs },
    );
    const res = okResponse(call);
    const signature = (res?.output.data as { signature?: unknown } | undefined)?.signature;
    const checks: CheckResult[] = [];
    if (!res || typeof signature !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(signature)) {
      checks.push(check("signature", "Returns a transaction signature", false, res ? "output.data.signature is missing or not a Solana signature." : describeCall(call), undefined, 1));
      return { checks };
    }
    checks.push(check("signature", "Returns a transaction signature", true, "Signature returned.", undefined, 1));
    const tx = await fetchSettledTransaction(rpcUrlFor(config.rpcUrl), signature, config.timeoutMs);
    ctx.evidence("transaction", { signature, memo, found: !!tx });
    if (!tx) {
      checks.push(check("settled", "Transaction is settled on devnet", false, `No confirmed devnet transaction with that signature after ${Math.round(Math.min(RPC_TIMING.settleMs, config.timeoutMs) / 1000)} seconds. Check it was sent to devnet (not mainnet or a local validator).`, undefined, 3));
      return { checks };
    }
    const succeeded = tx.meta?.err === null;
    const received = tokenDelta(tx.meta?.preTokenBalances ?? [], tx.meta?.postTokenBalances ?? [], config.payTo, USDC_DEVNET);
    const memoOk = (tx.transaction?.message?.instructions ?? []).some((ix) => (MEMO_PROGRAMS.includes(ix.programId ?? "") || ix.program === "spl-memo") && String(ix.parsed ?? "").includes(memo));
    checks.push(check("settled", "Transaction is settled on devnet", succeeded, succeeded ? "Confirmed on devnet." : "The transaction failed on chain.", undefined, 2));
    checks.push(check("amount", `Pays at least ${config.minAmountUsdc} devnet USDC to the organiser`, received >= config.minAmountUsdc - 1e-9, `The organiser's address received ${received} devnet USDC in this transaction.`, undefined, 2));
    checks.push(check("memo", "Carries this attempt's memo (prevents replay)", memoOk, memoOk ? "Memo matched this attempt." : "The memo for this attempt was not found in the transaction.", undefined, 2));
    return { checks };
  },
};

/** The public devnet RPC is heavily rate-limited; an operator can point the default at their own. */
function rpcUrlFor(configured: string): string {
  return configured === DEFAULT_RPC && process.env.SOLANA_DEVNET_RPC_URL ? process.env.SOLANA_DEVNET_RPC_URL : configured;
}

export const RPC_TIMING = { pollMs: 2000, settleMs: 30_000, backoffMs: 1500 };

interface DevnetTx {
  meta?: { err: unknown; preTokenBalances?: TokenBal[]; postTokenBalances?: TokenBal[] };
  blockTime?: number;
  transaction?: { message?: { instructions?: ParsedIx[] } };
}

/**
 * Looks the transaction up until it's confirmed. Apps often return the signature as soon as they
 * send, before devnet confirms it, so a single lookup would fail correct payments. Returns null
 * if no such transaction appears within the settle window (the team's problem). If the RPC itself
 * keeps failing (rate limits, outages) it throws InfrastructureError: the attempt is retried and
 * never recorded as the team's failure.
 */
export async function fetchSettledTransaction(rpcUrl: string, signature: string, timeoutMs: number): Promise<DevnetTx | null> {
  const settleBy = Date.now() + Math.min(RPC_TIMING.settleMs, timeoutMs);
  let rpcFailures = 0;
  let lastProblem = "";
  for (;;) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }] }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`devnet RPC returned ${res.status}`);
      const body = (await res.json()) as { result?: DevnetTx | null; error?: { code: number; message: string } };
      if (body.error) {
        // -32602: malformed signature (the app's fault, nothing to wait for). Others are RPC trouble.
        if (body.error.code === -32602) return null;
        throw new Error(`devnet RPC error ${body.error.code}: ${body.error.message}`);
      }
      if (body.result) return body.result;
      rpcFailures = 0;
      if (Date.now() >= settleBy) return null;
      await sleep(RPC_TIMING.pollMs);
    } catch (err) {
      rpcFailures += 1;
      lastProblem = (err as Error).message;
      if (rpcFailures >= 5) throw new InfrastructureError(`Could not read devnet: ${lastProblem}`);
      await sleep(RPC_TIMING.backoffMs * rpcFailures);
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface TokenBal { owner?: string; mint: string; uiTokenAmount: { uiAmount: number | null } }

function tokenDelta(pre: TokenBal[], post: TokenBal[], owner: string, mint: string): number {
  const sum = (list: TokenBal[]) => list.filter((b) => b.owner === owner && b.mint === mint).reduce((a, b) => a + (b.uiTokenAmount.uiAmount ?? 0), 0);
  return Math.round((sum(post) - sum(pre)) * 1e6) / 1e6;
}
