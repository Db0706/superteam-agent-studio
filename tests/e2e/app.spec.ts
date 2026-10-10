import { expect, test, type Page } from "@playwright/test";

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
    await expect(page).toHaveURL(/\/inspiration/);
    await page.goForward();
    await expect(page).toHaveURL(/\/$/);
  });

  test("no page scrolls horizontally", async ({ page }) => {
    for (const path of ["/", "/playground", "/build", "/inspiration"]) {
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
    await page.getByRole("switch", { name: /Wallet Connection/ }).click();
    await expect(page.getByRole("switch", { name: /Wallet Connection/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("companion-server/", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "STRUCTURE" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("ConnectWallet.tsx");

    await page.getByRole("button", { name: /Autonomous Agent/ }).click();
    await expect(page.getByText(/Wallet Connection unplugged/)).toBeVisible();
    await expect(page).toHaveURL(/fw=python/);
  });

  test("generate shows an honest preview and no download", async ({ page }) => {
    let downloaded = false;
    page.on("download", () => (downloaded = true));
    await page.getByRole("button", { name: /GENERATE PROJECT/ }).click();
    await expect(page.getByText(/CONFIGURED ·/)).toBeVisible();
    await expect(page.getByText("Generator integration coming next.")).toBeVisible();
    await expect(page.getByText(/Nothing has been generated or downloaded/)).toBeVisible();
    await expect(page.getByRole("button", { name: "ZIP · SOON" })).toBeDisabled();
    await expect(page.getByText("GEMINI_API_KEY", { exact: true })).toBeVisible();
    expect(downloaded).toBe(false);
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
