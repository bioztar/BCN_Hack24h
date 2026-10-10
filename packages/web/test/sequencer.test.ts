import { describe, expect, it } from "vitest";
import { makeLinePlayer, readingTimeMs, Sequencer, type PlayableAudio, LateAudio } from "../src/sequencer";

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

  it("replays a line after a tap when autoplay was refused", async () => {
    const mk = (blockFirst: boolean): PlayableAudio => {
      let blocked = blockFirst;
      const ended: (() => void)[] = [];
      return {
        play: async () => {
          if (blocked) {
            blocked = false;
            throw Object.assign(new Error("play() failed"), { name: "NotAllowedError" });
          }
          setTimeout(() => ended.forEach((f) => f()), 2);
        },
        pause: () => {},
        addEventListener: (t, cb) => void (t === "ended" && ended.push(cb)),
      };
    };
    let taps = 0;
    const yes = makeLinePlayer({ createAudio: () => mk(true), sleep: (ms) => tick(Math.min(ms, 5)), unblock: async () => (taps++, true) });
    expect(await yes({ text: "x", audioUrl: "u", speaker: "s" })).toBe("audio");
    expect(taps).toBe(1);
    const no = makeLinePlayer({ createAudio: () => mk(true), sleep: (ms) => tick(Math.min(ms, 5)), unblock: async () => false });
    expect(await no({ text: "x", audioUrl: "u", speaker: "s" })).toBe("read");
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

describe("LateAudio", () => {
  it("returns a URL delivered before or during the wait, else null after the grace period", async () => {
    const late = new LateAudio();
    late.deliver("a", "/a.mp3");
    expect(await late.wait("a", 1500, () => new Promise(() => undefined))).toBe("/a.mp3");
    let fire = () => {};
    const p = late.wait("b", 1500, () => new Promise<void>((r) => (fire = r)));
    late.deliver("b", "/b.mp3");
    expect(await p).toBe("/b.mp3");
    const q = late.wait("c", 1500, () => new Promise<void>((r) => (fire = r)));
    fire();
    expect(await q).toBeNull();
  });
});
