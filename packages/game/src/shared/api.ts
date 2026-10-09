/** Arcade leaderboard client: server (`/api/game/*`) or local-only (?mock=1, or server unreachable). */
import { MOCK } from "./env";

export type GameId = "whack" | "swipe" | "flappy" | "triplicate";
export type Stats = Record<string, number>;

export interface Entry {
  rank: number;
  name: string;
  score: number;
  stats: Stats;
  title: string | null;
  at: string;
  mine?: boolean;
}

export interface Ticket {
  game: GameId;
  seed: string;
  token: string | null;
  /** True when this round is local-only (mock or server down). */
  local: boolean;
}

export interface Submission {
  name: string;
  score: number;
  durationMs: number;
  stats: Stats;
  title?: string | null;
}

const API = "/api/game";
const NAME_KEY = "eurocrat-arcade-name";

export const savedName = (): string => localStorage.getItem(NAME_KEY) ?? "";
export const saveName = (n: string): void => localStorage.setItem(NAME_KEY, n.trim().slice(0, 24));

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(Date.now());
}

/** Fictional officials from PERSONA.md so the mock board is not empty. Mock only. */
const MOCK_SEED: Record<GameId, [string, number][]> = {
  whack: [["Mme Annexe-Vandamme", 21_400], ["Dr. H. Formblatt", 12_800], ["AUDITOR-9000", 6_300], ["Kevin from Compliance", 1_450]],
  swipe: [["Oma Gerda", 1_900], ["Kevin from Compliance", 600]],
  flappy: [["Inspector de Vries", 31], ["The Cookie", 4]],
  triplicate: [["The Trilogue", 8_100], ["Dr. H. Formblatt", 2_200]],
};

interface LocalRow {
  name: string;
  score: number;
  stats: Stats;
  title: string | null;
  at: string;
  mine?: boolean;
}

function localKey(game: GameId): string {
  return `eurocrat-arcade:${game}:${today()}`;
}

function localRows(game: GameId): LocalRow[] {
  try {
    const raw = localStorage.getItem(localKey(game));
    if (raw) return JSON.parse(raw) as LocalRow[];
  } catch {
    /* corrupt → reset */
  }
  return MOCK ? MOCK_SEED[game].map(([name, score]) => ({ name, score, stats: {}, title: null, at: new Date().toISOString() })) : [];
}

function sortRows(rows: LocalRow[]): LocalRow[] {
  return rows.sort((a, b) => b.score - a.score || a.at.localeCompare(b.at));
}

function localSubmit(game: GameId, s: Submission): number {
  const at = new Date().toISOString();
  const rows = localRows(game).map((r) => ({ ...r, mine: false }));
  rows.push({ name: s.name || "Anonymous stagiaire", score: s.score, stats: s.stats, title: s.title ?? null, at, mine: true });
  sortRows(rows);
  localStorage.setItem(localKey(game), JSON.stringify(rows.slice(0, 50)));
  return rows.findIndex((r) => r.at === at && r.mine) + 1;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

function randomSeed(): string {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function startRound(game: GameId): Promise<Ticket> {
  if (!MOCK) {
    try {
      const r = await json<{ seed: string; token: string }>(await fetch(`${API}/start?game=${game}`, { cache: "no-store" }));
      return { game, seed: r.seed, token: r.token, local: false };
    } catch {
      /* offline → play locally */
    }
  }
  return { game, seed: randomSeed(), token: null, local: true };
}

/** Returns today's rank, or null if the server refused the score. */
export async function submitScore(t: Ticket, s: Submission): Promise<number | null> {
  if (t.local || !t.token) return localSubmit(t.game, s);
  try {
    const res = await fetch(`${API}/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ game: t.game, name: s.name, score: s.score, durationMs: s.durationMs, seed: t.seed, token: t.token, stats: s.stats }),
    });
    return (await json<{ rank: number }>(res)).rank;
  } catch {
    return null;
  }
}

export async function leaderboard(game: GameId, limit = 20): Promise<{ entries: Entry[]; local: boolean }> {
  if (!MOCK) {
    try {
      const r = await json<{ entries: Entry[] }>(await fetch(`${API}/leaderboard?game=${game}&limit=${limit}`, { cache: "no-store" }));
      return { entries: r.entries, local: false };
    } catch {
      /* fall through to local */
    }
  }
  return { entries: sortRows(localRows(game)).slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 })), local: true };
}
