/**
 * LOCAL ONLY: the organiser's side of the day through the real UI. Signs in as the organiser
 * (code from the local Mailpit), makes someone a judge, awards points, chooses and confirms
 * finalists, checks the leaderboard and venue screen, and auto-assigns judges to finalists only.
 * Then screenshots the student pages at phone width.
 *
 *   npx tsx scripts/dev-race.mts points        # a running points race
 *   npx tsx scripts/team-journey.mts <dir> <student email>   # at least one team with a submission
 *   npx tsx scripts/organiser-journey.mts <screenshot dir> [organiser email] [judge email] [site]
 */
import { chromium, type Browser, type Page } from "playwright";

const OUT = process.argv[2];
const ORGANISER = process.argv[3] ?? "dev-organiser@demo.test";
const JUDGE = process.argv[4] ?? "grace@demo.test";
const SITE = (process.argv[5] ?? "http://localhost:3100").replace(/\/+$/, "");
const MAIL = "http://127.0.0.1:54624/api/v1";
if (!OUT) throw new Error("Usage: npx tsx scripts/organiser-journey.mts <screenshot dir> [organiser email] [judge email] [site]");
if (!/localhost|127\.0\.0\.1/.test(SITE)) throw new Error("organiser-journey only runs against a local site.");

let n = 0;
const shot = async (page: Page, name: string) => page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true });
const say = (s: string) => console.log(`· ${s}`);
const text = (page: Page) => page.locator("main").innerText();

async function signIn(browser: Browser, email: string, viewport = { width: 1280, height: 900 }): Promise<Page> {
  const page = await browser.newPage({ viewport });
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
let page: Page | null = null;
try {
  // The judge signs in once (roles can only be given to existing accounts).
  await (await signIn(browser, JUDGE)).close();
  say(`${JUDGE} signed in once`);

  page = await signIn(browser, ORGANISER);
  say("organiser signed in");

  await page.goto(`${SITE}/admin/readiness`);
  await page.getByText("CHECKED AUTOMATICALLY").waitFor();
  await shot(page, "readiness");
  say(`readiness: ${(await text(page)).match(/\d+ to do, \d+ to look at|Everything the platform can check is ready/)?.[0]}`);

  // Make the judge
  await page.goto(`${SITE}/admin/participants`);
  const roles = page.locator("form", { hasText: "MENTORS · JUDGES · ORGANISERS" }).or(page.locator("form").filter({ has: page.locator('select[name="role"]') }));
  await roles.locator('input[name="email"]').fill(JUDGE);
  await roles.locator('select[name="role"]').selectOption("judge");
  await roles.getByRole("button", { name: "Grant" }).click();
  await roles.getByText("Saved.").waitFor();
  say(`${JUDGE} is a judge`);

  // Award points
  await page.goto(`${SITE}/admin/points`);
  await page.getByText("AWARD POINTS").waitFor();
  const award = page.locator("form").filter({ has: page.getByRole("button", { name: "Award" }) });
  const team = award.getByLabel("Team");
  const firstTeam = (await team.locator("option").allInnerTexts()).find((t) => t.trim() && !/choose|select/i.test(t))!;
  await team.selectOption({ label: firstTeam });
  await award.getByLabel(/^Points/).fill("75");
  await award.getByLabel("What the points are for").fill("Escape room: Assembly");
  await award.getByRole("button", { name: "Award" }).click();
  await award.getByText("Awarded.").waitFor();
  say(`awarded 75 to ${firstTeam.trim()}`);

  // Finalists: top 2
  await page.reload();
  const fin = page.locator("div", { hasText: "Number of finalists" }).last();
  await page.getByLabel("Number of finalists").fill("2");
  await page.getByRole("button", { name: /choose these finalists|replace finalists/i }).click();
  await page.getByRole("button", { name: /confirm 2 finalists/i }).click();
  await page.getByText("Finalists confirmed and announced.").waitFor();
  await shot(page, "points-finalists");
  void fin;
  say("2 finalists confirmed");

  await page.goto(`${SITE}/leaderboard`);
  await page.waitForTimeout(1500);
  await shot(page, "leaderboard-finalists");
  say(`leaderboard: ${((await text(page)).match(/FINALIST/g) ?? []).length} marked finalist`);

  await page.goto(`${SITE}/display`);
  await page.waitForTimeout(2500);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-venue-screen-1080p.png` });
  await page.setViewportSize({ width: 1280, height: 900 });

  // Judging: finalists only
  await page.goto(`${SITE}/admin/judging`);
  await page.getByText(/Finalists only/).first().waitFor();
  const before = (await text(page)).match(/Added \d+ assignments?/)?.[0];
  await page.getByRole("button", { name: "Assign evenly" }).first().click();
  await page.getByText(/Added \d+ assignments?/).first().waitFor();
  await shot(page, "judging-assigned");
  say(`judging (finalists only): ${(await text(page)).match(/Added \d+ assignments?/)?.[0]}${before ? " (again)" : ""}`);

  // Student pages at phone width
  await page.close();
  page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  for (const path of ["/", "/race", "/leaderboard", "/start", "/build"]) {
    await page.goto(`${SITE}${path}`);
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-mobile${path === "/" ? "-home" : path.replace(/\//g, "-")}.png`, fullPage: true });
    say(`mobile ${path}: ${overflow > 0 ? `scrolls sideways by ${overflow}px` : "no sideways scroll"}`);
  }
} catch (e) {
  if (page) await shot(page, "FAILED").catch(() => {});
  console.log("STOPPED:", (e as Error).message.split("\n")[0]);
  if (page) console.log((await text(page).catch(() => "")).slice(0, 1200));
} finally {
  await browser.close();
}
