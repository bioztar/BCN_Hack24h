/** One SQLite file under $DATA_DIR: cases, the wall, rate-limit buckets. node:sqlite, no native build. */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rate_hits (ip TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS rate_hits_ip_ts ON rate_hits (ip, ts);
CREATE TABLE IF NOT EXISTS wall (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cases (
  case_id TEXT PRIMARY KEY,
  ticket INTEGER NOT NULL,
  state TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
`;

export function openDb(file: string): Db {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

export function nextCounter(db: Db, name: string, start: number): number {
  db.prepare("INSERT OR IGNORE INTO counters (name, value) VALUES (?, ?)").run(name, start - 1);
  db.prepare("UPDATE counters SET value = value + 1 WHERE name = ?").run(name);
  return Number((db.prepare("SELECT value FROM counters WHERE name = ?").get(name) as { value: number }).value);
}
