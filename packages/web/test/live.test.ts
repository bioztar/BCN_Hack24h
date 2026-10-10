import { describe, expect, it } from "vitest";
import { MELTDOWN_EUR, type LeaderboardEntry, type Provision } from "../src/contract";
import { compare, funniness, moves, pushCaption, sameDay, tickerPick, toEntry, top, upsert } from "../src/live/board";
import { applyFine, applyMeltdown, emptyMeter, fmtEurShort, fmtJail,
  fmtJailShort, meltdownProgress, type FineEvent } from "../src/live/fines";
import { dayMeanwhile, elapsedText, maxMeanwhile, secondsSinceMidnight, toMeanwhile } from "../src/live/meanwhile";
import { emptyLive, liveReduce } from "../src/live/case";
import { toGameTop, toLive, toStats } from "../src/live/api";
import { mockFine } from "../src/live/mockWorld";

const P: Provision = { id: "gdpr-83", label: "GDPR Art. 83", title: "Fines", url: "https://eur-lex.europa.eu/" };
const fine = (id: string, amountEur: number, totalEur: number, jail = 0, totalJail = 0): FineEvent => ({ type: "fine", id, provision: P, amountEur, jailMonths: jail, totalEur, totalJailMonths: totalJail, caption: "c" + id });
const entry = (caseId: string, totalEur: number, totalJailMonths: number, issuedAt = "2026-10-10T10:00:00Z"): LeaderboardEntry => ({ caseId, startupName: caseId, founderName: null, oneLiner: null, photoUrl: null, totalEur, totalJailMonths, meltdown: false, topLaws: [], issuedAt });

describe("fines meter", () => {
  it("uses server totals, dedupes replays, never goes down", () => {
    let m = applyFine(emptyMeter(), fine("a", 10, 10, 6, 6));
    m = applyFine(m, fine("b", 20, 30, 0, 6));
    expect(m.totalEur).toBe(30);
    expect(applyFine(m, fine("a", 10, 10))).toBe(m);
    m = applyFine(m, fine("c", 5, 25));
    expect(m.totalEur).toBe(30);
    expect(m.fines.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });
  it("meltdown progress is whichever threshold is closer", () => {
    expect(meltdownProgress({ totalEur: MELTDOWN_EUR / 2, totalJailMonths: 0, meltdown: false })).toBe(0.5);
    expect(meltdownProgress({ totalEur: 0, totalJailMonths: 900, meltdown: false })).toBe(0.75);
    expect(meltdownProgress({ totalEur: 5 * MELTDOWN_EUR, totalJailMonths: 0, meltdown: false })).toBe(1);
    expect(meltdownProgress(applyMeltdown(emptyMeter(), { type: "meltdown", totalEur: 1, totalJailMonths: 0 }))).toBe(1);
  });
  it("formats euros and jail for the projector", () => {
    expect(fmtEurShort(0)).toBe("€0");
    expect(fmtEurShort(950)).toBe("€950");
    expect(fmtEurShort(12_500)).toBe("€12.5 k");
    expect(fmtEurShort(35_000_000)).toBe("€35 M");
    expect(fmtEurShort(1_240_000_000)).toBe("€1.24 bn");
    expect(fmtEurShort(2_000_000_000)).toBe("€2 bn");
    expect(fmtEurShort(-5)).toBe("€0");
    expect(fmtJail(0)).toBe("no jail");
    expect(fmtJail(8)).toBe("8 months");
    expect(fmtJail(12)).toBe("1 year");
    expect(fmtJail(40)).toBe("3 years 4 months");
    expect(fmtJail(1250)).toBe("104 years");
  });
  it("mock fines climb with the tier and cross €1 bn by tier 4", () => {
    expect(mockFine(0, 4, P).amountEur).toBeGreaterThan(mockFine(0, 1, P).amountEur);
    const total = [1, 2, 3, 4].reduce((s, t) => s + mockFine(t, t as 1 | 2 | 3 | 4, P).amountEur * 2, 0);
    expect(total).toBeGreaterThan(MELTDOWN_EUR);
  });
});

describe("leaderboard", () => {
  it("sorts by fines or jail with tie-breakers, top 10", () => {
    const list = [entry("a", 10, 5), entry("b", 30, 1), entry("c", 30, 2), entry("d", 1, 99)];
    expect(top(list, "fines").map((e) => e.caseId)).toEqual(["c", "b", "a", "d"]);
    expect(top(list, "jail").map((e) => e.caseId)).toEqual(["d", "a", "c", "b"]);
    const many = Array.from({ length: 15 }, (_, i) => entry(`x${i}`, i, 0));
    expect(top(many, "fines")).toHaveLength(10);
    expect(top(many, "fines")[0]!.caseId).toBe("x14");
    expect([entry("old", 5, 0, "2026-10-10T09:00:00Z"), entry("new", 5, 0, "2026-10-10T11:00:00Z")].sort(compare("fines"))[0]!.caseId).toBe("new");
  });
  it("upserts by caseId and reports moves", () => {
    let list = [entry("a", 1, 0), entry("b", 2, 0)];
    list = upsert(list, entry("a", 5, 0));
    expect(list).toHaveLength(2);
    expect(top(list, "fines")[0]!.caseId).toBe("a");
    expect(upsert(list, entry("c", 0, 0))).toHaveLength(3);
    expect(Object.fromEntries(moves(["b", "a"], ["a", "b", "c"]))).toEqual({ a: 1, b: -1 });
  });
  it("validates wire entries", () => {
    expect(toEntry({ caseId: "x" })).toBeNull();
    expect(toEntry(null)).toBeNull();
    const e = toEntry({ caseId: "x", startupName: "S", totalEur: -1, totalJailMonths: "3", topLaws: ["A", 1, "B", "C", "D"] })!;
    expect(e.totalEur).toBe(0);
    expect(e.totalJailMonths).toBe(0);
    expect(e.topLaws).toEqual(["A", "B", "C"]);
  });
  it("counts same day in Brussels", () => {
    const now = new Date("2026-10-10T21:30:00Z"); // 23:30 Brussels
    expect(sameDay("2026-10-09T22:30:00Z", now)).toBe(true); // 00:30 Brussels on the 10th
    expect(sameDay("2026-10-09T21:30:00Z", now)).toBe(false);
    expect(sameDay("garbage", now)).toBe(false);
  });
  it("ticker keeps the funniest captions, deduped, in arrival order", () => {
    let c = pushCaption([], "ok", 1);
    c = pushCaption(c, "Payable in triplicate, by fax, to an office in Brussels that closed in 2009.", 2);
    c = pushCaption(c, "Payable in triplicate, by fax, to an office in Brussels that closed in 2009.", 3);
    c = pushCaption(c, "Your form was received. It has been lost, as is customary.", 4);
    expect(c).toHaveLength(3);
    expect(funniness("ok")).toBeLessThan(funniness(c[1]!.text));
    expect(tickerPick(c, 2).map((x) => x.at)).toEqual([2, 4]);
  });
});

describe("meanwhile", () => {
  const m = (sec: number, cn: number) => ({ elapsedSec: sec, china: { models: cn, note: `n${sec}` }, us: { models: 1, note: "" }, eu: { regulations: 3, forms: 40, note: "" } });
  it("is monotonic", () => {
    const a = maxMeanwhile(m(60, 4), m(30, 2));
    expect(a.china.models).toBe(4);
    expect(a.elapsedSec).toBe(60);
    expect(toMeanwhile({ china: {}, us: {} })).toBeNull();
    expect(toMeanwhile(m(5, 1))?.china.models).toBe(1);
  });
  it("day estimate grows through the day, forms ≫ regulations, China ≫ US", () => {
    const morning = dayMeanwhile(new Date("2026-10-10T07:00:00Z"));
    const evening = dayMeanwhile(new Date("2026-10-10T15:00:00Z"));
    expect(secondsSinceMidnight(new Date("2026-10-10T15:00:00Z"))).toBe(17 * 3600);
    expect(evening.china.models).toBeGreaterThan(morning.china.models);
    expect(evening.eu.forms).toBeGreaterThan(evening.eu.regulations * 10);
    expect(evening.china.models).toBeGreaterThan(evening.us.models * 3);
    expect(elapsedText(252)).toBe("4 min 12 s");
  });
});

describe("live case reducer", () => {
  it("mirrors lines, fines, meltdown, analyzing and the v2 verdict idempotently", () => {
    let s = emptyLive("k1", 4812, null);
    s = liveReduce(s, { type: "analyzing", stage: "Cloning", progress: 0.2 });
    expect(s.analyzing?.progress).toBe(0.2);
    const line = { type: "line" as const, id: "l1", speaker: "formblatt", text: "Hello.", provisions: [P], clip: "talking" as const, audioUrl: null };
    s = liveReduce(s, line);
    expect(s.analyzing).toBeNull();
    expect(liveReduce(s, line)).toBe(s);
    s = liveReduce(s, fine("l1-f0", 600e6, 600e6));
    s = liveReduce(s, fine("l1-f1", 600e6, 1200e6));
    s = liveReduce(s, { type: "meltdown", totalEur: 1200e6, totalJailMonths: 0 });
    expect(s.meter.meltdown).toBe(true);
    s = liveReduce(s, { type: "awaiting", prompt: "Explain." });
    expect(s.awaiting).toBe("Explain.");
    s = liveReduce(s, { type: "tier", tier: 2, name: "Committee" });
    expect(s.awaiting).toBeNull();
    const notice = { serial: "L-1", startup: "x", officers: ["formblatt", "annexe"] as [string, string], fineEur: 1, fineBasis: "", findings: [], issuedAt: "", applicantId: null, startupName: "48K", founderName: null, totalEur: 1300e6, totalJailMonths: 36, meltdown: true, tldr: [], recommendations: [], reportUrl: "", badgeUrl: "" };
    s = liveReduce(s, { type: "verdict", notice });
    expect(s.startupName).toBe("48K");
    expect(s.meter.totalEur).toBe(1300e6);
    expect(s.meter.totalJailMonths).toBe(36);
    expect(liveReduce(s, { type: "awaiting", prompt: "late" }).awaiting).toBeNull();
    expect(liveReduce(s, { type: "whatever" } as never)).toBe(s);
  });
});

describe("optional route parsers", () => {
  it("stats / live / game top tolerate partial shapes", () => {
    expect(toStats({ queue: 12 })).toEqual({ queue: 12, applicantsToday: null, meanwhileToday: null });
    expect(toLive({ caseId: "" })).toBeNull();
    expect(toLive({ caseId: "c", ticket: 7 })).toEqual({ caseId: "c", ticket: 7, startupName: null });
    expect(toGameTop({ entries: [{ name: "a", score: 3 }, { player: "b", score: 9 }] })).toEqual({ name: "b", score: 9 });
    expect(toGameTop([{ score: 1 }])).toEqual({ name: "Anonymous applicant", score: 1 });
    expect(toGameTop({ entries: [] })).toBeNull();
  });
});

describe("fmtJailShort", () => {
  it("is compact for the leaderboard column", () => {
    expect(fmtJailShort(0)).toBe("no jail");
    expect(fmtJailShort(8)).toBe("8 mo");
    expect(fmtJailShort(12)).toBe("1 yr");
    expect(fmtJailShort(47)).toBe("3 yrs 11 mo");
  });
});
