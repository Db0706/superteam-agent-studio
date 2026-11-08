/**
 * Server configuration for the verification engine. Read once, validated, never sent to browsers.
 * See docs/ENVIRONMENT.md for every variable.
 */
export interface EngineEnv {
  /** Public base URL of this platform: tools in tasks point at {challengeBaseUrl}/api/race/challenge/... */
  challengeBaseUrl: string;
  /** HMAC key for verification receipts. */
  receiptKey: string;
  /** Secret that seeds per-attempt hidden test data. */
  seedSecret: string;
  /** Development/test only: allow participant URLs on localhost/private networks. */
  allowPrivateTargets: boolean;
  /** Platform secret used to derive fixture-app verifier tokens in rehearsals. */
  fixtureSecret: string;
}

export function engineEnv(env: NodeJS.ProcessEnv = process.env): EngineEnv {
  const production = env.NODE_ENV === "production" && env.AGENT_STUDIO_ENV !== "test";
  const need = (key: string, devDefault: string) => {
    const v = env[key];
    if (v && v.length >= 16) return v;
    if (production) throw new Error(`${key} must be set (at least 16 characters) in production.`);
    return devDefault;
  };
  const allowPrivate = env.VERIFIER_ALLOW_PRIVATE_TARGETS === "true";
  if (allowPrivate && production && env.AGENT_STUDIO_ENV !== "rehearsal-local") {
    throw new Error("VERIFIER_ALLOW_PRIVATE_TARGETS must not be enabled in production.");
  }
  return {
    challengeBaseUrl: (env.CHALLENGE_BASE_URL ?? env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100").replace(/\/+$/, ""),
    receiptKey: need("RECEIPT_SIGNING_KEY", "dev-receipt-key-not-for-production"),
    seedSecret: need("VERIFIER_SEED_SECRET", "dev-seed-secret-not-for-production"),
    allowPrivateTargets: allowPrivate,
    fixtureSecret: need("FIXTURE_SECRET", "dev-fixture-secret-not-for-production"),
  };
}
