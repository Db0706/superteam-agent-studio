import { describe, expect, it } from "vitest";
import { buildSteps, chooseOffer, taskTotalCents } from "@/lib/simulation/engine";
import { activeBlockFor, httpBlocks, paymentRequired } from "@/lib/simulation/http";
import { initialPlayback, playbackReducer, statusOf, type PlaybackState } from "@/lib/simulation/machine";
import { SCENARIOS, SCENARIO_ORDER } from "@/lib/simulation/scenarios";

const done = (s: ReturnType<typeof buildSteps>) => s[s.length - 1];

describe("buildSteps", () => {
  it("is deterministic", () => {
    for (const scenario of SCENARIO_ORDER) {
      expect(buildSteps({ scenario, budget: 1, serviceDown: false })).toEqual(buildSteps({ scenario, budget: 1, serviceDown: false }));
    }
  });

  it.each(SCENARIO_ORDER)("%s completes within the default budget", (scenario) => {
    const steps = buildSteps({ scenario, budget: 1, serviceDown: false });
    expect(steps[0].kind).toBe("user");
    expect(done(steps)).toMatchObject({ kind: "done", gaps: 0, title: "TASK COMPLETE" });
    expect(done(steps).spentCents).toBe(taskTotalCents(scenario));
    expect(steps.filter((s) => s.kind === "paid")).toHaveLength(2);
  });

  it.each(SCENARIO_ORDER)("%s never overspends on LOW BUDGET", (scenario) => {
    const budget = SCENARIOS[scenario].low;
    const steps = buildSteps({ scenario, budget, serviceDown: false });
    expect(done(steps).gaps).toBeGreaterThan(0);
    expect(done(steps).spentCents).toBeLessThanOrEqual(Math.round(budget * 100));
    expect(steps.some((s) => s.kind === "error")).toBe(true);
  });

  it("never exceeds any budget on the slider", () => {
    for (const scenario of SCENARIO_ORDER) {
      for (let c = 5; c <= 200; c += 5) {
        const steps = buildSteps({ scenario, budget: c / 100, serviceDown: false });
        steps.forEach((s) => expect(s.spentCents).toBeLessThanOrEqual(c));
      }
    }
  });

  it("SERVICE DOWN fails the second service with 503 and spends nothing on it", () => {
    const steps = buildSteps({ scenario: "research", budget: 1, serviceDown: true });
    const err = steps.find((s) => s.kind === "error")!;
    expect(err.detail).toContain("503");
    expect(done(steps)).toMatchObject({ gaps: 1, spentCents: 30, paid: 1 });
  });

  it("stage indices stay within 0-5 and drive the flow", () => {
    const steps = buildSteps({ scenario: "travel", budget: 1, serviceDown: false });
    expect(steps.every((s) => s.stage >= 0 && s.stage <= 5)).toBe(true);
    expect(done(steps).stage).toBe(5);
  });

  it("labels the outcome as simulated", () => {
    expect(done(buildSteps({ scenario: "travel", budget: 1, serviceDown: false })).detail).toContain("SIMULATED");
  });
});

describe("agent-to-agent offers", () => {
  const welsh = SCENARIOS.hire.services[0];
  it("picks the best-rated offer that fits an even share", () => {
    expect(chooseOffer(welsh, 100, 2).offer?.agent).toBe("cymraeg-agent");
    expect(chooseOffer(welsh, 50, 2).offer?.agent).toBe("polyglot-bot");
  });
  it("never picks an offer below the quality bar", () => {
    const c = chooseOffer(welsh, 20, 1);
    expect(c.offer).toBeNull();
  });
  it("includes an offer step and a selection step", () => {
    const kinds = buildSteps({ scenario: "hire", budget: 1, serviceDown: false }).map((s) => s.kind);
    expect(kinds).toContain("offer");
    expect(kinds.filter((k) => k === "paid")).toHaveLength(2);
  });
});

describe("playback state machine", () => {
  const steps = buildSteps({ scenario: "research", budget: 1, serviceDown: false });
  const total = steps.length;

  it("idle → running → paused → running → completed", () => {
    let s: PlaybackState = initialPlayback;
    expect(statusOf(s, steps)).toBe("idle");
    s = playbackReducer(s, { type: "run", total });
    expect(statusOf(s, steps)).toBe("running");
    s = playbackReducer(s, { type: "tick", total });
    s = playbackReducer(s, { type: "pause" });
    expect(statusOf(s, steps)).toBe("paused");
    expect(playbackReducer(s, { type: "tick", total })).toBe(s);
    s = playbackReducer(s, { type: "run", total });
    while (s.running) s = playbackReducer(s, { type: "tick", total });
    expect(s.index).toBe(total - 1);
    expect(statusOf(s, steps)).toBe("completed");
  });

  it("step advances one at a time and stops at the end", () => {
    let s = initialPlayback;
    for (let i = 0; i < total + 5; i++) s = playbackReducer(s, { type: "step", total });
    expect(s).toEqual({ index: total - 1, running: false });
  });

  it("run again restarts from the first step; reset returns to idle", () => {
    const end = { index: total - 1, running: false };
    expect(playbackReducer(end, { type: "run", total })).toEqual({ index: 0, running: true });
    expect(playbackReducer(end, { type: "reset" })).toEqual(initialPlayback);
  });

  it("reports failed when the run finishes with gaps", () => {
    const low = buildSteps({ scenario: "research", budget: 0.35, serviceDown: false });
    expect(statusOf({ index: low.length - 1, running: false }, low)).toBe("failed");
  });
});

describe("technical inspector", () => {
  const call = { service: "X", host: "api.example", path: "/v1/x?y=1", priceCents: 5 };
  it("encodes amount in USDC atomic units (6 decimals)", () => {
    expect(paymentRequired(call).accepts[0].amount).toBe("50000");
    expect(paymentRequired(call).x402Version).toBe(2);
  });
  it("never fabricates signatures or receipts", () => {
    const code = httpBlocks(call).map((b) => b.code).join("\n");
    expect(code).toContain("not generated here");
    expect(code).toContain("simulated");
  });
  it("maps steps to blocks", () => {
    expect([activeBlockFor("service"), activeBlockFor("payreq"), activeBlockFor("paid"), activeBlockFor("result"), activeBlockFor("agent")]).toEqual([0, 1, 2, 3, -1]);
  });
});
