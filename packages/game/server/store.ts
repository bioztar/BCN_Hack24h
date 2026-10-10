/** Arcade leaderboard: its own SQLite file (node:sqlite) under $DATA_DIR — never the roast DB. */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { GAMES, type GameId, type Stats } from "./games.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS arcade_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL,
  day TEXT NOT NULL,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  stats TEXT NOT NULL,
  seed TEXT NOT NULL UNIQUE,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS arcade_scores_board ON arcade_scores (game, day, score DESC, at ASC);
`;

/** Leaderboards reset at midnight Brussels time. */
export function dayOf(ts: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(ts);
}

export interface ScoreRow {
  game: GameId;
  name: string;
  score: number;
  durationMs: number;
  stats: Stats;
  seed: string;
  at: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  stats: Stats;
  /** Rank title where the game has one (whack). */
  title: string | null;
  at: string;
}

interface DbRow {
  name: string;
  score: number;
  stats: string;
  at: number;
}

export class GameStore {
  readonly db: DatabaseSync;
  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    if (file !== ":memory:") this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  seedUsed(seed: string): boolean {
    return this.db.prepare("SELECT 1 FROM arcade_scores WHERE seed = ?").get(seed) !== undefined;
  }

  /** Inserts and returns the 1-based rank for the game and day (ties: earlier score ranks higher). */
  insert(r: ScoreRow): number {
    const day = dayOf(r.at);
    this.db
      .prepare("INSERT INTO arcade_scores (game, day, name, score, duration_ms, stats, seed, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(r.game, day, r.name, r.score, r.durationMs, JSON.stringify(r.stats), r.seed, r.at);
    const ahead = this.db
      .prepare("SELECT COUNT(*) AS n FROM arcade_scores WHERE game = ? AND day = ? AND (score > ? OR (score = ? AND at < ?))")
      .get(r.game, day, r.score, r.score, r.at) as { n: number };
    return Number(ahead.n) + 1;
  }

  leaderboard(game: GameId, now: number, limit = 20): { game: GameId; day: string; entries: LeaderboardEntry[] } {
    const day = dayOf(now);
    const rows = this.db
      .prepare("SELECT name, score, stats, at FROM arcade_scores WHERE game = ? AND day = ? ORDER BY score DESC, at ASC, id ASC LIMIT ?")
      .all(game, day, Math.max(1, Math.min(100, Math.floor(limit)))) as unknown as DbRow[];
    const titleOf = GAMES[game].rankTitle;
    return {
      game,
      day,
      entries: rows.map((r, i) => ({
        rank: i + 1,
        name: r.name,
        score: Number(r.score),
        stats: JSON.parse(r.stats) as Stats,
        title: titleOf ? titleOf(Number(r.score)) : null,
        at: new Date(Number(r.at)).toISOString(),
      })),
    };
  }

  close(): void {
    this.db.close();
  }
}
