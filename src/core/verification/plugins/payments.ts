import { z } from "zod";
import { check, type CheckResult, type VerifierPlugin } from "../plugin";
import { describeCall, okResponse } from "./shared";

/**
 * Optional: programmable payments on Solana devnet. The app must make a real devnet USDC
 * transfer to the organiser's address, with the attempt nonce in a memo, and return the
 * signature. The verifier reads the transaction from devnet RPC itself: an invented signature,
 * a simulation, a mainnet transfer or a replayed transaction never passes.
 */
const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const MEMO_PROGRAMS = ["MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo"];

const paymentConfig = z.object({
  payTo: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "A Solana address"),
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
  defaultConfig: { payTo: "11111111111111111111111111111111", minAmountUsdc: 0.01, rpcUrl: "https://api.devnet.solana.com", timeoutMs: 60000 },
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
    const rpc = await fetch(config.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }] }),
    }).then((r) => r.json() as Promise<{ result?: { meta?: { err: unknown; preTokenBalances?: TokenBal[]; postTokenBalances?: TokenBal[] }; blockTime?: number; transaction?: { message?: { instructions?: ParsedIx[] } } } }>);
    const tx = rpc.result;
    ctx.evidence("transaction", { signature, memo, found: !!tx });
    if (!tx) {
      checks.push(check("settled", "Transaction is settled on devnet", false, "No confirmed devnet transaction with that signature.", undefined, 3));
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

interface TokenBal { owner?: string; mint: string; uiTokenAmount: { uiAmount: number | null } }

function tokenDelta(pre: TokenBal[], post: TokenBal[], owner: string, mint: string): number {
  const sum = (list: TokenBal[]) => list.filter((b) => b.owner === owner && b.mint === mint).reduce((a, b) => a + (b.uiTokenAmount.uiAmount ?? 0), 0);
  return Math.round((sum(post) - sum(pre)) * 1e6) / 1e6;
}
