import { describe, expect, it } from "vitest";
import {
  BASE_POINTS,
  CARDS,
  CARD_MS,
  ROUND_CARDS,
  RANKS,
  Round,
  SPEED_MAX,
  buildDeck,
  maxScore,
  meanwhile,
  meanwhileLine,
  rankFor,
  resolveSwipe,
  scoreAnswer,
  tierForSlot,
  verdictLine,
  costLine,
  quipFor,
} from "../src/game";

describe("scoring", () => {
  it("wrong or timed-out answers score 0 and reset the streak", () => {
    expect(scoreAnswer(false, CARD_MS, 7)).toEqual({ points: 0, streak: 0, speed: 0, bonus: 0 });
  });
  it("correct = base + speed bonus + streak bonus", () => {
    expect(scoreAnswer(true, CARD_MS, 0)).toMatchObject({ points: BASE_POINTS + SPEED_MAX, streak: 1, bonus: 0 });
    expect(scoreAnswer(true, 0, 0).points).toBe(BASE_POINTS);
    expect(scoreAnswer(true, CARD_MS / 2, 2)).toMatchObject({ speed: 25, bonus: 50, streak: 3, points: 175 });
  });
  it("clamps time and caps the streak bonus", () => {
    expect(scoreAnswer(true, 99_999, 0).speed).toBe(SPEED_MAX);
    expect(scoreAnswer(true, -5, 0).speed).toBe(0);
    expect(scoreAnswer(true, 0, 50).bonus).toBe(scoreAnswer(true, 0, 10).bonus);
  });
  it("max score formula equals a perfect instant round", () => {
    expect(maxScore()).toBe(6625);
    const r = new Round("perfect");
    while (!r.done) r.answer(r.current!.verdict, CARD_MS);
    expect(r.score).toBe(maxScore());
    expect(r.stats()).toMatchObject({ correct: ROUND_CARDS, wrong: 0, timeouts: 0, bestStreak: ROUND_CARDS });
  });
  it("round stats count wrongs and timeouts", () => {
    const r = new Round(42);
    r.answer(r.current!.verdict, 4000);
    r.answer(r.current!.verdict === "banned" ? "allowed" : "banned", 4000);
    r.answer(null, 0);
    expect(r.stats()).toMatchObject({ correct: 1, wrong: 1, timeouts: 1, bestStreak: 1 });
    expect(r.streak).toBe(0);
  });
});

describe("difficulty curve + deck", () => {
  it("tiers rise through the round", () => {
    const tiers = Array.from({ length: ROUND_CARDS }, (_, i) => tierForSlot(i));
    expect(tiers.slice(0, 6).every((t) => t === 1)).toBe(true);
    expect(tiers.slice(-6).every((t) => t === 3)).toBe(true);
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]).toBeGreaterThanOrEqual(tiers[i - 1]);
  });
  it("deck is 20 unique cards, deterministic per seed, 10/10, following the curve", () => {
    for (const seed of ["a", "b", 123, "x9z", "2026-10-10"]) {
      const d = buildDeck(seed);
      expect(d).toHaveLength(ROUND_CARDS);
      expect(new Set(d.map((c) => c.id)).size).toBe(ROUND_CARDS);
      expect(buildDeck(seed).map((c) => c.id)).toEqual(d.map((c) => c.id));
      expect(d.filter((c) => c.verdict === "banned")).toHaveLength(ROUND_CARDS / 2);
      d.forEach((c, i) => expect(c.tier).toBe(tierForSlot(i)));
    }
    expect(buildDeck("a").map((c) => c.id)).not.toEqual(buildDeck("b").map((c) => c.id));
  });
  it("falls back gracefully on a tiny pool", () => {
    const d = buildDeck("s", 20, CARDS.slice(0, 5));
    expect(d).toHaveLength(5);
  });
});

describe("swipe verdict", () => {
  const W = 390;
  it("needs distance or a flick", () => {
    expect(resolveSwipe(-120, 0, W)).toBe("banned");
    expect(resolveSwipe(120, 0, W)).toBe("allowed");
    expect(resolveSwipe(40, 0, W)).toBeNull();
    expect(resolveSwipe(-40, -0.9, W)).toBe("banned");
    expect(resolveSwipe(40, 0.9, W)).toBe("allowed");
    expect(resolveSwipe(10, 2, W)).toBeNull();
    expect(resolveSwipe(-90, 0.9, W)).toBeNull();
  });
  it("threshold scales with width", () => {
    expect(resolveSwipe(200, 0, 1366)).toBeNull();
    expect(resolveSwipe(350, 0, 1366)).toBe("allowed");
  });
});

describe("ranks + meanwhile", () => {
  it("ladder is monotonic, starts at 0 and tops out below max", () => {
    for (let i = 1; i < RANKS.length; i++) expect(RANKS[i].min).toBeGreaterThan(RANKS[i - 1].min);
    expect(rankFor(0).title).toBe("Should not be allowed near a startup");
    expect(rankFor(maxScore()).title).toBe("Would pass the bar in Luxembourg");
    expect(RANKS[RANKS.length - 1].min).toBeLessThan(maxScore());
  });
  it("meanwhile grows with time and is never zero", () => {
    expect(meanwhile(0).china).toBe(1);
    expect(meanwhile(120_000).china).toBeGreaterThan(meanwhile(30_000).china);
    expect(meanwhileLine(meanwhile(60_000))).toMatch(/^During your round, China released \d+ more models?\./);
  });
  it("verdict line has stamp, basis and citation", () => {
    const c = CARDS.find((c) => c.id === "emotion-webcam")!;
    expect(verdictLine(c)).toBe("PROHIBITED — emotion recognition at work, AI Act Art. 5(1)(f).");
  });

  it("high-risk cost line depends on the classification path", () => {
    const get = (id: string) => CARDS.find((c) => c.id === id)!;
    expect(costLine(get("cv-ranker"))).toMatch(/EU database.*Arts\. 43, 48, 49, 14/);
    expect(costLine(get("grid-safety"))).toMatch(/national level.*49\(5\)/);
    expect(costLine(get("lift-brake"))).toMatch(/August 2027.*notified-body.*43\(3\)/);
    expect(costLine(get("lift-brake"))).not.toMatch(/database/);
    expect(quipFor(get("cv-ranker"))).toBe(costLine(get("cv-ranker")));
  });
});
