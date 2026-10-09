/** In-memory report store with TTL. Holds reports and live progress only — never uploads. */
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { ProgressEvent, Report } from "./types.js";

export const REPORT_TTL_MS = 60 * 60 * 1000;

export interface Job {
  id: string;
  createdAt: number;
  events: ProgressEvent[];
  report: Report | null;
  error: string | null;
  bus: EventEmitter;
}

export class ReportStore {
  private readonly jobs = new Map<string, Job>();
  private readonly timer: NodeJS.Timeout;

  constructor(
    private readonly ttlMs = REPORT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {
    this.timer = setInterval(() => this.sweep(), Math.min(ttlMs, 60_000));
    this.timer.unref();
  }

  create(): Job {
    const job: Job = { id: randomUUID(), createdAt: this.now(), events: [], report: null, error: null, bus: new EventEmitter() };
    job.bus.setMaxListeners(50);
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): Job | undefined {
    const j = this.jobs.get(id);
    if (j && this.now() - j.createdAt > this.ttlMs) {
      this.jobs.delete(id);
      return undefined;
    }
    return j;
  }

  emit(job: Job, e: ProgressEvent): void {
    job.events.push(e);
    if (e.type === "report") job.report = e.report;
    if (e.type === "error") job.error = e.message;
    job.bus.emit("event", e);
  }

  sweep(): void {
    const t = this.now();
    for (const [id, j] of this.jobs) if (t - j.createdAt > this.ttlMs) this.jobs.delete(id);
  }

  get size(): number {
    return this.jobs.size;
  }

  close(): void {
    clearInterval(this.timer);
    this.jobs.clear();
  }
}
