import { describe, expect, it } from "vitest";
import { makeLinePlayer, readingTimeMs, Sequencer, type PlayableAudio } from "../src/sequencer";

const tick = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));

class FakeAudio implements PlayableAudio {
  static playing = 0;
  static maxConcurrent = 0;
  static log: string[] = [];
  private listeners: Record<string, (() => void)[]> = {};
  constructor(
    readonly url: string,
    private readonly behaviour: "ok" | "error" | "reject" = "ok",
    private readonly ms = 5,
  ) {}
  addEventListener(type: "ended" | "error", cb: () => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  async play() {
    if (this.behaviour === "reject") throw new Error("NotAllowedError");
    FakeAudio.playing++;
    FakeAudio.maxConcurrent = Math.max(FakeAudio.maxConcurrent, FakeAudio.playing);
    FakeAudio.log.push(`start ${this.url}`);
    setTimeout(() => {
      FakeAudio.playing--;
      FakeAudio.log.push(`end ${this.url}`);
      this.listeners[this.behaviour === "error" ? "error" : "ended"]?.forEach((cb) => cb());
    }, this.ms);
  }
  pause() {}
}

describe("audio queue (Sequencer + line player)", () => {
  it("plays lines strictly in order, never overlapping", async () => {
    FakeAudio.playing = 0;
    FakeAudio.maxConcurrent = 0;
    FakeAudio.log = [];
    const play = makeLinePlayer({ createAudio: (u) => new FakeAudio(u, "ok", 10 - u.length), sleep: (ms) => tick(ms), maxMs: 1000 });
    const seq = new Sequencer<{ text: string; audioUrl: string | null; speaker: string }>(async (l) => void (await play(l)));
    for (const u of ["a", "bb", "ccc", "dddd"]) seq.enqueue({ text: u, audioUrl: u, speaker: "x" });
    await seq.idle();
    expect(FakeAudio.maxConcurrent).toBe(1);
    expect(FakeAudio.log).toEqual(["start a", "end a", "start bb", "end bb", "start ccc", "end ccc", "start dddd", "end dddd"]);
  });

  it("falls back to reading time when audio is null, errors, or autoplay is refused", async () => {
    const slept: number[] = [];
    const play = makeLinePlayer({
      createAudio: (u) => new FakeAudio(u, u === "err" ? "error" : "reject"),
      sleep: (ms) => (ms >= 45_000 ? new Promise<void>(() => {}) : (slept.push(ms), Promise.resolve())),
    });
    expect(await play({ text: "one two three", audioUrl: null, speaker: "x" })).toBe("read");
    expect(await play({ text: "one two three", audioUrl: "err", speaker: "x" })).toBe("read");
    expect(await play({ text: "one two three", audioUrl: "nope", speaker: "x" })).toBe("read");
    expect(slept).toEqual([readingTimeMs("one two three"), readingTimeMs("one two three"), readingTimeMs("one two three")]);
  });

  it("caps a hung audio element at maxMs", async () => {
    const hung: PlayableAudio = { play: async () => {}, pause: () => {}, addEventListener: () => {} };
    const play = makeLinePlayer({ createAudio: () => hung, sleep: () => tick(1), maxMs: 1 });
    expect(await play({ text: "x", audioUrl: "u", speaker: "s" })).toBe("audio");
  });

  it("uses speech synthesis for null audio when provided", async () => {
    const said: string[] = [];
    const play = makeLinePlayer({ createAudio: () => new FakeAudio("u"), sleep: () => tick(1), speak: async (t) => void said.push(t) });
    expect(await play({ text: "Non.", audioUrl: null, speaker: "annexe" })).toBe("speech");
    expect(said).toEqual(["Non."]);
  });

  it("clear() drops pending jobs and marks the in-flight one stale", async () => {
    const done: string[] = [];
    let staleSeen = false;
    const seq = new Sequencer<string>(async (x, isCurrent) => {
      await tick(5);
      if (!isCurrent()) staleSeen = true;
      done.push(x);
    });
    seq.enqueue("a");
    seq.enqueue("b");
    seq.enqueue("c");
    await tick(1);
    seq.clear();
    await seq.idle();
    expect(done).toEqual(["a"]);
    expect(staleSeen).toBe(true);
  });

  it("keeps going after a job throws", async () => {
    const done: number[] = [];
    const seq = new Sequencer<number>(async (n) => {
      if (n === 1) throw new Error("boom");
      done.push(n);
    });
    [0, 1, 2].forEach((n) => seq.enqueue(n));
    await seq.idle();
    expect(done).toEqual([0, 2]);
  });
});
