import { createHash } from "node:crypto";
import { address, getAddressDecoder, getProgramDerivedAddress, getUtf8Encoder, type Address } from "@solana/kit";
import { z } from "zod";
import { check, InfrastructureError, type CheckResult, type TeamRecord, type VerifierPlugin } from "../plugin";

/**
 * The on-chain challenges (Operation, Minesweeper), checked by reading Solana devnet only.
 * Nothing is asked of the team's app. Each team solves its own puzzle with its registered
 * wallet; only transactions that wallet signed count. Feedback says what's missing without
 * revealing expected values; those go to organiser-only evidence. RPC trouble is ours, never the
 * team's fail.
 */

const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "That isn't a Solana address.").refine((a) => !/^1+$/.test(a), "Enter the real address from the challenge setup, not a placeholder.");
const DEFAULT_RPC = "https://api.devnet.solana.com";

const bureauConfig = z.object({
  challenge: z.enum(["operation", "minesweeper"]),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  programId: base58,
  credMint: base58,
  presentationAccount: base58.optional(),
  codeWindowSlots: z.number().int().min(1).max(1_000_000).default(4500),
  fastSlots: z.number().int().min(1).max(1_000_000).default(150),
  rpcUrl: z.url().default(DEFAULT_RPC),
  timeoutMs: z.number().int().min(5000).max(120000).default(60000),
}).refine((c) => c.challenge !== "minesweeper" || c.tier === 1 || !!c.presentationAccount, { message: "Minesweeper tiers 2 and 3 need the presentation account.", path: ["presentationAccount"] });

type BureauConfig = z.infer<typeof bureauConfig>;

const rpcUrlFor = (configured: string) => (configured === DEFAULT_RPC && process.env.SOLANA_DEVNET_RPC_URL ? process.env.SOLANA_DEVNET_RPC_URL : configured);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** JSON-RPC with backoff; persistent failure is an InfrastructureError (the attempt is retried). */
export async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  let last = "";
  for (let i = 1; i <= 5; i++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(10_000) });
      if (res.status === 429 || res.status >= 500) throw new Error(`devnet RPC returned ${res.status}`);
      const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
      if (body.error) throw new Error(`devnet RPC error ${body.error.code}: ${body.error.message}`);
      return body.result as T;
    } catch (err) {
      last = (err as Error).message;
      await sleep(BACKOFF.ms * i);
    }
  }
  throw new InfrastructureError(`Could not read devnet: ${last}`);
}
export const BACKOFF = { ms: 1500 };

async function pda(programId: string, seeds: string[]): Promise<Address> {
  const utf8 = getUtf8Encoder();
  const [p] = await getProgramDerivedAddress({ programAddress: address(programId), seeds: seeds.map((s) => utf8.encode(s)) });
  return p;
}

async function accountBytes(url: string, account: string): Promise<Buffer | null> {
  const r = await rpc<{ value: { data: [string, string] } | null }>(url, "getAccountInfo", [account, { encoding: "base64", commitment: "confirmed" }]);
  return r?.value ? Buffer.from(r.value.data[0], "base64") : null;
}

interface ParsedTx {
  slot: number;
  meta: { err: unknown; preTokenBalances?: TokenBal[]; postTokenBalances?: TokenBal[] } | null;
  transaction: { message: { accountKeys: { pubkey: string; signer: boolean }[]; instructions: { program?: string; programId?: string; parsed?: unknown }[] } };
}
interface TokenBal { accountIndex: number; mint: string; uiTokenAmount: { amount: string } }

const MEMO_PROGRAMS = ["MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo"];

/** The latest successful transactions touching `account`, newest first (bounded). */
async function recentTransactions(url: string, account: string, limit: number): Promise<ParsedTx[]> {
  const sigs = await rpc<{ signature: string; err: unknown }[]>(url, "getSignaturesForAddress", [account, { limit, commitment: "confirmed" }]);
  const out: ParsedTx[] = [];
  for (const s of (sigs ?? []).filter((x) => x.err === null)) {
    const tx = await rpc<ParsedTx | null>(url, "getTransaction", [s.signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }]);
    if (tx && tx.meta?.err === null) out.push(tx);
  }
  return out;
}

const signedBy = (tx: ParsedTx, wallet: string) => tx.transaction.message.accountKeys.some((k) => k.pubkey === wallet && k.signer);
const memos = (tx: ParsedTx) => tx.transaction.message.instructions.filter((i) => i.program === "spl-memo" || MEMO_PROGRAMS.includes(i.programId ?? "")).map((i) => String(i.parsed ?? ""));

/** Base units of `mint` that `account` received in this transaction. */
function received(tx: ParsedTx, account: string, mint: string): bigint {
  const idx = tx.transaction.message.accountKeys.findIndex((k) => k.pubkey === account);
  if (idx < 0) return BigInt(0);
  const amt = (list: TokenBal[] | undefined) => BigInt(list?.find((b) => b.accountIndex === idx && b.mint === mint)?.uiTokenAmount.amount ?? "0");
  return amt(tx.meta?.postTokenBalances) - amt(tx.meta?.preTokenBalances);
}

/** Operation's expected memo: sha256(challenge id ‖ nonce as 8 little-endian bytes), first 16 hex. */
export function operationMemo(challengeId: string, nonce: bigint): string {
  const n = Buffer.alloc(8);
  n.writeBigUInt64LE(nonce);
  return createHash("sha256").update(Buffer.concat([Buffer.from(challengeId, "utf8"), n])).digest("hex").slice(0, 16);
}

export function decodeClaim(data: Buffer): { nonce: bigint; clearanceAta: string } | null {
  if (data.length < 81) return null;
  return { nonce: data.readBigUInt64LE(41), clearanceAta: getAddressDecoder().decode(data.subarray(49, 81)) };
}

/** The "deed" record: operative (borsh string), clearance_code [u8; 8], issued_slot u64, presented bool. */
export function decodeDeed(data: Buffer): { operative: string; code: string; issuedSlot: bigint } | null {
  if (data.length < 8 + 4) return null;
  const len = data.readUInt32LE(8);
  const start = 12;
  if (len > 64 || data.length < start + len + 8 + 8) return null;
  return {
    operative: data.subarray(start, start + len).toString("utf8"),
    code: data.subarray(start + len, start + len + 8).toString("utf8"),
    issuedSlot: data.readBigUInt64LE(start + len + 8),
  };
}

function identityChecks(team: TeamRecord | null): CheckResult[] | null {
  if (!team) return [check("team", "Belongs to a team", false, "Only teams can take on the challenges.")];
  if (!team.wallet) return [check("wallet", "Team wallet registered", false, "Register your team's devnet wallet on your team page first.")];
  return null;
}

async function runOperation(ctx: Parameters<VerifierPlugin<BureauConfig>["run"]>[0], c: BureauConfig, team: TeamRecord): Promise<CheckResult[]> {
  const url = rpcUrlFor(c.rpcUrl);
  const id = team.challengeId;
  const recordPda = await pda(c.programId, ["claim", id.toLowerCase()]);
  const bytes = await accountBytes(url, recordPda);
  const claim = bytes ? decodeClaim(bytes) : null;
  if (!claim) return [check("setup", "Your team is set up on chain", false, "Your team isn't set up on chain yet: ask an organiser.")];
  const fee = BigInt(1000) + (claim.nonce % BigInt(9000));
  const memo = operationMemo(id, claim.nonce);
  const txs = (await recentTransactions(url, claim.clearanceAta, 40)).filter((t) => signedBy(t, team.wallet!));
  const paid = txs.filter((t) => received(t, claim.clearanceAta, c.credMint) > BigInt(0));
  const exact = paid.filter((t) => received(t, claim.clearanceAta, c.credMint) === fee);
  const withMemo = exact.filter((t) => memos(t).includes(memo));
  ctx.evidence("operation", { challengeId: id, recordPda, clearanceAta: claim.clearanceAta, nonce: claim.nonce.toString(), expectedFee: fee.toString(), expectedMemo: memo, transfersFromWallet: paid.length, amounts: paid.map((t) => received(t, claim.clearanceAta, c.credMint).toString()), memos: paid.flatMap(memos) });
  const checks = [check("found", "CRED from your wallet reached your clearance account", paid.length > 0, paid.length ? "Found your transfer." : "No CRED transfer signed by your registered wallet has reached your clearance account yet. Check you decoded the right account.", undefined, 1)];
  if (c.tier >= 2) checks.push(check("exact", "Pays the exact clearance fee", exact.length > 0, exact.length ? "Exact fee received." : "A transfer arrived, but not for the exact clearance fee. Check how you read the nonce.", undefined, 2));
  if (c.tier >= 3) checks.push(check("memo", "The exact fee and the right memo in one transaction", withMemo.length > 0, withMemo.length ? "Verified." : "No single transaction has both the exact fee and the right memo. Check the memo and that both are in the same transaction.", undefined, 3));
  return checks;
}

async function runMinesweeper(ctx: Parameters<VerifierPlugin<BureauConfig>["run"]>[0], c: BureauConfig, team: TeamRecord): Promise<CheckResult[]> {
  const url = rpcUrlFor(c.rpcUrl);
  const id = team.challengeId;
  const holdings = await accountBytes(url, await pda(c.programId, ["holdings", id]));
  if (!holdings) return [check("setup", "Your team is set up on chain", false, "Your team isn't set up on chain yet: ask an organiser.")];
  const deedPda = await pda(c.programId, ["deed", id]);
  const bytes = await accountBytes(url, deedPda);
  const deed = bytes ? decodeDeed(bytes) : null;
  const minted = !!deed && deed.operative === id;
  ctx.evidence("minesweeper", { challengeId: id, deedPda, deed: deed ? { operative: deed.operative, code: deed.code, issuedSlot: deed.issuedSlot.toString() } : null });
  const checks = [check("minted", "A clearance code was minted for your team", minted, minted ? "Code minted." : "No clearance code has been minted for your team yet.", undefined, 1)];
  if (c.tier === 1 || !minted) {
    if (c.tier >= 2) checks.push(check("presented", "Code presented in time", false, "Mint a code first.", undefined, 2));
    return checks;
  }
  const expected = `${id}:${deed!.code}`;
  const presentation = c.presentationAccount!;
  const txs = (await recentTransactions(url, team.wallet!, 40)).filter((t) => received(t, presentation, c.credMint) > BigInt(0) && memos(t).includes(expected));
  const lag = (t: ParsedTx) => BigInt(t.slot) - deed!.issuedSlot;
  const inTime = txs.filter((t) => lag(t) >= BigInt(0) && lag(t) <= BigInt(c.codeWindowSlots));
  const fast = inTime.filter((t) => lag(t) <= BigInt(c.fastSlots));
  ctx.evidence("presentations", { expectedMemo: expected, matching: txs.map((t) => ({ slot: t.slot, slotsAfterMint: lag(t).toString() })) });
  checks.push(check("presented", "Code presented in time", inTime.length > 0, inTime.length ? "Crossing confirmed." : txs.length ? "Your presentation was outside the code's window. Mint a fresh code and present it sooner." : "No presentation of your current code, from your wallet, has reached the presentation account.", undefined, 2));
  if (c.tier >= 3) checks.push(check("fast", "Presented within about a minute of minting", fast.length > 0, fast.length ? "Fast hands." : "Presented, but not fast enough. Script mint, read and present together.", undefined, 3));
  return checks;
}

export const bureauPlugin: VerifierPlugin<BureauConfig> = {
  id: "bureau.chain",
  name: "On-chain challenge",
  category: "payments",
  description: "Reads Solana devnet to check the team's own on-chain puzzle (Operation or Minesweeper) at one tier. Only transactions signed by the team's registered wallet count. Never calls the team's app.",
  participantHint: "Solve it on Solana devnet with your team's registered wallet, then press Run verification.",
  configSchema: bureauConfig,
  defaultConfig: { challenge: "operation", tier: 1, programId: "", credMint: "", codeWindowSlots: 4500, fastSlots: 150, rpcUrl: DEFAULT_RPC, timeoutMs: 60000 } as unknown as BureauConfig,
  async run(ctx, config) {
    const team = await ctx.team();
    const blocked = identityChecks(team);
    if (blocked) return { checks: blocked };
    const checks = config.challenge === "operation" ? await runOperation(ctx, config, team!) : await runMinesweeper(ctx, config, team!);
    return { checks };
  },
};
