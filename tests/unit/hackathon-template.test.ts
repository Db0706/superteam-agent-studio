import { describe, expect, it } from "vitest";
import { parseTournamentConfig } from "@/core/tournament/config";
import { hackathonTemplate } from "@/core/tournament/templates";
import { validateVerifierConfig } from "@/core/verification/catalogue";

const PAY_TO = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const valid = (cfg: ReturnType<typeof hackathonTemplate>) =>
  parseTournamentConfig(cfg).ok && cfg.layers.every((l) => validateVerifierConfig(l.verifier.plugin, l.verifier.config).ok);

describe("hackathon template", () => {
  it("both parts: 4 bonus challenges open together for the window, 6 build stages all sprint", () => {
    const cfg = hackathonTemplate({ sprintSeconds: 7 * 3600, challengeWindowSeconds: 2 * 3600, payTo: PAY_TO });
    expect(cfg.mode).toBe("checkpoint");
    const ch = cfg.layers.filter((l) => l.category === "challenge");
    expect(ch.map((l) => [l.title, l.points])).toEqual([["Quick Draw", 100], ["Look It Up", 150], ["Remember Me", 175], ["Shop Run", 225]]);
    expect(ch.every((l) => l.timing.offsetSeconds === 0 && l.timing.durationSeconds === 2 * 3600 && l.prerequisites.length === 0)).toBe(true);
    const st = cfg.layers.filter((l) => l.category === "build_stage");
    expect(st).toHaveLength(6);
    expect(st.every((l) => l.timing.offsetSeconds === 0 && l.timing.durationSeconds === 7 * 3600)).toBe(true);
    expect(valid(cfg)).toBe(true);
  });

  it("challenges only, or build stages only", () => {
    const onlyChallenges = hackathonTemplate({ buildStages: false });
    expect(onlyChallenges.layers.map((l) => l.category)).toEqual(["challenge", "challenge", "challenge", "challenge"]);
    expect(valid(onlyChallenges)).toBe(true);
    const onlyStages = hackathonTemplate({ bonusChallenges: false, payTo: PAY_TO });
    expect(onlyStages.layers.every((l) => l.category === "build_stage")).toBe(true);
    expect(valid(onlyStages)).toBe(true);
  });

  it("needs the devnet address when the payment stage is on", () => {
    expect(valid(hackathonTemplate({}))).toBe(false);
  });

  it("never lets the challenge window run past the end", () => {
    const cfg = hackathonTemplate({ sprintSeconds: 3600, challengeWindowSeconds: 5 * 3600, buildStages: false });
    expect(cfg.layers.every((l) => l.timing.durationSeconds === 3600)).toBe(true);
  });
});
