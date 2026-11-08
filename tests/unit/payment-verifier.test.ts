import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InfrastructureError, type VerifierContext } from "@/core/verification/plugin";
import { paymentPlugin, RPC_TIMING } from "@/core/verification/plugins/payments";

const USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const PAY_TO = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const SIG = "4j5WT85x2o92tGZPFKyUaEzV2AD2LeZP9x7TLmQmwWkQEwxbikipq4bXvNeTJxdGRPfAB654nJg7av2r3khyhC5J";
const MEMO = "agent-studio-test-memo";
const config = { payTo: PAY_TO, minAmountUsdc: 0.01, rpcUrl: "https://rpc.test", timeoutMs: 60000 };

/** Shaped like a real jsonParsed devnet USDC transfer with a memo (checked against live devnet). */
function tx(opts: { amount?: number; to?: string; memo?: string; err?: unknown } = {}) {
  const bal = (amt: number) => ({ owner: opts.to ?? PAY_TO, mint: USDC, uiTokenAmount: { uiAmount: amt } });
  return {
    blockTime: 1792792076,
    meta: { err: opts.err ?? null, preTokenBalances: [bal(5)], postTokenBalances: [bal(5 + (opts.amount ?? 0.01))] },
    transaction: { message: { instructions: [{ program: "spl-memo", programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", parsed: opts.memo ?? MEMO }] } },
  };
}

function ctx(signature: unknown = SIG): VerifierContext {
  return {
    rng: { id: () => MEMO },
    callApp: async () => ({ nonceEchoed: true, response: { protocol: "asrp/1", status: "ok", nonce: "n", output: { data: { signature } } }, raw: "" }),
    evidence: () => {},
  } as unknown as VerifierContext;
}

/** Each RPC call returns the next scripted reply; the last one repeats. */
function rpc(...replies: (object | number)[]) {
  let i = 0;
  const f = vi.fn(async () => {
    const r = replies[Math.min(i++, replies.length - 1)];
    return typeof r === "number" ? new Response("rate limited", { status: r }) : Response.json(r);
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const found = (t = tx()) => ({ jsonrpc: "2.0", id: 1, result: t });
const notYet = { jsonrpc: "2.0", id: 1, result: null };
const passed = (out: Awaited<ReturnType<typeof paymentPlugin.run>>) => Object.fromEntries(out.checks.map((c) => [c.id, c.passed]));

describe("devnet payment verifier", () => {
  beforeEach(() => Object.assign(RPC_TIMING, { pollMs: 1, settleMs: 50, backoffMs: 1 }));
  afterEach(() => vi.unstubAllGlobals());

  it("passes a settled transfer of enough USDC to the organiser with this attempt's memo", async () => {
    rpc(found());
    expect(passed(await paymentPlugin.run(ctx(), config))).toEqual({ signature: true, settled: true, amount: true, memo: true });
  });

  it("waits for a transaction that isn't confirmed yet", async () => {
    const f = rpc(notYet, notYet, found());
    expect(passed(await paymentPlugin.run(ctx(), config)).settled).toBe(true);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("rides out rate limiting", async () => {
    rpc(429, 503, found());
    expect(passed(await paymentPlugin.run(ctx(), config)).settled).toBe(true);
  });

  it("reports a persistently failing RPC as our problem, not the team's", async () => {
    rpc(429);
    await expect(paymentPlugin.run(ctx(), config)).rejects.toBeInstanceOf(InfrastructureError);
  });

  it("fails a signature that never appears on devnet, after the settle window", async () => {
    rpc(notYet);
    const out = await paymentPlugin.run(ctx(), config);
    expect(passed(out).settled).toBe(false);
    expect(out.checks.find((c) => c.id === "settled")?.message).toMatch(/devnet \(not mainnet/);
  });

  it("fails too little, the wrong recipient, a missing memo and a failed transaction", async () => {
    rpc(found(tx({ amount: 0.001 })));
    expect(passed(await paymentPlugin.run(ctx(), config)).amount).toBe(false);
    rpc(found(tx({ to: "11111111111111111111111111111112" })));
    expect(passed(await paymentPlugin.run(ctx(), config)).amount).toBe(false);
    rpc(found(tx({ memo: "someone-elses-memo" })));
    expect(passed(await paymentPlugin.run(ctx(), config)).memo).toBe(false);
    rpc(found(tx({ err: { InstructionError: [0, "Custom"] } })));
    expect(passed(await paymentPlugin.run(ctx(), config)).settled).toBe(false);
  });

  it("fails a malformed signature without calling devnet", async () => {
    const f = rpc(found());
    expect(passed(await paymentPlugin.run(ctx("not-a-signature"), config)).signature).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});
