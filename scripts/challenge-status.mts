/**
 * Read-only: every team's readiness for the on-chain challenges. For each team it shows whether a
 * devnet wallet is saved, whether its puzzle is set up on chain for that same wallet, whether it
 * has entered the race, and which tiers it has passed.
 *
 *   DATABASE_URL=… npx tsx scripts/challenge-status.mts
 *
 * Reads the database, public devnet and the local setup state (~/.config/agent-studio/bureau/state.json).
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { address, createSolanaRpc, getProgramDerivedAddress, getUtf8Encoder } from "@solana/kit";
import { challengeIdFor } from "../src/core/challenges/identity";
import { createSql } from "../src/server/db";

const rawFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  for (let i = 0; ; i++) {
    const res = await rawFetch(input, init).catch((e) => (i >= 6 ? Promise.reject(e) : null));
    if (res && !(res.status === 429 && i < 6)) return res;
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
}) as typeof fetch;

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL.");
const slug = process.env.ACTIVE_EVENT_SLUG ?? "oxbridge-ai-race-2026";
const PROGRAM = address(process.env.BUREAU_PROGRAM_ID ?? "H2wWqEUUbQ3LJGWLAYyLK8vop4zxeX69r1cXeNpY4XXk");
const rpc = createSolanaRpc(process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com");
const utf8 = getUtf8Encoder();
const pda = async (...seeds: string[]) => (await getProgramDerivedAddress({ programAddress: PROGRAM, seeds: seeds.map((s) => utf8.encode(s)) }))[0];
const exists = async (a: string) => (await rpc.getAccountInfo(address(a), { encoding: "base64", dataSlice: { offset: 0, length: 0 } }).send()).value !== null;
const statePath = join(homedir(), ".config/agent-studio/bureau/state.json");
const state = existsSync(statePath) ? (JSON.parse(readFileSync(statePath, "utf8")) as { teams: Record<string, { wallet: string }> }) : { teams: {} };

const sql = createSql(url, 1);
const rows = await sql.begin("read only", async (q) => {
  const [ev] = await q`select id from public.events where slug = ${slug}`;
  return q`
    select t.id, t.name, t.track, p.solana_wallet as wallet,
      (select count(*)::int from public.team_members m where m.team_id = t.id) as members,
      exists (select 1 from public.tournament_participants tp join public.tournaments tr on tr.id = tp.tournament_id
              where tp.team_id = t.id and tr.simulation = false and tr.status in ('scheduled','running','paused')) as in_race,
      coalesce((select array_agg(distinct lr.layer_key order by lr.layer_key) from public.verification_attempts a
                join public.tournament_participants tp on tp.id = a.participant_id join public.layer_runs lr on lr.id = a.layer_run_id
                join public.tournaments tr on tr.id = a.tournament_id
                where tp.team_id = t.id and a.status = 'passed' and tr.simulation = false and lr.layer_key ~ '^(operation|minesweeper)-'), '{}') as passed
    from public.teams t left join public.projects p on p.team_id = t.id
    where t.event_id = ${ev.id} order by t.created_at`;
});
await sql.end();

let noWallet = 0, notSetUp = 0, ready = 0;
console.log("TEAM                          WALLET  ON CHAIN  IN RACE  TIERS PASSED");
for (const r of rows) {
  const id = challengeIdFor(r.id);
  let chain = "-";
  if (r.wallet) {
    const [claim, holdings] = await Promise.all([pda("claim", id.toLowerCase()), pda("holdings", id)]);
    const onChain = (await exists(claim)) && (await exists(holdings));
    const sameWallet = state.teams[id]?.wallet === r.wallet;
    chain = !onChain ? "✗ not yet" : sameWallet ? "✓" : "⚠ other wallet";
    if (chain === "✓") ready++; else notSetUp++;
  } else noWallet++;
  const name = `${r.name} (${r.members})`.slice(0, 29).padEnd(30);
  console.log(`${name}${(r.wallet ? "✓" : "✗").padEnd(8)}${chain.padEnd(10)}${(r.in_race ? "✓" : "✗").padEnd(9)}${r.passed.length ? r.passed.join(", ") : "-"}`);
}
console.log(`\n${rows.length} teams · ${ready} ready for the challenges · ${notSetUp} saved a wallet but not set up yet · ${noWallet} no wallet yet`);
if (notSetUp) console.log('→ Run the setup command (bureau-setup.mts seed) to set up the teams marked "✗ not yet".');
console.log('"⚠ other wallet" = the team changed its wallet after setup; tell Claude the team name.');
