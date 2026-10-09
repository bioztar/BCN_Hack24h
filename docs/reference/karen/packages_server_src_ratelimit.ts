/**
 * RATE_LIMIT_PER_HOUR messages per IP per rolling hour, counted in SQLite. Over the limit
 * Karen is on her break; the caller turns `retryAfterMs` into the timer the browser shows.
 */
import type { Db } from "./db.js";

export const HOUR_MS = 60 * 60 * 1000;

export interface LimitStatus {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the next message would be allowed; 0 when allowed now. */
  retryAfterMs: number;
}

export class RateLimiter {
  private readonly insert;
  private readonly count;
  private readonly oldest;
  private readonly prune;

  constructor(
    private readonly db: Db,
    private readonly perHour: number,
    private readonly now: () => number = Date.now,
  ) {
    this.insert = db.prepare("INSERT INTO rate_hits (ip, ts) VALUES (?, ?)");
    this.count = db.prepare<[string, number], { n: number }>("SELECT COUNT(*) AS n FROM rate_hits WHERE ip = ? AND ts > ?");
    this.oldest = db.prepare<[string, number], { ts: number } | undefined>(
      "SELECT ts FROM rate_hits WHERE ip = ? AND ts > ? ORDER BY ts ASC LIMIT 1",
    );
    this.prune = db.prepare("DELETE FROM rate_hits WHERE ts <= ?");
  }

  /** Reads the bucket without spending from it. */
  peek(ip: string): LimitStatus {
    const now = this.now();
    const since = now - HOUR_MS;
    const used = this.count.get(ip, since)?.n ?? 0;
    const remaining = Math.max(0, this.perHour - used);
    if (remaining > 0) return { allowed: true, remaining, retryAfterMs: 0 };
    const oldest = this.oldest.get(ip, since)?.ts ?? now;
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, oldest + HOUR_MS - now) };
  }

  /** Spends one message from the bucket if allowed. */
  hit(ip: string): LimitStatus {
    const status = this.peek(ip);
    if (!status.allowed) return status;
    const now = this.now();
    this.insert.run(ip, now);
    if (Math.random() < 0.05) this.prune.run(now - HOUR_MS);
    return { ...status, remaining: status.remaining - 1 };
  }
}
