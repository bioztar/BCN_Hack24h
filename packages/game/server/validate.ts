/** Score submission parsing (CONTRACT "Arcade": `{game, name, score, durationMs, seed, token, stats}`). */
import { isGameId, type GameId, type Stats } from "./games.js";

export const NAME_MAX = 24;
export const DEFAULT_NAME = "Anonymous stagiaire";
const STATS_MAX_KEYS = 16;

export interface ScoreInput {
  game: GameId;
  name: string;
  score: number;
  durationMs: number;
  seed: string;
  token: string;
  stats: Stats;
}

export function cleanName(raw: unknown): string {
  const s = String(raw ?? "")
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}<>]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return [...s].slice(0, NAME_MAX).join("") || DEFAULT_NAME;
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

/** `game` defaults to "whack"; whack's original flat `hits/mistralHits/bestCombo` are folded into stats. */
export function parseScore(body: unknown): ScoreInput | string {
  if (!body || typeof body !== "object") return "body must be JSON";
  const b = body as Record<string, unknown>;
  const game = b.game ?? "whack";
  if (!isGameId(game)) return "unknown game";
  if (!isInt(b.score)) return "score must be an integer";
  if (!isInt(b.durationMs)) return "durationMs must be an integer";
  if (typeof b.seed !== "string" || typeof b.token !== "string") return "seed and token are required";
  const stats: Stats = {};
  const rawStats = b.stats && typeof b.stats === "object" ? (b.stats as Record<string, unknown>) : {};
  for (const k of ["hits", "mistralHits", "bestCombo"]) if (b[k] !== undefined && rawStats[k] === undefined) rawStats[k] = b[k];
  const keys = Object.keys(rawStats);
  if (keys.length > STATS_MAX_KEYS) return "too many stats";
  for (const k of keys) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(k)) return `bad stat ${k.slice(0, 32)}`;
    const v = rawStats[k];
    if (!isInt(v)) return `stats.${k} must be an integer`;
    stats[k] = v;
  }
  return { game, name: cleanName(b.name), score: b.score, durationMs: b.durationMs, seed: b.seed, token: b.token, stats };
}
