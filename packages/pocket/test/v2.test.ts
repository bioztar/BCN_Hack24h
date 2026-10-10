import { describe, expect, it } from "vitest";
import { MockApi, entriesFromMessage } from "../src/api";
import { FIXTURE_PAIRS, FIXTURE_PERSONAS, mockRoundEvents, type MockCtx } from "../src/fixtures";
import { lawOf, mockFine, statutoryMax } from "../src/fines";
import { initials, mergeEntries, sortEntries } from "../src/leaderboard";
import { estimateMeanwhile, formatElapsed, maxMeanwhile, meanwhileLine, meanwhileRows } from "../src/meanwhile";
import { Tween, formatEurFull, formatEurShort, formatJail, meltdownCrossed, meltdownProgress, slotText } from "../src/meter";
import { reportLines } from "../src/pdf";
import { dataUrlBytes, fitSize } from "../src/photo";
import { CAUSES, formatPosition, positionAt } from "../src/queue";
import { initialState, reduce } from "../src/reducer";
import { FineSync, Timeline } from "../src/timeline";
import { SseParser, toRoastEvent } from "../src/sse";
import { MELTDOWN_EUR, type FineEvent, type LeaderboardEntry, type Notice, type NoticeV2, type Persona, type Provision, type Submission } from "../src/types";
import { isNoticeV2, toNoticeV2, turnoverLine } from "../src/verdict";

const prov = (id: string, label: string): Provision => ({ id, label, title: label, url: "https://eur-lex.europa.eu/" });
const gdpr = prov("gdpr-5", "GDPR Art. 5");
const ai = prov("ai-act-99", "AI Act Art. 99");
const fine = (id: string, p: Provision, totalEur: number, totalJailMonths = 0): FineEvent => ({ type: "fine", id, provision: p, amountEur: 1, jailMonths: 0, totalEur, totalJailMonths, caption: "" });
const line = (id: string, provisions: Provision[] = []) => ({ type: "line" as const, id, speaker: "formblatt" as const, text: "t", provisions, clip: "talking" as const, audioUrl: null });

describe("meter", () => {
  it("formats money and jail", () => {
    expect(formatEurFull(1_240_000_000)).toBe("€1,240,000,000");
    expect(formatEurFull(-5)).toBe("€0");
    expect(formatEurShort(1_240_000_000)).toBe("€1.24 bn");
    expect(formatEurShort(35_000_000)).toBe("€35.0 M");
    expect(formatJail(1)).toBe("1 month");
    expect(formatJail(38)).toBe("3 yrs 2 mo");
    expect(formatJail(24)).toBe("2 years");
    expect(formatJail(1236)).toBe("103 years");
  });
  it("meltdown when either threshold is crossed", () => {
    expect(meltdownCrossed(MELTDOWN_EUR - 1, 1199)).toBe(false);
    expect(meltdownCrossed(MELTDOWN_EUR, 0)).toBe(true);
    expect(meltdownCrossed(0, 1200)).toBe(true);
    expect(meltdownProgress(MELTDOWN_EUR / 2, 600)).toBe(0.5);
    expect(meltdownProgress(5 * MELTDOWN_EUR, 0)).toBe(1);
  });
  it("slot text keeps punctuation, spins digits, settles exactly", () => {
    const zero = () => 0;
    expect(slotText("€1,234", 0, zero)).toBe("€0,000");
    expect(slotText("€1,234", 1, zero)).toBe("€1,234");
    expect(slotText("€1,234", 0.99, zero)).toBe("€1,234");
  });
  it("tween only rises", () => {
    const t = new Tween(1000);
    expect(t.set(100, 0)).toBe(true);
    expect(t.value(500)).toBeGreaterThan(50);
    expect(t.value(1000)).toBe(100);
    expect(t.set(50, 1000)).toBe(false);
    expect(t.target).toBe(100);
  });
});

describe("fines (mock mirror of the server model)", () => {
  it("uses real statutory maxima", () => {
    expect(statutoryMax("ai-act-5")).toMatchObject({ eur: 35e6, pct: 0.07 });
    expect(statutoryMax("ai-act-99")).toMatchObject({ eur: 15e6, pct: 0.03 });
    expect(statutoryMax("gdpr-5")).toMatchObject({ eur: 20e6, pct: 0.04, jailMonths: 36 });
    expect(statutoryMax("gdpr-30")).toMatchObject({ eur: 10e6, pct: 0.02 });
    expect(statutoryMax("nis2-21").eur).toBe(10e6);
  });
  it("is deterministic per case, scales with tier, totals are monotonic", () => {
    const a = mockFine("c1", gdpr, 1, { eur: 0, jail: 0 });
    const b = mockFine("c1", gdpr, 1, { eur: 0, jail: 0 });
    expect(a).toEqual(b);
    const t5 = mockFine("c1", gdpr, 5, { eur: 0, jail: 0 });
    expect(t5.amountEur).toBeGreaterThan(a.amountEur * 100);
    const totals = { eur: 0, jail: 0 };
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const f = mockFine("c2", i % 2 ? ai : gdpr, ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5, totals, 1e9, i);
      expect(f.totalEur).toBeGreaterThan(last);
      expect(f.totalEur).toBe(totals.eur);
      last = f.totalEur;
    }
  });
  it("revenue-based maximum wins when larger", () => {
    const small = mockFine("c", ai, 1, { eur: 0, jail: 0 }, 0);
    const huge = mockFine("c", ai, 1, { eur: 0, jail: 0 }, 10e9);
    expect(huge.amountEur / small.amountEur).toBeCloseTo((0.03 * 10e9) / 15e6, 0);
  });
  it("groups provisions by law", () => {
    expect(lawOf("GDPR Art. 5")).toBe("GDPR");
    expect(lawOf("AI Act Annex III")).toBe("AI Act");
    expect(lawOf("ePrivacy Dir. Art. 5(3)")).toBe("ePrivacy");
  });
});

describe("timeline + meltdown sync", () => {
  it("holds a fine for the upcoming line that cites it; otherwise lands now", () => {
    const tl = new Timeline();
    tl.addLine(line("a", [gdpr]));
    expect(tl.addFine(fine("f1", gdpr, 10))).toBeNull();
    expect(tl.addFine(fine("f2", ai, 20))?.id).toBe("f2");
    const cue = tl.next()!;
    expect(cue.fines.map((f) => f.id)).toEqual(["f1"]);
    expect(tl.addFine(fine("f3", gdpr, 30))?.id).toBe("f3");
  });
  it("burns once, when the shown meter reaches the meltdown totals", () => {
    const s = new FineSync();
    expect(s.meltdown({ totalEur: 2e9, totalJailMonths: 0 })).toBe(false);
    expect(s.apply(fine("1", gdpr, 1e9))).toBe(false);
    expect(s.apply(fine("2", gdpr, 2e9))).toBe(true);
    expect(s.apply(fine("3", gdpr, 3e9))).toBe(false);
    expect(s.meltdown({ totalEur: 3e9, totalJailMonths: 0 })).toBe(false);
  });
  it("flushes a pending meltdown at the verdict", () => {
    const s = new FineSync();
    s.meltdown({ totalEur: 5e9, totalJailMonths: 0 });
    expect(s.flush()).toBe(true);
    expect(s.flush()).toBe(false);
    expect(s.melted).toBe(true);
  });
});

describe("reducer v2 events", () => {
  it("dedupes fines, keeps totals monotonic, clamps analyzing progress", () => {
    let s = reduce(initialState, fine("x", gdpr, 100, 5));
    s = reduce(s, fine("x", gdpr, 100, 5));
    s = reduce(s, fine("y", gdpr, 50, 1));
    expect(s.fines).toHaveLength(2);
    expect(s.totalEur).toBe(100);
    expect(s.totalJailMonths).toBe(5);
    s = reduce(s, { type: "meltdown", totalEur: 2e9, totalJailMonths: 3 });
    expect(s.meltdown).toBe(true);
    expect(s.totalEur).toBe(2e9);
    s = reduce(s, { type: "analyzing", stage: "a", progress: 0.6 });
    s = reduce(s, { type: "analyzing", stage: "b", progress: 0.3 });
    expect(s.analyzing).toEqual({ stage: "b", progress: 0.6 });
    const m = estimateMeanwhile("s", 60);
    expect(reduce(s, { type: "meanwhile", meanwhile: m }).meanwhile).toEqual(m);
  });
  it("SSE parser accepts v2 event types", () => {
    const p = new SseParser();
    const msgs = p.push(`data: ${JSON.stringify(fine("f", gdpr, 1))}\n\ndata: ${JSON.stringify({ type: "meanwhile", meanwhile: estimateMeanwhile("a", 9) })}\n\ndata: {"type":"meltdown","totalEur":1,"totalJailMonths":2}\n\n`);
    expect(msgs.map((m) => toRoastEvent(m)?.type)).toEqual(["fine", "meanwhile", "meltdown"]);
  });
});

describe("queue", () => {
  it("runs from start to exactly 0 over countdownSec, monotonically", () => {
    expect(positionAt(2_000_000, 0, 40)).toBe(2_000_000);
    expect(positionAt(2_000_000, 40, 40)).toBe(0);
    expect(positionAt(2_000_000, 39.9, 40)).toBeGreaterThanOrEqual(1);
    let last = Infinity;
    for (let t = 0; t <= 40; t += 0.5) {
      const p = positionAt(2_000_000, t, 40);
      expect(p).toBeLessThanOrEqual(last);
      last = p;
    }
    expect(positionAt(10, 5, 0)).toBe(0);
    expect(formatPosition(1234567)).toBe("1,234,567");
  });
  it("offers every contract cause once", () => {
    const ids = CAUSES.map((c) => c.id);
    expect(new Set(ids).size).toBe(10);
    expect(ids).toContain("ai-safety");
  });
});

const entry = (caseId: string, totalEur: number, totalJailMonths: number, min: number): LeaderboardEntry => ({
  caseId, startupName: caseId, founderName: null, oneLiner: null, photoUrl: null, totalEur, totalJailMonths, meltdown: false, topLaws: [], issuedAt: new Date(Date.UTC(2026, 9, 10, 12, min)).toISOString(),
});

describe("leaderboard", () => {
  const es = [entry("a", 100, 5, 1), entry("b", 300, 1, 2), entry("c", 200, 9, 3), entry("d", 300, 2, 0)];
  it("sorts by fines, jail, recent with tie-breaks", () => {
    expect(sortEntries(es, "fines").map((e) => e.caseId)).toEqual(["d", "b", "c", "a"]);
    expect(sortEntries(es, "jail").map((e) => e.caseId)).toEqual(["c", "a", "d", "b"]);
    expect(sortEntries(es, "recent").map((e) => e.caseId)).toEqual(["c", "b", "a", "d"]);
  });
  it("merges live entries: dedupe by caseId, newer wins, capped", () => {
    const merged = mergeEntries(es, [entry("a", 999, 0, 4), entry("e", 1, 0, 5)], "fines", 3);
    expect(merged.map((e) => e.caseId)).toEqual(["a", "d", "b"]);
    expect(merged[0]!.totalEur).toBe(999);
  });
  it("parses stream payloads in any reasonable shape", () => {
    const e = entry("z", 1, 1, 1);
    expect(entriesFromMessage(JSON.stringify(e))).toHaveLength(1);
    expect(entriesFromMessage(JSON.stringify({ type: "entry", entry: e }))).toHaveLength(1);
    expect(entriesFromMessage(JSON.stringify({ entries: [e, e, { nope: 1 }] }))).toHaveLength(2);
    expect(entriesFromMessage("not json")).toEqual([]);
  });
  it("initials", () => {
    expect(initials("Dr. Heinrich Formblatt")).toBe("DH");
    expect(initials("faceify")).toBe("F");
    expect(initials("  ")).toBe("?");
  });
});

describe("meanwhile", () => {
  it("is deterministic, monotonic, China ≫ US, forms ≫ regulations", () => {
    expect(estimateMeanwhile("k", 300)).toEqual(estimateMeanwhile("k", 300));
    const a = estimateMeanwhile("k", 120);
    const b = estimateMeanwhile("k", 300);
    expect(b.china.models).toBeGreaterThanOrEqual(a.china.models);
    expect(b.eu.forms).toBeGreaterThan(a.eu.forms);
    expect(b.china.models).toBeGreaterThan(b.us.models);
    expect(b.eu.forms).toBeGreaterThan(b.eu.regulations);
    expect(estimateMeanwhile("k", 0).china.models).toBe(0);
  });
  it("display never goes down", () => {
    const hi = estimateMeanwhile("k", 300);
    const lo = estimateMeanwhile("k", 10);
    expect(maxMeanwhile(hi, lo).eu.forms).toBe(hi.eu.forms);
    expect(maxMeanwhile(null, lo)).toEqual(lo);
  });
  it("renders the line and the verdict card rows", () => {
    const m = { elapsedSec: 95, china: { models: 11, note: "one of them achieved superintelligence" }, us: { models: 3, note: "and raised $40 bn" }, eu: { regulations: 27, forms: 412, note: "you now have to fill in to start your startup" } };
    expect(meanwhileLine(m)).toBe("🇨🇳 11 AI models · 🇺🇸 3 · 🇪🇺 27 regulations + 412 forms");
    const rows = meanwhileRows(m);
    expect(rows.map((r) => r.who)).toEqual(["China", "The US", "Europe"]);
    expect(rows[0]!.text).toContain("11 new AI models — one of them achieved superintelligence");
    expect(rows[2]!.text).toContain("27 new regulations and 412 forms");
    expect(formatElapsed(95)).toBe("1 min 35 s");
  });
});

describe("mock v2 roast", () => {
  const personas = (ids: [string, string]) => ids.map((id) => FIXTURE_PERSONAS.find((p) => p.id === id)!) as [Persona, Persona];
  it.each(FIXTURE_PAIRS.map((p) => p.officers))("%s + %s: monotonic fines, one meltdown, NoticeV2 verdict", (a, b) => {
    const ctx: MockCtx = { personas: personas([a, b]), ticket: 4812, pitch: "We are Uber for forms", serial: "L-2026/04812", caseId: `case-${a}`, applicant: { applicantId: "app1", startupName: "Faceify", founderName: "Lena" } };
    const all = [0, 1, 2].flatMap((r) => mockRoundEvents(ctx, r));
    all.splice(all.findIndex((e) => e.type === "verdict") + 1);
    const fines = all.filter((e): e is FineEvent => e.type === "fine");
    expect(fines.length).toBeGreaterThan(0);
    fines.reduce((last, f) => (expect(f.totalEur).toBeGreaterThanOrEqual(last), f.totalEur), 0);
    expect(new Set(fines.map((f) => f.id)).size).toBe(fines.length);
    const melts = all.filter((e) => e.type === "meltdown");
    expect(melts.length).toBeLessThanOrEqual(1);
    const v = all.find((e) => e.type === "verdict");
    expect(v).toBeTruthy();
    const n = (v as unknown as { notice: NoticeV2 }).notice;
    expect(isNoticeV2(n)).toBe(true);
    expect(n.startupName).toBe("Faceify");
    expect(n.totalEur).toBe(fines.at(-1)!.totalEur);
    expect(n.meltdown).toBe(melts.length === 1);
    expect(n.tldr.length).toBeGreaterThan(0);
    expect(reportLines({ ...n, meanwhile: estimateMeanwhile("x", 60) }).some((l) => l.text.startsWith("While you were being processed"))).toBe(true);
  });
  it("repo pitches stream analyzing progress before the roast", () => {
    const ctx: MockCtx = { personas: personas(FIXTURE_PAIRS[0]!.officers), ticket: 1, pitch: "", serial: "s", repoUrl: "https://github.com/acme/rocket" };
    const ev = mockRoundEvents(ctx, 0);
    const an = ev.filter((e) => e.type === "analyzing");
    expect(an.length).toBeGreaterThan(2);
    expect((an.at(-1) as { progress: number }).progress).toBe(1);
    expect(ev.findIndex((e) => e.type === "analyzing")).toBeLessThan(ev.findIndex((e) => e.type === "line"));
  });
});

describe("verdict + photo helpers", () => {
  it("formats the server's turnover estimate and hides it when absent", () => {
    expect(turnoverLine({ eur: 40_000_000, basis: "EU HR-tech TAM €8 bn × 0.5 %" })).toBe(
      "Estimated turnover (by the Commission, generously): €40 M — EU HR-tech TAM €8 bn × 0.5 %",
    );
    expect(turnoverLine({ eur: 1_250_000, basis: "" })).toBe("Estimated turnover (by the Commission, generously): €1.3 M");
    expect(turnoverLine(undefined)).toBeNull();
    expect(turnoverLine({ eur: Number.NaN, basis: "x" })).toBeNull();
  });

  const v1: Notice = { serial: "S", startup: "Acme", officers: ["formblatt", "annexe"], fineEur: 5, fineBasis: "", findings: [{ text: "bad", provision: gdpr }], issuedAt: "2026-10-10T12:00:00Z" };
  it("upgrades a v1 notice using the streamed totals", () => {
    const n = toNoticeV2(v1, { caseId: "c 1", fines: [fine("f", ai, 9e8)], totalEur: 9e8, totalJailMonths: 12, meltdown: false, meanwhile: null, startupName: "Faceify" });
    expect(n.totalEur).toBe(9e8);
    expect(n.startupName).toBe("Faceify");
    expect(n.tldr.map((t) => t.law).sort()).toEqual(["AI Act", "GDPR"]);
    expect(n.badgeUrl).toBe("/api/case/c%201/badge.png");
    expect(n.reportUrl).toBe("/api/case/c%201/report.pdf");
  });
  it("keeps a v2 notice, never lowering totals", () => {
    const v2: NoticeV2 = { ...v1, applicantId: null, startupName: "A", founderName: null, totalEur: 10, totalJailMonths: 1, meltdown: false, tldr: [], recommendations: [], reportUrl: "/r.pdf", badgeUrl: "/b.png" };
    const n = toNoticeV2(v2, { caseId: "c", fines: [], totalEur: 2e9, totalJailMonths: 0, meltdown: true, meanwhile: null });
    expect(n).toMatchObject({ totalEur: 2e9, totalJailMonths: 1, meltdown: true, reportUrl: "/r.pdf", badgeUrl: "/b.png" });
  });
  it("selfie sizing", () => {
    expect(fitSize(4032, 3024)).toEqual({ w: 512, h: 384 });
    expect(fitSize(300, 200)).toEqual({ w: 300, h: 200 });
    expect(fitSize(0, 10)).toEqual({ w: 0, h: 0 });
    expect(dataUrlBytes("data:image/jpeg;base64,QUJD")).toBe(3);
    expect(dataUrlBytes("data:image/jpeg;base64,QUI=")).toBe(2);
  });
});

describe("applicant token (contract amendment dd6a356)", () => {
  const sub = { kind: "text", text: "Uber for forms" } as Submission;
  const input = { startupName: "Faceify", founderName: "Lena K." };

  it("mock registration returns a secret base64url token distinct from the public id", async () => {
    const t = await new MockApi(5).register(input);
    expect(t.applicantToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(t.applicantToken).not.toContain(t.applicantId);
  });

  it("mock rejects better-place and case creation without the matching token", async () => {
    const api = new MockApi(5);
    const t = await api.register(input);
    const bad = { applicantId: t.applicantId, applicantToken: "nope" };
    await expect(api.betterPlace(bad, "climate")).rejects.toMatchObject({ status: 403 });
    await expect(api.createCase(sub, undefined, bad)).rejects.toMatchObject({ status: 403 });
    await expect(api.betterPlace(t, "climate")).resolves.toMatchObject({ cause: "climate" });
  });

  it("a second case for the same applicant returns the existing caseId", async () => {
    const api = new MockApi(5);
    const t = await api.register(input);
    const a = await api.createCase(sub, undefined, t);
    const b = await api.createCase(sub, undefined, t);
    expect(b.caseId).toBe(a.caseId);
    expect(b.officers).toEqual(a.officers);
    const anon = await api.createCase(sub);
    expect(anon.caseId).not.toBe(a.caseId);
  });
});
