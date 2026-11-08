/**
 * LOCAL ONLY: the organiser's tournament flow through the real UI, with a screenshot per step.
 * Creates a points race, sets the devnet address, publishes, schedules (accepting the
 * confirmation), opens the control room, pauses and resumes. Then creates a rehearsal from a
 * second draft, adds fixture teams, publishes and schedules it, and watches its control room.
 *
 *   npx tsx scripts/tournament-journey.mts <screenshot dir> [organiser email] [site]
 */
import { chromium, type Page } from "playwright";

const OUT = process.argv[2];
const ORGANISER = process.argv[3] ?? "dev-organiser@demo.test";
const SITE = (process.argv[4] ?? "http://localhost:3100").replace(/\/+$/, "");
const MAIL = "http://127.0.0.1:54624/api/v1";
const PAY_TO = "5Q6zKtHe73hqszUauQutYWV3AkznYhUHG27PUTgpdr6s";
if (!OUT) throw new Error("Usage: npx tsx scripts/tournament-journey.mts <screenshot dir> [organiser email] [site]");
if (!/localhost|127\.0\.0\.1/.test(SITE)) throw new Error("tournament-journey only runs against a local site.");

let n = 0;
const shot = async (page: Page, name: string) => page.screenshot({ path: `${OUT}/${String(++n).padStart(2, "0")}-${name}.png`, fullPage: true });
const say = (s: string) => console.log(`· ${s}`);
const dialogs: string[] = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on("dialog", async (d) => {
  dialogs.push(d.message().split("\n")[0]);
  await d.accept();
});
try {
  await fetch(`${MAIL}/search?query=to:${ORGANISER}`, { method: "DELETE" });
  await page.goto(`${SITE}/login`);
  await page.getByPlaceholder("you@cam.ac.uk").fill(ORGANISER);
  await page.keyboard.press("Enter");
  let code = "";
  for (let i = 0; i < 20 && !code; i++) {
    const d = await (await fetch(`${MAIL}/search?query=to:${ORGANISER}&limit=1`)).json();
    if (d.messages?.length) code = /\b(\d{6})\b/.exec((await (await fetch(`${MAIL}/message/${d.messages[0].ID}`)).json()).Text ?? "")?.[1] ?? "";
    if (!code) await new Promise((r) => setTimeout(r, 500));
  }
  await page.getByLabel("6-digit code").fill(code);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  say(`signed in → ${new URL(page.url()).pathname}`);

  // 1. Create a points race draft
  await page.goto(`${SITE}/admin/tournaments`);
  await page.getByText("NEW TOURNAMENT").waitFor();
  await shot(page, "list-new-tournament");
  const name = `Walkthrough race ${Date.now() % 10000}`;
  await page.getByLabel("Name").fill(name);
  await page.getByLabel(/Points race/).check();
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.waitForURL(/\/admin\/tournaments\/[0-9a-f-]{36}$/);
  const raceUrl = page.url();
  await page.getByText("PUBLISH AND SCHEDULE").waitFor();
  await shot(page, "builder-new-draft");
  const issues = (await page.locator("main").innerText()).match(/(\d+) ISSUES?/)?.[0] ?? "READY";
  say(`draft created: ${issues}`);

  // 2. The payment stage: set the address
  await page.getByRole("button", { name: /On-chain payment/ }).or(page.getByText("On-chain payment", { exact: true })).first().click();
  const addr = page.getByLabel(/devnet receiving address/i);
  await addr.waitFor();
  await shot(page, "builder-payment-stage-empty");
  await addr.fill(PAY_TO);
  await page.getByText("Settings are valid.").waitFor();
  await page.waitForTimeout(500);
  const after = (await page.locator("main").innerText()).match(/(\d+) ISSUES?|READY/)?.[0];
  say(`after setting the address: ${after}`);
  await shot(page, "builder-payment-stage-set");

  // 3. Publish and schedule (two minutes from now)
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByText("Published. Teams can now enter.").waitFor();
  say("published");
  const startInput = page.getByLabel(/Start time/);
  await startInput.waitFor();
  const start = new Date(Date.now() + 2 * 60_000);
  const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(start).replace(" ", "T");
  await startInput.fill(local);
  await shot(page, "builder-schedule");
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByText("Scheduled. The worker opens each layer on time.").waitFor();
  say(`scheduled for ${local} (confirmation shown: "${dialogs.at(-1)}")`);

  // 4. Control room: pause and resume
  await page.goto(`${raceUrl}/control`);
  await page.getByText("EMERGENCY CONTROLS").waitFor();
  await shot(page, "control-room-scheduled");
  await page.getByRole("button", { name: "Pause race" }).click();
  await page.getByPlaceholder("Reason (saved in the audit log)").fill("Walkthrough: testing pause");
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.getByRole("button", { name: "Resume" }).waitFor({ timeout: 15_000 });
  await shot(page, "control-room-paused");
  say("paused");
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.getByRole("button", { name: "Pause race" }).waitFor({ timeout: 15_000 });
  say("resumed");
  const mainText = await page.locator("main").innerText();
  say(`control room shows elimination controls: ${/Suspend eliminations|PASSED · OUT|\bOUT\b/.test(mainText) ? "YES (wrong for a points race)" : "no"}; layer names: ${/structured-outputs|onchain-payment/.test(mainText) ? "raw keys" : "titles"}`);

  // 5. Rehearsal: a second draft, then Create rehearsal
  await page.goto(`${SITE}/admin/tournaments`);
  await page.getByLabel("Name").fill(`${name} (for rehearsal)`);
  await page.getByLabel(/Points race/).check();
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.waitForURL(/\/admin\/tournaments\/[0-9a-f-]{36}$/);
  await page.getByText("On-chain payment", { exact: true }).first().click();
  await page.getByLabel(/devnet receiving address/i).fill(PAY_TO);
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByText("Draft saved.").waitFor();
  await page.getByText("REHEARSAL", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Create rehearsal" }).click();
  await page.getByText("Rehearsal created.").waitFor();
  await shot(page, "builder-rehearsal-created");
  say("rehearsal created");
  await page.getByRole("link", { name: /Open it/ }).click();
  await page.waitForURL(/\/admin\/tournaments\/[0-9a-f-]{36}$/);
  await page.getByText("FIXTURE TEAMS").waitFor();
  for (const [behaviour, label] of [["reference", "Fixture Atlas"], ["no-memory", "Fixture Borealis"], ["offline", "Fixture Ghost"]]) {
    await page.getByLabel("Behaviour").selectOption(behaviour);
    await page.getByLabel("Display name").fill(label);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByText(label).first().waitFor();
  }
  await shot(page, "rehearsal-fixtures");
  say("3 fixture teams added");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByText("Published. Teams can now enter.").waitFor();
  const soon = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(Date.now() + 60_000)).replace(" ", "T");
  await page.getByLabel(/Start time/).fill(soon);
  await page.getByRole("button", { name: "Schedule", exact: true }).click();
  await page.getByText("Scheduled. The worker opens each layer on time.").waitFor();
  say("rehearsal published and scheduled");
  await page.getByRole("link", { name: /Control room/ }).first().click();
  await page.getByText("EMERGENCY CONTROLS").waitFor();
  await page.waitForTimeout(150_000);
  await shot(page, "rehearsal-control-room-running");
  const rt = await page.locator("main").innerText();
  say(`rehearsal control room after 2.5 min: ${rt.match(/CURRENT LAYER\s+\S+/)?.[0]?.replace(/\s+/g, " ")}; passes ${rt.match(/PASSES\s+(\d+)/)?.[1] ?? "?"}`);
  console.log("dialogs:", dialogs);
} catch (e) {
  await shot(page, "FAILED").catch(() => {});
  console.log("STOPPED:", (e as Error).message.split("\n")[0]);
  console.log((await page.locator("main").innerText().catch(() => "")).slice(0, 1500));
} finally {
  await browser.close();
}
