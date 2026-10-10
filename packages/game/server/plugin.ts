/**
 * Arcade leaderboard plugin — helm registers `app.register(gamePlugin, { prefix: "/api/game" })` and
 * serves GAME_WEB_DIST at /game/ (arcade landing at /game/, Whack-a-Model at /game/whack/).
 * Every route takes a game id: "whack" | "swipe" | "flappy" | "triplicate" (default "whack").
 *   GET  /start?game=        → { game, seed, token, roundMs? }   (HMAC token)
 *   POST /score              → { rank, title }   body { game, name, score, durationMs, seed, token, stats }
 *   GET  /leaderboard?game=  → { game, day, entries }   (?limit=20, today, Brussels time)
 */
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROUND_MS } from "../src/core/rules.js";
import { GAMES, isGameId, type GameId } from "./games.js";
import { RateLimiter } from "./ratelimit.js";
import { GameStore } from "./store.js";
import { issueToken, newSeed, verifyToken } from "./token.js";
import { parseScore } from "./validate.js";

const PKG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = path.resolve(PKG_DIR, "..", "..");
export const GAME_WEB_DIST = path.join(PKG_DIR, "dist");

export interface GameOptions {
  /** HMAC secret; default env GAME_SECRET, else random per boot. */
  secret?: string;
  /** SQLite file; default $DATA_DIR/game.sqlite. Pass a ready store in tests. */
  dbFile?: string;
  store?: GameStore;
  /** Per IP per window for /start and /score each (default 240 per 10 min — a venue shares one IP; env GAME_RATE_LIMIT / GAME_RATE_WINDOW_MS). */
  rateLimit?: { limit: number; windowMs: number };
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}

function envInt(v: string | undefined, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
}

export const gamePlugin: FastifyPluginAsync<GameOptions> = async (app, opts) => {
  const env = opts.env ?? process.env;
  const now = opts.now ?? Date.now;
  const secret = opts.secret ?? (env.GAME_SECRET || randomBytes(32).toString("hex"));
  const store = opts.store ?? new GameStore(opts.dbFile ?? path.join(env.DATA_DIR || path.join(REPO_ROOT, "data"), "game.sqlite"));
  if (!opts.store) app.addHook("onClose", async () => store.close());
  const rl = opts.rateLimit ?? { limit: envInt(env.GAME_RATE_LIMIT, 240), windowMs: envInt(env.GAME_RATE_WINDOW_MS, 10 * 60 * 1000) };
  const startLimiter = new RateLimiter(rl.limit, rl.windowMs, now);
  const scoreLimiter = new RateLimiter(rl.limit, rl.windowMs, now);

  const limited = (limiter: RateLimiter, req: FastifyRequest, reply: FastifyReply): boolean => {
    const wait = limiter.check(req.ip);
    if (!wait) return false;
    void reply.code(429).header("retry-after", String(wait)).send({ error: "Too many requests. Please fill in Form RL-429 and wait.", retryAfterSec: wait });
    return true;
  };

  const gameParam = (req: FastifyRequest): GameId | null => {
    const g = (req.query as { game?: string }).game ?? "whack";
    return isGameId(g) ? g : null;
  };

  app.get("/start", async (req, reply) => {
    if (limited(startLimiter, req, reply)) return reply;
    const game = gameParam(req);
    if (!game) return reply.code(400).send({ error: "unknown game" });
    const seed = newSeed();
    void reply.header("cache-control", "no-store");
    return { game, seed, token: issueToken(secret, game, seed, now()), ...(game === "whack" ? { roundMs: ROUND_MS } : {}) };
  });

  app.post("/score", { bodyLimit: 4096 }, async (req, reply) => {
    if (limited(scoreLimiter, req, reply)) return reply;
    const input = parseScore(req.body);
    if (typeof input === "string") return reply.code(400).send({ error: input });
    const spec = GAMES[input.game];
    const t = now();
    const v = verifyToken(secret, input.token, t, spec.tokenTtlMs);
    if (!v.ok) return reply.code(401).send({ error: `token ${v.reason}` });
    if (v.claims.seed !== input.seed || v.claims.game !== input.game) return reply.code(401).send({ error: "token does not match this round" });
    if (store.seedUsed(input.seed)) return reply.code(409).send({ error: "score already filed for this round" });
    const why = spec.implausible(input, t - v.claims.issuedAt);
    if (why) {
      req.log.warn({ stage: "game.score", game: input.game, reason: why }, "implausible score rejected");
      return reply.code(422).send({ error: `implausible: ${why}` });
    }
    const rank = store.insert({ ...input, at: t });
    return { rank, title: spec.rankTitle?.(input.score) ?? null };
  });

  app.get("/leaderboard", async (req, reply) => {
    const game = gameParam(req);
    if (!game) return reply.code(400).send({ error: "unknown game" });
    void reply.header("cache-control", "no-store");
    return store.leaderboard(game, now(), envInt((req.query as { limit?: string }).limit, 20));
  });
};
