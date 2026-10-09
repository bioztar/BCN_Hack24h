import { describe, expect, it } from "vitest";
import type { RoastEvent } from "../src/contract";
import { mockApi, MOCK_PERSONAS } from "../src/mock";
import { expressionFor, initialState, reduce, type StageState } from "../src/reducer";

const [A, B] = MOCK_PERSONAS as [(typeof MOCK_PERSONAS)[0], (typeof MOCK_PERSONAS)[0]];
const prov = { id: "gdpr-33", label: "GDPR Art. 33", title: "Breach", url: "https://eur-lex.europa.eu/x" };

describe("stage reducer", () => {
  it("tracks speaker, clip, stamps and line-end", () => {
    let s = reduce(initialState(), { type: "officers", officers: [A, B], ticket: 4812 });
    s = reduce(s, { type: "tier", tier: 2, name: "Committee" });
    expect(s).toMatchObject({ tier: 2, tierName: "Committee", clip: "tier2", phase: "streaming" });
    s = reduce(s, { type: "line", id: "l1", speaker: "formblatt", text: "Non.", provisions: [prov], clip: "talking", audioUrl: null, stamp: "REFUSÉ" });
    expect(s.speaker).toBe("formblatt");
    expect(s.clip).toBe("stamp");
    expect(s.stamps).toEqual([{ lineId: "l1", text: "REFUSÉ", tier: 2 }]);
    s = reduce(s, { type: "line-end", id: "l1" });
    expect(s.speaker).toBeNull();
    expect(s.clip).toBe("idle");
  });

  it("ignores duplicate lines, falling tiers and non-https provisions", () => {
    let s = reduce(initialState(), { type: "tier", tier: 3, name: "" });
    expect(s.tierName).toBe("Trilogue");
    s = reduce(s, { type: "tier", tier: 1, name: "Pre-consultation" });
    expect(s.tier).toBe(3);
    const line: RoastEvent = { type: "line", id: "x", speaker: "annexe", text: "t", provisions: [prov, { ...prov, url: "javascript:alert(1)" }], clip: "talking", audioUrl: null };
    s = reduce(reduce(s, line), line);
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]!.provisions).toHaveLength(1);
  });

  it("stale line-end does not clear a newer speaker", () => {
    let s = reduce(initialState(), { type: "line", id: "a", speaker: "formblatt", text: "1", provisions: [], clip: "talking", audioUrl: null });
    s = reduce(s, { type: "line", id: "b", speaker: "annexe", text: "2", provisions: [], clip: "talking", audioUrl: null });
    s = reduce(s, { type: "line-end", id: "a" });
    expect(s.speaker).toBe("annexe");
  });

  it("awaiting → reply → next round, and verdict ends at tier 5", () => {
    let s = reduce(initialState(), { type: "awaiting", prompt: "Object." });
    expect(s).toMatchObject({ phase: "awaiting", awaiting: "Object." });
    s = reduce(s, { type: "reply", text: "But!" });
    expect(s).toMatchObject({ phase: "connecting", awaiting: null, round: 2 });
    s = reduce(s, { type: "connection-lost", message: "gone" });
    expect(s.phase).toBe("error");
  });

  it("plays the full mock case tier 1 → 5 to a verdict", async () => {
    const api = mockApi({ pace: 0 });
    const c = await api.createCase({ kind: "repo", repoUrl: "https://github.com/acme/swipely", revenueEur: 1_000_000_000 });
    let s: StageState = initialState();
    const tiers: number[] = [];
    for (let round = 0; round < 5; round++) {
      await api.stream(c.caseId, (e) => {
        s = reduce(s, e);
        if (e.type === "tier") tiers.push(e.tier);
      });
      if (s.phase === "awaiting") {
        s = reduce(s, { type: "reply", text: "But we are disruptive" });
        await api.reply(c.caseId, "But we are disruptive");
      }
    }
    expect(tiers).toEqual([1, 2, 3, 4, 5]);
    expect(s.phase).toBe("verdict");
    expect(s.intake?.findings.length).toBeGreaterThan(0);
    expect(s.stamps.length).toBeGreaterThanOrEqual(5);
    expect(new Set(s.stamps.map((x) => x.tier))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(s.notice?.fineEur).toBe(70_000_000);
    expect(s.notice?.findings.every((f) => f.provision.url.startsWith("https://eur-lex.europa.eu/"))).toBe(true);
  });
});

describe("expressionFor", () => {
  it("maps slots to stills", () => {
    expect(expressionFor("stamp", true)).toBe("stamping");
    expect(expressionFor("tier5", false)).toBe("appalled");
    expect(expressionFor("talking", true)).toBe("smug");
    expect(expressionFor("idle", false)).toBe("neutral");
  });
});
