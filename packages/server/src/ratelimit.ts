/** RATE_LIMIT_PER_HOUR hits per IP per rolling hour, counted in SQLite (as Karen). */
import type { Db } from "./db.js";

export const HOUR_MS = 60 * 60 * 1000;

export interface LimitStatus {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class RateLimiter {
  constructor(
    private readonly db: Db,
    private readonly perHour: () => number,
    private readonly now: () => number = Date.now,
  ) {}

  hit(ip: string): LimitStatus {
    const now = this.now();
    const since = now - HOUR_MS;
    const perHour = this.perHour();
    const used = Number((this.db.prepare("SELECT COUNT(*) AS n FROM rate_hits WHERE ip = ? AND ts > ?").get(ip, since) as { n: number }).n);
    if (used >= perHour) {
      const oldest = this.db.prepare("SELECT ts FROM rate_hits WHERE ip = ? AND ts > ? ORDER BY ts ASC LIMIT 1").get(ip, since) as { ts: number } | undefined;
      return { allowed: false, remaining: 0, retryAfterMs: Math.max(1, (oldest?.ts ?? now) + HOUR_MS - now) };
    }
    this.db.prepare("INSERT INTO rate_hits (ip, ts) VALUES (?, ?)").run(ip, now);
    if (Math.random() < 0.05) this.db.prepare("DELETE FROM rate_hits WHERE ts <= ?").run(since);
    return { allowed: true, remaining: perHour - used - 1, retryAfterMs: 0 };
  }
}
