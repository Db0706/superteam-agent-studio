/**
 * LOCAL ONLY: a student's day through the real UI. Sign in (code from the local Mailpit), create a
 * team, connect an app (the reference fixture), lock in an idea, enter the running race, verify
 * App live / Idea locked in / Submitted, submit with a receipt, and check the leaderboard.
 *
 *   npx tsx scripts/dev-race.mts points      # a running points race
 *   npm run worker                           # in another terminal
 *   npx tsx scripts/team-journey.mts <screenshot dir> <email on the participant list> [site]
 *
 * Screenshots of every step land in the directory. Re-running with the same email reuses the team.
 */
import { chromium, type Page } from "playwright";

const OUT = process.argv[2];
const EMAIL = process.argv[3];
const SITE = (process.argv[4] ?? "http://localhost:3100").replace(/\/+$/, "");
const MAIL = "http://127.0.0.1:54624/api/v1";
if (!OUT || !EMAIL) throw new Error("Usage: npx tsx scripts/team-journey.mts <screenshot dir> <email> [site]");
if (!/localhost|127\.0\.0\.1/.test(SITE)) throw new Error("team-journey only runs against a local site.");
let n = 0;
const shot = async (page: Page, name: string) => page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true });
const say = (s: string) => console.log(`· ${s}`);

async function code(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const d = await (await fetch(`${MAIL}/search?query=to:${EMAIL}&limit=1`)).json();
    if (d.messages?.length) {
      const m = await (await fetch(`${MAIL}/message/${d.messages[0].ID}`)).json();
      const c = /\b(\d{6})\b/.exec(m.Text ?? "")?.[1];
      if (c) return c;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no sign-in email");
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  // Sign in (clear old codes first so we read the new one)
  await fetch(`${MAIL}/search?query=to:${EMAIL}`, { method: "DELETE" });
  await page.goto(`${SITE}/login`);
  await page.getByPlaceholder("you@cam.ac.uk").fill(EMAIL);
  await page.keyboard.press("Enter");
  await page.getByLabel("6-digit code").fill(await code());
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/race|\/team|\/$/);
  say(`signed in → ${new URL(page.url()).pathname}`);

  // Team
  await page.goto(`${SITE}/team`);
  await page.getByText(/CREATE A TEAM|WHAT THE VERIFIER CALLS/).first().waitFor();
  if (await page.getByText("CREATE A TEAM").count()) {
    await shot(page, "team-empty");
    await page.locator('input[name="name"]').first().fill("Team Ada");
    await page.getByRole("button", { name: /create/i }).click();
    await page.getByText("WHAT THE VERIFIER CALLS").waitFor();
    say("team created");
  } else say("team already exists");
  await page.locator('input[name="endpoint"]').fill(`${SITE}/api/race/fixtures/reference`);
  await page.getByRole("button", { name: /save/i }).first().click();
  await page.waitForTimeout(1500);
  await shot(page, "team-connected");
  const testBtn = page.getByRole("button", { name: /test connection/i });
  if (await testBtn.count()) {
    await testBtn.click();
    await page.waitForTimeout(3000);
    say(`connection test: ${(await page.locator("main").innerText()).match(/(connected|reachable|ready|failed|error)[^\n]{0,80}/i)?.[0] ?? "(no message found)"}`);
  }
  await shot(page, "team-tested");

  // Idea (draft on Submit)
  await page.goto(`${SITE}/submit`);
  await page.waitForTimeout(1500);
  await shot(page, "submit-empty");
  await page.getByLabel(/title/i).first().fill(`Ada: an AI study buddy that checks its sources (${Date.now() % 10000})`);
  await page.getByLabel(/problem solved/i).fill("Students waste hours on AI answers that cite sources which do not exist; Ada only answers from documents it can quote.");
  await page.getByText("DRAFT SAVED").first().waitFor({ timeout: 15_000 });
  await shot(page, "submit-draft");
  say("idea draft saved");

  // Race: verify App live and Idea locked in
  await page.goto(`${SITE}/race`);
  await page.waitForTimeout(1500);
  const enter = page.getByRole("button", { name: /enter the race|join the race/i });
  if (await enter.count()) {
    await enter.first().click();
    await page.waitForTimeout(1500);
    say("entered the race");
  }
  for (const layer of ["App live", "Idea locked in"]) {
    await page.getByRole("link", { name: new RegExp(layer, "i") }).or(page.getByRole("button", { name: new RegExp(layer, "i") })).first().click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /run verification/i }).click();
    await page.getByText(/passed|failed|PASSED|FAILED/).first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1000);
    await shot(page, `race-${layer.toLowerCase().replace(/\W+/g, "-")}`);
    say(`${layer}: ${(await page.locator("main").innerText()).match(/(PASSED|FAILED|Passed|Failed)[^\n]{0,60}/)?.[0]}`);
  }

  // Submit for real
  await page.goto(`${SITE}/submit`);
  await page.waitForTimeout(1500);
  await page.getByLabel(/project description/i).fill("A chat assistant that answers questions from uploaded course notes and quotes the exact passage it used.");
  await page.getByLabel(/code repository/i).fill("https://github.com/example/ada");
  await page.getByLabel(/technical architecture/i).fill("Next.js app, a retrieval step over uploaded PDFs, and a model call that must cite passage ids.");
  await page.getByLabel(/ai capabilities/i).fill("Answering from sources with citations; checked against 20 questions with known answers.");
  await page.getByRole("button", { name: /submit to the build track/i }).click();
  await page.getByRole("button", { name: /yes, submit/i }).click();
  await page.waitForTimeout(2000);
  await shot(page, "submit-final");
  say(`submitted: ${(await page.locator("main").innerText()).match(/receipt[^\n]{0,60}/i)?.[0] ?? "(no receipt text)"}`);

  await page.goto(`${SITE}/race`);
  await page.getByRole("link", { name: /^.*Submitted/i }).or(page.getByRole("button", { name: /Submitted/i })).first().click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /run verification/i }).click();
  await page.getByText(/passed|failed|PASSED|FAILED/).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  await shot(page, "race-submitted");
  say(`Submitted: ${(await page.locator("main").innerText()).match(/(PASSED|FAILED|Passed|Failed)[^\n]{0,60}/)?.[0]}`);

  // Leaderboard
  await page.goto(`${SITE}/leaderboard`);
  await page.waitForTimeout(2000);
  await shot(page, "leaderboard");
  say(`leaderboard: ${(await page.locator("main").innerText()).match(/Team Ada[^\n]*(\n[^\n]*){0,3}/)?.[0]?.replace(/\n/g, " | ")}`);
} catch (e) {
  await shot(page, "FAILED");
  console.log("STOPPED:", (e as Error).message.split("\n")[0]);
  console.log((await page.locator("main").innerText().catch(() => "")).slice(0, 1200));
} finally {
  await browser.close();
}
