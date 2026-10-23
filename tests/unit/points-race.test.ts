import { describe, expect, it } from "vitest";
import { parseTournamentConfig } from "@/core/tournament/config";
import { BUILD_STAGES, pointsRaceTemplate } from "@/core/tournament/templates";
import { validateVerifierConfig } from "@/core/verification/catalogue";

describe("points race template", () => {
  const cfg = pointsRaceTemplate({ sprintSeconds: 7 * 3600, challengeIntervalSeconds: 45 * 60 });

  it("is a checkpoint race: challenges in timed windows, build stages open all sprint", () => {
    expect(cfg.mode).toBe("checkpoint");
    const challenges = cfg.layers.filter((l) => l.category === "challenge");
    const stages = cfg.layers.filter((l) => l.category === "build_stage");
    expect(stages.map((l) => l.key)).toEqual(BUILD_STAGES.map((l) => l.key));
    expect(stages.every((l) => l.timing.offsetSeconds === 0 && l.timing.durationSeconds === 7 * 3600)).toBe(true);
    expect(challenges.map((l) => l.timing.offsetSeconds)).toEqual(challenges.map((_, i) => i * 45 * 60));
    expect(challenges.every((l) => l.timing.offsetSeconds + l.timing.durationSeconds <= 7 * 3600)).toBe(true);
    // Challenges come first so each finalises when its window ends.
    expect(cfg.layers.findIndex((l) => l.category === "build_stage")).toBe(challenges.length);
  });

  it("gives every layer points and repeats no verifier between stages and challenges", () => {
    expect(cfg.layers.every((l) => l.points > 0)).toBe(true);
    expect(cfg.layers.every((l) => l.prerequisites.length === 0)).toBe(true);
    const keys = cfg.layers.map((l) => l.key);
    expect(keys).not.toContain("first-intelligence");
    expect(keys).not.toContain("tool-calling");
  });

  it("parses, but the payment stage needs the organiser's receiving address", () => {
    expect(parseTournamentConfig(cfg).ok).toBe(true);
    const pay = cfg.layers.find((l) => l.key === "onchain-payment")!;
    expect(validateVerifierConfig(pay.verifier.plugin, pay.verifier.config).ok).toBe(false);
    expect(validateVerifierConfig(pay.verifier.plugin, { ...pay.verifier.config, payTo: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM" }).ok).toBe(true);
  });
});
