import { afterEach, describe, expect, it } from "vitest";
import type { NoticeV2, RoastEvent as V1, RoastEventV2 } from "@dg-roast/shared";
type RoastEvent = V1 | RoastEventV2;
import { queueCountdownSec } from "../src/config.js";
import { prewarm } from "../src/prewarm.js";
import { parseSse } from "../src/sse.js";
import { clampTurnover, fallbackTurnover, parseTurnover } from "../src/turnover.js";
import { AudioCache, audioHash, deliveryText, PRIORITY_IDLE, ttsBody } from "../src/voice.js";
import { TURNOVER_LINE } from "../src/engine.js";
import { FakeLlm, FakeTts, makeApp, roster } from "./helpers.js";

type App = ReturnType<typeof makeApp>["app"];
const stream = async (app: App, caseId: string) => parseSse((await app.inject({ method: "GET", url: `/api/case/${caseId}/stream` })).payload).map((e) => e.data as RoastEvent);
const create = (app: App, payload: Record<string, unknown>) => app.inject({ method: "POST", url: "/api/case", payload });
const text = (t = "An HR platform that ranks job applicants by their webcam emotions") => ({ submission: { kind: "text", text: t } });

describe("voices", () => {
  it("Oma: Fish, prosody.speed, elderly cues in the spoken text only; hash includes speed and style", () => {
    const oma = roster.get("grandma-gdpr")!.voice;
    expect(oma.model).toContain("fish");
    expect(oma.speed).toBeCloseTo(0.85);
    const body = ttsBody(oma, "May I? Your app is a cookie jar.") as { text: string; prosody: { speed: number }; reference_id: string };
    expect(body.prosody.speed).toBeCloseTo(0.85);
    expect(body.text).toBe("[sigh] May I, dear? … Your app is a cookie jar.");
    expect(deliveryText("Hello.", { model: "deepgram/aura:2", voice: "x", style: "elderly" })).toBe("Hello.");
    expect(audioHash("a", { ...oma, speed: undefined })).not.toBe(audioHash("a", oma));
    expect(audioHash("a", { model: "m", voice: "v" })).toBe(audioHash("a", { model: "m", voice: "v" }));
  });

  it("a live line lifts its text out of the idle pre-render queue", async () => {
    const order: string[] = [];
    const tts = { async synthesize(t: string) { order.push(t); await new Promise((r) => setTimeout(r, 5)); return { audio: Buffer.from(t), contentType: "audio/mpeg" }; } };
    const cache = new AudioCache(tts, null, () => undefined, 1);
    const v = { model: "m", voice: "v" };
    const idle = ["busy", "a", "b", "c", "opener"].map((t) => cache.render(t, v, PRIORITY_IDLE));
    const live = cache.render("opener", v, 0);
    await Promise.all([...idle, live]);
    expect(order.indexOf("opener")).toBe(1);
  });
});

describe("round-1 first lines are voiced", () => {
  it("prewarm: one warm-up per paired voice, openers rendered first (incl. the turnover jibe)", async () => {
    const tts = new FakeTts();
    const { engine } = makeApp({ llm: null, tts });
    const audio = new AudioCache(tts, null);
    const r = await prewarm(engine, roster, audio);
    const voices = new Set(roster.pairs().flatMap((p) => p.officers.map((o) => roster.get(o)!.voice.voice)));
    expect(r.voices).toBe(voices.size);
    expect(tts.texts.filter((t) => t.text === "Hm.").length).toBe(voices.size);
    const firstNonOpener = tts.texts.findIndex((t, i) => i >= voices.size && !engine.openerLines().some((o) => o.text === t.text));
    expect(firstNonOpener === -1 || firstNonOpener >= voices.size + engine.openerLines().length - 3).toBe(true);
    expect(await audio.render(TURNOVER_LINE, roster.get("grandma-gdpr")!.voice, 0)).toMatch(/^\/api\/audio\//);
  });

  it("Oma first, cold voices (4 s first call): the first two lines still carry inline audio", async () => {
    const tts = new FakeTts();
    tts.coldMs = 4000;
    const { app } = makeApp({ tts });
    const res = await create(app, { ...text(), officers: ["grandma-gdpr", "auditor-9000"] });
    const ev = await stream(app, res.json().caseId);
    const lines = ev.filter((e): e is Extract<RoastEvent, { type: "line" }> => e.type === "line");
    expect(lines[0]!.speaker).toBe("grandma-gdpr");
    expect(lines[0]!.audioUrl).toBeTruthy();
    expect(lines[1]!.audioUrl).toBeTruthy();
  }, 30_000);
});

describe("express mode", () => {
  it("off by default: mode express → 400; staged unchanged", async () => {
    const { app } = makeApp({ llm: null });
    expect((await create(app, { ...text(), mode: "express" })).statusCode).toBe(400);
    expect((await create(app, { ...text(), mode: "nonsense" })).statusCode).toBe(400);
    const ok = await create(app, { ...text(), mode: "staged" });
    expect(ok.statusCode).toBe(201);
    const ev = await stream(app, ok.json().caseId);
    expect(ev.at(-1)!.type).toBe("awaiting");
  });

  it("one stream: tiers 1→5, 5–7 alternating lines, escalating fines, verdict, no awaiting, no replies", async () => {
    const { app } = makeApp({ llm: null, expressMode: true });
    const res = await create(app, { ...text(), mode: "express" });
    expect(res.json().mode).toBe("express");
    const caseId = res.json().caseId;
    const ev = await stream(app, caseId);
    const tiers = ev.flatMap((e) => (e.type === "tier" ? [e.tier] : []));
    expect(tiers).toEqual([1, 2, 3, 4, 5]);
    const lines = ev.filter((e): e is Extract<RoastEvent, { type: "line" }> => e.type === "line");
    expect(lines.length).toBeGreaterThanOrEqual(5);
    expect(lines.length).toBeLessThanOrEqual(7);
    lines.slice(1).forEach((l, i) => expect(l.speaker).not.toBe(lines[i]!.speaker));
    expect(ev.some((e) => e.type === "awaiting")).toBe(false);
    expect(ev.at(-1)!.type).toBe("verdict");
    expect(ev.filter((e) => e.type === "meltdown").length).toBeLessThanOrEqual(1);
    const totals = ev.flatMap((e) => (e.type === "fine" ? [e.totalEur] : []));
    expect(totals.length).toBeGreaterThan(0);
    totals.slice(1).forEach((t, i) => expect(t).toBeGreaterThanOrEqual(totals[i]!));
    expect((await app.inject({ method: "POST", url: `/api/case/${caseId}/reply`, payload: { text: "hi" } })).statusCode).toBe(409);

    // Appeal: one short round + a new verdict, once.
    expect((await app.inject({ method: "POST", url: `/api/case/${caseId}/appeal`, payload: { text: "We appeal." } })).statusCode).toBe(204);
    expect((await app.inject({ method: "POST", url: `/api/case/${caseId}/appeal`, payload: {} })).statusCode).toBe(409);
    const ap = await stream(app, caseId);
    const apLines = ap.filter((e) => e.type === "line");
    expect(apLines.length).toBeGreaterThanOrEqual(2);
    expect(apLines.length).toBeLessThanOrEqual(4);
    expect(ap.flatMap((e) => (e.type === "tier" ? [e.tier] : []))).toEqual([5]);
    expect(ap.at(-1)!.type).toBe("verdict");
    expect(ap.some((e) => e.type === "awaiting")).toBe(false);
  }, 60_000);

  it("staged cases cannot be appealed", async () => {
    const { app } = makeApp({ llm: null, expressMode: true });
    const caseId = (await create(app, text())).json().caseId;
    expect((await app.inject({ method: "POST", url: `/api/case/${caseId}/appeal`, payload: {} })).statusCode).toBe(409);
  });
});

describe("turnover estimate", () => {
  it("parse + clamp; deterministic fallback per caseId", () => {
    expect(parseTurnover({ tamEur: 8e9, sharePct: 0.5, estimatedTurnoverEur: 4e7, basis: "EU HR-tech TAM €8 bn × 0.5 % = €40 M" })).toEqual({ eur: 4e7, basis: "EU HR-tech TAM €8 bn × 0.5 % = €40 M" });
    expect(parseTurnover({ tamEur: 1e15, sharePct: 50 })!.eur).toBe(5e9);
    expect(parseTurnover({ estimatedTurnoverEur: 10 })!.eur).toBe(50_000);
    expect(parseTurnover({ basis: "nothing" })).toBeNull();
    expect(clampTurnover(1e12)).toBe(5e9);
    const a = fallbackTurnover("case-1", "recruiting platform");
    expect(fallbackTurnover("case-1", "recruiting platform")).toEqual(a);
    expect(a.basis).toContain("HR-tech");
    expect(a.eur).toBeGreaterThanOrEqual(50_000);
  });

  it("no revenue: one cheap call, cached, feeds fines, on NoticeV2, mocked by an officer", async () => {
    const llm = new FakeLlm();
    const { app } = makeApp({ llm, expressMode: true });
    const caseId = (await create(app, { ...text(), mode: "express" })).json().caseId;
    const ev = await stream(app, caseId);
    expect(llm.calls.filter((c) => c.messages[0]!.content.includes("Estimate the annual turnover")).length).toBe(1);
    expect(ev.some((e) => e.type === "line" && e.text === TURNOVER_LINE)).toBe(true);
    const notice = (ev.at(-1) as unknown as { notice: NoticeV2 }).notice;
    expect(notice.turnoverEstimate).toEqual({ eur: 40_000_000, basis: "EU HR-tech TAM €8 bn × 0.5 % = €40 M" });
    await app.inject({ method: "POST", url: `/api/case/${caseId}/appeal`, payload: {} });
    const ap = await stream(app, caseId);
    expect(llm.calls.filter((c) => c.messages[0]!.content.includes("Estimate the annual turnover")).length).toBe(1);
    expect((ap.at(-1) as unknown as { notice: NoticeV2 }).notice.turnoverEstimate?.eur).toBe(40_000_000);
  }, 60_000);

  it("revenueEur given: no estimate, no jibe, no turnoverEstimate", async () => {
    const llm = new FakeLlm();
    const { app } = makeApp({ llm, expressMode: true });
    const caseId = (await create(app, { submission: { ...text().submission, revenueEur: 2_000_000 }, mode: "express" })).json().caseId;
    const ev = await stream(app, caseId);
    expect(llm.calls.some((c) => c.messages[0]!.content.includes("Estimate the annual turnover"))).toBe(false);
    expect(ev.some((e) => e.type === "line" && e.text === TURNOVER_LINE)).toBe(false);
    expect((ev.at(-1) as unknown as { notice: NoticeV2 }).notice.turnoverEstimate).toBeUndefined();
  }, 60_000);
});

describe("QUEUE_COUNTDOWN_SEC", () => {
  afterEach(() => void delete process.env.QUEUE_COUNTDOWN_SEC);
  it("unset → null (30–60 default); '6' and '5-8' parse", async () => {
    expect(queueCountdownSec({})).toBeNull();
    expect(queueCountdownSec({ QUEUE_COUNTDOWN_SEC: "6" })).toEqual([6, 6]);
    expect(queueCountdownSec({ QUEUE_COUNTDOWN_SEC: "5-8" })).toEqual([5, 8]);
    expect(queueCountdownSec({ QUEUE_COUNTDOWN_SEC: "x" })).toBeNull();
    const { app } = makeApp({ llm: null });
    const reg = async () => (await app.inject({ method: "POST", url: "/api/applicants", payload: { startupName: "A", founderName: "B" } })).json().countdownSec as number;
    const def = await reg();
    expect(def).toBeGreaterThanOrEqual(30);
    expect(def).toBeLessThanOrEqual(60);
    process.env.QUEUE_COUNTDOWN_SEC = "5-8";
    const c = await reg();
    expect(c).toBeGreaterThanOrEqual(5);
    expect(c).toBeLessThanOrEqual(8);
  });
});
