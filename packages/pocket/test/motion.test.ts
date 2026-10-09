import { describe, expect, it } from "vitest";
import { ShakeDetector, Stillness, gravityFromOrientation, toScreenFrame } from "../src/motion";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

describe("gravityFromOrientation", () => {
  it("upright portrait points down the screen", () => {
    const g = gravityFromOrientation(90, 0);
    close(g.x, 0); close(g.y, -1); close(g.z, 0);
  });
  it("flat on a table points into the screen", () => {
    const g = gravityFromOrientation(0, 0);
    close(g.x, 0); close(g.y, 0); close(g.z, -1);
  });
  it("right edge down (gamma > 0) pulls right", () => {
    expect(gravityFromOrientation(10, 60).x).toBeGreaterThan(0.4);
    expect(gravityFromOrientation(10, -60).x).toBeLessThan(-0.4);
  });
  it("is a unit vector", () => {
    const g = gravityFromOrientation(37, -71);
    close(Math.hypot(g.x, g.y, g.z), 1);
  });
  it("landscape rotation maps screen axes", () => {
    const g = toScreenFrame({ x: 0, y: -1, z: 0 }, 90);
    close(g.x, -1); close(g.y, 0);
  });
});

describe("ShakeDetector", () => {
  it("needs three spikes inside the window", () => {
    const s = new ShakeDetector(14, 3, 900, 1500);
    expect(s.sample(20, 0, 0, 0)).toBe(false);
    expect(s.sample(0, 0, 0, 50)).toBe(false);
    expect(s.sample(20, 0, 0, 200)).toBe(false);
    expect(s.sample(0, 0, 0, 250)).toBe(false);
    expect(s.sample(0, 25, 0, 400)).toBe(true);
  });
  it("a held spike counts once, slow spikes never shake", () => {
    const s = new ShakeDetector(14, 3, 900, 1500);
    for (let t = 0; t < 500; t += 16) expect(s.sample(30, 0, 0, t)).toBe(false);
    const slow = new ShakeDetector(14, 3, 900, 1500);
    for (let i = 0; i < 6; i++) {
      expect(slow.sample(20, 0, 0, i * 1000)).toBe(false);
      slow.sample(0, 0, 0, i * 1000 + 50);
    }
  });
  it("cooldown stops double stamps", () => {
    const s = new ShakeDetector(14, 2, 900, 1500);
    const spike = (t: number) => { const r = s.sample(20, 0, 0, t); s.sample(0, 0, 0, t + 20); return r; };
    spike(0);
    expect(spike(100)).toBe(true);
    spike(300);
    expect(spike(400)).toBe(false);
  });
});

describe("Stillness", () => {
  it("falls asleep after the limit and wakes on activity", () => {
    const s = new Stillness(20);
    let ev = null;
    for (let i = 0; i < 199; i++) ev = s.tick(0.1, false) ?? ev;
    expect(ev).toBe(null);
    expect(s.tick(0.2, false)).toBe("sleep");
    expect(s.tick(1, false)).toBe(null);
    expect(s.tick(0.1, true)).toBe("wake");
    expect(s.asleep).toBe(false);
  });
  it("activity resets the timer", () => {
    const s = new Stillness(20);
    for (let i = 0; i < 15; i++) s.tick(1, false);
    s.tick(0.1, true);
    for (let i = 0; i < 15; i++) expect(s.tick(1, false)).toBe(null);
  });
});
