/** Production wiring: real providers, env-driven config. Keys are read lazily at call time. */
import path from "node:path";
import { paths, port, profiles, rateLimitPerHour, slngConfig } from "./config.js";
import { buildApp } from "./app.js";
import { Corpus } from "./corpus.js";
import { openDb } from "./db.js";
import { Engine, loadGags } from "./engine.js";
import { Moderator } from "./moderation.js";
import { NebiusLlm } from "./nebius.js";
import { Roster } from "./personas.js";
import { RateLimiter } from "./ratelimit.js";
import { GitHubIntake } from "./repo.js";
import { AudioCache, SlngStt, SlngTts } from "./voice.js";
import { Wall } from "./wall.js";

if (!process.env.NEBIUS_API_KEY) console.warn("NEBIUS_API_KEY is not set — officials will use canned lines only");
if (!process.env.SLNG_API_KEY) console.warn("SLNG_API_KEY is not set — lines will have audioUrl: null and /api/stt will return 503");

const dataDir = paths.data();
const db = openDb(path.join(dataDir, "roast.sqlite"));
const corpus = Corpus.load(paths.corpus());
const roster = Roster.load(paths.personas(), paths.assets());
const llm = new NebiusLlm();
let gags = loadGags(paths.gags(), corpus);
setInterval(() => (gags = loadGags(paths.gags(), corpus)), 60_000).unref();

const engine = new Engine({ llm, corpus, roster, profile: profiles.roast, cheap: profiles.cheap, gags: () => gags, log: (msg, meta) => console.warn(msg, meta ?? "") });
const app = buildApp({
  db,
  corpus,
  roster,
  engine,
  moderator: new Moderator(llm, profiles.cheap),
  wall: new Wall(db),
  limiter: new RateLimiter(db, rateLimitPerHour),
  audio: new AudioCache(new SlngTts(slngConfig), path.join(dataDir, "audio"), (m) => console.warn(m)),
  stt: new SlngStt(slngConfig),
  intake: new GitHubIntake(),
  webDir: paths.web(),
  assetsDir: paths.assets(),
  logger: true,
});

await app.listen({ host: process.env.HOST || "0.0.0.0", port: port() });
console.log(`DG ROAST ministry open on :${port()} — ${roster.specs.length} officials, ${corpus.size} provisions`);
