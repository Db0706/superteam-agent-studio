import { effectiveOutcome, type LayerConfig, type TournamentConfig } from "./config";

/**
 * Entry stays open once the race is running as long as no eliminating layer has been decided, so
 * a late team can't skip a cut it never faced. Points races (checkpoint) never eliminate, so teams
 * that form during the sprint can always join. Mirrors join_tournament in the database.
 */
export function entryOpen(status: string, config: Pick<TournamentConfig, "mode">, layers: { state: string; config: Pick<LayerConfig, "outcome"> }[]): boolean {
  if (status === "published" || status === "scheduled") return true;
  if (status !== "running" && status !== "paused") return false;
  return !layers.some((l) => (l.state === "finalising" || l.state === "closed") && effectiveOutcome(config.mode, l.config) === "eliminate");
}
