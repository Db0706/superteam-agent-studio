/**
 * LOCAL ONLY: a judge scoring an assigned submission through the real UI. Signs in, opens the
 * judge page, fills every criterion, saves a draft, submits final scores, and checks the scores
 * can't be edited afterwards. Then the organiser's judging page shows the result.
 *
 *   npx tsx scripts/judge-journey.mts <screenshot dir> <judge email> [organiser email] [site]
 *
 * The judge needs an assignment (scripts/organiser-journey.mts creates one).
 */
import { chromium, type Browser, type Page } from "playwright";

const [OUT, JUDGE] = process.argv.slice(2);
const ORGANISER = process.argv[4] ?? "dev-organiser@demo.test";
const SITE = (process.argv[5] ?? "http://localhost:3100").replace(/\/+$/, "");
const MAIL = "http://127.0.0.1:54624/api/v1";
if (!OUT || !JUDGE) throw new Error("Usage: npx tsx scripts/judge-journey.mts <screenshot dir> <judge email> [organiser email] [site]");
if (!/localhost|127\.0\.0\.1/.test(SITE)) throw new Error("judge-journey only runs against a local site.");

let n = 0;
const shot = async (page: Page, name: string) => page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true });
const say = (s: string) => console.log(`· ${s}`);

async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await fetch(`${MAIL}/search?query=to:${email}`, { method: "DELETE" });
  await page.goto(`${SITE}/login`);
  await page.getByPlaceholder("you@cam.ac.uk").fill(email);
  await page.keyboard.press("Enter");
  let code = "";
  for (let i = 0; i < 20 && !code; i++) {
    const d = await (await fetch(`${MAIL}/search?query=to:${email}&limit=1`)).json();
    if (d.messages?.length) code = /\b(\d{6})\b/.exec((await (await fetch(`${MAIL}/message/${d.messages[0].ID}`)).json()).Text ?? "")?.[1] ?? "";
    if (!code) await new Promise((r) => setTimeout(r, 500));
  }
  if (!code) throw new Error(`no sign-in email for ${email}`);
  await page.getByLabel("6-digit code").fill(code);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}

const browser = await chromium.launch();
let current: Page | null = null;
try {
  const judge = await signIn(browser, JUDGE);
  current = judge;
  await judge.goto(`${SITE}/judge`);
  await judge.waitForTimeout(1500);
  await shot(judge, "judge-assignments");
  const fields = judge.getByLabel(/score out of \d+/);
  const count = await fields.count();
  if (!count) throw new Error("no score fields: is this judge assigned a submission?");
  say(`judge sees ${count} criteria to score`);

  // Fill every criterion with 7 (or the max if lower), add a comment, save a draft.
  for (let i = 0; i < count; i++) {
    const max = Number(/out of (\d+)/.exec((await fields.nth(i).getAttribute("aria-label")) ?? "")?.[1] ?? 10);
    await fields.nth(i).fill(String(Math.min(7, max)));
  }
  await judge.locator("textarea").first().fill("Clear problem, working retrieval with citations. Would like to see an evaluation on harder questions.");
  await judge.getByRole("button", { name: "Save draft" }).first().click();
  await judge.getByText("Draft saved.").waitFor();
  say("draft saved");

  await judge.getByRole("button", { name: "Submit final scores" }).first().click();
  await judge.getByText("Final scores submitted.").waitFor();
  await judge.reload();
  await judge.waitForTimeout(1500);
  await shot(judge, "judge-final");
  const stillEditable = await judge.getByRole("button", { name: "Submit final scores" }).count();
  say(`after submitting, the form is ${stillEditable ? "STILL EDITABLE" : "locked"}`);

  const organiser = await signIn(browser, ORGANISER);
  current = organiser;
  await organiser.goto(`${SITE}/admin/judging`);
  await organiser.waitForTimeout(1500);
  await shot(organiser, "organiser-results");
  const text = await organiser.locator("main").innerText();
  say(`organiser sees: ${text.match(/\d+ of \d+ (scored|assignments? scored)[^\n]*/i)?.[0] ?? text.match(/Team Ada[^\n]*/)?.[0] ?? "(no result line found)"}`);
} catch (e) {
  if (current) await shot(current, "FAILED").catch(() => {});
  console.log("STOPPED:", (e as Error).message.split("\n")[0]);
  if (current) console.log((await current.locator("main").innerText().catch(() => "")).slice(0, 1200));
} finally {
  await browser.close();
}
