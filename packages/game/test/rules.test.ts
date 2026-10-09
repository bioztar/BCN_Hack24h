import { describe, expect, it } from "vitest";
import { COMBO_CAP, ESCAPE_PENALTY, MISTRAL_PENALTY, newTally, rankTitle, RANKS, score, type GameEvent, type Tally } from "../src/core/rules.js";

const run = (evs: GameEvent[], t: Tally = newTally()) => evs.reduce((acc, e) => score(acc, e).tally, t);

describe("scoring", () => {
  it("hit = +100 × combo, combo grows on consecutive hits", () => {
    const a = score(newTally(), "hit");
    expect(a.points).toBe(100);
    const b = score(a.tally, "hit");
    expect(b.points).toBe(200);
    const c = score(b.tally, "hit");
    expect(c.points).toBe(300);
    expect(c.tally.score).toBe(600);
    expect(c.tally.bestCombo).toBe(3);
  });

  it("caps the multiplier but keeps counting best combo", () => {
    const t = run(Array<GameEvent>(COMBO_CAP + 5).fill("hit"));
    expect(score(t, "hit").points).toBe(100 * COMBO_CAP);
    expect(t.bestCombo).toBe(COMBO_CAP + 5);
  });

  it("miss resets the combo without points", () => {
    const t = run(["hit", "hit", "miss"]);
    expect(t.score).toBe(300);
    expect(t.streak).toBe(0);
    expect(t.misses).toBe(1);
    expect(score(t, "hit").points).toBe(100);
  });

  it("stamping Mistral = −500 and resets the combo", () => {
    const t = run(["hit", "hit", "hit", "mistral"]);
    expect(t.score).toBe(600 + MISTRAL_PENALTY);
    expect(t.mistralHits).toBe(1);
    expect(t.streak).toBe(0);
    expect(t.bestCombo).toBe(3);
    expect(t.hits).toBe(3);
  });

  it("escape = −25 and resets; sparing Mistral changes nothing", () => {
    const t = run(["hit", "escape"]);
    expect(t.score).toBe(100 + ESCAPE_PENALTY);
    expect(t.streak).toBe(0);
    const s = run(["hit", "spared"]);
    expect(s.streak).toBe(1);
    expect(s.score).toBe(100);
  });
});

describe("rank titles", () => {
  it("climbs from Intern to President of the Commission", () => {
    expect(rankTitle(-1200)).toBe("Intern (stagiaire)");
    expect(rankTitle(0)).toBe("Intern (stagiaire)");
    expect(rankTitle(1_999)).toBe("Intern (stagiaire)");
    expect(rankTitle(2_000)).toBe("Desk Officer");
    expect(rankTitle(6_000)).toBe("Head of Unit");
    expect(rankTitle(12_000)).toBe("Director");
    expect(rankTitle(20_000)).toBe("Director-General");
    expect(rankTitle(32_000)).toBe("Commissioner");
    expect(rankTitle(50_000)).toBe("President of the Commission");
    expect(rankTitle(1e9)).toBe("President of the Commission");
  });
  it("thresholds are strictly increasing", () => {
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i]!.min).toBeGreaterThan(RANKS[i - 1]!.min);
  });
});
