import { describe, expect, it } from "vitest";
import {
  MAX_POINTS_PER_FORM, MIN_INTERVAL_MS, RANKS, dropInterval, levelFor, maxPlausibleScore, meanwhileFor, meanwhileLine,
  rankFor, rowScore,
} from "../src/rules";

describe("difficulty curve", () => {
  it("levels rise every 10 pieces", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(9)).toBe(1);
    expect(levelFor(10)).toBe(2);
    expect(levelFor(95)).toBe(10);
  });

  it("gravity speeds up monotonically and is floored", () => {
    let prev = Infinity;
    for (let l = 1; l <= 40; l++) {
      const i = dropInterval(l);
      expect(i).toBeLessThanOrEqual(prev);
      expect(i).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
      prev = i;
    }
    expect(dropInterval(1)).toBe(650);
    expect(dropInterval(10)).toBeLessThan(250);
    expect(dropInterval(40)).toBe(MIN_INTERVAL_MS);
  });
});

describe("scoring", () => {
  it("rows × 300 × chain, chain capped at ×3", () => {
    expect(rowScore(1, 1)).toBe(300);
    expect(rowScore(2, 1)).toBe(600);
    expect(rowScore(1, 2)).toBe(600);
    expect(rowScore(1, 7)).toBe(900);
  });

  it("max plausible score formula", () => {
    expect(MAX_POINTS_PER_FORM).toBe(310);
    expect(maxPlausibleScore(0)).toBe(930);
    expect(maxPlausibleScore(60_000)).toBe((Math.floor(60_000 / 220) + 1) * 3 * 310);
  });

  it("rank ladder is ordered and covers zero", () => {
    expect(RANKS[0]!.min).toBe(0);
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i]!.min).toBeGreaterThan(RANKS[i - 1]!.min);
    expect(rankFor(0)).toBe("Intern (stagiaire)");
    expect(rankFor(1499)).toBe("Intern (stagiaire)");
    expect(rankFor(1500)).toBe("Desk Officer");
    expect(rankFor(1e9)).toBe("President of the Commission");
  });

  it("Meanwhile: China outpaces, numbers grow with time", () => {
    expect(meanwhileFor(0).china).toBe(1);
    expect(meanwhileFor(180_000).china).toBe(10);
    expect(meanwhileFor(180_000).euForms).toBe(306);
    expect(meanwhileLine(125_000)).toMatch(/^During your 2 min 5 s, China released 7 more models\./);
    expect(meanwhileLine(5_000)).toContain("1 more model.");
  });
});
