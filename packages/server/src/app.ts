/** The ministry's HTTP surface — docs/CONTRACT.md "HTTP API". Every provider is injected. */
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { TIER_NAMES, type Case, type PersonaId, type RoastEvent, type Submission, type Tier } from "@dg-roast/shared";
import type { Corpus } from "./corpus.js";
import { nextCounter, type Db } from "./db.js";
import { CaseStore } from "./cases.js";
import type { CaseState, Engine } from "./engine.js";
import type { Roster } from "./personas.js";
import { quotesVisitor } from "./visitor.js";
import type { RateLimiter } from "./ratelimit.js";
import { IntakeError, type GitHubIntake } from "./repo.js";
import { Sse } from "./sse.js";
import { AUDIO_TYPES, type AudioCache, type Stt } from "./voice.js";
import type { Wall } from "./wall.js";

export interface AppDeps {
  db: Db;
  corpus: Corpus;
  roster: Roster;
  engine: Engine;
  wall: Wall;
  limiter: RateLimiter;
  audio: AudioCache;
  stt: Stt;
  intake: GitHubIntake;
  webDir?: string;
  pocketDir?: string;
  assetsDir?: string;
  /** Max wait for TTS before a line goes out with `audioUrl: null`. */
  ttsBudgetMs?: number;
  logger?: boolean;
  rand?: () => number;
}

const AWAITING: Record<Tier, string> = {
  1: "You may submit observations. They will be filed.",
  2: "The committee will hear your objection. Briefly. In writing would be better.",
  3: "The Council invites a response, which it will not read.",
  4: "Final observations before publication. Choose them carefully; they will be used against you.",
  5: "",
};

interface Runtime {
  events: RoastEvent[];
  done: boolean;
  bus: EventEmitter;
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

export function buildApp(d: AppDeps): FastifyInstance & { settle(): Promise<void> } {
  const app = Fastify({ logger: d.logger ?? false, trustProxy: true, bodyLimit: 64 * 1024 });
  const cases = new CaseStore(d.db);
  const runtimes = new Map<string, Runtime>();
  const background = new Set<Promise<unknown>>();
  const track = (p: Promise<unknown>) => {
    background.add(p);
    void p.finally(() => background.delete(p));
  };

  const fail = (reply: FastifyReply, status: number, error: string) => reply.code(status).send({ error });
  const limited = (req: FastifyRequest, reply: FastifyReply): boolean => {
    const s = d.limiter.hit(req.ip);
    if (s.allowed) return false;
    void reply.header("retry-after", Math.ceil(s.retryAfterMs / 1000)).code(429).send({ error: "Rate limit exceeded. The ministry is closed for lunch; try again later." });
    return true;
  };

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) app.log.error(err);
    void reply.code(status).send({ error: status >= 500 ? "internal error" : err.message });
  });

  app.addContentTypeParser(/^(audio|video)\//, { parseAs: "buffer", bodyLimit: 10 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: 10 * 1024 * 1024 }, (_req, body, done) => done(null, body));

  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/personas", async () => d.roster.all());
  app.get("/api/pairs", async () => d.roster.pairs());

  app.get<{ Params: { id: string } }>("/api/provision/:id", async (req, reply) => {
    const p = d.corpus.provision(req.params.id);
    return p ?? fail(reply, 404, `unknown provision ${req.params.id}`);
  });

  app.post<{ Body: { submission?: Submission; officers?: [PersonaId, PersonaId] } }>("/api/case", async (req, reply) => {
    const sub = req.body?.submission;
    if (!sub || !["text", "dictation", "repo"].includes(sub.kind)) return fail(reply, 400, "submission.kind must be text, dictation or repo");
    if (sub.revenueEur !== undefined && (typeof sub.revenueEur !== "number" || !Number.isFinite(sub.revenueEur) || sub.revenueEur < 0)) return fail(reply, 400, "submission.revenueEur must be a non-negative number");
    if (sub.kind !== "repo" && (typeof sub.text !== "string" || !sub.text.trim())) return fail(reply, 400, "submission.text is required");
    if (typeof sub.text === "string" && sub.text.length > 4000) return fail(reply, 400, "submission.text is longer than 4000 characters");
    if (sub.kind === "repo" && typeof sub.repoUrl !== "string") return fail(reply, 400, "submission.repoUrl is required");
    let officers = req.body.officers;
    if (officers !== undefined) {
      if (!Array.isArray(officers) || officers.length !== 2 || officers[0] === officers[1] || !officers.every((o) => d.roster.get(o))) return fail(reply, 400, "officers must be two distinct persona ids");
    } else officers = d.roster.randomPair(d.rand);
    if (limited(req, reply)) return reply;

    const submission: Submission = { kind: sub.kind, ...(sub.text ? { text: sub.text.trim() } : {}), ...(sub.repoUrl ? { repoUrl: sub.repoUrl.trim() } : {}), ...(sub.revenueEur !== undefined ? { revenueEur: sub.revenueEur } : {}) };
    const state: CaseState = { caseId: randomUUID(), ticket: nextCounter(d.db, "ticket", 4812), officers: [officers[0], officers[1]], submission, tier: 1, replies: [], lines: [], roundPending: true, round: 0, done: false };
    if (sub.kind === "repo") {
      try {
        const r = await d.intake.fetch(sub.repoUrl!);
        state.intake = r.intake;
        state.readme = r.readme;
        state.injection = r.injection;
      } catch (err) {
        if (err instanceof IntakeError) return fail(reply, err.status, err.message);
        app.log.warn({ err }, "repo intake failed");
        return fail(reply, 502, "GitHub could not be reached; try a text pitch");
      }
    }
    cases.save(state);
    const out: Case = { caseId: state.caseId, ticket: state.ticket, officers: state.officers };
    return reply.code(201).send(out);
  });

  app.post<{ Params: { caseId: string }; Body: { text?: string } }>("/api/case/:caseId/reply", async (req, reply) => {
    const state = cases.get(req.params.caseId);
    if (!state) return fail(reply, 404, "unknown case");
    const text = req.body?.text;
    if (typeof text !== "string" || !text.trim()) return fail(reply, 400, "text is required");
    if (text.length > 2000) return fail(reply, 400, "text is longer than 2000 characters");
    if (state.done) return fail(reply, 409, "the Notice has been published; the case is closed");
    if (state.roundPending) return fail(reply, 409, "the current round has not been heard yet; open the stream first");
    if (limited(req, reply)) return reply;
    state.replies.push(text.trim());
    state.tier = Math.min(5, state.tier + 1) as Tier;
    state.roundPending = true;
    state.round++;
    runtimes.delete(state.caseId);
    cases.save(state);
    return reply.code(204).send();
  });

  const visitorTexts = (s: CaseState) => [s.submission.text ?? "", ...s.replies, s.intake?.description ?? "", s.readme ?? ""].filter(Boolean);

  async function runRound(state: CaseState, rt: Runtime): Promise<void> {
    const push = (e: RoastEvent) => {
      rt.events.push(e);
      rt.bus.emit("event", e);
    };
    try {
      if (state.round === 0) {
        push({ type: "officers", officers: [d.roster.toPersona(state.officers[0]), d.roster.toPersona(state.officers[1])], ticket: state.ticket });
        if (state.intake) push({ type: "intake", repo: state.intake });
      }
      push({ type: "tier", tier: state.tier, name: TIER_NAMES[state.tier - 1]! });
      const meta = state.tier === 5 ? d.engine.extractMeta(state) : null;
      let n = 0;
      for await (const line of d.engine.lines(state)) {
        const spec = d.roster.get(line.speaker)!;
        const audioUrl = await withTimeout(d.audio.render(line.text, spec.voice), d.ttsBudgetMs ?? 3500, null);
        const provisions = line.provisions.map((id) => d.corpus.provision(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
        push({ type: "line", id: `${state.caseId}-${state.round}-${n++}`, speaker: line.speaker, text: line.text, provisions, clip: line.clip, audioUrl, ...(line.stamp ? { stamp: line.stamp } : {}) });
        state.lines.push({ speaker: line.speaker, text: line.text, provisions: provisions.map((p) => p.id), tier: state.tier, ...(line.charge ? { charge: line.charge } : {}) });
        if (!quotesVisitor(line.text, visitorTexts(state))) d.wall.add({ speaker: line.speaker, text: line.text, at: new Date().toISOString() });
      }
      if (state.tier === 5) {
        state.notice = d.engine.notice(state, await meta!);
        state.done = true;
        push({ type: "verdict", notice: state.notice });
      } else {
        push({ type: "awaiting", prompt: AWAITING[state.tier] });
      }
      state.roundPending = false;
      cases.save(state);
    } catch (err) {
      app.log.error({ err }, "round failed");
      push({ type: "error", message: "The ministry has suffered an administrative incident. Please reopen the stream." });
      runtimes.delete(state.caseId);
    } finally {
      rt.done = true;
      rt.bus.emit("done");
    }
  }

  app.get<{ Params: { caseId: string } }>("/api/case/:caseId/stream", async (req, reply) => {
    const state = cases.get(req.params.caseId);
    if (!state) return fail(reply, 404, "unknown case");
    let rt = runtimes.get(state.caseId);
    if (!rt) {
      rt = { events: [], done: false, bus: new EventEmitter() };
      runtimes.set(state.caseId, rt);
      if (state.roundPending) track(runRound(state, rt));
      else {
        // Round already heard (e.g. after a restart): replay the closing event so the client can proceed.
        rt.events.push(state.done && state.notice ? { type: "verdict", notice: state.notice } : { type: "awaiting", prompt: AWAITING[state.tier] });
        rt.done = true;
      }
    }
    reply.hijack();
    const sse = new Sse(reply.raw);
    for (const e of rt.events) sse.send("message", e);
    if (rt.done) return sse.end();
    const onEvent = (e: RoastEvent) => sse.send("message", e);
    const onDone = () => {
      cleanup();
      sse.end();
    };
    const cleanup = () => {
      rt.bus.off("event", onEvent);
      rt.bus.off("done", onDone);
    };
    rt.bus.on("event", onEvent);
    rt.bus.on("done", onDone);
    reply.raw.on("close", cleanup);
  });

  app.get("/api/wall/stream", async (_req, reply) => {
    reply.hijack();
    const sse = new Sse(reply.raw);
    for (const e of d.wall.recent(30)) sse.send("message", e);
    const off = d.wall.subscribe((e) => sse.send("message", e));
    const ping = setInterval(() => {
      if (!sse.isClosed) reply.raw.write(":ping\n\n");
    }, 20000);
    reply.raw.on("close", () => {
      off();
      clearInterval(ping);
    });
  });

  app.post("/api/stt", async (req, reply) => {
    const type = req.headers["content-type"] ?? "";
    if (!AUDIO_TYPES.test(type) && type !== "application/octet-stream") return fail(reply, 415, "send raw audio (audio/webm)");
    const body = req.body as Buffer | undefined;
    if (!Buffer.isBuffer(body) || body.length === 0) return fail(reply, 400, "empty audio");
    if (limited(req, reply)) return reply;
    try {
      const text = await d.stt.transcribe(body, type === "application/octet-stream" ? "audio/webm" : type);
      return { text };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      app.log.warn({ err: msg }, "stt failed");
      return fail(reply, /is not set$/.test(msg) ? 503 : 502, /is not set$/.test(msg) ? msg : "speech-to-text failed; please type instead");
    }
  });

  app.get<{ Params: { file: string } }>("/api/audio/:file", async (req, reply) => {
    const m = /^([a-f0-9]{32})\.mp3$/.exec(req.params.file);
    const a = m ? d.audio.get(m[1]!) : null;
    if (!a) return fail(reply, 404, "no such audio");
    return reply.header("content-type", a.contentType).header("cache-control", "public, max-age=31536000, immutable").send(a.audio);
  });

  // Static roots; any missing directory is skipped. Only the first registration decorates reply.
  const roots = [
    { root: d.assetsDir, prefix: "/assets/generated/", spa: false },
    { root: d.pocketDir, prefix: "/pocket/", spa: true },
    { root: d.webDir, prefix: "/", spa: true },
  ].filter((r): r is { root: string; prefix: string; spa: boolean } => Boolean(r.root && existsSync(r.root)));
  roots.forEach((r, i) => void app.register(fastifyStatic, { root: r.root, prefix: r.prefix, decorateReply: i === 0, index: r.spa ? ["index.html"] : false, wildcard: true }));

  app.setNotFoundHandler((req, reply) => {
    if (req.method === "GET" && !req.url.startsWith("/api/") && !req.url.startsWith("/assets/")) {
      // SPA fallback: /pocket/* → pocket/index.html, everything else → web/index.html.
      const spa = roots.find((r) => r.spa && req.url.startsWith(r.prefix) && existsSync(`${r.root}/index.html`));
      if (spa) return reply.type("text/html").sendFile("index.html", spa.root);
    }
    return fail(reply, 404, "not found");
  });

  return Object.assign(app, {
    async settle() {
      while (background.size) await Promise.allSettled([...background]);
    },
  });
}
