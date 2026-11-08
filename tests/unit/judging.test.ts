import { describe, expect, it } from "vitest";
import { planAssignments, rankSubmissions, rubricIssues, weightedScore, type RubricCriterion } from "@/core/judging/results";

const C: RubricCriterion[] = [
  { key: "impact", name: "Impact", description: "", weight: 60, max: 10 },
  { key: "execution", name: "Execution", description: "", weight: 40, max: 5 },
];

describe("judging results", () => {
  it("weights each criterion by its max", () => {
    expect(weightedScore(C, { impact: 10, execution: 5 })).toBe(100);
    expect(weightedScore(C, { impact: 5, execution: 0 })).toBe(30);
    expect(weightedScore(C, { impact: 50 })).toBe(60);
  });

  it("ranks by mean of final scores only", () => {
    const r = rankSubmissions(C, ["a", "b", "c"], [
      { submissionId: "a", final: true, scores: { impact: 6, execution: 5 } },
      { submissionId: "a", final: true, scores: { impact: 10, execution: 5 } },
      { submissionId: "b", final: true, scores: { impact: 10, execution: 5 } },
      { submissionId: "c", final: false, scores: { impact: 10, execution: 5 } },
    ]);
    expect(r.map((x) => x.submissionId)).toEqual(["b", "a", "c"]);
    expect(r[1].weighted).toBe(88);
    expect(r[1].spread).toBe(24);
    expect(r[2].weighted).toBeNull();
  });

  it("explains rubric problems", () => {
    expect(rubricIssues(C)).toEqual([]);
    expect(rubricIssues([{ ...C[0], weight: 10 }, C[1]])[0]).toMatch(/50/);
    expect(rubricIssues([C[0], { ...C[1], key: "impact" }])).toContain("Criterion keys must be unique.");
  });

  it("spreads judges evenly and respects existing assignments", () => {
    const plan = planAssignments(["s1", "s2", "s3"], ["j1", "j2", "j3"], [{ submissionId: "s1", judgeId: "j1" }], 2);
    expect(plan).toHaveLength(5);
    const load = (j: string) => plan.filter((p) => p.judgeId === j).length + (j === "j1" ? 1 : 0);
    expect(Math.max(load("j1"), load("j2"), load("j3")) - Math.min(load("j1"), load("j2"), load("j3"))).toBeLessThanOrEqual(1);
    expect(plan.some((p) => p.submissionId === "s1" && p.judgeId === "j1")).toBe(false);
    expect(planAssignments(["s1"], ["j1"], [], 3)).toEqual([{ submissionId: "s1", judgeId: "j1" }]);
  });
});
