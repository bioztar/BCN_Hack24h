import { describe, expect, it } from "vitest";
import type { RoastEvent } from "@dg-roast/shared";
import { parseSse } from "../src/sse.js";
import { AudioCache, PRIORITY_IDLE } from "../src/voice.js";
import { FakeTts, makeApp } from "./helpers.js";

type App = ReturnType<typeof makeApp>["app"];
const stream = async (app: App, caseId: string) => parseSse((await app.inject({ method: "GET", url: `/api/case/${caseId}/stream` })).payload).map((e) => e.data as RoastEvent);
const reply = (app: App, caseId: string) => app.inject({ method: "POST", url: `/api/case/${caseId}/reply`, payload: { text: "We are compliant." } });
const create = async (app: App) => ((await app.inject({ method: "POST", url: "/api/case", payload: { submission: { kind: "text", text: "An AI for cats" } } })).json() as { caseId: string }).caseId;
const lineIds = (ev: RoastEvent[]) => ev.flatMap((e) => (e.type === "line" ? [e.id] : []));
const audioIds = (ev: RoastEvent[]) => ev.flatMap((e) => (e.type === "audio" ? [e.id] : []));

describe("TTS coverage", () => {
  it("7 s TTS: every line of every round is voiced before awaiting/verdict", async () => {
    const tts = new FakeTts();
    tts.delayMs = 7000;
    const { app } = makeApp({ llm: null, tts });
    const caseId = await create(app);
    for (let t = 1; t <= 5; t++) {
      const ev = await stream(app, caseId);
      const lines = lineIds(ev);
      expect(lines.length).toBeGreaterThanOrEqual(3);
      const voiced = new Set([...audioIds(ev), ...ev.flatMap((e) => (e.type === "line" && e.audioUrl ? [e.id] : []))]);
      expect(voiced, `round ${t}`).toEqual(new Set(lines));
      expect(ev.at(-1)!.type).toBe(t < 5 ? "awaiting" : "verdict");
      if (t < 5) expect((await reply(app, caseId)).statusCode).toBe(204);
    }
  }, 120_000);

  it("audio still pending when a round closes is replayed at the start of the next stream", async () => {
    const tts = new FakeTts();
    tts.delayMs = 300;
    const { app } = makeApp({ llm: null, tts, ttsBudgetMs: 10, lateAudioMs: 10 });
    const caseId = await create(app);
    const r1 = await stream(app, caseId);
    const missing = lineIds(r1).filter((id) => !audioIds(r1).includes(id));
    expect(missing.length).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 900));
    await reply(app, caseId);
    const r2 = await stream(app, caseId);
    const firstTier = r2.findIndex((e) => e.type === "tier");
    expect(new Set(audioIds(r2.slice(0, firstTier)))).toEqual(new Set(missing));
  });

  it("queue: concurrency bound, live lines in order, idle pre-render last", async () => {
    const order: string[] = [];
    const tts = {
      async synthesize(text: string) {
        order.push(text);
        await new Promise((r) => setTimeout(r, 10));
        return { audio: Buffer.from(text), contentType: "audio/mpeg" };
      },
    };
    const cache = new AudioCache(tts, null, () => undefined, 1);
    const v = { provider: "x", voice: "y" } as never;
    await Promise.all([cache.render("first", v, 0), cache.render("idle", v, PRIORITY_IDLE), cache.render("line3", v, 3), cache.render("line1", v, 1), cache.render("line2", v, 2)]);
    expect(order).toEqual(["first", "line1", "line2", "line3", "idle"]);
  });
});
