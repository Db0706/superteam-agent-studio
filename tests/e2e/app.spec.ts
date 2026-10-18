import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { expect, test, type Page } from "@playwright/test";
import { listZipEntries } from "../../src/lib/scaffold/zip-entries";

/** Reads one entry's bytes from a ZIP (deflate or stored) with node:zlib. */
function readZipEntry(zip: Buffer, path: string): Buffer {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = zip.readUInt32LE(end + 16);
  for (let i = 0; i < zip.readUInt16LE(end + 10); i++) {
    const nameLen = zip.readUInt16LE(p + 28);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (name === path) {
      const local = zip.readUInt32LE(p + 42);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const body = zip.subarray(start, start + zip.readUInt32LE(p + 20));
      return zip.readUInt16LE(p + 10) === 8 ? inflateRawSync(body) : body;
    }
    p += 46 + nameLen + zip.readUInt16LE(p + 30) + zip.readUInt16LE(p + 32);
  }
  throw new Error(`${path} not in ZIP`);
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1120;

async function navTo(page: Page, label: string) {
  if (isMobile(page)) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label, exact: true }).click();
}

test.describe("navigation", () => {
  test("every page is reachable from the header, with active state and back/forward", async ({ page }) => {
    await page.goto("/");
    for (const [label, path, heading] of [
      ["Playground", "/playground", /Watch an agent/],
      ["Build", "/build", /Wire up your/],
      ["Inspiration", "/inspiration", /Big ideas start somewhere/],
      ["First 10 Minutes", "/start", /Your first 10 minutes/],
      ["Dashboard", "/", /Build what the internet/],
    ] as const) {
      await navTo(page, label);
      await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/$" : path}`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      if (isMobile(page)) await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
      if (isMobile(page)) await page.getByRole("button", { name: "Close menu" }).click();
    }
    await page.goBack();
    await expect(page).toHaveURL(/\/start/);
    await page.goForward();
    await expect(page).toHaveURL(/\/$/);
  });

  test("no page scrolls horizontally", async ({ page }) => {
    for (const path of ["/", "/playground", "/build", "/inspiration", "/start"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("dashboard", () => {
  test("CTAs lead to the right pages", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("main").getByRole("link", { name: "START BUILDING" }).click();
    await expect(page).toHaveURL(/\/build/);
    await page.goto("/");
    await page.getByRole("link", { name: "TRY THE PLAYGROUND" }).click();
    await expect(page).toHaveURL(/\/playground/);
  });

  test("event switch updates copy and persists in the URL", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Agent Studio · Cambridge" })).toBeVisible();
    await page.getByRole("group", { name: "Choose event" }).getByRole("button", { name: /Imperial/ }).click();
    await expect(page.getByRole("heading", { name: "Agent Studio · Imperial" })).toBeVisible();
    await expect(page).toHaveURL(/event=imperial/);
    await expect(page.getByText("Sat 6 to Sun 7 Mar 2027")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Agent Studio · Imperial" })).toBeVisible();
  });

  test("track card preselects the framework in the builder", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Start with EXPO/ }).click();
    await expect(page).toHaveURL(/fw=expo/);
    await expect(page.getByRole("button", { name: /Mobile Application/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("shows honesty labels", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("PENDING ORGANISER APPROVAL")).toBeVisible();
    await expect(page.getByText("No sponsorships or funding commitments are confirmed yet.")).toBeVisible();
    await expect(page.getByText("SAMPLE").first()).toBeVisible();
  });
});

test.describe("playground", () => {
  test("run, pause, step, reset", async ({ page }) => {
    const requests: Array<{ url: string; method: string }> = [];
    page.on("request", (r) => requests.push({ url: r.url(), method: r.method() }));
    await page.goto("/playground");
    requests.length = 0;
    await page.getByRole("button", { name: "▸ RUN" }).click();
    await expect(page.getByText(/· RUNNING/)).toBeVisible();
    await page.getByRole("button", { name: "❚❚ PAUSE" }).click();
    await expect(page.getByText(/· PAUSED/)).toBeVisible();
    const before = await page.getByRole("log").locator("> div").count();
    await page.getByRole("button", { name: "STEP ▸|" }).click();
    await expect(page.getByRole("log").locator("> div")).toHaveCount(before + 1);
    await page.getByRole("button", { name: "RESET" }).click();
    await expect(page.getByText("Agent standing by")).toBeVisible();
    await expect(page.getByText(/STEPS QUEUED/)).toBeVisible();
    // Simulation is fully client-side: nothing leaves the site and nothing is POSTed.
    // (Same-origin GETs are Next.js route prefetches for the header links.)
    const origin = new URL(page.url()).origin;
    expect(requests.filter((r) => !r.url.startsWith(origin))).toEqual([]);
    expect(requests.filter((r) => r.method !== "GET")).toEqual([]);
  });

  test("low budget declines payment and finishes with gaps", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: /LOW BUDGET/ }).click();
    const step = page.getByRole("button", { name: "STEP ▸|" });
    while (await step.isEnabled()) await step.click();
    await expect(page.getByText("Payment declined: over budget")).toBeVisible();
    await expect(page.getByText("AGENT → YOU · DONE WITH GAPS")).toBeVisible();
    await expect(page.getByText(/SPENT \$0\.30 OF \$0\.35/)).toBeVisible();
  });

  test("agent-to-agent scenario collects offers", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: /Agent Hires Agents/ }).click();
    const step = page.getByRole("button", { name: "STEP ▸|" });
    while (await step.isEnabled()) await step.click();
    await expect(page.getByText("3 agents make offers").first()).toBeVisible();
    await expect(page.getByText("Selects cymraeg-agent")).toBeVisible();
    await expect(page.getByText("AGENT → YOU · TASK COMPLETE")).toBeVisible();
  });

  test("technical inspector opens and is labelled illustrative", async ({ page }) => {
    await page.goto("/playground");
    await page.getByRole("button", { name: /TECHNICAL INSPECTOR/ }).click();
    await expect(page.getByText(/"x402Version": 2/)).toBeVisible();
    await expect(page.getByText(/Nothing is sent over the network/)).toBeVisible();
  });
});

test.describe("project builder", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/build");
    await page.getByRole("button", { name: "↺ START OVER" }).click();
  });

  test("validates the project name", async ({ page }) => {
    const input = page.getByLabel("What are you building?");
    await input.fill("9 lives");
    await expect(page.getByText("Start with a letter.")).toBeVisible();
    await expect(page.getByRole("button", { name: /GENERATE PROJECT/ })).toBeDisabled();
    await input.fill("My Cool Agent");
    await expect(page.getByText("Formatted as my-cool-agent.")).toBeVisible();
    await expect(page.getByRole("tabpanel")).toContainText("my-cool-agent/");
  });

  test("framework and capability selection update the preview", async ({ page }) => {
    await page.getByRole("button", { name: /Autonomous Agent/ }).click();
    await page.getByRole("tab", { name: "REQUIREMENTS.TXT" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("httpx");
    await expect(page.getByRole("tab", { name: "PACKAGE.JSON" })).toHaveCount(0);
    await expect(page.getByRole("switch", { name: /Wallet Connection/ })).toHaveAttribute("aria-disabled", "true");

    await page.getByRole("button", { name: /Mobile Application/ }).click();
    await expect(page.getByText("companion-server/", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: /Web Application/ }).click();
    await page.getByRole("switch", { name: /Wallet Connection/ }).click();
    await expect(page.getByRole("switch", { name: /Wallet Connection/ })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("tab", { name: "STRUCTURE" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("ConnectWallet.tsx");

    await page.getByRole("button", { name: /Autonomous Agent/ }).click();
    await expect(page.getByText(/Wallet Connection unplugged/)).toBeVisible();
    await expect(page).toHaveURL(/fw=python/);
  });

  test("downloads a real Next.js project whose files match studio.manifest.json", async ({ page }) => {
    await page.getByLabel("What are you building?").fill("Paid Research Agent");
    // Paid API switches on Payments and Spending Controls automatically.
    await page.getByRole("switch", { name: /Paid API/ }).click();
    for (const name of [/Gemini AI/, /Internet-Native Payments/, /Spending Controls/, /Paid API/]) {
      await expect(page.getByRole("switch", { name })).toHaveAttribute("aria-checked", "true");
    }
    await page.getByRole("button", { name: /GENERATE PROJECT/ }).click();
    await expect(page.getByText("Ready to download.")).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "DOWNLOAD ZIP ↓" }).click()]);
    expect(download.suggestedFilename()).toBe("paid-research-agent.zip");
    const zip = readFileSync((await download.path())!);
    const paths = listZipEntries(zip).map((e) => e.path);
    expect(paths.every((p) => p.startsWith("paid-research-agent/"))).toBe(true);

    const manifest = JSON.parse(readZipEntry(zip, "paid-research-agent/studio.manifest.json").toString("utf8"));
    expect(manifest.framework).toBe("next");
    expect(manifest.modules).toEqual(["gemini", "payments", "spending", "paidapi"]);
    expect(paths.map((p) => p.slice("paid-research-agent/".length)).sort()).toEqual(manifest.files);
    expect(paths.some((p) => /\.env(?!\.example$)/.test(p))).toBe(false);
    const env = readZipEntry(zip, "paid-research-agent/.env.example").toString("utf8");
    expect(env).toMatch(/^X402_NETWORK=solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1$/m);
    expect(env).toMatch(/^AGENT_PRIVATE_KEY=$/m);
    expect(JSON.parse(readZipEntry(zip, "paid-research-agent/package.json").toString("utf8")).name).toBe("paid-research-agent");

    await expect(page.getByText(new RegExp(`SAVED paid-research-agent\\.zip · ${manifest.files.length} FILES`))).toBeVisible();
  });

  test("shows a retryable error when the generator fails", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/scaffold", (route) =>
      ++calls === 1 ? route.fulfill({ status: 503, json: { error: "Generator is busy. Try again.", retryable: true } }) : route.fallback(),
    );
    await page.getByRole("button", { name: /GENERATE PROJECT/ }).click();
    await page.getByRole("button", { name: "DOWNLOAD ZIP ↓" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "ZIP FAILED" })).toHaveText("ZIP FAILED · Generator is busy. Try again.");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "RETRY ZIP" }).click()]);
    expect(download.suggestedFilename()).toBe("my-first-ai-agent.zip");
    await expect(page.getByRole("alert").filter({ hasText: "ZIP FAILED" })).toHaveCount(0);
    await expect(page.getByText(/^SAVED my-first-ai-agent\.zip/)).toBeVisible();
  });

  test("modules without templates stay an honest preview with no download", async ({ page }) => {
    let downloaded = false;
    page.on("download", () => (downloaded = true));
    const posts: string[] = [];
    page.on("request", (r) => r.method() === "POST" && posts.push(r.url()));
    await page.getByRole("button", { name: /Mobile Application/ }).click();
    await page.getByRole("switch", { name: /Wallet Connection/ }).click();
    await expect(page.getByText(/Preview only\. Wallet Connection has no template yet/)).toBeVisible();
    await page.getByRole("button", { name: /GENERATE PROJECT/ }).click();
    await expect(page.getByText(/CONFIGURED ·/)).toBeVisible();
    await expect(page.getByText(/Nothing has been generated or downloaded/)).toBeVisible();
    await expect(page.getByRole("button", { name: "ZIP · PREVIEW ONLY" })).toBeDisabled();
    await expect(page.getByText("GEMINI_API_KEY", { exact: true })).toBeVisible();
    expect(downloaded).toBe(false);
    expect(posts).toEqual([]);
    await page.getByRole("button", { name: "EDIT" }).click();
    await expect(page.getByRole("button", { name: /GENERATE PROJECT/ })).toBeVisible();
  });

  test("never asks for credentials", async ({ page }) => {
    await expect(page.locator("input[type=password]")).toHaveCount(0);
    await expect(page.locator("input")).toHaveCount(1);
  });
});

test.describe("inspiration", () => {
  test("surprise me, filters, empty state, history", async ({ page }) => {
    await page.goto("/inspiration");
    const title = page.locator("#idea-title");
    const first = await title.textContent();
    await page.getByRole("button", { name: /SURPRISE ME/ }).click();
    await expect(title).not.toHaveText(first!);
    await expect(page.getByRole("region", { name: "Recently explored" }).getByRole("button")).toHaveCount(1);

    await page.getByLabel("INDUSTRY").selectOption("Legal");
    await expect(page.getByText(/10 OF 250 IDEAS MATCH/)).toBeVisible();
    await expect(page.locator("article").first()).toContainText("LEGAL");

    await page.getByLabel("DIFFICULTY").selectOption("Advanced");
    await page.getByLabel("APPLICATION TYPE").selectOption("Mobile app");
    await page.getByLabel("TRACK").selectOption("Autonomous Agents");
    await expect(page.getByText("No ideas match every filter.")).toBeVisible();
    await page.getByRole("button", { name: "CLEAR FILTERS", exact: true }).click();
    await expect(page.getByText(/250 OF 250 IDEAS MATCH/)).toBeVisible();
  });

  test("space bar shuffles", async ({ page }) => {
    await page.goto("/inspiration");
    const title = page.locator("#idea-title");
    const first = await title.textContent();
    await page.locator("h1").click();
    await page.keyboard.press("Space");
    await expect(title).not.toHaveText(first!);
  });

  test("has no build-this shortcut", async ({ page }) => {
    await page.goto("/inspiration");
    await expect(page.getByRole("button", { name: /build this|generate/i })).toHaveCount(0);
  });
});

test.describe("first 10 minutes guide", () => {
  test("switches framework, keeps it in the URL and links to a ready Builder", async ({ page }) => {
    await page.goto("/start");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Your first 10 minutes/);
    await expect(page.getByText("$ npm run keygen -- --pay-to")).toBeVisible();

    await page.getByRole("group", { name: "Framework" }).getByRole("button", { name: /Autonomous Agent/ }).click();
    await expect(page).toHaveURL(/fw=python/);
    await expect(page.getByText("$ python -m agent keygen --pay-to")).toBeVisible();

    await page.reload();
    await expect(page.getByText("$ python -m agent buy")).toBeVisible();

    await page.getByRole("link", { name: /Open Build, ready to download/ }).click();
    await expect(page).toHaveURL(/\/build\?.*fw=python/);
    await expect(page.getByRole("switch", { name: /Paid API/ })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: /GENERATE PROJECT/ }).click();
    await expect(page.getByRole("button", { name: "DOWNLOAD ZIP ↓" })).toBeEnabled();
  });
});
