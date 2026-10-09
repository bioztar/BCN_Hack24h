/**
 * Fastify plugin — registered by Lane B as `app.register(analyzerPlugin, { prefix: "/api/analyze" })`.
 *   POST /                  → { reportId }   (JSON or multipart; uploads stay in memory)
 *   GET  /:reportId/stream  → SSE: `stage` events, then `report` (or `error`)
 *   GET  /:reportId.md      → Markdown export
 *   GET  /:reportId         → report JSON
 */
import multipart from "@fastify/multipart";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DOCUMENT_TYPES, extensionOf, MAX_DOCUMENT_BYTES } from "./intake/document.js";
import { IntakeError } from "./intake/errors.js";
import { GitHubIntake, REPO_URL } from "./intake/github.js";
import { NebiusLlm, requireApiKey, type Llm } from "./llm.js";
import { reportMarkdown } from "./markdown.js";
import { analyze, type Deps } from "./pipeline.js";
import { ProvisionIndex } from "./provisions.js";
import { loadSkills, SKILLS_DIR } from "./skills.js";
import { Sse } from "./sse.js";
import { ReportStore } from "./store.js";
import { RateLimiter } from "./ratelimit.js";
import type { AnalyzeRequest, ChecklistName, IntakeKind, ProgressEvent } from "./types.js";

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_CORPUS = resolve(PKG_DIR, "..", "..", "corpus", "provisions.json");
export const WEB_DIST = resolve(PKG_DIR, "web", "dist");
export const PUBLIC_URL = "https://warden.pro7ocol.com/analyze/";

export interface AnalyzerOptions {
  llm?: Llm;
  github?: GitHubIntake;
  index?: ProvisionIndex;
  corpusPath?: string;
  store?: ReportStore;
  /** Analyses per IP per window (default 6 per 10 min). */
  rateLimit?: { limit: number; windowMs: number };
  env?: NodeJS.ProcessEnv;
  deps?: Partial<Pick<Deps, "batchSize" | "concurrency" | "now">>;
}

const KINDS: IntakeKind[] = ["idea", "document", "repo"];
const CHECKLISTS: ChecklistName[] = ["product-idea", "design-doc", "codebase", "vendor-assessment"];

async function readRequest(req: FastifyRequest): Promise<AnalyzeRequest> {
  const fields: Record<string, string> = {};
  let file: AnalyzeRequest["file"];
  if (req.isMultipart()) {
    for await (const part of req.parts()) {
      if (part.type === "file") {
        if (file) throw new IntakeError("upload one file at a time");
        const data = await part.toBuffer();
        if (part.file.truncated) throw new IntakeError("file is larger than 10 MB", 413);
        file = { name: part.filename, data };
      } else fields[part.fieldname] = String(part.value ?? "");
    }
  } else {
    const b = (req.body ?? {}) as Record<string, unknown>;
    for (const k of ["kind", "text", "repoUrl", "checklist", "explainer"]) if (b[k] !== undefined) fields[k] = String(b[k]);
  }
  const kind = fields.kind as IntakeKind;
  if (!KINDS.includes(kind)) throw new IntakeError("kind must be idea, document or repo");
  const checklist = fields.checklist && fields.checklist !== "auto" ? (fields.checklist as ChecklistName) : undefined;
  if (checklist && !CHECKLISTS.includes(checklist)) throw new IntakeError(`checklist must be one of ${CHECKLISTS.join(", ")}`);
  const out: AnalyzeRequest = { kind, checklist, explainer: fields.explainer !== "false" };
  if (kind === "idea") {
    out.text = fields.text ?? "";
    if (out.text.trim().length < 20) throw new IntakeError("describe the idea in at least a sentence (20+ characters)");
  } else if (kind === "repo") {
    out.repoUrl = (fields.repoUrl ?? "").trim();
    if (!REPO_URL.test(out.repoUrl)) throw new IntakeError("enter a public GitHub repository URL like https://github.com/owner/repo");
  } else {
    if (!file) throw new IntakeError("attach a .pdf, .docx, .md or .txt file");
    if (!(DOCUMENT_TYPES as readonly string[]).includes(extensionOf(file.name))) throw new IntakeError(`unsupported file type — use ${DOCUMENT_TYPES.join(", ")}`, 415);
    if (file.data.length > MAX_DOCUMENT_BYTES) throw new IntakeError("file is larger than 10 MB", 413);
    out.file = file;
  }
  return out;
}

const fail = (reply: FastifyReply, status: number, error: string) => reply.code(status).send({ error });

export const analyzerPlugin: FastifyPluginAsync<AnalyzerOptions> = async (app, opts) => {
  const env = opts.env ?? process.env;
  const llm = opts.llm ?? new NebiusLlm(env);
  const index = opts.index ?? ProvisionIndex.load(opts.corpusPath ?? env.ANALYZER_CORPUS ?? DEFAULT_CORPUS, SKILLS_DIR);
  const skills = loadSkills(index);
  const github = opts.github ?? new GitHubIntake({ token: () => env.GITHUB_TOKEN || undefined });
  const store = opts.store ?? new ReportStore();
  const limiter = new RateLimiter(opts.rateLimit?.limit ?? 6, opts.rateLimit?.windowMs ?? 10 * 60_000);
  if (!opts.store) app.addHook("onClose", async () => store.close());

  await app.register(multipart, { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 8, fieldSize: 64 * 1024, parts: 10 } });
  app.log.info({ index: index.source, provisions: index.size }, "analyzer: provision index loaded");

  app.post("/", { bodyLimit: 256 * 1024 }, async (req, reply) => {
    const wait = limiter.check(req.ip);
    if (wait) {
      reply.header("retry-after", String(wait));
      return fail(reply, 429, `rate limit: try again in ${wait}s`);
    }
    if (llm instanceof NebiusLlm) {
      try {
        requireApiKey(env);
      } catch (e) {
        return fail(reply, 503, (e as Error).message);
      }
    }
    let request: AnalyzeRequest;
    try {
      request = await readRequest(req);
    } catch (e) {
      if (e instanceof IntakeError) return fail(reply, e.status, e.message);
      const code = (e as { code?: string }).code;
      if (code === "FST_REQ_FILE_TOO_LARGE") return fail(reply, 413, "file is larger than 10 MB");
      return fail(reply, 400, "could not read the request");
    }
    const job = store.create();
    const emit = (e: ProgressEvent) => store.emit(job, e);
    const deps: Deps = { llm, index, skills, github, ...opts.deps };
    void analyze(request, deps, emit, job.id).catch((e: unknown) => {
      const message = e instanceof IntakeError ? e.message : e instanceof Error && /NEBIUS_API_KEY|nebius|model/i.test(e.message) ? e.message : "analysis failed";
      // Log the failure class only — never request content.
      req.log.warn({ reportId: job.id, kind: request.kind, err: e instanceof Error ? e.name : "unknown" }, "analysis failed");
      emit({ type: "error", message });
    });
    return reply.code(202).send({ reportId: job.id });
  });

  app.get<{ Params: { reportId: string } }>("/:reportId/stream", (req, reply) => {
    const job = store.get(req.params.reportId);
    if (!job) return fail(reply, 404, "report not found or expired");
    reply.hijack();
    const sse = new Sse(reply.raw);
    const send = (e: ProgressEvent) => {
      sse.send(e.type, e);
      if (e.type === "report" || e.type === "error") {
        cleanup();
        sse.end();
      }
    };
    const ping = setInterval(() => sse.ping(), 15_000);
    const cleanup = () => {
      clearInterval(ping);
      job.bus.off("event", send);
    };
    reply.raw.on("close", cleanup);
    for (const e of job.events) {
      send(e);
      if (sse.isClosed) return;
    }
    job.bus.on("event", send);
  });

  app.get<{ Params: { reportId: string } }>("/:reportId.md", (req, reply) => {
    const job = store.get(req.params.reportId);
    if (!job?.report) return fail(reply, 404, job ? "report not ready" : "report not found or expired");
    return reply
      .header("content-type", "text/markdown; charset=utf-8")
      .header("content-disposition", `attachment; filename="warden-report-${job.id.slice(0, 8)}.md"`)
      .send(reportMarkdown(job.report, PUBLIC_URL));
  });

  app.get<{ Params: { reportId: string } }>("/:reportId", (req, reply) => {
    const job = store.get(req.params.reportId);
    if (!job) return fail(reply, 404, "report not found or expired");
    if (job.error) return fail(reply, 422, job.error);
    if (!job.report) return reply.code(202).send({ status: "running", events: job.events });
    return job.report;
  });
};

export const webDistExists = () => existsSync(WEB_DIST);
