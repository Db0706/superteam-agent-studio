/**
 * Sends test SOL on Solana devnet from the organiser wallet, for students whose faucet request
 * failed. Devnet only: test money, worth nothing.
 *
 *   npx tsx scripts/devnet-sol.mts <address> [<address> …] [--sol 0.05]
 *
 * Default 0.05 SOL each (enough for thousands of transactions), at most 0.5. Uses the same
 * organiser wallet as bureau-setup (BUREAU_AUTHORITY, default ~/.config/agent-studio/devnet-e2e-payer.json).
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  isAddress,
  type Instruction,
  type KeyPairSigner,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";

const RPC = process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com";
if (/mainnet/i.test(RPC)) throw new Error("Refusing to run against mainnet: this script is for devnet test SOL only.");
const SYSTEM = address("11111111111111111111111111111111");
const rpc = createSolanaRpc(RPC);

const args = process.argv.slice(2);
const solFlag = args.indexOf("--sol");
const sol = solFlag >= 0 ? Number(args[solFlag + 1]) : 0.05;
const targets = args.filter((_, i) => solFlag < 0 || (i !== solFlag && i !== solFlag + 1));
if (!targets.length) {
  console.log("Usage: npx tsx scripts/devnet-sol.mts <address> [<address> …] [--sol 0.05]");
  process.exit(1);
}
if (!(sol > 0 && sol <= 0.5)) throw new Error("--sol must be between 0 and 0.5.");
const bad = targets.filter((t) => !isAddress(t));
if (bad.length) throw new Error(`Not a Solana address: ${bad.join(", ")}`);

const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u64 = (n: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; };
const transferSolIx = (from: KeyPairSigner, to: string, amount: bigint): Instruction => ({
  programAddress: SYSTEM,
  accounts: [{ address: from.address, role: AccountRole.WRITABLE_SIGNER, signer: from }, { address: address(to), role: AccountRole.WRITABLE }] as never,
  data: Buffer.concat([u32(2), u64(amount)]),
});
const balance = async (a: string) => Number((await rpc.getBalance(address(a)).send()).value) / 1e9;

const file = process.env.BUREAU_AUTHORITY ?? join(homedir(), ".config/agent-studio/devnet-e2e-payer.json");
const payer = await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(file, "utf8"))));
const lamports = BigInt(Math.round(sol * 1e9));

for (const to of targets) {
  try {
    const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
    const tx = await signTransactionMessageWithSigners(pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions([transferSolIx(payer, to, lamports)], m),
    ));
    const sig = getSignatureFromTransaction(tx);
    await rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64", preflightCommitment: "confirmed" }).send();
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) {
      const { value } = await rpc.getSignatureStatuses([sig]).send();
      if (value[0]?.err) throw new Error(JSON.stringify(value[0].err));
      ok = value[0]?.confirmationStatus === "confirmed" || value[0]?.confirmationStatus === "finalized";
      if (!ok) await new Promise((r) => setTimeout(r, 1000));
    }
    console.log(ok ? `✓ ${to}: sent ${sol} SOL, balance now ${(await balance(to)).toFixed(3)} SOL` : `? ${to}: sent, not confirmed yet (${sig})`);
  } catch (err) {
    console.log(`✗ ${to}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.log(`Organiser wallet has ${(await balance(payer.address)).toFixed(3)} SOL left.`);
