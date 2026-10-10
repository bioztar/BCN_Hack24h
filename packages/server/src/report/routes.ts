/**
 * GET /api/case/:caseId/report.pdf and /badge.png — docs/CONTRACT.md v2. Both files are rendered
 * once in a worker thread (pre-rendered when the verdict is published) and persisted under
 * `reportsDir`; later requests are served from disk. `?mock=1` (or case id `mock`) serves the fixture.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Notice, PersonaId } from "@dg-roast/shared";
import type { Corpus } from "../corpus.js";
import type { Roster } from "../personas.js";
import { MOCK_CASE_ID, mockFines, mockNotice } from "./fixture.js";
import { normalise, type FineLike, type ReportData, type ReportOfficer } from "./model.js";
import { Renderer, Window } from "./renderer.js";

/** Bump when the layout changes so persisted files are re-rendered after a deploy. */
const LAYOUT = "v2";

export interface ReportDeps {
  /** undefined → unknown case; notice null → case exists but no Notice has been published yet. */
  state(caseId: string): { notice: Notice | null; fines?: FineLike[] } | undefined;
  corpus: Corpus;
  roster: Roster;
  assetsDir?: string;
  /** Persist rendered files here (DATA_DIR/reports in production); memory only when unset. */
  reportsDir?: string;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
  /** Requests per IP per minute (all report routes). */
  perMinute?: number;
  /** Fresh renders per IP per minute (requests that are not already on disk). */
  rendersPerMinute?: number;
  maxQueue?: number;
}

export interface ReportRoutes {
  /** Renders both files for a published case in the background (called when the verdict is set). */
  prerender(caseId: string): Promise<void>;
}

type Kind = "pdf" | "png";
type Resolved = { ok: true; report: ReportData; persist: boolean } | { ok: false; status: number; error: string };

export function registerReportRoutes(app: FastifyInstance, d: ReportDeps): ReportRoutes {
  const renderer = new Renderer();
  app.addHook("onClose", async () => renderer.close());
  const mem = new Map<string, Promise<Buffer>>();
  const requests = new Window(d.perMinute ?? 300);
  const renders = new Window(d.rendersPerMinute ?? 30);
  const maxQueue = d.maxQueue ?? 40;

  const officer = (id: PersonaId): ReportOfficer => {
    const spec = d.roster.get(id);
    const cutout = d.assetsDir ? ["smug", "neutral"].map((e) => path.join(d.assetsDir!, "cutout", `${id}-${e}.png`)).find((f) => existsSync(f)) ?? null : null;
    return { id, name: spec?.name ?? id, title: spec?.title ?? "Case Officer", cutout };
  };

  const resolve = (caseId: string, mock: boolean): Resolved => {
    if (mock || caseId === MOCK_CASE_ID) {
      const n = mockNotice();
      return { ok: true, persist: false, report: normalise(MOCK_CASE_ID, n, [officer(n.officers[0]), officer(n.officers[1])], mockFines()) };
    }
    const s = d.state(caseId);
    if (!s) return { ok: false, status: 404, error: "unknown case" };
    if (!s.notice) return { ok: false, status: 409, error: "the Notice has not been published yet; the case must reach the Official Journal first" };
    const n = s.notice;
    return { ok: true, persist: true, report: normalise(caseId, n, [officer(n.officers[0]), officer(n.officers[1])], s.fines) };
  };

  const fileFor = (r: ReportData, kind: Kind, persist: boolean) =>
    persist && d.reportsDir ? path.join(d.reportsDir, `${r.caseId.replace(/[^A-Za-z0-9_-]/g, "_")}.${LAYOUT}.${kind}`) : null;

  const produce = (r: ReportData, kind: Kind, persist: boolean): Promise<Buffer> => {
    const key = `${kind}:${r.caseId}`;
    const hit = mem.get(key);
    if (hit) return hit;
    const file = fileFor(r, kind, persist);
    const p = (async () => {
      if (file && existsSync(file)) return readFile(file);
      const lawTexts: Record<string, string> = {};
      for (const f of r.findings) {
        const t = d.corpus.get(f.provision.id)?.text;
        if (t) lawTexts[f.provision.id] = t;
      }
      const buf = await renderer.render(kind, r, lawTexts);
      if (file) {
        await mkdir(path.dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        await writeFile(tmp, buf);
        await rename(tmp, file);
      }
      return buf;
    })();
    mem.set(key, p);
    p.then(
      () => file && mem.delete(key),
      () => mem.delete(key),
    );
    if (mem.size > 300) mem.delete(mem.keys().next().value as string);
    return p;
  };

  const ready = (r: ReportData, kind: Kind, persist: boolean) => {
    const file = fileFor(r, kind, persist);
    return mem.has(`${kind}:${r.caseId}`) || Boolean(file && existsSync(file));
  };

  const tooMany = (reply: FastifyReply, ms: number) =>
    reply.code(429).header("retry-after", String(Math.ceil(ms / 1000))).send({ error: "too many requests; the Directorate processes one citizen at a time" });

  const serve = (kind: Kind) => async (req: FastifyRequest<{ Params: { caseId: string }; Querystring: { mock?: string } }>, reply: FastifyReply) => {
    const wait = requests.hit(req.ip);
    if (wait) return tooMany(reply, wait);
    const res = resolve(req.params.caseId, req.query.mock === "1");
    if (!res.ok) return reply.code(res.status).send({ error: res.error });
    const r = res.report;
    if (!ready(r, kind, res.persist)) {
      const w = renders.hit(req.ip);
      if (w) return tooMany(reply, w);
      if (renderer.queued >= maxQueue) return reply.code(503).header("retry-after", "5").send({ error: "the printing office is busy; try again in a few seconds" });
    }
    try {
      const body = await produce(r, kind, res.persist);
      const name = `eurocrat-${r.serial.replace(/[^A-Za-z0-9-]+/g, "-")}`;
      return reply
        .header("content-type", kind === "pdf" ? "application/pdf" : "image/png")
        .header("content-disposition", `inline; filename="${name}.${kind}"`)
        .header("cache-control", "public, max-age=600")
        .send(body);
    } catch (err) {
      d.log?.(`${kind} render failed`, { caseId: r.caseId, err: err instanceof Error ? err.message : "unknown" });
      return reply.code(500).send({ error: `the ${kind === "pdf" ? "report" : "badge"} could not be rendered; the Directorate apologises (it does not)` });
    }
  };

  app.get("/api/case/:caseId/report.pdf", serve("pdf"));
  app.get("/api/case/:caseId/badge.png", serve("png"));

  return {
    async prerender(caseId) {
      const res = resolve(caseId, false);
      if (!res.ok) return;
      await Promise.all((["png", "pdf"] as const).map((k) => produce(res.report, k, res.persist))).catch((err: unknown) =>
        d.log?.("prerender failed", { caseId, err: err instanceof Error ? err.message : "unknown" }),
      );
    },
  };
}
