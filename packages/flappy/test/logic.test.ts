import { describe, expect, it } from "vitest";
import {
  C, GROUND_Y, PILLAR_REGS, RANKS, chinaModelsDuring, circleHitsRect, flap, gapAt, gapY, hitsPillar,
  maxPlausibleScore, meanwhileLine, newGame, rankFor, speedAt, step, type State,
} from "../src/logic";

/** Autopilot: flap when below the next gap's centre and falling. */
function autopilot(st: State, ms: number): void {
  for (let t = 0; t < ms && st.phase !== "dead"; t += C.stepMs) {
    const next = st.pillars.find((p) => p.x + C.pillarW / 2 > st.bird.x - C.radius)!;
    const target = gapY(next, st.t) + 18;
    if (st.bird.y > target && st.bird.vy > -50) flap(st);
    step(st, C.stepMs);
  }
}

describe("difficulty curve", () => {
  it("speed rises monotonically and clamps at vMax", () => {
    for (let s = 0; s < 200; s++) expect(speedAt(s + 1)).toBeGreaterThanOrEqual(speedAt(s));
    expect(speedAt(0)).toBe(C.v0);
    expect(speedAt(10_000)).toBe(C.vMax);
  });
  it("gaps narrow monotonically and clamp at gapMin (always passable)", () => {
    for (let i = 0; i < 200; i++) expect(gapAt(i + 1)).toBeLessThanOrEqual(gapAt(i));
    expect(gapAt(0)).toBe(C.gap0);
    expect(gapAt(10_000)).toBe(C.gapMin);
    expect(C.gapMin).toBeGreaterThan(C.radius * 2 * 3);
  });
  it("generated gaps stay inside the playfield", () => {
    const st = newGame(42);
    for (const p of st.pillars) {
      expect(p.baseY - p.gap / 2).toBeGreaterThanOrEqual(C.edge - 1e-9);
      expect(p.baseY + p.gap / 2).toBeLessThanOrEqual(GROUND_Y - C.edge + 1e-9);
    }
  });
});

describe("determinism", () => {
  it("same seed → same course", () => {
    const a = newGame("abc"), b = newGame("abc"), c = newGame("abd");
    expect(a.pillars.map((p) => [p.baseY, p.reg])).toEqual(b.pillars.map((p) => [p.baseY, p.reg]));
    expect(a.pillars.map((p) => p.baseY)).not.toEqual(c.pillars.map((p) => p.baseY));
  });
});

describe("scoring + collision", () => {
  it("ready phase does not fall; first flap starts the round", () => {
    const st = newGame(1);
    step(st, 5000);
    expect(st.phase).toBe("ready");
    expect(st.t).toBe(0);
    flap(st);
    expect(st.phase).toBe("play");
  });
  it("never flapping again → dies on the floor, verdict names a real pillar regulation", () => {
    const st = newGame(7);
    flap(st);
    step(st, 200);
    for (let i = 0; i < 60 && st.phase === "play"; i++) step(st, 100);
    expect(st.phase).toBe("dead");
    expect(st.verdict).not.toBeNull();
    expect(PILLAR_REGS).toContain(st.verdict!.reg);
    expect(st.score).toBe(0);
    expect(st.events.some((e) => e.type === "crash")).toBe(true);
  });
  it("score counts pillars passed, one per pillar", () => {
    const st = newGame(3);
    flap(st);
    autopilot(st, 20_000);
    const passed = st.pillars.filter((p) => p.passed).length;
    expect(st.score).toBeGreaterThan(3);
    expect(st.score).toBeLessThanOrEqual(passed + 50);
    const scores = st.events.filter((e) => e.type === "score").map((e) => (e as { score: number }).score);
    expect(scores).toEqual(scores.map((_, i) => i + 1));
  });
  it("hitting a pillar kills with that pillar's regulation", () => {
    const st = newGame(9);
    flap(st);
    const p = st.pillars[0];
    st.bird.x = p.x - C.pillarW / 2 - C.radius - 1;
    st.bird.y = p.baseY - p.gap / 2 - 40;
    st.bird.vy = 0;
    st.sandboxUntil = 0;
    for (let i = 0; i < 20 && st.phase === "play"; i++) step(st, C.stepMs);
    expect(st.phase).toBe("dead");
    expect(st.verdict).toEqual({ reg: PILLAR_REGS[p.reg], cause: "pillar" });
  });
  it("circle/rect + pillar gap geometry", () => {
    expect(circleHitsRect(0, 0, 5, 4, -1, 10, 2)).toBe(true);
    expect(circleHitsRect(0, 0, 5, 6, -1, 10, 2)).toBe(false);
    const st = newGame(5);
    const p = st.pillars[0];
    expect(hitsPillar(p, 0, p.x, p.baseY)).toBe(false);
    expect(hitsPillar(p, 0, p.x, p.baseY - p.gap / 2 - 1)).toBe(true);
    expect(hitsPillar(p, 0, p.x, p.baseY + p.gap / 2 + 1)).toBe(true);
    expect(hitsPillar(p, 0, p.x + C.pillarW, p.baseY - p.gap)).toBe(false);
  });
  it("regulatory sandbox makes you pass through pillars and bounce off the floor", () => {
    const st = newGame(9);
    flap(st);
    st.sandboxUntil = 1e9;
    for (let i = 0; i < 100; i++) step(st, 100);
    expect(st.phase).toBe("play");
    expect(st.events.some((e) => e.type === "bounce")).toBe(true);
    expect(st.score).toBeGreaterThan(0);
  });
  it("picking up a delegated act makes the next pillars move, within the playfield", () => {
    const st = newGame(11);
    flap(st);
    st.pickups = [{ kind: "delegated", x: st.bird.x + 1, y: st.bird.y, taken: false }];
    step(st, C.stepMs * 2);
    const moving = st.pillars.filter((p) => p.moveFrom !== null);
    expect(moving.length).toBe(C.movingCount);
    expect(st.stats.delegatedActs).toBe(1);
    for (const p of moving) {
      expect(p.baseY - p.moveAmp - p.gap / 2).toBeGreaterThanOrEqual(C.edge * 0.5 - 1e-9);
      expect(p.baseY + p.moveAmp + p.gap / 2).toBeLessThanOrEqual(GROUND_Y - C.edge * 0.5 + 1e-9);
    }
  });
  it("sandbox pickup grants timed invincibility", () => {
    const st = newGame(12);
    flap(st);
    st.pickups = [{ kind: "sandbox", x: st.bird.x + 1, y: st.bird.y, taken: false }];
    step(st, C.stepMs * 2);
    expect(st.sandboxUntil).toBeCloseTo(st.t + C.sandboxMs - C.stepMs, 0);
  });
});

describe("leaderboard cap", () => {
  it("no simulated run beats maxPlausibleScore(duration)", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const st = newGame(seed);
      flap(st);
      st.sandboxUntil = 1e12;
      autopilot(st, 120_000);
      expect(st.score).toBeLessThanOrEqual(maxPlausibleScore(st.t));
      expect(st.score).toBeGreaterThan(maxPlausibleScore(st.t) * 0.6);
    }
  });
  it("formula", () => {
    expect(maxPlausibleScore(0)).toBe(1);
    expect(maxPlausibleScore(60_000)).toBe(Math.floor(60 * (C.vMax / C.spacing)) + 1);
  });
});

describe("ranks + meanwhile", () => {
  it("ladder is ordered and ends at the President", () => {
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i].min).toBeGreaterThan(RANKS[i - 1].min);
    expect(rankFor(0).rank.title).toBe("Rejected at reception");
    expect(rankFor(3).rank.title).toBe("Desk Officer");
    expect(rankFor(999).rank.title).toBe("President of the Commission");
    expect(rankFor(999).next).toBeNull();
  });
  it("china models: at least one, grows with time", () => {
    expect(chinaModelsDuring(0)).toBe(1);
    expect(chinaModelsDuring(45_000)).toBe(3);
    expect(meanwhileLine(1000)).toContain("1 more model.");
    expect(meanwhileLine(40_000)).toContain("3 more models");
  });
});

describe("ready → play", () => {
  it("idle time on the ready screen does not fast-forward the first flap", () => {
    const st = newGame("idle");
    for (let i = 0; i < 120; i++) step(st, 16.7);
    const y0 = st.bird.y;
    flap(st);
    step(st, 16.7);
    expect(st.phase).toBe("play");
    expect(st.t).toBeLessThan(20);
    expect(st.bird.y).toBeLessThan(y0);
  });
});
