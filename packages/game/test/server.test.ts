import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { ROUND_MS } from "../src/core/rules.js";
import { maxPlausibleScore } from "../src/core/scheduler.js";
import { GAMES, type Submission } from "../server/games.js";
import { gamePlugin } from "../server/plugin.js";
import { dayOf, GameStore } from "../server/store.js";
import { issueToken, TOKEN_TTL_MS, verifyToken } from "../server/token.js";
import { cleanName, parseScore } from "../server/validate.js";

const SECRET = "test-secret";

describe("token", () => {
  it("signs and verifies, binding game + seed", () => {
    const tok = issueToken(SECRET, "whack", "abcdef0123456789", 1_000);
    expect(verifyToken(SECRET, tok, 2_000)).toEqual({ ok: true, claims: { game: "whack", seed: "abcdef0123456789", issuedAt: 1_000 } });
  });
  it("rejects a wrong secret, tampering, expiry and garbage", () => {
    const tok = issueToken(SECRET, "whack", "abcdef0123456789", 1_000);
    expect(verifyToken("other", tok, 2_000)).toEqual({ ok: false, reason: "signature" });
    expect(verifyToken(SECRET, tok.replace("whack.", "swipe."), 2_000)).toEqual({ ok: false, reason: "signature" });
    expect(verifyToken(SECRET, tok.replace("abcdef01", "ffffff01"), 2_000)).toEqual({ ok: false, reason: "signature" });
    expect(verifyToken(SECRET, tok.replace(".1000.", ".1001."), 2_000)).toEqual({ ok: false, reason: "signature" });
    expect(verifyToken(SECRET, tok, 1_000 + TOKEN_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
    expect(verifyToken(SECRET, "nope", 2_000)).toEqual({ ok: false, reason: "malformed" });
  });
});

const whack = (o: Partial<Submission> = {}, stats: Record<string, number> = {}): Submission => ({
  score: 4200,
  durationMs: ROUND_MS,
  ...o,
  stats: { hits: 30, mistralHits: 0, bestCombo: 12, ...stats },
});

describe("plausibility caps", () => {
  const late = ROUND_MS + 5_000;
  it("whack: accepts a strong but possible round", () => {
    expect(GAMES.whack.implausible(whack(), late)).toBeNull();
    expect(GAMES.whack.implausible(whack({ score: maxPlausibleScore(ROUND_MS) }, { hits: 100, bestCombo: 100 }), late)).toBeNull();
  });
  it("whack: rejects impossible claims", () => {
    expect(GAMES.whack.implausible(whack({ score: maxPlausibleScore(ROUND_MS) + 1 }), late)).toMatch(/plausible max/);
    expect(GAMES.whack.implausible(whack({}, { hits: 10_000 }), late)).toMatch(/hits/);
    expect(GAMES.whack.implausible(whack({ durationMs: ROUND_MS * 2 }), ROUND_MS * 3)).toBe("duration");
    expect(GAMES.whack.implausible(whack(), 5_000)).toMatch(/token/);
    expect(GAMES.whack.implausible(whack({}, { bestCombo: 31 }), late)).toBe("combo");
    expect(GAMES.whack.implausible(whack({}, { hits: -1 }), late)).toBe("negative stats");
  });
  it("other games: generous caps scale with duration", () => {
    const min = 60_000;
    expect(GAMES.flappy.implausible({ score: 80, durationMs: min, stats: {} }, min)).toBeNull();
    expect(GAMES.flappy.implausible({ score: 5_000, durationMs: min, stats: {} }, min)).toMatch(/plausible max/);
    expect(GAMES.swipe.implausible({ score: 30_000, durationMs: 3 * min, stats: {} }, 3 * min)).toBeNull();
    expect(GAMES.triplicate.implausible({ score: 1e9, durationMs: min, stats: {} }, min)).toMatch(/plausible max/);
    expect(GAMES.flappy.tokenTtlMs).toBeGreaterThan(GAMES.flappy.maxDurationMs);
  });
});

describe("parseScore", () => {
  it("parses the arcade body and folds whack's flat stats", () => {
    expect(parseScore({ game: "swipe", name: " Kevin ", score: 3, durationMs: 9, seed: "s", token: "t", stats: { cards: 20 } })).toEqual({
      game: "swipe",
      name: "Kevin",
      score: 3,
      durationMs: 9,
      seed: "s",
      token: "t",
      stats: { cards: 20 },
    });
    expect(parseScore({ score: 3, durationMs: 9, seed: "s", token: "t", hits: 2, bestCombo: 2 })).toMatchObject({ game: "whack", stats: { hits: 2, bestCombo: 2 } });
  });
  it("rejects bad bodies", () => {
    expect(parseScore({ game: "chess", score: 1 })).toBe("unknown game");
    expect(parseScore({ score: 1.5 })).toBe("score must be an integer");
    expect(parseScore({ score: 1, durationMs: 1, seed: "s", token: "t", stats: { x: "y" } })).toBe("stats.x must be an integer");
  });
  it("cleans names", () => {
    expect(cleanName("  <b>Ursula\u0000  </b> ")).toBe("bUrsula /b");
    expect(cleanName("")).toBe("Anonymous stagiaire");
    expect([...cleanName("x".repeat(40))].length).toBe(24);
  });
});

describe("leaderboard store", () => {
  it("sorts by score desc, ties by earlier time; per game; only today", () => {
    const s = new GameStore(":memory:");
    const t0 = Date.parse("2026-10-10T08:00:00Z");
    const row = (name: string, score: number, at: number, game: "whack" | "swipe" = "whack") => ({ game, name, score, durationMs: ROUND_MS, stats: { hits: 1 }, seed: `${name}-${at}`, at });
    expect(s.insert(row("yesterday", 99_999, t0 - 24 * 3600_000))).toBe(1);
    expect(s.insert(row("other-game", 99_999, t0, "swipe"))).toBe(1);
    expect(s.insert(row("a", 1000, t0))).toBe(1);
    expect(s.insert(row("b", 3000, t0 + 1))).toBe(1);
    expect(s.insert(row("c", 1000, t0 + 2))).toBe(3);
    expect(s.insert(row("d", -500, t0 + 3))).toBe(4);
    const lb = s.leaderboard("whack", t0 + 10);
    expect(lb.day).toBe(dayOf(t0));
    expect(lb.entries.map((e) => [e.rank, e.name, e.score])).toEqual([
      [1, "b", 3000],
      [2, "a", 1000],
      [3, "c", 1000],
      [4, "d", -500],
    ]);
    expect(lb.entries[0]).toMatchObject({ title: "Desk Officer", stats: { hits: 1 } });
    expect(s.leaderboard("whack", t0 + 10, 2).entries).toHaveLength(2);
    expect(s.leaderboard("swipe", t0 + 10).entries).toEqual([expect.objectContaining({ name: "other-game", title: null })]);
  });
  it("day rolls over at Brussels midnight", () => {
    expect(dayOf(Date.parse("2026-10-10T21:59:00Z"))).toBe("2026-10-10");
    expect(dayOf(Date.parse("2026-10-10T22:01:00Z"))).toBe("2026-10-11");
  });
});

describe("gamePlugin", () => {
  let clock = Date.parse("2026-10-10T09:00:00Z");
  let app: ReturnType<typeof Fastify> | null = null;
  afterEach(async () => {
    await app?.close();
    app = null;
  });
  const build = async (rateLimit = { limit: 100, windowMs: 60_000 }) => {
    app = Fastify();
    await app.register(gamePlugin, { prefix: "/api/game", secret: SECRET, store: new GameStore(":memory:"), now: () => clock, rateLimit });
    return app;
  };
  type Start = { game: string; seed: string; token: string; roundMs?: number };

  it("whack: start → play → score → leaderboard; replay rejected", async () => {
    const a = await build();
    const start = (await a.inject("/api/game/start?game=whack")).json() as Start;
    expect(start).toMatchObject({ game: "whack", roundMs: ROUND_MS });
    clock += ROUND_MS + 3_000;
    const body = { game: "whack", name: "Ursula", score: 6200, durationMs: ROUND_MS, seed: start.seed, token: start.token, stats: { hits: 31, mistralHits: 1, bestCombo: 9 } };
    const res = await a.inject({ method: "POST", url: "/api/game/score", payload: body });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ rank: 1, title: "Head of Unit" });
    expect((await a.inject({ method: "POST", url: "/api/game/score", payload: body })).statusCode).toBe(409);
    const lb = (await a.inject("/api/game/leaderboard?game=whack&limit=5")).json() as { entries: { name: string; score: number }[] };
    expect(lb.entries).toEqual([expect.objectContaining({ name: "Ursula", score: 6200 })]);
    expect(((await a.inject("/api/game/leaderboard?game=flappy")).json() as { entries: unknown[] }).entries).toEqual([]);
  });

  it("other games use their own boards and token TTL", async () => {
    const a = await build();
    const start = (await a.inject("/api/game/start?game=flappy")).json() as Start;
    expect(start.roundMs).toBeUndefined();
    clock += 5 * 60_000;
    const body = { game: "flappy", name: "Pim", score: 120, durationMs: 4 * 60_000, seed: start.seed, token: start.token, stats: { pillars: 120 } };
    expect((await a.inject({ method: "POST", url: "/api/game/score", payload: { ...body, game: "whack" } })).statusCode).toBe(401);
    expect((await a.inject({ method: "POST", url: "/api/game/score", payload: body })).json()).toEqual({ rank: 1, title: null });
    expect((await a.inject("/api/game/start?game=chess")).statusCode).toBe(400);
  });

  it("rejects forged, expired, mismatched and implausible scores", async () => {
    const a = await build();
    const start = (await a.inject("/api/game/start")).json() as Start;
    clock += ROUND_MS + 1_000;
    const ok = { game: "whack", name: "x", score: 100, durationMs: ROUND_MS, seed: start.seed, token: start.token, stats: { hits: 1, mistralHits: 0, bestCombo: 1 } };
    const post = (payload: object) => a.inject({ method: "POST", url: "/api/game/score", payload });
    expect((await post({ ...ok, token: issueToken("forged", "whack", start.seed, clock) })).statusCode).toBe(401);
    expect((await post({ ...ok, seed: "0123456789abcdef" })).statusCode).toBe(401);
    expect((await post({ ...ok, score: 10_000_000 })).statusCode).toBe(422);
    expect((await post({ ...ok, score: "lots" })).statusCode).toBe(400);
    clock += TOKEN_TTL_MS;
    expect((await post(ok)).statusCode).toBe(401);
  });

  it("rate-limits per IP", async () => {
    const a = await build({ limit: 2, windowMs: 60_000 });
    expect((await a.inject("/api/game/start")).statusCode).toBe(200);
    expect((await a.inject("/api/game/start")).statusCode).toBe(200);
    const r = await a.inject("/api/game/start");
    expect(r.statusCode).toBe(429);
    expect(r.headers["retry-after"]).toBeDefined();
  });
});
