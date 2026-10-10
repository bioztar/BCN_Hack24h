import { describe, expect, it } from "vitest";
import type { Notice } from "@dg-roast/shared";
import { BADGE_SIZE, badgeSvg, meanwhileLine } from "../src/report/badge.js";
import { mkdtempSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import { mockFines, mockNotice } from "../src/report/fixture.js";
import { printable } from "../src/report/glyphs.js";
import { Window } from "../src/report/renderer.js";
import { registerReportRoutes } from "../src/report/routes.js";
import { formatElapsed, formatEur, formatJail } from "../src/report/format.js";
import { frameworkOf, remedyFor } from "../src/report/law.js";
import { normalise, type ReportOfficer } from "../src/report/model.js";
import { excerpt } from "../src/report/pdf.js";
import { corpus, makeApp, roster } from "./helpers.js";

const OFFICERS: [ReportOfficer, ReportOfficer] = [
  { id: "formblatt", name: "Dr. Heinrich Formblatt", title: "Rapporteur", cutout: null },
  { id: "annexe", name: "Mme Ségolène Annexe-Vandamme", title: "Director", cutout: null },
];

const v1: Notice = {
  serial: "L-2026/00007",
  startup: "Fridgely",
  officers: ["formblatt", "annexe"],
  fineEur: 70_000_000,
  fineBasis: "AI Act Art. 99(3)",
  findings: [
    { text: "Mood-based upselling.", provision: corpus.provision("ai-act-5")! },
    { text: "Biometrics sold to insurers.", provision: corpus.provision("gdpr-9")! },
    { text: "No lawful basis.", provision: corpus.provision("gdpr-6")! },
  ],
  issuedAt: "2026-10-10T15:00:00.000Z",
};

const pngSize = (b: Buffer) => [b.readUInt32BE(16), b.readUInt32BE(20)];

describe("report formatting", () => {
  it("formats euros, jail time and elapsed time", () => {
    expect(formatEur(1_234_567_890)).toBe("€1,234,567,890");
    expect(formatEur(-5)).toBe("€0");
    expect(formatEur(Number.NaN)).toBe("€0");
    expect(formatJail(171)).toBe("14 years 3 months");
    expect(formatJail(12)).toBe("1 year");
    expect(formatJail(1)).toBe("1 month");
    expect(formatJail(25)).toBe("2 years 1 month");
    expect(formatElapsed(252)).toMatch(/4 min 12 s/);
  });

  it("renders the Meanwhile line in plain text (no flags)", () => {
    expect(meanwhileLine(mockNotice().meanwhile!)).toBe("MEANWHILE: CHINA 11 AI MODELS · US 3 · EU 27 REGULATIONS + 412 FORMS");
    expect(meanwhileLine({ elapsedSec: 15, china: { models: 1, note: "" }, us: { models: 1, note: "" }, eu: { regulations: 1, forms: 1, note: "" } })).toBe("MEANWHILE: CHINA 1 AI MODEL · US 1 · EU 1 REGULATION + 1 FORM");
  });

  it("cuts law excerpts at a word boundary and skips stubs", () => {
    const long = "word ".repeat(300);
    const e = excerpt(long, 100)!;
    expect(e.length).toBeLessThanOrEqual(102);
    expect(e.endsWith(" …")).toBe(true);
    expect(excerpt("too short")).toBeNull();
  });
});

describe("report model", () => {
  it("normalises a v1 Notice: total = fineEur, no jail, TL;DR grouped per law", () => {
    const r = normalise("c1", v1, OFFICERS);
    expect(r).toMatchObject({ totalEur: 70_000_000, totalJailMonths: 0, startupName: "Fridgely", meanwhile: null });
    expect(r.tldr.map((t) => t.law)).toEqual(["AI Act", "GDPR"]);
    expect(r.tldr[1]!.provisions).toEqual(["GDPR Art. 9", "GDPR Art. 6"]);
  });

  it("keeps v2 totals, TL;DR, recommendations and Meanwhile", () => {
    const n = mockNotice();
    const r = normalise("mock", n, OFFICERS);
    expect(r.totalEur).toBe(n.totalEur);
    expect(r.totalJailMonths).toBe(171);
    expect(r.tldr.map((t) => t.law)).toEqual(n.tldr.map((t) => t.law));
    expect(r.recommendations).toEqual(n.recommendations);
    expect(r.meanwhile).toEqual(n.meanwhile);
  });

  it("every fixture provision is a real corpus entry with a framework and a remedy", () => {
    const n = mockNotice();
    for (const f of n.findings) {
      expect(f.provision).toEqual(corpus.provision(f.provision.id));
      expect(frameworkOf(f.provision).key).not.toBe("other");
      expect(remedyFor(f.provision).length).toBeGreaterThan(20);
    }
  });

  it("badge SVG carries every required element", () => {
    const svg = badgeSvg(normalise("mock", mockNotice(), OFFICERS));
    for (const s of ["EUROCRAT", "REFUSÉ", "BANNED IN THE EU", "FRIDGELY", "€1,234,567,890", "14 YEARS 3 MONTHS", "L-2026/04812", "eurocrat.pro7ocol.com", "MEANWHILE: CHINA 11", "PARODY"]) expect(svg).toContain(s);
    expect(svg).toContain(`width="${BADGE_SIZE}" height="${BADGE_SIZE}"`);
  });
});

describe("GET /api/case/:caseId/report.pdf and badge.png", () => {
  it("serves the fixture with ?mock=1 and for case id 'mock'", async () => {
    const { app } = makeApp();
    const png = await app.inject({ method: "GET", url: "/api/case/anything/badge.png?mock=1" });
    expect(png.statusCode).toBe(200);
    expect(png.headers["content-type"]).toBe("image/png");
    expect(pngSize(png.rawPayload)).toEqual([1080, 1080]);
    const pdf = await app.inject({ method: "GET", url: "/api/case/mock/report.pdf" });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toMatch(/eurocrat-L-2026-04812\.pdf/);
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.rawPayload.length).toBeGreaterThan(20_000);
  }, 30_000);

  it("404s unknown cases and 409s cases without a published Notice", async () => {
    const { app } = makeApp();
    expect((await app.inject({ method: "GET", url: "/api/case/nope/report.pdf" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/case/nope/badge.png" })).statusCode).toBe(404);
    const c = (await app.inject({ method: "POST", url: "/api/case", payload: { submission: { kind: "text", text: "We are Fridgely. Our AI watches you eat." }, officers: ["formblatt", "annexe"] } })).json() as { caseId: string };
    const res = await app.inject({ method: "GET", url: `/api/case/${c.caseId}/badge.png` });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: expect.stringMatching(/not been published/) });
  });

  it("renders the real Notice once the case reaches tier 5", async () => {
    const { app } = makeApp();
    const c = (await app.inject({ method: "POST", url: "/api/case", payload: { submission: { kind: "text", text: "We are Fridgely, the uber for fridges. Our AI watches you eat and sells the data. We do €1B in revenue." }, officers: ["formblatt", "annexe"] } })).json() as { caseId: string };
    for (let tier = 1; tier <= 5; tier++) {
      if (tier > 1) await app.inject({ method: "POST", url: `/api/case/${c.caseId}/reply`, payload: { text: `Objection number ${tier}` } });
      await app.inject({ method: "GET", url: `/api/case/${c.caseId}/stream` });
    }
    const pdf = await app.inject({ method: "GET", url: `/api/case/${c.caseId}/report.pdf` });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    const png = await app.inject({ method: "GET", url: `/api/case/${c.caseId}/badge.png` });
    expect(png.statusCode).toBe(200);
    expect(pngSize(png.rawPayload)).toEqual([1080, 1080]);
    // cached: second request is the identical buffer
    const again = await app.inject({ method: "GET", url: `/api/case/${c.caseId}/badge.png` });
    expect(again.rawPayload.equals(png.rawPayload)).toBe(true);
  }, 30_000);
});

describe("report hardening", () => {
  it("strips emoji, flags, ZWJ/VS16 and glyphs the fonts lack (CJK); keeps Latin/Cyrillic accents", () => {
    expect(printable("Fridgely 🚀🇪🇺 👨‍👩‍👧 ❤️ 冷蔵庫")).toBe("Fridgely");
    expect(printable("Ségolène Привет")).toBe("Ségolène Привет");
    const r = normalise("x", { ...mockNotice(), startupName: "🤖🤖" }, OFFICERS);
    expect(r.startupName).toBe("Unnamed Startup");
  });

  it("v2: per-law breakdown from the fines meter, largest first; v1 has none", () => {
    const r = normalise("mock", mockNotice(), OFFICERS, mockFines());
    expect(r.breakdown).toEqual([
      { law: "AI Act", eur: 700_000_000, jailMonths: 0 },
      { law: "GDPR", eur: 480_000_000, jailMonths: 120 },
      { law: "NIS2", eur: 54_567_890, jailMonths: 51 },
    ]);
    expect(r.breakdown.reduce((a, b) => a + b.eur, 0)).toBe(r.totalEur);
    expect(normalise("c1", v1, OFFICERS, mockFines()).breakdown).toEqual([]);
  });

  it("cites FR Code pénal 226-17/226-18 for GDPR jail", () => {
    const fw = frameworkOf(corpus.provision("gdpr-9")!);
    expect(fw.penalty).toMatch(/226-17/);
    expect(fw.penalty).toMatch(/226-18/);
    expect(fw.penalty).not.toMatch(/226-16/);
  });

  it("sliding window limits per key", () => {
    let t = 0;
    const w = new Window(2, 1000, () => t);
    expect(w.hit("a")).toBe(0);
    expect(w.hit("a")).toBe(0);
    expect(w.hit("a")).toBe(1000);
    expect(w.hit("b")).toBe(0);
    t = 1001;
    expect(w.hit("a")).toBe(0);
  });

  it("rate-limits the routes per IP with 429 + retry-after", async () => {
    const app = Fastify();
    registerReportRoutes(app, { state: () => undefined, corpus, roster, perMinute: 2 });
    expect((await app.inject({ url: "/api/case/x/badge.png" })).statusCode).toBe(404);
    expect((await app.inject({ url: "/api/case/x/badge.png" })).statusCode).toBe(404);
    const r = await app.inject({ url: "/api/case/x/badge.png" });
    expect(r.statusCode).toBe(429);
    expect(Number(r.headers["retry-after"])).toBeGreaterThan(0);
    await app.close();
  });

  it("pre-renders both files at verdict into reportsDir and serves them from disk", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "reports-"));
    const { app } = makeApp({ reportsDir: dir });
    const c = (await app.inject({ method: "POST", url: "/api/case", payload: { submission: { kind: "text", text: "We are Fridgely. Our AI watches you eat and sells the data. We do €1B in revenue." }, officers: ["formblatt", "annexe"] } })).json() as { caseId: string };
    for (let tier = 1; tier <= 5; tier++) {
      if (tier > 1) await app.inject({ method: "POST", url: `/api/case/${c.caseId}/reply`, payload: { text: `Objection ${tier}` } });
      await app.inject({ method: "GET", url: `/api/case/${c.caseId}/stream` });
    }
    const deadline = Date.now() + 20_000;
    while (readdirSync(dir).filter((f) => !f.endsWith(".tmp")).length < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    expect(readdirSync(dir).sort()).toEqual([`${c.caseId}.v2.pdf`, `${c.caseId}.v2.png`]);
    const png = await app.inject({ url: `/api/case/${c.caseId}/badge.png` });
    expect(png.statusCode).toBe(200);
    expect(pngSize(png.rawPayload)).toEqual([1080, 1080]);
    expect(existsSync(path.join(dir, `${c.caseId}.v2.png`))).toBe(true);
    await app.close();
  }, 40_000);
});
