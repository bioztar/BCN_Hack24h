import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/core/rng.js";
import { COMBO_CAP, HIT_POINTS, HOLES, ROUND_MS } from "../src/core/rules.js";
import { GAP_END, GAP_START, LIFETIME_END, LIFETIME_START, maxPlausibleScore, maxSpawns, phaseAt, Spawner } from "../src/core/scheduler.js";

describe("spawn scheduler", () => {
  it("lifetime shrinks ~1.1 s → ~0.45 s, gap shrinks, up to 3 live", () => {
    expect(phaseAt(0)).toEqual({ lifetime: LIFETIME_START, gap: GAP_START, maxLive: 1 });
    expect(phaseAt(ROUND_MS)).toEqual({ lifetime: LIFETIME_END, gap: GAP_END, maxLive: 3 });
    let prev = phaseAt(0);
    for (let t = 1000; t <= ROUND_MS; t += 1000) {
      const p = phaseAt(t);
      expect(p.lifetime).toBeLessThanOrEqual(prev.lifetime);
      expect(p.gap).toBeLessThanOrEqual(prev.gap);
      expect(p.maxLive).toBeGreaterThanOrEqual(prev.maxLive);
      prev = p;
    }
    expect(phaseAt(15_000).maxLive).toBe(2);
    expect(phaseAt(30_000).maxLive).toBe(3);
  });

  it("never exceeds maxLive, never reuses a busy hole, stops at the bell", () => {
    const s = new Spawner(mulberry32(7));
    const live = new Map<number, number>();
    let spawnsLate = 0;
    let spawnsEarly = 0;
    for (let t = 0; t < ROUND_MS + 2000; t += 16) {
      for (const [h, until] of live) if (until <= t) live.delete(h);
      const sp = s.next(t, new Set(live.keys()));
      if (!sp) continue;
      expect(t).toBeLessThan(ROUND_MS);
      expect(live.has(sp.hole)).toBe(false);
      expect(sp.hole).toBeGreaterThanOrEqual(0);
      expect(sp.hole).toBeLessThan(HOLES);
      live.set(sp.hole, t + sp.lifetime);
      expect(live.size).toBeLessThanOrEqual(phaseAt(t).maxLive);
      if (t < 10_000) spawnsEarly++;
      if (t > 22_000) spawnsLate++;
    }
    expect(spawnsLate).toBeGreaterThan(spawnsEarly);
  });

  it("speeds up: more spawns per second at the end than at the start", () => {
    expect(maxSpawns(10_000)).toBeLessThan(maxSpawns(ROUND_MS) - maxSpawns(20_000));
  });
});

describe("plausibility cap", () => {
  it("a perfect bot (instant hit on every pop) stays under the cap", () => {
    for (const seed of [1, 2, 3, 42, 1234]) {
      const s = new Spawner(mulberry32(seed));
      let hits = 0;
      let pts = 0;
      for (let t = 0; t < ROUND_MS; t += 16) {
        if (s.next(t, new Set())) {
          hits++;
          pts += HIT_POINTS * Math.min(hits, COMBO_CAP);
        }
      }
      expect(hits).toBeLessThanOrEqual(maxSpawns(ROUND_MS));
      expect(pts).toBeLessThanOrEqual(maxPlausibleScore(ROUND_MS));
    }
  });

  it("cap grows with duration and is zero-ish for instant submits", () => {
    expect(maxPlausibleScore(0)).toBe(0);
    expect(maxPlausibleScore(10_000)).toBeLessThan(maxPlausibleScore(ROUND_MS));
    expect(maxPlausibleScore(ROUND_MS + 60_000)).toBe(maxPlausibleScore(ROUND_MS));
  });
});
