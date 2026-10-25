import { address, getAddressEncoder, getProgramDerivedAddress, getUtf8Encoder } from "@solana/kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InfrastructureError, type TeamRecord, type VerifierContext } from "@/core/verification/plugin";
import { BACKOFF, bureauPlugin, decodeDeed, operationMemo } from "@/core/verification/plugins/bureau";

const programId = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const CRED = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const WALLET = "5Q6zKtHe73hqszUauQutYWV3AkznYhUHG27PUTgpdr6s";
const OTHER = "B3aSCgNhYqukoMrhsUa6tWctG8rhqMJBqC6mKAbE2eV8";
const CLEARANCE = "7sykmFQgVwz9PqYSk1E24D1pDGpbFTpibyzXPtN9mfYY";
const PRESENT = "G5Tu25otWo8kTaSACmTvx68YMoj6e6stn2ad7TM19VvZ";
const ID = "T-3f9a21c8";
const NONCE = BigInt(123456789);
const FEE = (BigInt(1000) + (NONCE % BigInt(9000))).toString();

const pda = async (seeds: string[]) => (await getProgramDerivedAddress({ programAddress: address(programId), seeds: seeds.map((s) => getUtf8Encoder().encode(s)) }))[0];
const team = (over: Partial<TeamRecord> = {}): TeamRecord => ({ id: "3f9a21c8-0000-0000-0000-000000000000", name: "Team", challengeId: ID, wallet: WALLET, submissions: [], ...over });
const ctx = (t: TeamRecord | null = team()): VerifierContext => ({ team: async () => t, evidence: () => {} }) as unknown as VerifierContext;
const op = (tier: 1 | 2 | 3) => ({ challenge: "operation" as const, tier, programId, credMint: CRED, codeWindowSlots: 4500, fastSlots: 150, rpcUrl: "https://rpc.test", timeoutMs: 60000 });
const ms = (tier: 1 | 2 | 3) => ({ ...op(tier), challenge: "minesweeper" as const, presentationAccount: PRESENT });

function claimBytes(): Buffer {
  const b = Buffer.alloc(81);
  b.writeBigUInt64LE(NONCE, 41);
  Buffer.from(getAddressEncoder().encode(address(CLEARANCE))).copy(b, 49);
  return b;
}
function deedBytes(code: string, issuedSlot: number, operative = ID): Buffer {
  const op = Buffer.from(operative, "utf8");
  const b = Buffer.alloc(8 + 4 + op.length + 8 + 8 + 1);
  b.writeUInt32LE(op.length, 8);
  op.copy(b, 12);
  Buffer.from(code, "utf8").copy(b, 12 + op.length);
  b.writeBigUInt64LE(BigInt(issuedSlot), 12 + op.length + 8);
  return b;
}
function tx(opts: { to: string; amount: string; memo?: string; signer?: string; slot?: number }) {
  return {
    slot: opts.slot ?? 1000,
    meta: { err: null, preTokenBalances: [{ accountIndex: 1, mint: CRED, uiTokenAmount: { amount: "0" } }], postTokenBalances: [{ accountIndex: 1, mint: CRED, uiTokenAmount: { amount: opts.amount } }] },
    transaction: { message: { accountKeys: [{ pubkey: opts.signer ?? WALLET, signer: true }, { pubkey: opts.to, signer: false }], instructions: opts.memo ? [{ program: "spl-memo", programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", parsed: opts.memo }] : [] } },
  };
}

/** A tiny devnet: accounts by address, and transactions listed under the addresses they touch. */
function devnet(accounts: Record<string, Buffer>, txs: ReturnType<typeof tx>[], fail = false) {
  vi.stubGlobal("fetch", vi.fn(async (_: string, init: { body: string }) => {
    if (fail) return new Response("down", { status: 503 });
    const { method, params } = JSON.parse(init.body);
    if (method === "getAccountInfo") return Response.json({ result: { value: accounts[params[0]] ? { data: [accounts[params[0]].toString("base64"), "base64"] } : null } });
    if (method === "getSignaturesForAddress") return Response.json({ result: txs.map((t, i) => ({ sig: `sig${i}`, t })).filter(({ t }) => t.transaction.message.accountKeys.some((k) => k.pubkey === params[0])).map(({ sig }) => ({ signature: sig, err: null })) });
    if (method === "getTransaction") return Response.json({ result: txs[Number(String(params[0]).slice(3))] });
    return Response.json({ error: { code: -1, message: "unknown" } });
  }));
}
const passed = (out: { checks: { id: string; passed: boolean }[] }) => out.checks.every((c) => c.passed);

describe("bureau.chain verifier", () => {
  beforeEach(() => void (BACKOFF.ms = 1));
  afterEach(() => vi.unstubAllGlobals());

  it("needs a team, a registered wallet, and the team's records on chain", async () => {
    devnet({}, []);
    expect((await bureauPlugin.run(ctx(null), op(1))).checks[0].id).toBe("team");
    expect((await bureauPlugin.run(ctx(team({ wallet: null })), op(1))).checks[0].message).toMatch(/Register your team's devnet wallet/);
    expect((await bureauPlugin.run(ctx(), op(1))).checks[0].message).toMatch(/isn't set up on chain yet/);
  });

  it("Operation: tier 1 any transfer, tier 2 the exact fee, tier 3 fee and memo in one transaction", async () => {
    const claim = { [await pda(["claim", ID.toLowerCase()])]: claimBytes() };
    devnet(claim, [tx({ to: CLEARANCE, amount: "5" })]);
    expect(passed(await bureauPlugin.run(ctx(), op(1)))).toBe(true);
    expect(passed(await bureauPlugin.run(ctx(), op(2)))).toBe(false);
    devnet(claim, [tx({ to: CLEARANCE, amount: FEE })]);
    expect(passed(await bureauPlugin.run(ctx(), op(2)))).toBe(true);
    expect(passed(await bureauPlugin.run(ctx(), op(3)))).toBe(false);
    // Fee and memo split across two transactions don't count.
    devnet(claim, [tx({ to: CLEARANCE, amount: FEE }), tx({ to: CLEARANCE, amount: "1", memo: operationMemo(ID, NONCE) })]);
    expect(passed(await bureauPlugin.run(ctx(), op(3)))).toBe(false);
    devnet(claim, [tx({ to: CLEARANCE, amount: FEE, memo: operationMemo(ID, NONCE) })]);
    expect(passed(await bureauPlugin.run(ctx(), op(3)))).toBe(true);
  });

  it("Operation: only transactions signed by the team's own wallet count", async () => {
    devnet({ [await pda(["claim", ID.toLowerCase()])]: claimBytes() }, [tx({ to: CLEARANCE, amount: FEE, memo: operationMemo(ID, NONCE), signer: OTHER })]);
    expect(passed(await bureauPlugin.run(ctx(), op(1)))).toBe(false);
  });

  it("feedback never reveals the expected fee or memo", async () => {
    devnet({ [await pda(["claim", ID.toLowerCase()])]: claimBytes() }, [tx({ to: CLEARANCE, amount: "5" })]);
    const text = JSON.stringify((await bureauPlugin.run(ctx(), op(3))).checks);
    expect(text).not.toContain(FEE);
    expect(text).not.toContain(operationMemo(ID, NONCE));
  });

  it("Minesweeper: tier 1 minted, tier 2 presented in the window, tier 3 fast", async () => {
    const accounts = { [await pda(["holdings", ID])]: Buffer.alloc(41), [await pda(["deed", ID])]: deedBytes("AB12CD34", 1000) };
    devnet({ [await pda(["holdings", ID])]: Buffer.alloc(41) }, []);
    expect(passed(await bureauPlugin.run(ctx(), ms(1)))).toBe(false);
    devnet(accounts, []);
    expect(passed(await bureauPlugin.run(ctx(), ms(1)))).toBe(true);
    expect(passed(await bureauPlugin.run(ctx(), ms(2)))).toBe(false);
    devnet(accounts, [tx({ to: PRESENT, amount: "1", memo: `${ID}:AB12CD34`, slot: 3000 })]);
    expect(passed(await bureauPlugin.run(ctx(), ms(2)))).toBe(true);
    expect(passed(await bureauPlugin.run(ctx(), ms(3)))).toBe(false);
    devnet(accounts, [tx({ to: PRESENT, amount: "1", memo: `${ID}:AB12CD34`, slot: 1100 })]);
    expect(passed(await bureauPlugin.run(ctx(), ms(3)))).toBe(true);
    devnet(accounts, [tx({ to: PRESENT, amount: "1", memo: `${ID}:AB12CD34`, slot: 1000 + 4501 })]);
    expect(passed(await bureauPlugin.run(ctx(), ms(2)))).toBe(false);
    devnet(accounts, [tx({ to: PRESENT, amount: "1", memo: `${ID}:OLDCODE1`, slot: 1100 })]);
    expect(passed(await bureauPlugin.run(ctx(), ms(2)))).toBe(false);
  });

  it("decodes the deed record", () => {
    expect(decodeDeed(deedBytes("AB12CD34", 77))).toEqual({ operative: ID, code: "AB12CD34", issuedSlot: BigInt(77) });
  });

  it("an RPC outage is our problem, not the team's fail", async () => {
    devnet({}, [], true);
    await expect(bureauPlugin.run(ctx(), op(1))).rejects.toBeInstanceOf(InfrastructureError);
  });
});
