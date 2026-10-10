/** Production wiring: real providers, env-driven config. Keys are read lazily at call time. */
import path from "node:path";
import { paths, port, profiles, rateLimitPerHour, slngConfig } from "./config.js";
import { analyzerPlugin, WEB_DIST as ANALYZER_WEB } from "@dg-roast/analyzer";
import { buildApp } from "./app.js";
import { Corpus } from "./corpus.js";
import { openDb } from "./db.js";
import { Engine, loadGags } from "./engine.js";
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
const audio = new AudioCache(new SlngTts(slngConfig), path.join(dataDir, "audio"), (m) => console.warn(m));
const app = buildApp({
  db,
  corpus,
  roster,
  engine,
  wall: new Wall(db),
  limiter: new RateLimiter(db, rateLimitPerHour),
  audio,
  stt: new SlngStt(slngConfig),
  intake: new GitHubIntake(),
  webDir: paths.web(),
  pocketDir: paths.pocket(),
  assetsDir: paths.assets(),
  reportsDir: path.join(dataDir, "reports"),
  analyzer: { plugin: analyzerPlugin, options: { corpusPath: paths.corpus() }, webDir: ANALYZER_WEB },
  logger: true,
});

await app.listen({ host: process.env.HOST || "0.0.0.0", port: port() });
console.log(`DG ROAST ministry open on :${port()} — ${roster.specs.length} officials, ${corpus.size} provisions`);

// Pre-render every canned/fallback line (cached by content hash) so fallbacks always have audio.
if (process.env.SLNG_API_KEY) {
  const jobs = engine.cannedLines();
  let next = 0;
  let ok = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const j = jobs[next++]!;
      if (await audio.render(j.text, roster.get(j.speaker)!.voice)) ok++;
    }
  };
  void Promise.all([worker(), worker(), worker()]).then(() => console.log(`pre-rendered ${ok}/${jobs.length} canned lines`));
}
