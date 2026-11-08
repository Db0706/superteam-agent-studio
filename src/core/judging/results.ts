export interface RubricCriterion {
  key: string;
  name: string;
  description: string;
  weight: number;
  max: number;
}

export interface ScoreRow {
  submissionId: string;
  final: boolean;
  scores: Record<string, number>;
}

export interface SubmissionResult {
  submissionId: string;
  /** Weighted score out of 100, averaged over judges who submitted final scores. Null if none have. */
  weighted: number | null;
  finalCount: number;
  perCriterion: Record<string, number | null>;
  /** Largest gap between two judges' weighted scores; a hint that judges disagree. */
  spread: number;
}

/** One judge's weighted score out of 100. Missing criteria count as zero. */
export function weightedScore(criteria: RubricCriterion[], scores: Record<string, number>): number {
  return criteria.reduce((sum, c) => sum + (Math.max(0, Math.min(c.max, scores[c.key] ?? 0)) / c.max) * c.weight, 0);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Ranks submissions by the mean of judges' final weighted scores. Draft scores never count. */
export function rankSubmissions(criteria: RubricCriterion[], submissionIds: string[], rows: ScoreRow[]): SubmissionResult[] {
  const results = submissionIds.map((id) => {
    const finals = rows.filter((r) => r.submissionId === id && r.final);
    const each = finals.map((r) => weightedScore(criteria, r.scores));
    const perCriterion = Object.fromEntries(
      criteria.map((c) => [c.key, finals.length ? round1(finals.reduce((a, r) => a + (r.scores[c.key] ?? 0), 0) / finals.length) : null]),
    );
    return {
      submissionId: id,
      weighted: each.length ? round1(each.reduce((a, b) => a + b, 0) / each.length) : null,
      finalCount: finals.length,
      perCriterion,
      spread: each.length > 1 ? round1(Math.max(...each) - Math.min(...each)) : 0,
    };
  });
  return results.sort((a, b) => (b.weighted ?? -1) - (a.weighted ?? -1) || b.finalCount - a.finalCount);
}

export function rubricIssues(criteria: RubricCriterion[]): string[] {
  const issues: string[] = [];
  if (!criteria.length) issues.push("Add at least one criterion.");
  const total = criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0);
  if (total !== 100) issues.push(`Weights add up to ${total}, not 100.`);
  const keys = criteria.map((c) => c.key);
  if (new Set(keys).size !== keys.length) issues.push("Criterion keys must be unique.");
  if (criteria.some((c) => !/^[a-z][a-z0-9_]{0,39}$/.test(c.key))) issues.push("Keys use lowercase letters, digits and underscores.");
  if (criteria.some((c) => !c.name.trim())) issues.push("Every criterion needs a name.");
  if (criteria.some((c) => !(c.max >= 1 && c.max <= 100))) issues.push("Max scores are between 1 and 100.");
  if (criteria.some((c) => !(c.weight > 0))) issues.push("Weights must be positive.");
  return issues;
}

/**
 * Spreads judges over submissions so each gets `perSubmission` judges, keeping loads even.
 * Existing assignments and declared conflicts are respected.
 */
export function planAssignments(
  submissionIds: string[],
  judgeIds: string[],
  existing: { submissionId: string; judgeId: string }[],
  perSubmission: number,
): { submissionId: string; judgeId: string }[] {
  const load = new Map(judgeIds.map((j) => [j, existing.filter((e) => e.judgeId === j).length]));
  const plan: { submissionId: string; judgeId: string }[] = [];
  for (const sub of submissionIds) {
    const have = new Set(existing.filter((e) => e.submissionId === sub).map((e) => e.judgeId));
    while (have.size < perSubmission) {
      const pick = judgeIds.filter((j) => !have.has(j)).sort((a, b) => (load.get(a)! - load.get(b)!) || a.localeCompare(b))[0];
      if (!pick) break;
      have.add(pick);
      load.set(pick, load.get(pick)! + 1);
      plan.push({ submissionId: sub, judgeId: pick });
    }
  }
  return plan;
}
