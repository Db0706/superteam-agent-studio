import { effectiveOutcome, type Advancement, type LayerConfig, type TournamentConfig } from "./config";

/**
 * Advancement decisions for one layer. Pure and deterministic: given the same attempts it
 * always produces the same decisions, so a retried finalisation can never disagree with itself.
 *
 * Fairness rules implemented here (also in docs/TOURNAMENT_RULES.md):
 *  - Only attempts submitted before the deadline are passed in (the caller filters by the
 *    server timestamp). Late verification of an on-time attempt still counts.
 *  - A participant with any passing attempt passes, whatever else happened.
 *  - A participant whose best outcome is still pending (queued/running), an infrastructure
 *    error, or awaiting human review is *blocked*: no decision is made for anyone until an
 *    organiser resolves it, because ranking needs everyone's result.
 *  - Ties are broken by the tournament's published order, then by participant id.
 */

export type AttemptStatus = "queued" | "running" | "passed" | "failed" | "error" | "review_required";

export interface AttemptSummary {
  id: string;
  status: AttemptStatus;
  score: number | null;
  /** Server timestamp, ISO. */
  submittedAt: string;
  attemptNo: number;
}

export interface ParticipantInput {
  id: string;
  name: string;
  state: "registered" | "active" | "qualified" | "eliminated" | "completed" | "withdrawn";
  attempts: AttemptSummary[];
}

export type DecisionKind = "qualified" | "eliminated" | "checkpoint_passed" | "checkpoint_missed";

export interface Decision {
  participantId: string;
  decision: DecisionKind;
  reason: string;
  bestAttemptId: string | null;
  score: number | null;
  rank: number | null;
}

export type AdvancementResult =
  | { status: "decided"; decisions: Decision[] }
  | { status: "blocked"; waitingOn: { participantId: string; name: string; why: "pending" | "error" | "review" }[] };

interface Evaluated {
  p: ParticipantInput;
  passed: boolean;
  best: AttemptSummary | null;
  firstPass: AttemptSummary | null;
}

const isPassing = (a: AttemptSummary, passingScore: number) => a.status === "passed" && (a.score ?? 0) >= passingScore;

function evaluate(p: ParticipantInput, passingScore: number): Evaluated | { blocked: "pending" | "error" | "review" } {
  const sorted = [...p.attempts].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt) || a.attemptNo - b.attemptNo);
  const passing = sorted.filter((a) => isPassing(a, passingScore));
  if (passing.length) {
    const best = [...passing].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.submittedAt.localeCompare(b.submittedAt))[0];
    return { p, passed: true, best, firstPass: passing[0] };
  }
  if (sorted.some((a) => a.status === "queued" || a.status === "running")) return { blocked: "pending" };
  if (sorted.some((a) => a.status === "review_required")) return { blocked: "review" };
  if (sorted.some((a) => a.status === "error")) return { blocked: "error" };
  const scored = sorted.filter((a) => a.score !== null);
  const best = scored.length ? [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] : (sorted.at(-1) ?? null);
  return { p, passed: false, best, firstPass: null };
}

function compare(order: TournamentConfig["tieBreak"]) {
  return (a: Evaluated, b: Evaluated): number => {
    for (const key of order) {
      let d = 0;
      if (key === "score_desc") d = (b.best?.score ?? -1) - (a.best?.score ?? -1);
      else if (key === "first_pass_at_asc") d = (a.firstPass?.submittedAt ?? "~").localeCompare(b.firstPass?.submittedAt ?? "~");
      else if (key === "attempts_asc") d = (a.firstPass?.attemptNo ?? Infinity) - (b.firstPass?.attemptNo ?? Infinity);
      else if (key === "submitted_at_asc") d = (a.best?.submittedAt ?? "~").localeCompare(b.best?.submittedAt ?? "~");
      if (d !== 0 && !Number.isNaN(d)) return d;
    }
    return a.p.id.localeCompare(b.p.id);
  };
}

function quota(adv: Advancement, competing: number): number {
  if (adv.kind === "top_n") return adv.n;
  if (adv.kind === "top_percent") return Math.max(1, Math.ceil((adv.percent / 100) * competing));
  return Infinity;
}

export function decideLayer(input: {
  config: Pick<TournamentConfig, "mode" | "tieBreak">;
  layer: Pick<LayerConfig, "outcome" | "advancement" | "passingScore" | "title">;
  eliminationsSuspended: boolean;
  participants: ParticipantInput[];
}): AdvancementResult {
  const { config, layer } = input;
  const competing = input.participants.filter((p) => p.state === "active" || p.state === "qualified");

  const evaluated: Evaluated[] = [];
  const waitingOn: { participantId: string; name: string; why: "pending" | "error" | "review" }[] = [];
  for (const p of competing) {
    const e = evaluate(p, layer.passingScore);
    if ("blocked" in e) waitingOn.push({ participantId: p.id, name: p.name, why: e.blocked });
    else evaluated.push(e);
  }
  if (waitingOn.length) return { status: "blocked", waitingOn };

  const outcome = effectiveOutcome(config.mode, layer);
  const ranked = [...evaluated].sort(compare(config.tieBreak));
  const passingRanked = ranked.filter((e) => e.passed);
  const rankOf = new Map(passingRanked.map((e, i) => [e.p.id, i + 1]));
  const limit = quota(layer.advancement, competing.length);

  const decisions: Decision[] = ranked.map((e) => {
    const rank = rankOf.get(e.p.id) ?? null;
    const base = { participantId: e.p.id, bestAttemptId: e.best?.id ?? null, score: e.best?.score ?? null, rank };
    if (outcome === "checkpoint") {
      return e.passed
        ? { ...base, decision: "checkpoint_passed", reason: `Passed ${layer.title}.` }
        : { ...base, decision: "checkpoint_missed", reason: e.best ? `No passing attempt for ${layer.title} before the deadline.` : `No attempt for ${layer.title} before the deadline.` };
    }
    const advances = e.passed && rank !== null && rank <= limit;
    if (advances) return { ...base, decision: "qualified", reason: limit === Infinity ? `Passed ${layer.title}.` : `Ranked ${rank} of ${passingRanked.length} passing; top ${limit} advance.` };
    const why = !e.passed
      ? e.best
        ? `No passing attempt for ${layer.title} before the deadline.`
        : `No attempt for ${layer.title} before the deadline.`
      : `Passed ${layer.title} but ranked ${rank}; only the top ${limit} advance.`;
    if (input.eliminationsSuspended) return { ...base, decision: "checkpoint_missed", reason: `${why} Eliminations were suspended by the organisers.` };
    return { ...base, decision: "eliminated", reason: why };
  });

  return { status: "decided", decisions };
}
