// Pure fixed-window rate limiter. Memory is per server instance (serverless), so this is best-effort abuse protection;
// pair it with Vercel Firewall / WAF rate limiting for a hard guarantee (see docs/PRODUCTION_CHECKLIST.md).
export function createLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return {
    check(key: string): { ok: boolean; retryAfterSec: number } {
      const t = now();
      if (buckets.size > 5000) for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
      let b = buckets.get(key);
      if (!b || b.resetAt <= t) { b = { count: 0, resetAt: t + windowMs }; buckets.set(key, b); }
      b.count++;
      return b.count <= max ? { ok: true, retryAfterSec: 0 } : { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - t) / 1000)) };
    },
    size: () => buckets.size,
  };
}
