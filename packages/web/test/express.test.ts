import { describe, expect, it } from "vitest";
import type { RoastEvent } from "../src/contract";
import { DEFAULT_RATES, ratesFrom, talkMeanwhile } from "../src/live/meanwhile";
import { mockApi } from "../src/mock";
import { reportHref } from "../src/presenter/nav";
import { toStats } from "../src/live/api";
import { parseView } from "../src/presenter/view";
import { initialState, reduce } from "../src/reducer";

const sub = { kind: "text" as const, text: "Our startup is called Swipely." };

describe("express hearing (mock)", () => {
  it("runs tiers 1→5 in one stream to a verdict, then one appeal round", async () => {
    const api = mockApi({ pace: 0 });
    const kase = await api.createCase(sub, undefined, "express");
    expect(kase.mode).toBe("express");
    const first: RoastEvent[] = [];
    await api.stream(kase.caseId, (e) => first.push(e));
    expect(first.filter((e) => e.type === "tier").map((e) => (e as { tier: number }).tier)).toEqual([1, 2, 3, 4, 5]);
    expect(first.some((e) => e.type === "awaiting")).toBe(false);
    expect(first.at(-1)?.type).toBe("verdict");
    await expect(api.reply(kase.caseId, "no")).rejects.toMatchObject({ status: 409 });

    await api.appeal(kase.caseId);
    const second: RoastEvent[] = [];
    await api.stream(kase.caseId, (e) => second.push(e));
    expect(second.filter((e) => e.type === "line")).toHaveLength(2);
    const fine = (es: RoastEvent[]) => (es.at(-1) as { notice: { fineEur: number } }).notice.fineEur;
    expect(fine(second)).toBeGreaterThan(fine(first));
    await expect(api.appeal(kase.caseId)).rejects.toMatchObject({ status: 409 });
  });

  it("refuses an appeal on a staged case", async () => {
    const api = mockApi({ pace: 0 });
    const kase = await api.createCase(sub);
    expect(kase.mode).toBeUndefined();
    await expect(api.appeal(kase.caseId)).rejects.toMatchObject({ status: 409 });
  });

  it("an appeal reopens the hearing after the verdict", () => {
    const notice = { serial: "x", startup: "s", officers: ["a", "b"], fineEur: 1, fineBasis: "", findings: [], issuedAt: "" } as never;
    const s = reduce(reduce(initialState(), { type: "verdict", notice }), { type: "appeal" });
    expect(s.phase).toBe("connecting");
    expect(s.notice).toBeNull();
  });
});

describe("MEANWHILE during this talk (E)", () => {
  it("counts from the talk start at today's rates", () => {
    expect(talkMeanwhile(0, DEFAULT_RATES)).toMatchObject({ elapsedSec: 0, china: { models: 0 }, us: { models: 0 }, eu: { regulations: 0, forms: 0 } });
    expect(talkMeanwhile(600, DEFAULT_RATES)).toMatchObject({ china: { models: 34 }, us: { models: 8 }, eu: { regulations: 68, forms: 1044 } });
    const day = { elapsedSec: 36_000, china: { models: 2001, note: "" }, us: { models: 480, note: "" }, eu: { regulations: 4002, forms: 61_205, note: "" } };
    expect(ratesFrom(day)).toEqual({ china: 2000 / 36_000, us: 480 / 36_000, regulations: 4000 / 36_000, forms: 61_200 / 36_000 });
    expect(ratesFrom(null)).toBe(DEFAULT_RATES);
    expect(ratesFrom({ ...day, elapsedSec: 60 })).toBe(DEFAULT_RATES);
    expect(ratesFrom({ ...day, us: { models: 0, note: "" } })).toBe(DEFAULT_RATES);
  });
  it("E opens the closing view", () => {
    expect(parseView("e")).toBe("end");
    expect(parseView("end")).toBe("end");
  });
});

describe("hackathon stats + report link", () => {
  it("reads the event totals and pre-fills the real report", () => {
    expect(toStats({ queue: 2, applicantsToday: 9, refusedToday: 7, totalEurToday: 1e9, totalJailMonthsToday: 40 })).toMatchObject({ refusedToday: 7, totalEurToday: 1e9, totalJailMonthsToday: 40 });
    expect(toStats({ queue: 2 })).toMatchObject({ refusedToday: null, totalEurToday: null });
    expect(reportHref(" Tinder for filings & more ")).toBe("https://warden.pro7ocol.com/analyze/?idea=Tinder%20for%20filings%20%26%20more");
    expect(reportHref(undefined)).toBe("https://warden.pro7ocol.com/analyze/");
  });
});
