import { describe, expect, it } from "vitest";
import type { NoticeV2, RoastEvent as V1, RoastEventV2 } from "@dg-roast/shared";
import { emptyMeter } from "../src/fine.js";
import { stripStrayAmounts, type CaseState } from "../src/engine.js";
import { parseSse } from "../src/sse.js";
import { FakeLlm, makeApp } from "./helpers.js";

type Ev = V1 | RoastEventV2;
type App = ReturnType<typeof makeApp>["app"];
const run = async (app: App, text: string) => {
  const caseId = (await app.inject({ method: "POST", url: "/api/case", payload: { submission: { kind: "text", text }, mode: "express" } })).json().caseId as string;
  const ev = parseSse((await app.inject({ method: "GET", url: `/api/case/${caseId}/stream` })).payload).map((e) => e.data as Ev);
  return { ev, notice: (ev.at(-1) as unknown as { notice: NoticeV2 }).notice };
};

/** A model that cites a fixed set of provisions per tier, like the live FaceFeel run. */
class ScriptLlm extends FakeLlm {
  constructor(private readonly script: Record<number, string[]>) {
    super(null);
  }
  override stream(req: Parameters<FakeLlm["stream"]>[0]) {
    const sys = req.messages[0]!.content;
    const tier = /CURRENT TIER (\d)/.exec(sys)?.[1];
    if (!tier) return super.stream(req);
    this.calls.push(req);
    const ids = [...sys.matchAll(/- id "([^"]+)"/g)].map((m) => m[1]!);
    const line = { speaker: ids[0], text: `Tier ${tier}. Refused, with feeling.`, provisions: this.script[Number(tier)] ?? [], clip: "talking", stamp: Number(tier) >= 2 ? "REFUSÉ" : null };
    return (async function* () { yield JSON.stringify(line) + "\n"; })();
  }
}

const FACEFEEL = "FaceFeel: webcams read employees' emotions at work all day; biometric templates are stored on US servers.";

describe("spoken amounts match the meter", () => {
  it("strips stray amounts, keeps the running total", () => {
    expect(stripStrayAmounts("Fine computed: thirty-five million euros, Article 99(3). Refused.", 714e6)).toBe("Refused.");
    expect(stripStrayAmounts("You owe €35M. Next.", null)).toBe("Next.");
    expect(stripStrayAmounts("The total stands at 714.3 million euros so far. Refused.", 714.3e6)).toBe("The total stands at 714.3 million euros so far. Refused.");
    expect(stripStrayAmounts("China built 412 models. Europe adopted 3 regulations.", null)).toBe("China built 412 models. Europe adopted 3 regulations.");
  });

  it("tier-5 prompt carries the running total + jail and forbids other amounts", () => {
    const { engine } = makeApp({ llm: null });
    const meter = { ...emptyMeter(), totalEur: 714_300_000, totalJailMonths: 47 };
    const state = { caseId: "c", ticket: 1, officers: ["grandma-gdpr", "auditor-9000"], submission: { kind: "text", text: "x" }, tier: 5, replies: [], lines: [], roundPending: true, round: 0, done: false, meter, fine: { fineEur: 35e6, fineBasis: "AI Act Art. 99(3)" } } as unknown as CaseState;
    const sys = engine.buildMessages(state, ["gdpr-6"])[0]!.content;
    expect(sys).toContain("714.3 million euros");
    expect(sys).toContain("47 months");
    expect(sys).not.toContain("35 million");
    expect(engine.buildMessages({ ...state, tier: 3 }, ["gdpr-6"])[0]!.content).toContain("never state a fine amount");
  });

  it("no canned line states an amount", () => {
    const { engine } = makeApp({ llm: null });
    for (const l of engine.cannedLines()) expect(stripStrayAmounts(l.text, null), l.text).toBe(l.text);
  });
});

describe("express calibration", () => {
  it("prohibited practice + biometric + US transfer melts down (≥ €1 bn) by the last line", async () => {
    for (let i = 0; i < 6; i++) {
      const { app } = makeApp({ llm: new ScriptLlm({ 1: ["ai-act-5"], 2: ["gdpr-9"], 3: ["ai-act-5"], 4: ["gdpr-46"], 5: ["gdpr-6"] }), expressMode: true });
      const { ev, notice } = await run(app, `${FACEFEEL} (#${i})`);
      expect(notice.totalEur, `case ${i}`).toBeGreaterThanOrEqual(1e9);
      expect(notice.meltdown).toBe(true);
      expect(ev.filter((e) => e.type === "meltdown").length).toBe(1);
    }
  }, 60_000);

  it("benign chess-board shop stays < €200 M, no meltdown", async () => {
    for (let i = 0; i < 6; i++) {
      const { app } = makeApp({ llm: null, expressMode: true });
      const { notice } = await run(app, `We run a small online shop for handmade wooden chess boards (#${i}). Customers pay by card; we ship within the EU.`);
      expect(notice.totalEur, `case ${i}`).toBeLessThan(200_000_000);
      expect(notice.meltdown).toBe(false);
    }
  }, 60_000);
});
