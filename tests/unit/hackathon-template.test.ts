import { describe, expect, it } from "vitest";
import { parseTournamentConfig } from "@/core/tournament/config";
import { hackathonTemplate } from "@/core/tournament/templates";
import { validateVerifierConfig } from "@/core/verification/catalogue";

const PAY_TO = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const ONCHAIN = { programId: "B3aSCgNhYqukoMrhsUa6tWctG8rhqMJBqC6mKAbE2eV8", credMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", presentationAccount: "G5Tu25otWo8kTaSACmTvx68YMoj6e6stn2ad7TM19VvZ", salt: "bureau-salt" };
const valid = (cfg: ReturnType<typeof hackathonTemplate>) =>
  parseTournamentConfig(cfg).ok && cfg.layers.every((l) => validateVerifierConfig(l.verifier.plugin, l.verifier.config).ok);

describe("hackathon template", () => {
  it("matches the published points slide: 1,300 build + 700 AI challenges unlocking in order, all race", () => {
    const sprint = 7 * 3600;
    const cfg = hackathonTemplate({ sprintSeconds: sprint, challengeSet: "ai", challengeOffsetSeconds: 0, challengeWindowSeconds: sprint, payTo: PAY_TO });
    expect(valid(cfg)).toBe(true);
    const build = cfg.layers.filter((l) => l.category === "build_stage");
    expect(build.map((l) => [l.title, l.points])).toEqual([
      ["Idea locked in", 50], ["App live", 150], ["AI feature working", 200], ["Agent uses tools", 300], ["Agentic end-to-end payment", 400], ["Submitted", 200],
    ]);
    const ch = cfg.layers.filter((l) => l.category === "challenge");
    expect(ch.map((l) => [l.title, l.points, l.prerequisites])).toEqual([
      ["Structured Outputs", 50, []], ["External Knowledge", 100, ["structured-outputs"]], ["Memory and Context", 100, ["external-knowledge"]],
      ["Reliability", 100, ["memory-context"]], ["Autonomous Workflow", 150, ["reliability"]], ["Final Mission", 200, ["autonomous-workflow"]],
    ]);
    expect(cfg.layers.reduce((a, l) => a + l.points, 0)).toBe(2000);
    expect(cfg.layers.every((l) => l.timing.offsetSeconds === 0 && l.timing.durationSeconds === sprint && l.outcome === "checkpoint")).toBe(true);
  });

  it("both parts: 6 on-chain tiers in the challenge window (tiers chained), 6 build stages all sprint", () => {
    const cfg = hackathonTemplate({ sprintSeconds: 7 * 3600, challengeOffsetSeconds: 20 * 60, challengeWindowSeconds: 2 * 3600, payTo: PAY_TO, onchain: ONCHAIN });
    expect(cfg.mode).toBe("checkpoint");
    const ch = cfg.layers.filter((l) => l.category === "challenge");
    expect(ch.map((l) => [l.key, l.points, l.prerequisites])).toEqual([
      ["operation-1", 30, []], ["operation-2", 50, ["operation-1"]], ["operation-3", 70, ["operation-2"]],
      ["minesweeper-1", 90, []], ["minesweeper-2", 80, ["minesweeper-1"]], ["minesweeper-3", 30, ["minesweeper-2"]],
    ]);
    expect(ch.reduce((a, l) => a + l.points, 0)).toBe(350);
    expect(ch.every((l) => l.verifier.plugin === "bureau.chain" && l.timing.offsetSeconds === 20 * 60 && l.timing.durationSeconds === 2 * 3600)).toBe(true);
    expect(ch[0].instructions).toContain(ONCHAIN.programId);
    const st = cfg.layers.filter((l) => l.category === "build_stage");
    expect(st).toHaveLength(6);
    expect(st.every((l) => l.timing.offsetSeconds === 0 && l.timing.durationSeconds === 7 * 3600)).toBe(true);
    expect(valid(cfg)).toBe(true);
  });

  it("challenges only, or build stages only", () => {
    const onlyChallenges = hackathonTemplate({ buildStages: false, onchain: ONCHAIN });
    expect(onlyChallenges.layers.every((l) => l.category === "challenge")).toBe(true);
    expect(valid(onlyChallenges)).toBe(true);
    const onlyStages = hackathonTemplate({ bonusChallenges: false, payTo: PAY_TO });
    expect(onlyStages.layers.every((l) => l.category === "build_stage")).toBe(true);
    expect(valid(onlyStages)).toBe(true);
  });

  it("needs the devnet address for the payment stage and real constants for the challenges", () => {
    expect(valid(hackathonTemplate({ onchain: ONCHAIN }))).toBe(false);
    expect(valid(hackathonTemplate({ buildStages: false }))).toBe(false);
  });

  it("never lets the challenge window run past the end", () => {
    const cfg = hackathonTemplate({ sprintSeconds: 3600, challengeWindowSeconds: 5 * 3600, buildStages: false, onchain: ONCHAIN });
    expect(cfg.layers.every((l) => l.timing.durationSeconds === 3600)).toBe(true);
  });
});
