import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioBook } from "../src/audiobook";

describe("AudioBook (late TTS)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns a URL that arrived before the line", async () => {
    const b = new AudioBook();
    b.set("l1", "/api/audio/l1.mp3");
    expect(b.get("l1")).toBe("/api/audio/l1.mp3");
    await expect(b.wait("l1", 1500)).resolves.toBe("/api/audio/l1.mp3");
  });

  it("resolves a waiting line as soon as its audio event arrives", async () => {
    const b = new AudioBook();
    const p = b.wait("l2", 1500);
    vi.advanceTimersByTime(400);
    b.set("l2", "/api/audio/l2.mp3");
    await expect(p).resolves.toBe("/api/audio/l2.mp3");
  });

  it("gives up after the timeout, and later audio does not resurrect it", async () => {
    const b = new AudioBook();
    const p = b.wait("l3", 1500);
    vi.advanceTimersByTime(1500);
    await expect(p).resolves.toBeNull();
    b.set("l3", "/api/audio/l3.mp3");
    expect(b.get("l3")).toBe("/api/audio/l3.mp3");
  });

  it("clear() releases waiters and forgets URLs", async () => {
    const b = new AudioBook();
    b.set("a", "/x.mp3");
    const p = b.wait("b", 1500);
    b.clear();
    await expect(p).resolves.toBeNull();
    expect(b.get("a")).toBeNull();
  });
});
