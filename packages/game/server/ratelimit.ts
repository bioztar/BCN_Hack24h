/** Fixed-window per-IP limiter (in memory; one instance per process). */
export class RateLimiter {
  private readonly hits = new Map<string, { start: number; count: number }>();
  constructor(
    readonly limit: number,
    readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns seconds to wait, or 0 if allowed. */
  check(key: string): number {
    const t = this.now();
    const h = this.hits.get(key);
    if (!h || t - h.start >= this.windowMs) {
      this.hits.set(key, { start: t, count: 1 });
      if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (t - v.start >= this.windowMs) this.hits.delete(k);
      return 0;
    }
    if (h.count >= this.limit) return Math.ceil((h.start + this.windowMs - t) / 1000);
    h.count++;
    return 0;
  }
}
