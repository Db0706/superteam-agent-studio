/**
 * LOCAL ONLY: a mentor request through the real UI, with two people in two browsers. A student
 * asks for help, a mentor sees it in the queue and takes it, the student sees who's coming, the
 * mentor resolves it.
 *
 *   npx tsx scripts/mentor-journey.mts <screenshot dir> <student email> <mentor email> [site]
 *
 * The student must be on the participant list and the mentor must have the mentor role.
 */
import { chromium, type Browser, type Page } from "playwright";

const [OUT, STUDENT, MENTOR] = process.argv.slice(2);
const SITE = (process.argv[5] ?? "http://localhost:3100").replace(/\/+$/, "");
const MAIL = "http://127.0.0.1:54624/api/v1";
if (!OUT || !STUDENT || !MENTOR) throw new Error("Usage: npx tsx scripts/mentor-journey.mts <screenshot dir> <student email> <mentor email> [site]");
if (!/localhost|127\.0\.0\.1/.test(SITE)) throw new Error("mentor-journey only runs against a local site.");

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
const problem = `Our agent keeps calling exchange_rate in a loop (${Date.now() % 10000})`;
let current: Page | null = null;
try {
  const student = await signIn(browser, STUDENT);
  const mentor = await signIn(browser, MENTOR);
  say("both signed in");

  current = student;
  await student.goto(`${SITE}/mentor`);
  await student.getByText("ASK FOR A MENTOR").waitFor();
  await student.locator('textarea[name="description"]').fill(problem);
  await student.locator('input[name="location"]').fill("Table 7, Keynes Hall");
  await student.getByRole("button", { name: /request a mentor/i }).click();
  await student.getByText(problem).waitFor();
  await shot(student, "student-asked");
  say("student asked");

  current = mentor;
  await mentor.goto(`${SITE}/mentor`);
  const card = mentor.locator("li, article, section").filter({ hasText: problem }).last();
  await card.waitFor();
  await shot(mentor, "mentor-queue");
  await card.getByRole("button", { name: "I'll take it" }).click();
  await card.getByRole("button", { name: "Resolved" }).waitFor();
  say("mentor took it");

  current = student;
  await student.reload();
  const mine = student.locator("li, article, section").filter({ hasText: problem }).last();
  await mine.waitFor();
  await shot(student, "student-sees-claimed");
  say(`student sees: ${(await mine.innerText()).replace(/\s+/g, " ").match(/(claimed|on (the|their) way|coming|being helped)[^.]{0,60}/i)?.[0] ?? "(no claimed wording found)"}`);

  current = mentor;
  await card.getByRole("button", { name: "Resolved" }).click();
  await mentor.waitForTimeout(1500);
  await shot(mentor, "mentor-resolved");

  current = student;
  await student.reload();
  await student.waitForTimeout(1000);
  await shot(student, "student-sees-resolved");
  const after = await student.locator("main").innerText();
  say(`after resolving, the student's page ${after.includes(problem) ? "still lists the request" : "no longer lists it as open"}`);
} catch (e) {
  if (current) await shot(current, "FAILED").catch(() => {});
  console.log("STOPPED:", (e as Error).message.split("\n")[0]);
  if (current) console.log((await current.locator("main").innerText().catch(() => "")).slice(0, 1200));
} finally {
  await browser.close();
}
