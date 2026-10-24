import {
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  getUtf8Encoder,
  type Instruction,
  type KeyPairSigner,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstruction, getTransferCheckedInstruction, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

/**
 * Lets the reference fixture pass the on-chain payment stage in rehearsals: a real devnet USDC
 * transfer with the attempt's memo, from a throwaway devnet wallet (FIXTURE_PAYER_KEY, a JSON
 * byte array). The same transfer the starters' payUsdc makes, so a rehearsal exercises the whole
 * path: fixture app → devnet → worker → payment verifier. Devnet only; never a real wallet.
 */

const USDC_DEVNET = address("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const MEMO_PROGRAM = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export type DevnetPayer = (to: string, amountUsdc: number, memo: string) => Promise<string>;

let signer: Promise<KeyPairSigner> | null = null;

/** The configured payer, or null when FIXTURE_PAYER_KEY isn't set (the payment stage then fails). */
export function devnetPayerFromEnv(env: Record<string, string | undefined> = process.env): DevnetPayer | null {
  const raw = env.FIXTURE_PAYER_KEY?.trim();
  if (!raw) return null;
  signer ??= createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(raw) as number[]));
  const rpcUrl = env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com";
  return async (to, amountUsdc, memo) => payUsdc(await signer!, to, amountUsdc, memo, rpcUrl);
}

async function payUsdc(payer: KeyPairSigner, toAddress: string, amountUsdc: number, memo: string, rpcUrl: string): Promise<string> {
  const to = address(toAddress);
  const [source] = await findAssociatedTokenPda({ owner: payer.address, mint: USDC_DEVNET, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  const [destination] = await findAssociatedTokenPda({ owner: to, mint: USDC_DEVNET, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  const instructions: Instruction[] = [
    getCreateAssociatedTokenIdempotentInstruction({ payer, ata: destination, owner: to, mint: USDC_DEVNET }),
    getTransferCheckedInstruction({ source, mint: USDC_DEVNET, destination, authority: payer, amount: BigInt(Math.round(amountUsdc * 1e6)), decimals: 6 }),
    { programAddress: MEMO_PROGRAM, accounts: [], data: new Uint8Array(getUtf8Encoder().encode(memo)) },
  ];
  const rpc = createSolanaRpc(rpcUrl);
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const tx = await signTransactionMessageWithSigners(
    pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(instructions, m),
    ),
  );
  await rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64", preflightCommitment: "confirmed" }).send();
  // Return straight away, like many real apps: the verifier waits for confirmation itself.
  return getSignatureFromTransaction(tx);
}
