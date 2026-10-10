/** Board + timing + scoring constants. The leaderboard cap in README is derived from these. */
export const COLS = 3;
export const ROWS = 10;

/** Pause between a lock and the next spawn — the floor on time per piece. */
export const SPAWN_DELAY_MS = 220;
/** Extra pause when rows clear, so the stamp lands. */
export const CLEAR_PAUSE_MS = 380;

export const FILED_POINTS = 10;
export const ROW_POINTS = 300;
export const MAX_CHAIN_MULT = 3;
export const MAX_FORMS_PER_PIECE = 3;

export const PIECES_PER_LEVEL = 10;
const BASE_INTERVAL_MS = 650;
const INTERVAL_DECAY = 0.88;
export const MIN_INTERVAL_MS = 70;

export const levelFor = (pieces: number): number => 1 + Math.floor(Math.max(0, pieces) / PIECES_PER_LEVEL);

/** ms per row of gravity at a level: geometric speed-up, floored. */
export const dropInterval = (level: number): number =>
  Math.max(MIN_INTERVAL_MS, Math.round(BASE_INTERVAL_MS * INTERVAL_DECAY ** (Math.max(1, level) - 1)));

export const rowScore = (rows: number, chain: number): number =>
  ROW_POINTS * rows * Math.min(Math.max(1, chain), MAX_CHAIN_MULT);

/** Each form scores at most once when filed and once when its row clears (≤ ROW_POINTS × MAX_CHAIN_MULT / 3). */
export const MAX_POINTS_PER_FORM = FILED_POINTS + (ROW_POINTS * MAX_CHAIN_MULT) / COLS;

/** Upper bound for the leaderboard plausibility cap (see README). */
export const maxPlausibleScore = (durationMs: number): number =>
  (Math.floor(Math.max(0, durationMs) / SPAWN_DELAY_MS) + 1) * MAX_FORMS_PER_PIECE * MAX_POINTS_PER_FORM;

export interface RankTitle {
  min: number;
  title: string;
}

export const RANKS: readonly RankTitle[] = [
  { min: 0, title: "Intern (stagiaire)" },
  { min: 1500, title: "Desk Officer" },
  { min: 4000, title: "Head of Unit" },
  { min: 8000, title: "Director" },
  { min: 14000, title: "Director-General" },
  { min: 22000, title: "Commissioner" },
  { min: 35000, title: "President of the Commission" },
];

export const rankFor = (score: number): string => {
  let r = RANKS[0]!.title;
  for (const x of RANKS) if (score >= x.min) r = x.title;
  return r;
};

/** Same absurd rates as the server's Meanwhile (China ≈ one model per 18 s, EU ≈ 1.7 forms per s). */
export function meanwhileFor(durationMs: number): { china: number; us: number; euForms: number } {
  const t = Math.max(0, durationMs) / 1000;
  return {
    china: Math.max(1, Math.round(t / 18)),
    us: Math.round(t / 75),
    euForms: Math.max(1, Math.round(t * 1.7)),
  };
}

export const fmtDuration = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

export function meanwhileLine(durationMs: number): string {
  const m = meanwhileFor(durationMs);
  const models = m.china === 1 ? "1 more model" : `${m.china} more models`;
  return `During your ${fmtDuration(durationMs)}, China released ${models}. Europe adopted ${m.euForms} new forms. You filed some of them.`;
}
