/**
 * A team's Challenge ID for the on-chain challenges: "T-" plus the first 8 hex characters of the
 * team's id. Short (the program allows 16 characters), stable and unique in practice, and needs
 * no storage: the team page shows it and the verifier derives the same value.
 */
export function challengeIdFor(teamId: string): string {
  return `T-${teamId.replace(/-/g, "").slice(0, 8).toLowerCase()}`;
}
