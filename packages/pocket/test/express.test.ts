import { describe, expect, it } from "vitest";
import { MockApi } from "../src/api";
import { EXPRESS_DEFAULT, isExpress, pivotName, wardenUrl, whackLine, whackResult } from "../src/express";
import { FIXTURE_PAIRS, FIXTURE_PERSONAS, mockExpressEvents, mockRoundEvents } from "../src/fixtures";
import type { Persona, Submission } from "../src/types";

const q = (s: string) => new URLSearchParams(s);
const sub: Submission = { kind: "text", text: "Biometric emotion recognition for HR interviews" } as Submission;

describe("express flag", () => {
  it("express is the default (EXPRESS_DEFAULT) and ?express=0 brings back the staged rounds", () => {
    expect(EXPRESS_DEFAULT).toBe(true);
    expect(isExpress(q(""))).toBe(true);
    expect(isExpress(q("?mock=1&express=0"))).toBe(false);
  });
  it("with the default flipped off, ?express=1 opts in", () => {
    expect(isExpress(q(""), false)).toBe(false);
    expect(isExpress(q("?express=1"), false)).toBe(true);
    expect(isExpress(q("?mock=1&express"), false)).toBe(true);
  });
});

describe("mock express stream", () => {
  const pair = FIXTURE_PAIRS[0]!.officers.map((id) => FIXTURE_PERSONAS.find((p) => p.id === id)!) as [Persona, Persona];
  const ctx = () => ({ personas: pair, ticket: 1, pitch: "biometric emotion recognition HR", serial: "X", totals: { eur: 0, jail: 0, melted: false, n: 0 } });
  it("one stream: no awaiting, exactly one verdict, at the end", () => {
    const ev = mockExpressEvents(ctx(), false);
    expect(ev.some((e) => e.type === "awaiting")).toBe(false);
    expect(ev.filter((e) => e.type === "verdict")).toHaveLength(1);
    expect(ev.at(-1)!.type).toBe("verdict");
    expect(ev.filter((e) => e.type === "tier").length).toBeGreaterThan(mockRoundEvents(ctx(), 0).filter((e) => e.type === "tier").length);
  });
  it("the appeal round adds fines and ends in a new verdict", () => {
    const c = ctx();
    const first = mockExpressEvents(c, false);
    const second = mockExpressEvents(c, true);
    const total = (ev: typeof first) => (ev.at(-1) as unknown as { notice: { totalEur: number } }).notice.totalEur;
    expect(second.some((e) => e.type === "awaiting")).toBe(false);
    expect(second.at(-1)!.type).toBe("verdict");
    expect(total(second)).toBeGreaterThan(total(first));
  });
});

describe("mock appeal", () => {
  it("echoes mode, allows one appeal, rejects the second and staged cases, and refuses replies", async () => {
    const api = new MockApi();
    const c = await api.createCase(sub, undefined, undefined, "express");
    expect(c.mode).toBe("express");
    await expect(api.reply(c.caseId)).rejects.toMatchObject({ status: 409 });
    await api.appeal(c.caseId);
    await expect(api.appeal(c.caseId)).rejects.toMatchObject({ status: 409 });
    const staged = await api.createCase(sub);
    expect(staged.mode).toBeUndefined();
    await expect(api.appeal(staged.caseId)).rejects.toMatchObject({ status: 409 });
  });
});

describe("whack-a-model score", () => {
  it("accepts only whack score messages and counts non-EU hits", () => {
    expect(whackResult({ type: "score", game: "whack", score: 4200, hits: 17, mistralHits: 1 })).toEqual({ banned: 17, mistral: 1 });
    expect(whackResult({ type: "score", game: "other", hits: 3 })).toBeNull();
    expect(whackResult({ type: "ready" })).toBeNull();
    expect(whackResult({ type: "score", game: "whack", score: 10 })).toBeNull();
    expect(whackResult(null)).toBeNull();
  });
  it("formats the verdict line", () => {
    expect(whackLine({ banned: 17, mistral: 0 })).toBe("While we audited your repo you banned 17 American/Chinese models.");
    expect(whackLine({ banned: 1, mistral: 2 })).toBe("While we audited your repo you banned 1 American/Chinese model — and stamped Mistral ×2. The only one we had.");
  });
});

describe("verdict links", () => {
  it("prefills the analyzer with ?idea=<url-encoded pitch>", () => {
    expect(wardenUrl("Emotion AI for HR & hiring?")).toBe("https://warden.pro7ocol.com/analyze/?idea=Emotion%20AI%20for%20HR%20%26%20hiring%3F");
    expect(wardenUrl("  ")).toBe("https://warden.pro7ocol.com/analyze/");
  });
  it("names the play-again startup as a pivot within 60 chars", () => {
    expect(pivotName("Faceify")).toBe("Faceify (pivot 2)");
    expect(pivotName("Faceify (pivot 2)")).toBe("Faceify (pivot 3)");
    expect(pivotName("x".repeat(60)).length).toBe(60);
  });
});
