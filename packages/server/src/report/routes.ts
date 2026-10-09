/**
 * GET /api/case/:caseId/report.pdf and /badge.png — docs/CONTRACT.md v2. Rendered once per
 * published Notice and cached; `?mock=1` (or case id `mock`) serves the fixture.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Notice, PersonaId } from "@dg-roast/shared";
import type { Corpus } from "../corpus.js";
import type { Roster } from "../personas.js";
import { renderBadge } from "./badge.js";
import { MOCK_CASE_ID, mockNotice } from "./fixture.js";
import { normalise, type ReportData, type ReportOfficer } from "./model.js";
import { renderReport } from "./pdf.js";

export interface ReportDeps {
  /** undefined → unknown case; null → case exists but no Notice has been published yet. */
  notice(caseId: string): Notice | null | undefined;
  corpus: Corpus;
  roster: Roster;
  assetsDir?: string;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
  cacheSize?: number;
}

export function registerReportRoutes(app: FastifyInstance, d: ReportDeps): void {
  const cache = new Map<string, Promise<Buffer>>();
  const max = d.cacheSize ?? 300;

  const officer = (id: PersonaId): ReportOfficer => {
    const spec = d.roster.get(id);
    const cutout = d.assetsDir ? ["smug", "neutral"].map((e) => path.join(d.assetsDir!, "cutout", `${id}-${e}.png`)).find((f) => existsSync(f)) ?? null : null;
    return { id, name: spec?.name ?? id, title: spec?.title ?? "Case Officer", cutout };
  };

  const resolve = (caseId: string, mock: boolean, reply: FastifyReply): ReportData | null => {
    const isMock = mock || caseId === MOCK_CASE_ID;
    const notice = isMock ? mockNotice() : d.notice(caseId);
    if (notice === undefined) {
      void reply.code(404).send({ error: "unknown case" });
      return null;
    }
    if (notice === null) {
      void reply.code(409).send({ error: "the Notice has not been published yet; the case must reach the Official Journal first" });
      return null;
    }
    return normalise(isMock ? MOCK_CASE_ID : caseId, notice, [officer(notice.officers[0]), officer(notice.officers[1])]);
  };

  const cached = (key: string, make: () => Promise<Buffer>): Promise<Buffer> => {
    let p = cache.get(key);
    if (!p) {
      p = make();
      cache.set(key, p);
      p.catch(() => cache.delete(key));
      if (cache.size > max) cache.delete(cache.keys().next().value as string);
    }
    return p;
  };

  const serve = (kind: "pdf" | "png") => async (req: { params: { caseId: string }; query: { mock?: string } }, reply: FastifyReply) => {
    const r = resolve(req.params.caseId, req.query.mock === "1", reply);
    if (!r) return reply;
    const key = `${kind}:${r.caseId}:${r.serial}:${r.issuedAt}`;
    try {
      const body = await cached(key, () => (kind === "pdf" ? renderReport({ report: r, lawText: (id) => d.corpus.get(id)?.text }) : renderBadge(r)));
      const name = `eurocrat-${r.serial.replace(/[^A-Za-z0-9-]+/g, "-")}`;
      return reply
        .header("content-type", kind === "pdf" ? "application/pdf" : "image/png")
        .header("content-disposition", `inline; filename="${name}.${kind}"`)
        .header("cache-control", "public, max-age=600")
        .send(body);
    } catch (err) {
      d.log?.(`${kind} render failed`, { caseId: r.caseId, err: err instanceof Error ? err.name : "unknown" });
      return reply.code(500).send({ error: `the ${kind === "pdf" ? "report" : "badge"} could not be rendered; the Directorate apologises (it does not)` });
    }
  };

  app.get<{ Params: { caseId: string }; Querystring: { mock?: string } }>("/api/case/:caseId/report.pdf", serve("pdf"));
  app.get<{ Params: { caseId: string }; Querystring: { mock?: string } }>("/api/case/:caseId/badge.png", serve("png"));
}
