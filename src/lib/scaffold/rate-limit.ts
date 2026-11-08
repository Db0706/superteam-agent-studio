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

/**
 * Download limits, per server instance per minute. Defaults are sized for a hackathon:
 * a whole venue often shares one public IP (eduroam, campus NAT), and one instance
 * builds roughly 200-400 ZIPs a second, so these only stop runaway scripts.
 * Override on Vercel with SCAFFOLD_RATE_PER_IP / SCAFFOLD_RATE_GLOBAL (positive integers);
 * anything else falls back to the default rather than disabling the limit.
 */
export const DEFAULT_RATE_LIMITS = { perClient: 120, global: 3000 } as const;

export function rateLimitsFromEnv(env: Record<string, string | undefined>): { perClient: number; global: number } {
  const read = (value: string | undefined, fallback: number) => {
    const n = Number(value);
    return value?.trim() && Number.isInteger(n) && n > 0 ? n : fallback;
  };
  return {
    perClient: read(env.SCAFFOLD_RATE_PER_IP, DEFAULT_RATE_LIMITS.perClient),
    global: read(env.SCAFFOLD_RATE_GLOBAL, DEFAULT_RATE_LIMITS.global),
  };
}

/** Best-effort client address. Only trustworthy behind a proxy that sets these headers. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || req.headers.get("x-real-ip")?.trim() || "unknown";
}
