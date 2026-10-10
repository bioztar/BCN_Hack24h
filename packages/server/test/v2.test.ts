import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MELTDOWN_EUR, type LeaderboardEntry, type NoticeV2, type RoastEvent, type RoastEventV2 } from "@dg-roast/shared";
import { ApplicantStore, CAUSES, QUIPS, reencodePhoto } from "../src/applicants.js";
import { openDb } from "../src/db.js";
import { addFine, emptyMeter, isPenaltyArticle, jailFor, provisionFine, statuteFor } from "../src/fine.js";
import { Leaderboard } from "../src/leaderboard.js";
import { meanwhileAt, meanwhileLine } from "../src/meanwhile.js";
import { parseSse } from "../src/sse.js";
import { AudioCache } from "../src/voice.js";
import { entries, fakeGitHub, makeApp } from "./helpers.js";

type Ev = RoastEvent | RoastEventV2;
type App = ReturnType<typeof makeApp>["app"];

async function stream(app: App, caseId: string): Promise<Ev[]> {
  const res = await app.inject({ method: "GET", url: `/api/case/${caseId}/stream` });
  expect(res.statusCode).toBe(200);
  return parseSse(res.payload).map((e) => e.data as Ev);
}

async function fullCase(app: App, payload: Record<string, unknown>): Promise<{ caseId: string; events: Ev[] }> {
  const created = await app.inject({ method: "POST", url: "/api/case", payload });
  expect(created.statusCode).toBe(201);
  const { caseId } = created.json() as { caseId: string };
  const events: Ev[] = [];
  for (let t = 1; t <= 5; t++) {
    events.push(...(await stream(app, caseId)));
    if (t < 5) expect((await app.inject({ method: "POST", url: `/api/case/${caseId}/reply`, payload: { text: "We are fully compliant, trust us." } })).statusCode).toBe(204);
  }
  return { caseId, events };
}

const PITCH = "We are Fridgely, the uber for fridges in Europe. Our AI watches you eat, recognises your face and sells the health data. We do €1B in revenue.";

describe("fines model", () => {
  it("is deterministic per case and scales with tier", () => {
    const o = { caseId: "c1", index: 0, provisionId: "ai-act-5", label: "AI Act Art. 5", tier: 1, revenueEur: 0, repeat: false };
    expect(provisionFine(o)).toEqual(provisionFine(o));
    const t1 = provisionFine(o)!.amountEur;
    const t5 = provisionFine({ ...o, tier: 5 })!.amountEur;
    expect(t1).toBeGreaterThanOrEqual(0.35 * 35_000_000);
    expect(t1).toBeLessThanOrEqual(35_000_000);
    expect(t5).toBeGreaterThan(t1 * 10);
  });
  it("uses the real statutory maxima", () => {
    expect(statuteFor("ai-act-5")).toMatchObject({ capEur: 35_000_000, pct: 0.07 });
    expect(statuteFor("gdpr-6")).toMatchObject({ capEur: 20_000_000, pct: 0.04 });
    expect(statuteFor("gdpr-32")).toMatchObject({ capEur: 10_000_000, pct: 0.02 });
    // turnover-based ceiling wins when higher
    const big = provisionFine({ caseId: "c", index: 0, provisionId: "ai-act-5", label: "AI Act Art. 5", tier: 1, revenueEur: 10_000_000_000, repeat: false });
    expect(big!.amountEur).toBeGreaterThan(35_000_000);
  });
  it("meltdown fires exactly once and totals are monotonic", () => {
    const m = emptyMeter();
    let crossings = 0;
    let last = 0;
    for (let i = 0; i < 40; i++) {
      const f = provisionFine({ caseId: "c2", index: i, provisionId: "ai-act-5", label: "AI Act Art. 5", tier: 5, revenueEur: 0, repeat: i > 0 });
      if (addFine(m, { id: String(i), ...f! }, { eur: MELTDOWN_EUR, jailMonths: 1200 }).crossed) crossings++;
      expect(m.totalEur).toBeGreaterThanOrEqual(last);
      last = m.totalEur;
    }
    expect(crossings).toBe(1);
    expect(m.meltdown).toBe(true);
  });
});

describe("meanwhile", () => {
  it("is deterministic per case, monotonic, and absurd in the right direction", () => {
    expect(meanwhileAt("k", 90)).toEqual(meanwhileAt("k", 90));
    let prev = meanwhileAt("k", 0);
    for (let t = 1; t <= 600; t += 7) {
      const m = meanwhileAt("k", t);
      expect(m.china.models).toBeGreaterThanOrEqual(prev.china.models);
      expect(m.us.models).toBeGreaterThanOrEqual(prev.us.models);
      expect(m.eu.regulations).toBeGreaterThanOrEqual(prev.eu.regulations);
      expect(m.eu.forms).toBeGreaterThanOrEqual(prev.eu.forms);
      prev = m;
    }
    for (const key of ["a", "b", "c", "d"]) {
      const m = meanwhileAt(key, 120);
      expect(m.china.models).toBeGreaterThan(m.us.models);
      expect(m.eu.forms).toBeGreaterThan(m.eu.regulations * 5);
      expect(m.us.note).toMatch(/\$\d+ bn/);
    }
    expect(meanwhileLine(meanwhileAt("k", 60))).toMatch(/^Meanwhile, .*China built .*Europe adopted \d+ new regulations and \d+ forms/);
  });
});

describe("applicants", () => {
  it("issues a queue ticket in contract ranges and a better-place skip per cause", async () => {
    const store = new ApplicantStore(openDb(":memory:"));
    for (let i = 0; i < 20; i++) {
      const { ticket } = await store.register({ startupName: "48K", founderName: "Ada" });
      expect(ticket.ticket).toBeGreaterThanOrEqual(10_000);
      expect(ticket.ticket).toBeLessThan(1_000_000);
      expect(ticket.position).toBeGreaterThan(1_000_000);
      expect(ticket.countdownSec).toBeGreaterThanOrEqual(30);
      expect(ticket.countdownSec).toBeLessThanOrEqual(60);
      expect(ticket.etaText).toMatch(/^Estimated decision: /);
    }
    const { ticket } = await store.register({ startupName: "48K", founderName: "Ada" });
    for (const cause of CAUSES) expect(QUIPS[cause].length).toBeGreaterThan(0);
    expect(ticket.applicantToken.length).toBeGreaterThanOrEqual(43);
    expect(() => store.betterPlace(ticket.applicantId, "climate", "wrong")).toThrow(/applicantToken/);
    const r = store.betterPlace(ticket.applicantId, "climate", ticket.applicantToken);
    expect(r).toMatchObject({ position: 1, skipped: ticket.position - 1, cause: "climate" });
    expect(r.quip).not.toContain("{skipped}");
    expect(store.get(ticket.applicantId)!.position).toBe(1);
    expect(() => store.betterPlace(ticket.applicantId, "crypto", ticket.applicantToken)).toThrow(/cause must be one of/);
  });
  it("re-encodes selfies to ≤512 px JPEG without EXIF", async () => {
    const png = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#c00" } })
      .withExif({ IFD0: { Artist: "Secret Person", Copyright: "GPS 41.38N 2.17E" } })
      .jpeg()
      .toBuffer();
    const out = await reencodePhoto(`data:image/jpeg;base64,${png.toString("base64")}`);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width!, meta.height!)).toBe(512);
    expect(meta.exif).toBeUndefined();
    expect(out.includes(Buffer.from("Secret Person"))).toBe(false);
    await expect(reencodePhoto("data:text/html;base64,PGgxPg==")).rejects.toThrow(/data URL/);
    await expect(reencodePhoto("data:image/png;base64,bm90IGFuIGltYWdl")).rejects.toThrow(/readable/);
  });
});

describe("leaderboard", () => {
  const entry = (i: number, eur: number, jail: number): LeaderboardEntry => ({ caseId: `case-${i}`, startupName: `S${i}`, founderName: null, oneLiner: null, photoUrl: null, totalEur: eur, totalJailMonths: jail, meltdown: false, topLaws: ["GDPR"], issuedAt: new Date(Date.UTC(2026, 9, 10, 12, i)).toISOString() });
  it("sorts by fines, jail and recent with a stable cursor", () => {
    const b = new Leaderboard(openDb(":memory:"));
    const all = [entry(1, 500, 3), entry(2, 900, 1), entry(3, 500, 9), entry(4, 100, 9), entry(5, 900, 0)];
    for (const e of all) b.add(e, [], null);
    const walk = (sort: "fines" | "jail" | "recent") => {
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const page = b.list(sort, 2, cursor);
        expect(page.entries.length).toBeLessThanOrEqual(2);
        ids.push(...page.entries.map((e) => e.caseId));
        cursor = page.next;
      } while (cursor);
      return ids;
    };
    expect(walk("fines")).toEqual(["case-5", "case-2", "case-3", "case-1", "case-4"]);
    expect(walk("jail")).toEqual(["case-4", "case-3", "case-1", "case-2", "case-5"]);
    expect(walk("recent")).toEqual(["case-5", "case-4", "case-3", "case-2", "case-1"]);
    expect(b.get("case-3")!.entry.totalJailMonths).toBe(9);
  });
});

describe("v2 over HTTP (mocked providers)", () => {
  it("applicant → case → fines, meltdown once, meanwhile, NoticeV2, leaderboard", async () => {
    const { app } = makeApp();
    const jpeg = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#00f" } }).jpeg().toBuffer();
    const reg = await app.inject({ method: "POST", url: "/api/applicants", payload: { startupName: "Fridgely", founderName: "Ada Lovelace", oneLiner: "Uber for fridges", photo: `data:image/jpeg;base64,${jpeg.toString("base64")}` } });
    expect(reg.statusCode).toBe(201);
    const ticket = reg.json() as { applicantId: string; applicantToken: string };
    expect((await app.inject({ method: "POST", url: "/api/applicants", payload: { startupName: "" } })).statusCode).toBe(400);
    const bp = `/api/applicants/${ticket.applicantId}/better-place`;
    expect((await app.inject({ method: "POST", url: bp, payload: { cause: "ai-safety" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: bp, payload: { cause: "ai-safety", applicantToken: "x".repeat(43) } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: bp, headers: { "x-applicant-token": ticket.applicantToken }, payload: { cause: "ai-safety" } })).json()).toMatchObject({ position: 1, cause: "ai-safety" });
    expect((await app.inject({ method: "GET", url: `/api/photos/${ticket.applicantId}.jpg` })).statusCode).toBe(404);
    const sub = { kind: "text", text: PITCH };
    expect((await app.inject({ method: "POST", url: "/api/case", payload: { submission: sub, applicantId: "nope" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: "/api/case", payload: { submission: sub, applicantId: ticket.applicantId } })).statusCode).toBe(403);

    const { caseId, events } = await fullCase(app, { submission: sub, officers: ["formblatt", "annexe"], applicantId: ticket.applicantId, applicantToken: ticket.applicantToken });
    const again = await app.inject({ method: "POST", url: "/api/case", payload: { submission: sub, applicantId: ticket.applicantId, applicantToken: ticket.applicantToken } });
    expect(again.statusCode).toBe(200);
    expect((again.json() as { caseId: string }).caseId).toBe(caseId);
    const fines = events.filter((e): e is Extract<Ev, { type: "fine" }> => e.type === "fine");
    const cites = events.flatMap((e) => (e.type === "line" ? e.provisions : [])).filter((p) => statuteFor(p.id));
    expect(fines.some((f) => isPenaltyArticle(f.provision.id))).toBe(false);
    for (const f of fines) expect(f.jailMonths).toBeLessThanOrEqual(60);
    expect(fines.length).toBe(cites.length);
    expect(fines.length).toBeGreaterThan(0);
    for (let i = 1; i < fines.length; i++) expect(fines[i]!.totalEur).toBeGreaterThanOrEqual(fines[i - 1]!.totalEur);
    expect(events.filter((e) => e.type === "meltdown").length).toBeLessThanOrEqual(1);
    const verdictAt = events.findIndex((e) => e.type === "verdict");
    const mw = events[verdictAt - 1]!;
    expect(mw.type).toBe("meanwhile");
    const notice = (events[verdictAt] as unknown as { notice: NoticeV2 }).notice;
    expect(notice).toMatchObject({ applicantId: ticket.applicantId, startupName: "Fridgely", founderName: "Ada Lovelace", reportUrl: `/api/case/${caseId}/report.pdf`, badgeUrl: `/api/case/${caseId}/badge.png` });
    expect(notice.totalEur).toBe(fines.at(-1)!.totalEur);
    expect(notice.totalJailMonths).toBe(fines.at(-1)!.totalJailMonths);
    expect(notice.meltdown).toBe(events.some((e) => e.type === "meltdown"));
    expect(notice.meanwhile).toEqual((mw as { meanwhile: unknown }).meanwhile);
    expect(notice.tldr.length).toBeGreaterThan(0);
    expect(notice.recommendations.length).toBeGreaterThan(0);
    expect(typeof notice.fineEur).toBe("number");
    const lastLine = events.filter((e) => e.type === "line").at(-1) as { text: string };
    expect(lastLine.text).toMatch(/meanwhile/i);

    const lb = (await app.inject({ method: "GET", url: "/api/leaderboard?sort=recent" })).json() as { entries: LeaderboardEntry[]; next: string | null };
    expect(lb.entries[0]).toMatchObject({ caseId, startupName: "Fridgely", totalEur: notice.totalEur, oneLiner: "Uber for fridges" });
    const photoUrl = lb.entries[0]!.photoUrl!;
    expect(photoUrl).toMatch(/^\/api\/photos\/[A-Za-z0-9_-]{16,64}\.jpg$/);
    expect(photoUrl).not.toContain(ticket.applicantId);
    const photo = await app.inject({ method: "GET", url: photoUrl });
    expect(photo.statusCode).toBe(200);
    expect(photo.headers["content-type"]).toBe("image/jpeg");
    const one = (await app.inject({ method: "GET", url: `/api/leaderboard/${caseId}` })).json() as { entry: LeaderboardEntry; findings: unknown[] };
    expect(one.entry.caseId).toBe(caseId);
    expect(one.findings).toEqual(notice.findings);
    expect((await app.inject({ method: "GET", url: "/api/leaderboard?cursor=garbage" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/leaderboard?sort=nope" })).statusCode).toBe(400);
    // replay after the case closed still returns the v2 notice
    const replay = await stream(app, caseId);
    expect((replay.find((e) => e.type === "verdict") as unknown as { notice: NoticeV2 }).notice.totalEur).toBe(notice.totalEur);
  });

  it("works without any model (mock path) and still produces NoticeV2", async () => {
    const { app } = makeApp({ llm: null });
    const { events } = await fullCase(app, { submission: { kind: "text", text: PITCH } });
    const notice = (events.find((e) => e.type === "verdict") as unknown as { notice: NoticeV2 }).notice;
    expect(notice.applicantId).toBeNull();
    expect(notice.tldr.length).toBeGreaterThan(0);
    expect(notice.meanwhile).toBeDefined();
  });

  it("streams analyzing progress before the intake for repo pitches", async () => {
    const gh = fakeGitHub({ tree: { "": entries("", ["README.md", ".env", "package.json"]) }, files: { "README.md": "An AI chatbot that stores user emails.", "package.json": '{"dependencies":{"langchain":"1"}}' } });
    const { app } = makeApp({ github: gh.impl });
    const created = await app.inject({ method: "POST", url: "/api/case", payload: { submission: { kind: "repo", repoUrl: "https://github.com/acme/bot" } } });
    expect(created.statusCode).toBe(201);
    const events = await stream(app, (created.json() as { caseId: string }).caseId);
    const types = events.map((e) => e.type);
    const analyzing = events.filter((e): e is Extract<Ev, { type: "analyzing" }> => e.type === "analyzing");
    expect(analyzing.length).toBeGreaterThan(1);
    expect(analyzing.at(-1)!.progress).toBe(1);
    expect(types.lastIndexOf("analyzing")).toBeLessThan(types.indexOf("intake"));
  });
});

describe("turnover-only regimes", () => {
  it("still fine when no turnover was given", () => {
    const f = provisionFine({ caseId: "c", index: 0, provisionId: "dsa-74", label: "DSA Art. 74", tier: 1, revenueEur: 0, repeat: false });
    expect(f!.amountEur).toBeGreaterThan(0);
    expect(f!.law).toBe("DSA");
  });
});

describe("fines calibration", () => {
  const verdictOf = (events: Ev[]) => (events.find((e) => e.type === "verdict") as unknown as { notice: NoticeV2 }).notice;
  it("a benign pitch ends in the €10–200M range, ≤ 5 years, no meltdown", async () => {
    for (let i = 0; i < 6; i++) {
      const { app } = makeApp({ llm: null });
      const { events } = await fullCase(app, { submission: { kind: "text", text: `We run a small online shop for handmade wooden chess boards (#${i}). Customers pay by card; we ship within the EU.` } });
      const n = verdictOf(events);
      expect(n.totalEur, `case ${i}`).toBeGreaterThanOrEqual(10_000_000);
      expect(n.totalEur, `case ${i}`).toBeLessThanOrEqual(200_000_000);
      expect(n.totalJailMonths).toBeLessThanOrEqual(60);
      expect(n.meltdown).toBe(false);
    }
  });
  it("a special-category / biometric pitch melts down by tier 4–5", async () => {
    const { app } = makeApp();
    const { events } = await fullCase(app, { submission: { kind: "text", text: PITCH } });
    const at = events.findIndex((e) => e.type === "meltdown");
    expect(at).toBeGreaterThan(-1);
    const tier = (events.slice(0, at).filter((e) => e.type === "tier").at(-1) as { tier: number }).tier;
    expect(tier).toBeGreaterThanOrEqual(4);
    expect(verdictOf(events).meltdown).toBe(true);
  });
  it("never fines penalty articles; jail only for covered offences, never above the statutory max", () => {
    for (const id of ["ai-act-99", "ai-act-101", "gdpr-83", "gdpr-84", "dora-28"]) expect(provisionFine({ caseId: "c", index: 0, provisionId: id, label: id, tier: 5, revenueEur: 1e9, repeat: false })).toBeNull();
    for (const id of ["gdpr-13", "gdpr-30", "gdpr-25", "ai-act-5", "nis2-21"]) for (const c of ["a", "b", "c", "d"]) expect(jailFor(c, id)).toBeNull();
    for (const c of ["a", "b", "c", "d", "e", "f"]) {
      const f = provisionFine({ caseId: c, index: 0, provisionId: "gdpr-9", label: "GDPR Art. 9", tier: 5, revenueEur: 1e9, repeat: false })!;
      const max = jailFor(c, "gdpr-9")!.months;
      expect(f.jailMonths).toBeGreaterThan(0);
      expect(f.jailMonths).toBeLessThanOrEqual(max);
      // same offence is sentenced once per case
      expect(provisionFine({ caseId: c, index: 1, provisionId: "gdpr-9", label: "GDPR Art. 9", tier: 5, revenueEur: 1e9, repeat: true, jailBases: new Set([f.jailBasis!]) })!.jailMonths).toBe(0);
    }
  });
});

describe("TTS queue", () => {
  it("bounds concurrency to 3 and retries a failed synth once", async () => {
    let active = 0;
    let peak = 0;
    const fails = new Set(["t1"]);
    const logs: string[] = [];
    const tts = {
      async synthesize(text: string) {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 20));
        active--;
        if (fails.delete(text)) throw new Error("TTS HTTP 503");
        return { audio: Buffer.from(text), contentType: "audio/mpeg" };
      },
    };
    const cache = new AudioCache(tts, null, (m) => logs.push(m), 3, 1);
    const urls = await Promise.all(Array.from({ length: 8 }, (_, i) => cache.render(`t${i}`, { provider: "x", voice: "y" } as never)));
    expect(urls.every((u) => u?.startsWith("/api/audio/"))).toBe(true);
    expect(peak).toBeLessThanOrEqual(3);
    expect(logs.join("\n")).toMatch(/attempt 1, status 503, Error/);
  });
});
