const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);

function statusOf(e: unknown): number | undefined {
  const err = e as { code?: number | string; status?: number; response?: { status?: number } };
  const c = err?.response?.status ?? err?.status ?? (typeof err?.code === "number" ? err.code : undefined);
  return c;
}

export async function withRetry<T>(fn: () => Promise<T>, opts = { retries: 5, baseMs: 500 }): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      const s = statusOf(e);
      const transient = s !== undefined && TRANSIENT.has(s);
      if (!transient || attempt >= opts.retries) throw e;
      const delay = opts.baseMs * 2 ** attempt + Math.random() * 250; // exponential backoff + jitter
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
    }
  }
}
