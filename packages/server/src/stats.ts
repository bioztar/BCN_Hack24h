/** Stage feeds (CONTRACT "v2 amendment — stage feeds"): day totals for the QR/leaderboard views and the case the room should watch. */
import { EventEmitter } from "node:events";
import type { Meanwhile } from "@dg-roast/shared";
import type { Db } from "./db.js";
import type { CaseState } from "./engine.js";
import { meanwhileAt } from "./meanwhile.js";

export interface Stats {
  inQueue: number;
  refusedToday: number;
  totalEurToday: number;
  totalJailMonthsToday: number;
  meanwhileToday: Meanwhile;
  /** Aliases read by the stage-v2 client (packages/web live/api.ts). */
  queue: number;
  applicantsToday: number;
}

export interface LiveCase {
  caseId: string | null;
  startedAt: string | null;
  ticket?: number;
  startupName?: string | null;
}

/** A registered applicant still counts as queued this long without a verdict. */
export const QUEUE_WINDOW_MS = 30 * 60_000;
export const LIVE_WINDOW_MS = 10 * 60_000;
const TZ = "Europe/Brussels";

/** Epoch ms of today's midnight in Brussels. */
export function brusselsMidnight(nowMs: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(nowMs));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return nowMs - ((n("hour") * 60 + n("minute")) * 60 + n("second")) * 1000 - (nowMs % 1000);
}

export class StatsHub {
  private readonly bus = new EventEmitter();
  private last = 0;
  private pending: NodeJS.Timeout | null = null;
  private ticker: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Db,
    private readonly now: () => number,
    private readonly throttleMs = 1000,
    private readonly tickMs = 5000,
  ) {
    this.bus.setMaxListeners(1000);
  }

  /** Day totals; `event` restricts leaderboard rows and applicants to that event tag. */
  snapshot(event: string | null = null): Stats {
    const t = this.now();
    const midnight = brusselsMidnight(t);
    const since = new Date(midnight).toISOString();
    const ev = event ? " AND event = ?" : "";
    const evArgs = event ? [event] : [];
    const lb = this.db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total_eur), 0) AS eur, COALESCE(SUM(total_jail), 0) AS jail FROM leaderboard WHERE issued_at >= ?${ev}`).get(since, ...evArgs) as { n: number; eur: number; jail: number };
    const queued = this.db
      .prepare(`SELECT COUNT(*) AS n FROM applicants a WHERE a.created_at >= ?${event ? " AND a.event = ?" : ""} AND NOT EXISTS (SELECT 1 FROM leaderboard l WHERE l.applicant_id = a.id)`)
      .get(t - QUEUE_WINDOW_MS, ...evArgs) as { n: number };
    const today = this.db.prepare(`SELECT COUNT(*) AS n FROM applicants WHERE created_at >= ?${ev}`).get(midnight, ...evArgs) as { n: number };
    const inQueue = Number(queued.n);
    return {
      inQueue,
      refusedToday: Number(lb.n),
      totalEurToday: Number(lb.eur),
      totalJailMonthsToday: Number(lb.jail),
      meanwhileToday: meanwhileAt(`day:${since.slice(0, 10)}`, (t - midnight) / 1000),
      queue: inQueue,
      applicantsToday: Number(today.n),
    };
  }

  /** Most recently created case that is still in progress and started within the last 10 minutes. */
  live(): LiveCase {
    const t = this.now();
    const rows = this.db.prepare("SELECT state FROM cases WHERE updated_at >= ? ORDER BY updated_at DESC LIMIT 100").all(t - LIVE_WINDOW_MS) as { state: string }[];
    let best: CaseState | null = null;
    for (const r of rows) {
      const s = JSON.parse(r.state) as CaseState;
      if (s.done || s.createdAt === undefined || s.createdAt < t - LIVE_WINDOW_MS) continue;
      if (!best || s.createdAt > best.createdAt!) best = s;
    }
    if (!best) return { caseId: null, startedAt: null };
    const a = best.applicantId ? (this.db.prepare("SELECT startup_name FROM applicants WHERE id = ?").get(best.applicantId) as { startup_name: string } | undefined) : undefined;
    return { caseId: best.caseId, startedAt: new Date(best.createdAt!).toISOString(), ticket: best.ticket, startupName: a?.startup_name ?? null };
  }

  /** Something counted changed: push to subscribers, at most once per `throttleMs`. */
  changed(): void {
    if (this.pending || !this.bus.listenerCount("stats")) return;
    const wait = Math.max(0, this.last + this.throttleMs - this.now());
    this.pending = setTimeout(() => {
      this.pending = null;
      this.last = this.now();
      this.bus.emit("stats", this.snapshot());
    }, wait);
  }

  /** The Meanwhile day total moves on its own, so subscribers also get a periodic push. */
  subscribe(fn: (s: Stats) => void): () => void {
    this.bus.on("stats", fn);
    this.ticker ??= setInterval(() => this.changed(), this.tickMs);
    return () => {
      this.bus.off("stats", fn);
      if (!this.bus.listenerCount("stats") && this.ticker) {
        clearInterval(this.ticker);
        this.ticker = null;
      }
    };
  }

  close(): void {
    if (this.pending) clearTimeout(this.pending);
    if (this.ticker) clearInterval(this.ticker);
    this.pending = this.ticker = null;
    this.bus.removeAllListeners();
  }
}
