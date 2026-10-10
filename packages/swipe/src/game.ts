import data from "./cards.json";

export type Verdict = "banned" | "allowed";
export type Kind =
  | "prohibited"
  | "unlawful"
  | "noncompliant"
  | "highrisk"
  | "transparency"
  | "minimal"
  | "carveout"
  | "exception"
  | "outofscope"
  | "lawful";
export type Tier = 1 | 2 | 3;

export interface Card {
  id: string;
  tier: Tier;
  verdict: Verdict;
  kind: Kind;
  pitch: string;
  basis: string;
  /** corpus/provisions.json id */
  cite: string;
  /** precise reference, always starts with the corpus label */
  ref: string;
  url: string;
  quip?: string;
}

export const CARDS: readonly Card[] = (data as { cards: Card[] }).cards;

export const ROUND_CARDS = 20;
export const CARD_MS = 8000;
export const BASE_POINTS = 100;
export const SPEED_MAX = 50;
export const STREAK_STEP = 25;
export const STREAK_CAP = 10;

export const BANNED_KINDS: ReadonlySet<Kind> = new Set<Kind>(["prohibited", "unlawful", "noncompliant"]);

export const KIND_STAMP: Record<Kind, string> = {
  prohibited: "PROHIBITED",
  unlawful: "UNLAWFUL",
  noncompliant: "NON-COMPLIANT",
  highrisk: "ALLOWED — HIGH-RISK",
  transparency: "ALLOWED — WITH A LABEL",
  minimal: "ALLOWED — MINIMAL RISK",
  carveout: "ALLOWED — NOT HIGH-RISK",
  exception: "ALLOWED — NARROW EXCEPTION",
  outofscope: "ALLOWED — OUT OF SCOPE",
  lawful: "ALLOWED",
};

const KIND_QUIP: Partial<Record<Kind, string>> = {
  highrisk: "Bring 400 forms.",
  minimal: "Nothing to fill in. We are as surprised as you.",
  transparency: "Label it and carry on.",
  prohibited: "Fines up to €35 million or 7 % of turnover.",
};

export function verdictLine(card: Card): string {
  return `${KIND_STAMP[card.kind]} — ${card.basis}, ${card.ref}.`;
}

export function quipFor(card: Card): string | undefined {
  return card.quip ?? KIND_QUIP[card.kind];
}

/** FNV-1a 32-bit. */
export function hashSeed(seed: string | number): number {
  const s = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], r: () => number): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

/** Difficulty curve: the first 30 % of a round are obvious, the last 30 % are the tricky carve-outs. */
export function tierForSlot(i: number, n = ROUND_CARDS): Tier {
  const f = i / n;
  return f < 0.3 ? 1 : f < 0.7 ? 2 : 3;
}

const TIER_FALLBACK: Record<Tier, Tier[]> = { 1: [1, 2, 3], 2: [2, 1, 3], 3: [3, 2, 1] };

/** Deterministic per seed: tiers follow `tierForSlot`, verdicts split half/half. */
export function buildDeck(seed: string | number, n = ROUND_CARDS, cards: readonly Card[] = CARDS): Card[] {
  const r = rng(hashSeed(seed));
  const targets = shuffle(
    Array.from({ length: n }, (_, i): Verdict => (i % 2 === 0 ? "banned" : "allowed")),
    r,
  );
  const pools: Record<Tier, Card[]> = {
    1: shuffle(cards.filter((c) => c.tier === 1), r),
    2: shuffle(cards.filter((c) => c.tier === 2), r),
    3: shuffle(cards.filter((c) => c.tier === 3), r),
  };
  const used = new Set<string>();
  const deck: Card[] = [];
  for (let i = 0; i < n; i++) {
    const order = TIER_FALLBACK[tierForSlot(i, n)];
    let pick: Card | undefined;
    for (const want of [targets[i], null] as const) {
      for (const t of order) {
        pick = pools[t].find((c) => !used.has(c.id) && (want === null || c.verdict === want));
        if (pick) break;
      }
      if (pick) break;
    }
    if (!pick) break;
    used.add(pick.id);
    deck.push(pick);
  }
  return deck;
}

export interface Scored {
  points: number;
  streak: number;
  speed: number;
  bonus: number;
}

export function scoreAnswer(correct: boolean, msLeft: number, streakBefore: number): Scored {
  if (!correct) return { points: 0, streak: 0, speed: 0, bonus: 0 };
  const streak = streakBefore + 1;
  const left = Math.min(Math.max(msLeft, 0), CARD_MS);
  const speed = Math.round((SPEED_MAX * left) / CARD_MS);
  const bonus = STREAK_STEP * Math.min(streak - 1, STREAK_CAP);
  return { points: BASE_POINTS + speed + bonus, streak, speed, bonus };
}

/** Perfect round: every card right with the full 8 s left. 6625 for 20 cards. */
export function maxScore(n = ROUND_CARDS): number {
  let s = 0;
  for (let k = 1; k <= n; k++) s += BASE_POINTS + SPEED_MAX + STREAK_STEP * Math.min(k - 1, STREAK_CAP);
  return s;
}

export interface Answer {
  card: Card;
  choice: Verdict | null;
  correct: boolean;
  msLeft: number;
  points: number;
  streak: number;
}

export interface RoundStats {
  score: number;
  correct: number;
  wrong: number;
  timeouts: number;
  total: number;
  bestStreak: number;
}

export class Round {
  readonly deck: Card[];
  index = 0;
  score = 0;
  streak = 0;
  bestStreak = 0;
  readonly answers: Answer[] = [];

  constructor(seed: string | number, n = ROUND_CARDS) {
    this.deck = buildDeck(seed, n);
  }

  get current(): Card | undefined {
    return this.deck[this.index];
  }

  get done(): boolean {
    return this.index >= this.deck.length;
  }

  /** `choice: null` = the 8 s ran out. */
  answer(choice: Verdict | null, msLeft: number): Answer {
    const card = this.current;
    if (!card) throw new Error("round is over");
    const correct = choice === card.verdict;
    const s = scoreAnswer(correct, msLeft, this.streak);
    this.streak = s.streak;
    this.bestStreak = Math.max(this.bestStreak, s.streak);
    this.score += s.points;
    const a: Answer = { card, choice, correct, msLeft, points: s.points, streak: s.streak };
    this.answers.push(a);
    this.index++;
    return a;
  }

  stats(): RoundStats {
    const correct = this.answers.filter((a) => a.correct).length;
    const timeouts = this.answers.filter((a) => a.choice === null).length;
    return {
      score: this.score,
      correct,
      wrong: this.answers.length - correct - timeouts,
      timeouts,
      total: this.deck.length,
      bestStreak: this.bestStreak,
    };
  }
}

export const RANKS: readonly { min: number; title: string }[] = [
  { min: 0, title: "Should not be allowed near a startup" },
  { min: 600, title: "Thinks GDPR is a cookie banner" },
  { min: 1500, title: "Stagiaire, unpaid, third floor" },
  { min: 2500, title: "Desk Officer, grade AD5" },
  { min: 3500, title: "Head of Unit (acting)" },
  { min: 4500, title: "Legal Service, eleventh floor" },
  { min: 5500, title: "Would pass the bar in Luxembourg" },
];

export function rankFor(score: number): { index: number; title: string } {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (score >= RANKS[i].min) index = i;
  return { index, title: RANKS[index].title };
}

/** Swipe resolution: far enough, or a flick. */
export function resolveSwipe(dx: number, vx: number, width: number): Verdict | null {
  const threshold = Math.max(60, width * 0.25);
  if (dx <= -threshold || (vx <= -0.5 && dx < -30)) return "banned";
  if (dx >= threshold || (vx >= 0.5 && dx > 30)) return "allowed";
  return null;
}

export interface Meanwhile {
  china: number;
  us: number;
  forms: number;
}

export function meanwhile(durationMs: number): Meanwhile {
  const s = Math.max(0, durationMs) / 1000;
  return { china: Math.max(1, Math.ceil(s / 15)), us: Math.floor(s / 45), forms: Math.max(1, Math.round(s * 1.7)) };
}

export function meanwhileLine(m: Meanwhile): string {
  const models = (n: number) => `${n} more model${n === 1 ? "" : "s"}`;
  const us = m.us > 0 ? ` The US released ${models(m.us)}.` : "";
  return `During your round, China released ${models(m.china)}.${us} Europe produced ${m.forms} new forms.`;
}
