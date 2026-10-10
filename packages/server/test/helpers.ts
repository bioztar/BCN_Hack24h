import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp, type AppDeps } from "../src/app.js";
import { profiles } from "../src/config.js";
import { Corpus } from "../src/corpus.js";
import { openDb } from "../src/db.js";
import { Engine, type Timings } from "../src/engine.js";
import type { Llm, LlmRequest } from "../src/llm.js";
import { Roster } from "../src/personas.js";
import { RateLimiter } from "../src/ratelimit.js";
import { GitHubIntake } from "../src/repo.js";
import { AudioCache, type Stt, type Tts } from "../src/voice.js";
import { Wall } from "../src/wall.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const corpus = Corpus.load(path.join(ROOT, "corpus", "provisions.json"));
export const roster = Roster.load(path.join(ROOT, "content", "personas"), path.join(ROOT, "assets", "generated"));

export function chunked(text: string, size = 17): AsyncIterable<string> {
  return (async function* () {
    for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
  })();
}

/** Fake Nebius: answers meta extraction and roast prompts. Records every request. */
export class FakeLlm implements Llm {
  readonly calls: LlmRequest[] = [];
  failRoast = false;
  constructor(readonly revenue: number | null = 1_000_000_000) {}

  stream(req: LlmRequest): AsyncIterable<string> {
    this.calls.push(req);
    const sys = req.messages[0]!.content;
    if (sys.includes("Extract from the pitch")) return chunked(JSON.stringify({ revenueEur: this.revenue, startup: "Fridgely" }));
    if (this.failRoast) return (async function* () { throw new Error("nebius 503"); })();
    const ids = [...sys.matchAll(/- id "([^"]+)"/g)].map((m) => m[1]!);
    const tier = Number(/CURRENT TIER (\d)/.exec(sys)![1]);
    const [a, b] = ids as [string, string];
    const lines = [
      { speaker: a, text: `Tier ${tier}: your fridge processes biometric data, which Article 999 forbids.`, provisions: ["ai-act-999", "gdpr-9"], clip: `tier${tier}`, stamp: null, charge: "Biometric fridge." },
      { speaker: b, text: `I refuse your draft. Under Article 50 it lacks transparency.`, provisions: ["ai-act-50", "made-up-1"], clip: "talking", stamp: tier >= 2 ? "REFUSÉ" : null, charge: "Undisclosed chatbot." },
      { speaker: a, text: "Then we refuse it twice, in triplicate.", provisions: ["gdpr-6"], clip: "stamp", stamp: "INCOMPLET" },
    ];
    // One compact, one pretty-printed (spans chunks/newlines), one compact.
    const out = `${JSON.stringify(lines[0])}\n${JSON.stringify(lines[1], null, 2)}\n${JSON.stringify(lines[2])}\n`;
    return chunked(out);
  }
}

export class FakeTts implements Tts {
  calls = 0;
  fail = false;
  delayMs = 0;
  async synthesize(text: string) {
    this.calls++;
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.fail) throw new Error("SLNG_API_KEY is not set");
    return { audio: Buffer.from(`mp3:${text}`), contentType: "audio/mpeg" };
  }
}

export class FakeStt implements Stt {
  async transcribe(audio: Buffer, mime: string) {
    return `heard ${audio.length} bytes of ${mime}`;
  }
}

export interface FakeRepo {
  meta?: Record<string, unknown>;
  status?: number;
  tree: Record<string, { name: string; path: string; type: "file" | "dir" | "symlink" }[]>;
  files: Record<string, string>;
  redirect?: boolean;
}

/** Fake api.github.com. Records URLs so tests can prove nothing else was fetched. */
export function fakeGitHub(repo: FakeRepo) {
  const urls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (repo.redirect) return new Response(null, { status: 301, headers: { location: "https://evil.example/" } });
    const u = new URL(url);
    if (u.hostname !== "api.github.com") throw new Error(`off-host fetch ${url}`);
    const t = /^\/repos\/[^/]+\/[^/]+\/git\/trees\/[^/]+$/.exec(u.pathname);
    if (t) {
      const tree = Object.values(repo.tree).flat().map((e) => ({ path: e.path, type: e.type === "dir" ? "tree" : "blob", mode: e.type === "symlink" ? "120000" : e.type === "dir" ? "040000" : "100644" }));
      return Response.json({ sha: "x", tree, truncated: false });
    }
    const m = /^\/repos\/([^/]+)\/([^/]+)(?:\/contents\/?(.*))?$/.exec(u.pathname)!;
    if (m[3] === undefined) {
      if (repo.status) return new Response("{}", { status: repo.status });
      return Response.json({ full_name: `${m[1]}/${m[2]}`, private: false, description: "A fridge that judges you", stargazers_count: 7, language: "TypeScript", default_branch: "main", license: null, ...repo.meta });
    }
    const p = decodeURIComponent(m[3]);
    if (p in repo.files) return new Response(repo.files[p], { headers: { "content-type": "text/plain" } });
    const listing = repo.tree[p];
    if (listing) return Response.json(listing);
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { impl, urls };
}

/** "dir/" → directory, "name@" → symlink, else a regular file. */
export function entries(dir: string, names: string[]) {
  return names.map((n) => {
    const name = n.replace(/[/@]$/, "");
    const type = n.endsWith("/") ? ("dir" as const) : n.endsWith("@") ? ("symlink" as const) : ("file" as const);
    return { name, path: dir ? `${dir}/${name}` : name, type };
  });
}

export function makeApp(opts: { llm?: Llm | null; tts?: FakeTts; github?: typeof fetch; perHour?: number; webDir?: string; pocketDir?: string; assetsDir?: string; reportsDir?: string; timings?: Partial<Timings>; roundDeadlineMs?: number; ttsBudgetMs?: number; arcade?: AppDeps["arcade"] } = {}) {
  const db = openDb(":memory:");
  const llm = (opts.llm === undefined ? new FakeLlm() : opts.llm) as FakeLlm | null;
  const tts = opts.tts ?? new FakeTts();
  const engine = new Engine({ llm, corpus, roster, profile: profiles.roast, cheap: profiles.cheap, gags: () => [], timings: opts.timings });
  const wall = new Wall(db);
  const app = buildApp({
    db, corpus, roster, engine, wall,
    limiter: new RateLimiter(db, () => opts.perHour ?? 1000),
    audio: new AudioCache(tts, null),
    stt: new FakeStt(),
    intake: new GitHubIntake(opts.github ?? fakeGitHub({ tree: { "": [] }, files: {} }).impl, () => undefined),
    rand: () => 0,
    analyzingStepMs: 0,
    webDir: opts.webDir,
    pocketDir: opts.pocketDir,
    assetsDir: opts.assetsDir,
    reportsDir: opts.reportsDir,
    roundDeadlineMs: opts.roundDeadlineMs,
    ttsBudgetMs: opts.ttsBudgetMs,
    arcade: opts.arcade,
  });
  return { app, db, llm, tts, wall, engine };
}
