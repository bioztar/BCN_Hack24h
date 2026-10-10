/**
 * Arcade game registry: per-game plausibility caps for the shared leaderboard.
 * whack is exact (its scheduler is in this package); swipe/flappy/triplicate are generous
 * placeholders until their lanes document a max-score formula in their package README.
 */
import { MISTRAL_PENALTY, ESCAPE_PENALTY, ROUND_MS, rankTitle } from "../src/core/rules.js";
import { maxPlausibleScore, maxSpawns } from "../src/core/scheduler.js";

export const GAME_IDS = ["whack", "swipe", "flappy", "triplicate"] as const;
export type GameId = (typeof GAME_IDS)[number];

export type Stats = Record<string, number>;

export interface Submission {
  score: number;
  durationMs: number;
  stats: Stats;
}

export interface GameSpec {
  id: GameId;
  title: string;
  /** Longest legitimate round. */
  maxDurationMs: number;
  /** How long after /start a score may be filed. */
  tokenTtlMs: number;
  /** Reason when impossible, else null. `elapsedMs` = time since the token was issued. */
  implausible(s: Submission, elapsedMs: number): string | null;
  rankTitle?(score: number): string;
}

const MIN = 60_000;
/** Allowed overrun of a timed round (frame timing, tab hiccups). */
export const DURATION_SLACK_MS = 1_500;

function common(spec: Pick<GameSpec, "maxDurationMs">, s: Submission, elapsedMs: number): string | null {
  if (s.durationMs < 0 || s.durationMs > spec.maxDurationMs + DURATION_SLACK_MS) return "duration";
  if (s.durationMs > elapsedMs + DURATION_SLACK_MS) return "duration longer than the token is old";
  for (const v of Object.values(s.stats)) if (v < 0) return "negative stats";
  return null;
}

const whack: GameSpec = {
  id: "whack",
  title: "Whack-a-Model",
  maxDurationMs: ROUND_MS,
  tokenTtlMs: 2 * MIN,
  rankTitle,
  implausible(s, elapsedMs) {
    const c = common(this, s, elapsedMs);
    if (c) return c;
    const hits = s.stats.hits ?? 0;
    const mistralHits = s.stats.mistralHits ?? 0;
    const bestCombo = s.stats.bestCombo ?? 0;
    const spawns = maxSpawns(s.durationMs);
    if (hits + mistralHits > spawns) return "more hits than pop-ups";
    if (bestCombo > hits) return "combo";
    if (s.score > maxPlausibleScore(s.durationMs)) return "score above plausible max";
    if (s.score < spawns * (MISTRAL_PENALTY + ESCAPE_PENALTY)) return "score below plausible min";
    return null;
  },
};

/** Generous: score ≤ perSecond × seconds (+ floor), duration ≤ max. */
function generous(id: GameId, title: string, maxDurationMs: number, perSecond: number, floor: number): GameSpec {
  return {
    id,
    title,
    maxDurationMs,
    tokenTtlMs: maxDurationMs + 2 * MIN,
    implausible(s, elapsedMs) {
      const c = common(this, s, elapsedMs);
      if (c) return c;
      if (s.score > floor + perSecond * Math.ceil(s.durationMs / 1000)) return "score above plausible max";
      if (s.score < -floor) return "score below plausible min";
      return null;
    },
  };
}

export const GAMES: Record<GameId, GameSpec> = {
  whack,
  // 20 cards × 8 s, plus flip/animation time.
  swipe: generous("swipe", "Legal or Banned?", 10 * MIN, 2_000, 5_000),
  // Score = pillars passed; pillars are > 0.5 s apart at top speed.
  flappy: generous("flappy", "Regulatory Flappy", 30 * MIN, 3, 10),
  triplicate: generous("triplicate", "In Triplicate", 60 * MIN, 3_000, 5_000),
};

export function isGameId(v: unknown): v is GameId {
  return typeof v === "string" && (GAME_IDS as readonly string[]).includes(v);
}
