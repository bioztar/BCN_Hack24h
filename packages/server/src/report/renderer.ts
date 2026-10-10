/** One long-lived render worker; jobs queue inside it. Respawns after a crash. */
import { Worker } from "node:worker_threads";
import type { ReportData } from "./model.js";
import type { RenderJob } from "./worker.js";

type Pending = { resolve: (b: Buffer) => void; reject: (e: Error) => void };

export class Renderer {
  private w: Worker | null = null;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();

  get queued(): number {
    return this.pending.size;
  }

  private worker(): Worker {
    if (this.w) return this.w;
    const ext = import.meta.url.endsWith(".ts") ? ".ts" : ".js";
    const tsx = process.execArgv.some((a) => a.includes("tsx"));
    const w = new Worker(new URL(`./worker${ext}`, import.meta.url), { execArgv: tsx || ext === ".js" ? process.execArgv : [...process.execArgv, "--import", "tsx"] });
    w.unref();
    w.on("message", (m: { id: number; ok: boolean; data?: ArrayBuffer; error?: string }) => {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (!this.pending.size) w.unref();
      if (m.ok && m.data) p.resolve(Buffer.from(m.data));
      else p.reject(new Error(m.error ?? "render failed"));
    });
    const fail = (err: Error) => {
      if (this.w === w) this.w = null;
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
    w.on("error", fail);
    w.on("exit", (code) => fail(new Error(`report worker exited (${code})`)));
    this.w = w;
    return w;
  }

  render(kind: RenderJob["kind"], report: ReportData, lawTexts: Record<string, string>): Promise<Buffer> {
    const id = ++this.seq;
    const w = this.worker();
    w.ref();
    return new Promise<Buffer>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      w.postMessage({ id, kind, report, lawTexts } satisfies RenderJob);
    });
  }

  async close(): Promise<void> {
    const w = this.w;
    this.w = null;
    await w?.terminate();
  }
}

/** Per-key sliding window: at most `limit` hits per `windowMs`. */
export class Window {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit; returns 0 if allowed, else ms until the next slot frees up. */
  hit(key: string): number {
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter((x) => x > t - this.windowMs);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return Math.max(1, list[0]! + this.windowMs - t);
    }
    list.push(t);
    if (this.hits.size > 10_000) this.hits.clear();
    this.hits.set(key, list);
    return 0;
  }
}
