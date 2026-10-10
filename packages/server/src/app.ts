/** The ministry's HTTP surface — docs/CONTRACT.md "HTTP API". Every provider is injected. */
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyPluginAsync, type FastifyReply, type FastifyRequest } from "fastify";
import { MELTDOWN_EUR, MELTDOWN_JAIL_MONTHS, TIER_NAMES, type ApplicantInput, type Case, type LeaderboardSort, type NoticeV2, type PersonaId, type RoastEvent, type RoastEventV2, type Submission, type Tier } from "@dg-roast/shared";
import { ApplicantStore, InputError } from "./applicants.js";
import { addFine, emptyMeter, extractRevenueHeuristic, provisionFine, topLaws } from "./fine.js";
import { Leaderboard, SORTS, decodeCursor } from "./leaderboard.js";
import { meanwhileAt } from "./meanwhile.js";
import { buildNoticeV2, fallbackExtras, type Extras } from "./notice2.js";
import type { Corpus } from "./corpus.js";
import { nextCounter, type Db } from "./db.js";
import { CaseStore } from "./cases.js";
import type { CaseState, Engine, LineOut } from "./engine.js";
import type { Roster } from "./personas.js";
import { quotesVisitor } from "./visitor.js";
import type { RateLimiter } from "./ratelimit.js";
import { IntakeError, type GitHubIntake } from "./repo.js";
import { Sse } from "./sse.js";
import { AUDIO_TYPES, type AudioCache, type Stt } from "./voice.js";
import type { Wall } from "./wall.js";
import { registerReportRoutes } from "./report/routes.js";

export const ANALYZER_HOST = "warden.pro7ocol.com";

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
  /** Rendered report.pdf / badge.png per case (DATA_DIR/reports). */
  reportsDir?: string;
  /** Lane D analyzer: plugin mounted at /api/analyze, its built UI served at /analyze/. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analyzer?: { plugin: FastifyPluginAsync<any>; options?: Record<string, unknown>; webDir?: string };
  /** Max wait for TTS before a line goes out with `audioUrl: null` (a later `audio` event follows). */
  ttsBudgetMs?: number;
  /** Before `awaiting`/`verdict`, wait at most this long for all of the round's outstanding audio; the rest is replayed at the start of the next stream. */
  lateAudioMs?: number;
  /** A canned opener speaks if no model line arrives by then. */
  firstLineMs?: number;
  /** Hard cap on a round: `awaiting` or `verdict` is always emitted by then (plus TTS waits). */
  roundDeadlineMs?: number;
  /** Tier 5: max wait for the model's revenue extraction before the heuristic is used. */
  metaBudgetMs?: number;
  logger?: boolean;
  rand?: () => number;
  /** v2: clock for the Meanwhile counters (ms epoch). */
  now?: () => number;
  /** v2: `meanwhile` tick period during a round. */
  meanwhileTickMs?: number;
  /** v2: pause between `analyzing` stages (the loading screen needs a moment). */
  analyzingStepMs?: number;
  /** v2: max wait at the verdict for the model's TL;DR + recommendations before the fallback is used. */
  reportBudgetMs?: number;
}

type AnyEvent = RoastEvent | RoastEventV2;

const ANALYZING = ["Cloning the repository into a filing cabinet", "Reading the README aloud to the committee", "Counting dependencies, in triplicate", "Mapping your code to 27 legal systems"];

/** Until the tier-5 round has run, the Meanwhile clock assumes it lasts this long, so the ticks never overtake the final value. */
const VERDICT_ROUND_SEC = 15;

const AWAITING: Record<Tier, string> = {
  1: "You may submit observations. They will be filed.",
  2: "The committee will hear your objection. Briefly. In writing would be better.",
  3: "The Council invites a response, which it will not read.",
  4: "Final observations before publication. Choose them carefully; they will be used against you.",
  5: "",
};

interface Runtime {
  events: AnyEvent[];
  done: boolean;
  bus: EventEmitter;
}

const STOP = Symbol("stop");

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
  const now = d.now ?? Date.now;
  const applicants = new ApplicantStore(d.db, d.rand ?? Math.random, now);
  const board = new Leaderboard(d.db);
  const reports = registerReportRoutes(app, {
    state: (id) => {
      const s = cases.get(id);
      return s ? { notice: s.notice ?? null, fines: s.meter?.items } : undefined;
    },
    corpus: d.corpus, roster: d.roster, assetsDir: d.assetsDir, reportsDir: d.reportsDir, log: (msg, meta) => app.log.warn(meta ?? {}, msg),
  });
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

  // warden.pro7ocol.com is the analyzer's host: its root goes to /analyze/ (CONTRACT "Deploy target").
  app.addHook("onRequest", async (req, reply) => {
    const host = (req.headers.host ?? "").split(":")[0]?.toLowerCase();
    if (req.method !== "GET" && req.method !== "HEAD") return;
    if (host === ANALYZER_HOST && (req.url === "/" || req.url.startsWith("/?"))) {
      return reply.redirect("/analyze/" + req.url.slice(1), 302);
    }
    const [pathname, query] = [req.url.split("?")[0], req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""];
    if (pathname === "/pocket" || pathname === "/analyze") return reply.redirect(`${pathname}/${query}`, 301);
  });

  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/personas", async () => d.roster.all());
  app.get("/api/pairs", async () => d.roster.pairs());

  app.get<{ Params: { id: string } }>("/api/provision/:id", async (req, reply) => {
    const p = d.corpus.provision(req.params.id);
    return p ?? fail(reply, 404, `unknown provision ${req.params.id}`);
  });

  // ── v2: applicants, queue, better-place, selfies ──
  app.post<{ Body: ApplicantInput }>("/api/applicants", { bodyLimit: 1024 * 1024 }, async (req, reply) => {
    if (limited(req, reply)) return reply;
    try {
      const { ticket } = await applicants.register(req.body);
      return reply.code(201).send(ticket);
    } catch (err) {
      if (err instanceof InputError) return fail(reply, err.status, err.message);
      throw err;
    }
  });

  const tokenOf = (req: FastifyRequest, body: { applicantToken?: unknown } | undefined) => body?.applicantToken ?? req.headers["x-applicant-token"];

  app.post<{ Params: { id: string }; Body: { cause?: unknown; applicantToken?: unknown } }>("/api/applicants/:id/better-place", async (req, reply) => {
    if (limited(req, reply)) return reply;
    try {
      return reply.send(applicants.betterPlace(req.params.id, req.body?.cause, tokenOf(req, req.body)));
    } catch (err) {
      if (err instanceof InputError) return fail(reply, err.status, err.message);
      throw err;
    }
  });

  app.get<{ Params: { file: string } }>("/api/photos/:file", async (req, reply) => {
    const m = /^([A-Za-z0-9_-]{16,64})\.jpg$/.exec(req.params.file);
    const jpeg = m ? applicants.photo(m[1]!) : null;
    if (!jpeg) return fail(reply, 404, "no such photo");
    return reply.header("content-type", "image/jpeg").header("cache-control", "public, max-age=86400").header("x-content-type-options", "nosniff").send(jpeg);
  });

  // ── v2: leaderboard ──
  app.get<{ Querystring: { sort?: string; limit?: string; cursor?: string } }>("/api/leaderboard", async (req, reply) => {
    const sort = (req.query.sort ?? "fines") as LeaderboardSort;
    if (!SORTS.includes(sort)) return fail(reply, 400, "sort must be fines, jail or recent");
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) return fail(reply, 400, "limit must be an integer 1–200");
    if (req.query.cursor && !decodeCursor(req.query.cursor)) return fail(reply, 400, "invalid cursor");
    return board.list(sort, limit, req.query.cursor || null);
  });

  app.get("/api/leaderboard/stream", async (_req, reply) => {
    reply.hijack();
    const sse = new Sse(reply.raw);
    for (const e of board.list("fines", 20).entries) sse.send("message", e);
    const off = board.subscribe((e) => sse.send("message", e));
    const ping = setInterval(() => {
      if (!sse.isClosed) reply.raw.write(":ping\n\n");
    }, 15000);
    reply.raw.on("close", () => {
      off();
      clearInterval(ping);
    });
  });

  app.get<{ Params: { caseId: string } }>("/api/leaderboard/:caseId", async (req, reply) => {
    const r = board.get(req.params.caseId);
    if (!r) return fail(reply, 404, "not on the leaderboard (yet)");
    return r;
  });

  app.post<{ Body: { submission?: Submission; officers?: [PersonaId, PersonaId]; applicantId?: string; applicantToken?: string } }>("/api/case", async (req, reply) => {
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
    const applicantId = req.body.applicantId;
    let applicant: ReturnType<typeof applicants.get> = null;
    if (applicantId !== undefined) {
      try {
        applicant = applicants.authorize(applicantId, tokenOf(req, req.body));
      } catch (err) {
        if (err instanceof InputError) return fail(reply, err.status, err.status === 404 ? "unknown applicantId" : err.message);
        throw err;
      }
      // One case per applicant: a second POST returns the existing case.
      const existing = applicant.caseId ? cases.get(applicant.caseId) : null;
      if (existing) return reply.code(200).send({ caseId: existing.caseId, ticket: existing.ticket, officers: existing.officers } satisfies Case);
    }
    if (limited(req, reply)) return reply;

    const submission: Submission = { kind: sub.kind, ...(sub.text ? { text: sub.text.trim() } : {}), ...(sub.repoUrl ? { repoUrl: sub.repoUrl.trim() } : {}), ...(sub.revenueEur !== undefined ? { revenueEur: sub.revenueEur } : {}) };
    const state: CaseState = { caseId: randomUUID(), ticket: nextCounter(d.db, "ticket", 4812), officers: [officers[0], officers[1]], submission, tier: 1, replies: [], lines: [], roundPending: true, round: 0, done: false };
    state.startedAt = applicant ? applicant.createdAt : now();
    if (applicant) state.applicantId = applicant.id;
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
    if (applicant) applicants.setCase(applicant.id, state.caseId);
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

  /** Per case: `audio` events that landed after their round closed, waiting for the next stream. */
  const carried = new Map<string, { events: AnyEvent[]; push: ((e: AnyEvent) => void) | null }>();
  const carry = (caseId: string) => {
    let c = carried.get(caseId);
    if (!c) {
      if (carried.size >= 1000) carried.delete(carried.keys().next().value as string);
      carried.set(caseId, (c = { events: [], push: null }));
    }
    return c;
  };
  let lineSeq = 0;

  const visitorTexts = (s: CaseState) => [s.submission.text ?? "", ...s.replies, s.intake?.description ?? "", s.readme ?? ""].filter(Boolean);

  /**
   * One round. Lines go out as soon as they arrive (audio attached if ready within ttsBudgetMs, else a
   * later `audio` event). Whatever happens — slow, stalled or failing model — the round ends with
   * `awaiting` or `verdict` within roundDeadlineMs (plus bounded TTS waits).
   */
  async function runRound(state: CaseState, rt: Runtime): Promise<void> {
    const push = (e: AnyEvent) => {
      rt.events.push(e);
      rt.bus.emit("event", e);
    };
    // Late audio from earlier rounds: replay what finished, route the rest into this stream as it lands.
    const prev = carried.get(state.caseId);
    if (prev) {
      prev.push = push;
      for (const e of prev.events.splice(0)) push(e);
    }
    let open = true;
    const deliverLate = (e: AnyEvent) => {
      if (open) return push(e);
      if (state.done) return void rt.events.push(e);
      const c = carry(state.caseId);
      if (c.push) c.push(e);
      else c.events.push(e);
    };
    const started = Date.now();
    const deadline = started + (d.roundDeadlineMs ?? 20000);
    const lateAudio: Promise<void>[] = [];
    let chain: Promise<void> = Promise.resolve();
    let meta: { revenueEur: number; startup: string } | null = null;
    let n = 0;
    let count = 0;
    const meter = (state.meter ??= emptyMeter());
    const cited = new Set(meter.items.map((i) => i.provisionId));
    const revenue = state.submission.revenueEur ?? extractRevenueHeuristic(visitorTexts(state).join("\n")) ?? 0;
    const elapsed = () => Math.max(0, (now() - (state.startedAt ?? now())) / 1000);
    let ticker: ReturnType<typeof setInterval> | null = null;
    let extras: Promise<Extras> | null = null;
    const emit = (line: LineOut) => {
      const id = `${state.caseId}-${state.round}-${n++}`;
      const spec = d.roster.get(line.speaker)!;
      const render = d.audio.render(line.text, spec.voice, lineSeq++);
      const arrived = Date.now();
      const provisions = line.provisions.map((pid) => d.corpus.provision(pid)).filter((p): p is NonNullable<typeof p> => Boolean(p));
      state.lines.push({ speaker: line.speaker, text: line.text, provisions: provisions.map((p) => p.id), tier: state.tier, ...(line.charge ? { charge: line.charge } : {}) });
      count++;
      chain = chain.then(async () => {
        const audioUrl = await withTimeout(render, Math.max(0, arrived + (d.ttsBudgetMs ?? 2500) - Date.now()), null);
        push({ type: "line", id, speaker: line.speaker, text: line.text, provisions, clip: line.clip, audioUrl, ...(line.stamp ? { stamp: line.stamp } : {}) });
        provisions.forEach((p, k) => {
          const jailBases = new Set(meter.items.flatMap((i) => (i.jailBasis ? [i.jailBasis] : [])));
          const fine = provisionFine({ caseId: state.caseId, index: meter.items.length, provisionId: p.id, label: p.label, tier: state.tier, revenueEur: revenue, repeat: cited.has(p.id), jailBases });
          if (!fine) return;
          const item = { id: `${id}-f${k}`, ...fine };
          cited.add(p.id);
          const { crossed } = addFine(meter, item, { eur: MELTDOWN_EUR, jailMonths: MELTDOWN_JAIL_MONTHS });
          push({ type: "fine", id: item.id, provision: p, amountEur: item.amountEur, jailMonths: item.jailMonths, totalEur: meter.totalEur, totalJailMonths: meter.totalJailMonths, caption: item.caption });
          if (crossed) push({ type: "meltdown", totalEur: meter.totalEur, totalJailMonths: meter.totalJailMonths });
        });
        if (!quotesVisitor(line.text, visitorTexts(state))) d.wall.add({ speaker: line.speaker, text: line.text, at: new Date().toISOString() });
        if (!audioUrl) lateAudio.push(render.then((url) => (url ? deliverLate({ type: "audio", id, audioUrl: url }) : undefined), () => undefined));
      });
    };
    try {
      if (state.round === 0) {
        push({ type: "officers", officers: [d.roster.toPersona(state.officers[0]), d.roster.toPersona(state.officers[1])], ticket: state.ticket });
        if (state.intake) {
          for (const [k, stage] of ANALYZING.entries()) {
            push({ type: "analyzing", stage, progress: +((k + 1) / (ANALYZING.length + 1)).toFixed(2) });
            if (d.analyzingStepMs !== 0) await new Promise((r) => setTimeout(r, d.analyzingStepMs ?? 600));
          }
          push({ type: "analyzing", stage: "Findings filed", progress: 1 });
          push({ type: "intake", repo: state.intake });
        }
      }
      push({ type: "tier", tier: state.tier, name: TIER_NAMES[state.tier - 1]! });
      if (state.tier === 5) {
        meta = await withTimeout(d.engine.extractMeta(state), d.metaBudgetMs ?? 1500, d.engine.metaFallback(state));
        state.fine = d.engine.previewFine(state, meta);
        state.meanwhile = meanwhileAt(state.caseId, elapsed() + VERDICT_ROUND_SEC);
        const startup = meta.startup;
        extras = d.engine.reportExtras(state, d.engine.notice(state, meta).findings, startup);
      }
      // Ticks never overtake the final (tier-5) value; tier 5 ticks show the climb towards it.
      const final = state.tier === 5 ? state.meanwhile : null;
      const tick = () => push({ type: "meanwhile", meanwhile: final ? meanwhileAt(state.caseId, Math.min(elapsed(), final.elapsedSec - 1)) : meanwhileAt(state.caseId, elapsed()) });
      tick();
      ticker = setInterval(tick, d.meanwhileTickMs ?? 5000);
      const firstLineMs = Math.max(300, (d.firstLineMs ?? 3500) - (Date.now() - started));
      const it = d.engine.lines(state, { firstLineMs, roundMs: Math.max(1000, deadline - Date.now() - 1000) })[Symbol.asyncIterator]();
      try {
        for (;;) {
          const r = await withTimeout<IteratorResult<LineOut> | typeof STOP>(it.next(), Math.max(0, deadline - Date.now()), STOP);
          if (r === STOP) {
            app.log.warn({ caseId: state.caseId, tier: state.tier }, "round deadline hit; closing with canned lines");
            break;
          }
          if (r.done) break;
          emit(r.value);
        }
      } finally {
        void it.return(undefined).catch(() => undefined);
      }
      while (count < 3) emit(d.engine.fill(state, d.engine.partner(state, state.lines.at(-1)?.speaker), state.lines.map((l) => l.text)));
      await chain;
      if (lateAudio.length) await withTimeout(Promise.all(lateAudio).then(() => undefined), d.lateAudioMs ?? 10000, undefined);
    } catch (err) {
      app.log.error({ err }, "round failed; closing it anyway");
    } finally {
      if (ticker) clearInterval(ticker);
    }
    open = false;
    const c = carried.get(state.caseId);
    if (c) {
      c.push = null;
      if (!c.events.length) carried.delete(state.caseId);
    }
    try {
      if (state.tier === 5) {
        const base = d.engine.notice(state, meta ?? d.engine.metaFallback(state));
        const fb = fallbackExtras(base.findings, d.corpus);
        const got = extras ? await withTimeout(extras.catch(() => fb), d.reportBudgetMs ?? 4000, fb) : fb;
        const merged: Extras = { tldr: fb.tldr.map((t) => got.tldr.find((g) => g.law === t.law) ?? t), recommendations: got.recommendations.length ? got.recommendations : fb.recommendations };
        const a = state.applicantId ? applicants.get(state.applicantId) : null;
        state.meanwhile ??= meanwhileAt(state.caseId, elapsed());
        const notice: NoticeV2 = buildNoticeV2(base, { caseId: state.caseId, applicant: a, meter, extras: merged, meanwhile: state.meanwhile });
        state.notice = notice;
        state.done = true;
        push({ type: "meanwhile", meanwhile: state.meanwhile });
        push({ type: "verdict", notice });
        try {
          board.add(
            { caseId: state.caseId, startupName: notice.startupName, founderName: notice.founderName, oneLiner: a?.oneLiner ?? null, photoUrl: a?.photoId ? `/api/photos/${a.photoId}.jpg` : null, totalEur: meter.totalEur, totalJailMonths: meter.totalJailMonths, meltdown: meter.meltdown, topLaws: topLaws(meter), issuedAt: notice.issuedAt },
            notice.findings,
            state.applicantId ?? null,
          );
        } catch (err) {
          app.log.error({ err }, "leaderboard insert failed");
        }
        void reports.prerender(state.caseId);
      } else {
        push({ type: "awaiting", prompt: AWAITING[state.tier] });
      }
      state.roundPending = false;
      cases.save(state);
    } catch (err) {
      app.log.error({ err }, "round close failed");
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
    const onEvent = (e: AnyEvent) => sse.send("message", e);
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
    if (!AUDIO_TYPES.test(type) && type !== "application/octet-stream") return fail(reply, 415, "send raw audio (audio/webm or audio/mp4)");
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

  // assets/generated is created if missing so pictures that land after deploy are served without a restart
  // (@fastify/static resolves files per request). Other missing roots are skipped.
  if (d.assetsDir && !existsSync(d.assetsDir)) {
    try {
      mkdirSync(d.assetsDir, { recursive: true });
    } catch {
      /* read-only filesystem: skipped below */
    }
  }
  if (d.analyzer) void app.register(d.analyzer.plugin, { ...(d.analyzer.options ?? {}), prefix: "/api/analyze" });

  // Static roots; any missing directory is skipped. Only the first registration decorates reply.
  const roots = [
    { root: d.assetsDir, prefix: "/assets/generated/", spa: false },
    { root: d.pocketDir, prefix: "/pocket/", spa: true },
    { root: d.analyzer?.webDir, prefix: "/analyze/", spa: true },
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
