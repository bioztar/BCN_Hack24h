import { describe, expect, it, vi } from "vitest";
import { Leaderboard, LocalBoard, parseEntries, startSession } from "../src/api";

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("leaderboard client", () => {
  it("mock mode never calls the server", async () => {
    const f = vi.fn();
    const s = await startSession(true, f as unknown as typeof fetch);
    expect(s.mode).toBe("local");
    expect(f).not.toHaveBeenCalled();
  });
  it("uses the server seed + token", async () => {
    const f = vi.fn(async () => json({ seed: 77, token: "t" }));
    const s = await startSession(false, f as unknown as typeof fetch);
    expect(s).toEqual({ seed: "77", token: "t", mode: "server" });
    expect((f.mock.calls[0] as unknown[])[0]).toBe("/api/game/start?game=swipe");
  });
  it("404 on start falls back to local", async () => {
    const s = await startSession(false, (async () => new Response("nope", { status: 404 })) as typeof fetch);
    expect(s.mode).toBe("local");
  });
  it("posts the contract payload and returns the server rank", async () => {
    const f = vi.fn(async () => json({ rank: 3 }));
    const lb = new Leaderboard({ seed: "s", token: "t", mode: "server" }, memStore(), f as unknown as typeof fetch);
    const r = await lb.submit({ name: " Ursula ", score: 1234, durationMs: 90000, stats: { correct: 15 } });
    expect(r).toEqual({ rank: 3, mode: "server" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/game/score");
    expect(JSON.parse(init.body as string)).toEqual({ game: "swipe", name: "Ursula", score: 1234, durationMs: 90000, seed: "s", token: "t", stats: { correct: 15 } });
  });
  it("score 404 falls back to the local board", async () => {
    const store = memStore();
    const lb = new Leaderboard({ seed: "s", token: "t", mode: "server" }, store, (async () => new Response("", { status: 404 })) as typeof fetch);
    expect(await lb.submit({ name: "A", score: 10, durationMs: 1, stats: {} })).toEqual({ rank: 1, mode: "local" });
    expect(await lb.top()).toEqual([{ name: "A", score: 10 }]);
  });
  it("local board ranks by score", () => {
    const b = new LocalBoard(memStore());
    expect(b.add({ name: "a", score: 100 })).toBe(1);
    expect(b.add({ name: "b", score: 300 })).toBe(1);
    expect(b.add({ name: "c", score: 200 })).toBe(2);
    expect(b.top().map((e) => e.name)).toEqual(["b", "c", "a"]);
  });
  it("parses common leaderboard shapes", () => {
    expect(parseEntries([{ name: "x", score: 1 }])).toEqual([{ name: "x", score: 1 }]);
    expect(parseEntries({ entries: [{ name: "y", score: 2 }] })).toEqual([{ name: "y", score: 2 }]);
    expect(parseEntries({ leaderboard: [{ player: "z", score: 3 }, { bad: 1 }] })).toEqual([{ name: "z", score: 3 }]);
    expect(parseEntries(null)).toEqual([]);
  });
});
