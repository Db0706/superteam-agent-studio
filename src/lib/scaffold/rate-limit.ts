/**
 * Fixed-window rate limiter kept in memory. Per server instance, so it is an
 * abuse brake, not a quota: a per-client limit plus a global cap that also
 * bounds clients who rotate or spoof their address.
 */
export interface RateLimiterOptions {
  perClient: number;
  global: number;
  windowMs: number;
  now?: () => number;
}

export type RateDecision = { ok: true } | { ok: false; retryAfterSec: number };

export function createRateLimiter({ perClient, global, windowMs, now = Date.now }: RateLimiterOptions) {
  let windowStart = now();
  let total = 0;
  const hits = new Map<string, number>();

  return {
    take(client: string): RateDecision {
      const t = now();
      if (t - windowStart >= windowMs) {
        windowStart = t;
        total = 0;
        hits.clear();
      }
      const retryAfterSec = Math.max(1, Math.ceil((windowStart + windowMs - t) / 1000));
      const mine = hits.get(client) ?? 0;
      if (mine >= perClient || total >= global) return { ok: false, retryAfterSec };
      hits.set(client, mine + 1);
      total += 1;
      return { ok: true };
    },
  };
}

/** Best-effort client address. Only trustworthy behind a proxy that sets these headers. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip")?.trim() || "unknown";
}
