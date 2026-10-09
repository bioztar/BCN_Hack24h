/** Scoring per docs/CONTRACT.md "Game — Eurocrat: Whack-a-Model". Pure: shared by client, server and tests. */
export const ROUND_MS = 45_000;
export const HOLES = 9;
export const HIT_POINTS = 100;
/** Combo multiplier cap (streak keeps counting for "best combo"). */
export const COMBO_CAP = 10;
export const MISTRAL_PENALTY = -500;
export const ESCAPE_PENALTY = -25;

export type GameEvent =
  | "hit" // stamped a non-EU model
  | "mistral" // stamped the only European one
  | "escape" // a non-EU model got away
  | "spared" // Mistral left alone (correct)
  | "miss"; // stamped an empty hole

export interface Tally {
  score: number;
  hits: number;
  mistralHits: number;
  escapes: number;
  misses: number;
  streak: number;
  bestCombo: number;
}

export interface Scored {
  tally: Tally;
  points: number;
  /** Multiplier applied to this event (hits only, else 0). */
  combo: number;
}

export function newTally(): Tally {
  return { score: 0, hits: 0, mistralHits: 0, escapes: 0, misses: 0, streak: 0, bestCombo: 0 };
}

export function comboMultiplier(streak: number): number {
  return Math.max(1, Math.min(streak, COMBO_CAP));
}

export function score(t: Tally, ev: GameEvent): Scored {
  switch (ev) {
    case "hit": {
      const streak = t.streak + 1;
      const combo = comboMultiplier(streak);
      const points = HIT_POINTS * combo;
      return { tally: { ...t, score: t.score + points, hits: t.hits + 1, streak, bestCombo: Math.max(t.bestCombo, streak) }, points, combo };
    }
    case "mistral":
      return { tally: { ...t, score: t.score + MISTRAL_PENALTY, mistralHits: t.mistralHits + 1, streak: 0 }, points: MISTRAL_PENALTY, combo: 0 };
    case "escape":
      return { tally: { ...t, score: t.score + ESCAPE_PENALTY, escapes: t.escapes + 1, streak: 0 }, points: ESCAPE_PENALTY, combo: 0 };
    case "miss":
      return { tally: { ...t, misses: t.misses + 1, streak: 0 }, points: 0, combo: 0 };
    case "spared":
      return { tally: t, points: 0, combo: 0 };
  }
}

export const RANKS: readonly { min: number; title: string }[] = [
  { min: Number.NEGATIVE_INFINITY, title: "Intern (stagiaire)" },
  { min: 2_000, title: "Desk Officer" },
  { min: 6_000, title: "Head of Unit" },
  { min: 12_000, title: "Director" },
  { min: 20_000, title: "Director-General" },
  { min: 32_000, title: "Commissioner" },
  { min: 50_000, title: "President of the Commission" },
];

export function rankTitle(points: number): string {
  let title = RANKS[0]!.title;
  for (const r of RANKS) if (points >= r.min) title = r.title;
  return title;
}

export const STAMP_WORDS: readonly string[] = [
  "REFUSÉ",
  "VERBOTEN",
  "INTERDIT",
  "BANNED",
  "PROHIBITED ART. 5",
  "NON-CONFORME",
  "VIETATO",
  "PROHIBIDO",
  "ZAKAZANE",
  "SEE ANNEX III",
  "PENDING DELEGATED ACT",
];
