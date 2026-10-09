/**
 * Runs async jobs strictly one after another. Used for the hearing timeline: every SSE
 * event goes through it, and `line` jobs only finish when their audio (or reading time)
 * has finished — so audio never overlaps and subtitles stay in sync.
 */
export class Sequencer<T> {
  private queue: T[] = [];
  private running = false;
  private generation = 0;
  private idleWaiters: (() => void)[] = [];

  constructor(private readonly handler: (item: T, isCurrent: () => boolean) => Promise<void>) {}

  enqueue(item: T): void {
    this.queue.push(item);
    if (!this.running) void this.drain();
  }

  get size(): number {
    return this.queue.length + (this.running ? 1 : 0);
  }

  /** Drops everything pending; the job in flight is told it is stale via `isCurrent`. */
  clear(): void {
    this.generation++;
    this.queue = [];
  }

  idle(): Promise<void> {
    if (!this.running && !this.queue.length) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  private async drain(): Promise<void> {
    this.running = true;
    while (this.queue.length) {
      const item = this.queue.shift() as T;
      const gen = this.generation;
      try {
        await this.handler(item, () => gen === this.generation);
      } catch (err) {
        console.warn("[sequencer] job failed", err);
      }
    }
    this.running = false;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    waiters.forEach((w) => w());
  }
}

export interface PlayableAudio {
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: "ended" | "error", cb: () => void, opts?: { once?: boolean }): void;
  readonly duration?: number;
}

/**
 * Late TTS (`{type:"audio", id, audioUrl}` after a line sent with audioUrl:null). Fed outside
 * the line queue so the URL is there by the time the line plays; `wait` gives it a grace period.
 */
export class LateAudio {
  private readonly urls = new Map<string, string>();
  private readonly waiters = new Map<string, (url: string) => void>();

  deliver(id: string, url: string): void {
    this.urls.set(id, url);
    this.waiters.get(id)?.(url);
    this.waiters.delete(id);
  }

  get(id: string): string | null {
    return this.urls.get(id) ?? null;
  }

  wait(id: string, ms: number, sleep: (ms: number) => Promise<void>): Promise<string | null> {
    const have = this.get(id);
    if (have) return Promise.resolve(have);
    return new Promise((resolve) => {
      let done = false;
      const finish = (url: string | null) => {
        if (done) return;
        done = true;
        this.waiters.delete(id);
        resolve(url);
      };
      this.waiters.set(id, finish);
      void sleep(ms).then(() => finish(this.get(id)));
    });
  }
}

export interface LinePlayerDeps {
  createAudio: (url: string) => PlayableAudio;
  sleep: (ms: number) => Promise<void>;
  /** Hard cap per line so a hung audio element can never stall the hearing. */
  maxMs?: number;
  /** Used when there is no audioUrl (subtitles only), e.g. Web Speech in mock mode. */
  speak?: (text: string, speaker: string) => Promise<void> | null;
}

/** Time a subtitle stays on screen when there is no audio: ~3.3 words/s, 1.8–12 s. */
export function readingTimeMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(12_000, Math.max(1_800, words * 300 + 600));
}

/** Plays one line's audio to the end. Falls back to reading time if audio is absent or fails. */
export function makeLinePlayer(deps: LinePlayerDeps) {
  const maxMs = deps.maxMs ?? 45_000;
  return async function playLine(line: { text: string; audioUrl: string | null; speaker: string }): Promise<"audio" | "speech" | "read"> {
    if (line.audioUrl) {
      const audio = deps.createAudio(line.audioUrl);
      const finished = new Promise<boolean>((resolve) => {
        audio.addEventListener("ended", () => resolve(true), { once: true });
        audio.addEventListener("error", () => resolve(false), { once: true });
      });
      let ok: boolean;
      try {
        await audio.play();
        ok = await Promise.race([finished, deps.sleep(maxMs).then(() => true)]);
      } catch {
        ok = false;
      }
      audio.pause();
      if (ok) return "audio";
    }
    const spoken = deps.speak?.(line.text, line.speaker);
    if (spoken) {
      // some browsers never fire `end` (no voices installed): cap at 3× reading time
      await Promise.race([spoken.catch(() => undefined), deps.sleep(Math.min(maxMs, readingTimeMs(line.text) * 3))]);
      return "speech";
    }
    await deps.sleep(readingTimeMs(line.text));
    return "read";
  };
}
