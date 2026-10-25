/**
 * Devnet setup for the on-chain bonus challenges (Operation, Minesweeper), using the
 * bureau_registry program from Speedbuild 2026.
 *
 *   npx tsx scripts/bureau-setup.mts init                 one-off: config, CRED mint, presentation account, salt
 *   npx tsx scripts/bureau-setup.mts seed                 every team with a registered wallet (from DATABASE_URL)
 *   npx tsx scripts/bureau-setup.mts seed teams.json      or from a file: [{ "challengeId": "T-…", "wallet": "…" }]
 *   npx tsx scripts/bureau-setup.mts constants            print the four constants for the setup form
 *
 * Env: BUREAU_AUTHORITY (keypair file; default ~/.config/agent-studio/devnet-e2e-payer.json),
 * BUREAU_PROGRAM_ID, SOLANA_DEVNET_RPC_URL (default public devnet), DATABASE_URL + ACTIVE_EVENT_SLUG for seed.
 * State (mint keypair, salt, per-team clearance accounts) is kept in ~/.config/agent-studio/bureau/state.json.
 * Safe to re-run: anything already on chain is skipped, so late teams can be seeded later.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  getUtf8Encoder,
  type Address,
  type Instruction,
  type KeyPairSigner,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstruction, getInitializeMint2Instruction, getMintSize, getMintToInstruction, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { challengeIdFor } from "../src/core/challenges/identity";

// Public devnet rate-limits quickly: retry 429s and transient errors with backoff.
const rawFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  for (let i = 0; ; i++) {
    try {
      const res = await rawFetch(input, init);
      if ((res.status === 429 || res.status >= 500) && i < 8) { await new Promise((r) => setTimeout(r, 1000 * (i + 1))); continue; }
      return res;
    } catch (err) {
      if (i >= 8) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}) as typeof fetch;

const DIR = join(homedir(), ".config/agent-studio/bureau");
const STATE = join(DIR, "state.json");
const RPC = process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM = address(process.env.BUREAU_PROGRAM_ID ?? "H2wWqEUUbQ3LJGWLAYyLK8vop4zxeX69r1cXeNpY4XXk");
const SYSTEM = address("11111111111111111111111111111111");
const CRED_DECIMALS = 6;
const TEAM_SOL = BigInt(20_000_000); // 0.02 SOL: fees plus the code record's rent for Minesweeper
const TEAM_CRED = BigInt(1_000_000); // 1 CRED: far more than Operation (≤ 10,000 units) and presentations need
const CODE_WINDOW_SLOTS = BigInt(4500);

interface State { credMintSecret?: number[]; salt?: string; teams: Record<string, { wallet: string; clearanceOwner: string; clearanceAta: string }> }
const load = (): State => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { teams: {} });
const save = (s: State) => { mkdirSync(DIR, { recursive: true }); writeFileSync(STATE, JSON.stringify(s, null, 2), { mode: 0o600 }); };

const rpc = createSolanaRpc(RPC);
const utf8 = getUtf8Encoder();
const addrBytes = (a: string) => new Uint8Array(getAddressEncoder().encode(address(a)));
const u64 = (n: bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(n); return b; };
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const borshString = (s: string) => Buffer.concat([u32(Buffer.byteLength(s)), Buffer.from(s, "utf8")]);
const disc = (name: string) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
const pda = async (seeds: (string | Uint8Array)[]) => (await getProgramDerivedAddress({ programAddress: PROGRAM, seeds: seeds.map((s) => (typeof s === "string" ? utf8.encode(s) : s)) }))[0];

async function authority(): Promise<KeyPairSigner> {
  const file = process.env.BUREAU_AUTHORITY ?? join(homedir(), ".config/agent-studio/devnet-e2e-payer.json");
  return createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(readFileSync(file, "utf8"))));
}

async function send(payer: KeyPairSigner, instructions: Instruction[]): Promise<string> {
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const tx = await signTransactionMessageWithSigners(pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  ));
  const sig = getSignatureFromTransaction(tx);
  await rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64", preflightCommitment: "confirmed" }).send();
  for (let i = 0; i < 60; i++) {
    const { value } = await rpc.getSignatureStatuses([sig]).send();
    if (value[0]?.err) throw new Error(`transaction failed: ${JSON.stringify(value[0].err)}`);
    if (value[0]?.confirmationStatus === "confirmed" || value[0]?.confirmationStatus === "finalized") return sig;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`not confirmed in time: ${sig}`);
}

const exists = async (a: string) => (await rpc.getAccountInfo(address(a), { encoding: "base64" }).send()).value !== null;
const lamports = async (a: string) => BigInt((await rpc.getBalance(address(a)).send()).value);

function createAccountIx(from: KeyPairSigner, account: KeyPairSigner, rent: bigint, space: number, owner: Address): Instruction {
  return { programAddress: SYSTEM, accounts: [{ address: from.address, role: AccountRole.WRITABLE_SIGNER, signer: from }, { address: account.address, role: AccountRole.WRITABLE_SIGNER, signer: account }] as never, data: Buffer.concat([u32(0), u64(rent), u64(BigInt(space)), Buffer.from(addrBytes(owner))]) };
}
function transferSolIx(from: KeyPairSigner, to: string, amount: bigint): Instruction {
  return { programAddress: SYSTEM, accounts: [{ address: from.address, role: AccountRole.WRITABLE_SIGNER, signer: from }, { address: address(to), role: AccountRole.WRITABLE }] as never, data: Buffer.concat([u32(2), u64(amount)]) };
}

async function init() {
  const auth = await authority();
  const state = load();
  const config = await pda(["config"]);
  if (!(await exists(config))) {
    await send(auth, [{ programAddress: PROGRAM, accounts: [{ address: auth.address, role: AccountRole.WRITABLE_SIGNER, signer: auth }, { address: config, role: AccountRole.WRITABLE }, { address: SYSTEM, role: AccountRole.READONLY }] as never, data: Buffer.concat([disc("initialize"), u64(CODE_WINDOW_SLOTS)]) }]);
    console.log("· program initialised (code window 4500 slots)");
  } else console.log("· program already initialised");
  let mint: KeyPairSigner;
  if (state.credMintSecret) mint = await createKeyPairSignerFromBytes(Uint8Array.from(state.credMintSecret));
  else {
    const kp = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const priv = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey)).slice(-32);
    const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
    state.credMintSecret = [...priv, ...pub];
    save(state);
    mint = await createKeyPairSignerFromBytes(Uint8Array.from(state.credMintSecret));
  }
  if (!(await exists(mint.address))) {
    const rent = BigInt(await rpc.getMinimumBalanceForRentExemption(BigInt(getMintSize())).send());
    await send(auth, [createAccountIx(auth, mint, rent, getMintSize(), TOKEN_PROGRAM_ADDRESS), getInitializeMint2Instruction({ mint: mint.address, decimals: CRED_DECIMALS, mintAuthority: auth.address })]);
    console.log("· CRED mint created");
  } else console.log("· CRED mint already exists");
  const [presentation] = await findAssociatedTokenPda({ owner: auth.address, mint: mint.address, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  if (!(await exists(presentation))) {
    await send(auth, [getCreateAssociatedTokenIdempotentInstruction({ payer: auth, ata: presentation, owner: auth.address, mint: mint.address })]);
    console.log("· presentation account created");
  }
  if (!state.salt) { state.salt = randomBytes(6).toString("hex"); save(state); }
  await constants();
}

async function constants() {
  const auth = await authority();
  const state = load();
  if (!state.credMintSecret || !state.salt) throw new Error("Run init first.");
  const mint = await createKeyPairSignerFromBytes(Uint8Array.from(state.credMintSecret));
  const [presentation] = await findAssociatedTokenPda({ owner: auth.address, mint: mint.address, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  console.log(`\nPaste these into Admin → Tournaments → Set up the hackathon → Challenge constants:\n  Program ID            ${PROGRAM}\n  CRED mint             ${mint.address}\n  Presentation account  ${presentation}\n  Salt                  ${state.salt}\n`);
  return { mint, presentation };
}

async function teamsToSeed(file?: string): Promise<{ challengeId: string; wallet: string }[]> {
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  const { createSql } = await import("../src/server/db");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (or pass a teams.json file).");
  const sql = createSql(url, 2);
  const slug = process.env.ACTIVE_EVENT_SLUG ?? "oxbridge-ai-race-2026";
  const rows = await sql<{ team_id: string; wallet: string }[]>`
    select p.team_id, p.solana_wallet as wallet from public.projects p join public.teams t on t.id = p.team_id
    join public.events e on e.id = t.event_id where e.slug = ${slug} and p.solana_wallet is not null`;
  await sql.end();
  return rows.map((r) => ({ challengeId: challengeIdFor(r.team_id), wallet: r.wallet }));
}

async function seed(file?: string) {
  const auth = await authority();
  const state = load();
  const { mint } = await constants();
  const config = await pda(["config"]);
  const teams = await teamsToSeed(file);
  console.log(`Seeding ${teams.length} team${teams.length === 1 ? "" : "s"}…`);
  let done = 0;
  for (const t of teams) {
    try {
      const ix: Instruction[] = [];
      // Each team gets its own clearance account (an ATA for a fresh owner), so finding it proves the decoding.
      let entry = state.teams[t.challengeId];
      if (!entry || entry.wallet !== t.wallet) {
        const owner = await generateKeyPairSigner();
        const [ata] = await findAssociatedTokenPda({ owner: owner.address, mint: mint.address, tokenProgram: TOKEN_PROGRAM_ADDRESS });
        entry = { wallet: t.wallet, clearanceOwner: owner.address, clearanceAta: ata };
      }
      const claim = await pda(["claim", t.challengeId.toLowerCase()]);
      const holdings = await pda(["holdings", t.challengeId]);
      const claimExists = await exists(claim);
      if (!claimExists) {
        ix.push(getCreateAssociatedTokenIdempotentInstruction({ payer: auth, ata: address(entry.clearanceAta), owner: address(entry.clearanceOwner), mint: mint.address }));
        const nonce = randomBytes(8).readBigUInt64LE(0);
        ix.push({ programAddress: PROGRAM, accounts: [{ address: auth.address, role: AccountRole.WRITABLE_SIGNER, signer: auth }, { address: config, role: AccountRole.READONLY }, { address: claim, role: AccountRole.WRITABLE }, { address: address(entry.clearanceAta), role: AccountRole.READONLY }, { address: SYSTEM, role: AccountRole.READONLY }] as never, data: Buffer.concat([disc("init_operative"), borshString(t.challengeId), u64(nonce)]) });
      }
      if (!(await exists(holdings))) {
        ix.push({ programAddress: PROGRAM, accounts: [{ address: auth.address, role: AccountRole.WRITABLE_SIGNER, signer: auth }, { address: config, role: AccountRole.READONLY }, { address: holdings, role: AccountRole.WRITABLE }, { address: SYSTEM, role: AccountRole.READONLY }] as never, data: Buffer.concat([disc("init_operative_holdings"), borshString(t.challengeId), Buffer.from(addrBytes(t.wallet))]) });
      }
      if (ix.length) await send(auth, ix);
      if (claimExists && state.teams[t.challengeId]?.wallet !== t.wallet) console.log(`  ! ${t.challengeId}: already set up on chain for a different wallet; leaving it`);
      else state.teams[t.challengeId] = entry;
      save(state);
      // Funding: SOL for fees, CRED to pay with. Topped up only when low, so re-runs are cheap.
      const fund: Instruction[] = [];
      if ((await lamports(t.wallet)) < TEAM_SOL / BigInt(2)) fund.push(transferSolIx(auth, t.wallet, TEAM_SOL));
      const [teamAta] = await findAssociatedTokenPda({ owner: address(t.wallet), mint: mint.address, tokenProgram: TOKEN_PROGRAM_ADDRESS });
      const bal = (await exists(teamAta)) ? BigInt((await rpc.getTokenAccountBalance(teamAta).send()).value.amount) : BigInt(0);
      if (bal < TEAM_CRED / BigInt(10)) {
        fund.push(getCreateAssociatedTokenIdempotentInstruction({ payer: auth, ata: teamAta, owner: address(t.wallet), mint: mint.address }));
        fund.push(getMintToInstruction({ mint: mint.address, token: teamAta, mintAuthority: auth, amount: TEAM_CRED }));
      }
      if (fund.length) await send(auth, fund);
      done++;
      console.log(`  ✓ ${t.challengeId}  ${t.wallet}${ix.length ? "  (records created)" : ""}${fund.length ? "  (funded)" : ""}`);
    } catch (err) {
      console.log(`  ✗ ${t.challengeId}: ${(err as Error).message.slice(0, 200)}`);
    }
  }
  console.log(`Done: ${done} of ${teams.length}. Authority balance ${(Number(await lamports(auth.address)) / 1e9).toFixed(3)} SOL.`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "init") await init();
else if (cmd === "seed") await seed(arg);
else if (cmd === "constants") await constants();
else console.log("Usage: npx tsx scripts/bureau-setup.mts init | seed [teams.json] | constants");
