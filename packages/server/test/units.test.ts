import { describe, expect, it } from "vitest";
import { GENERIC_CANNED, extractObjects, scanObjects } from "../src/engine.js";
import { AI_ACT_BASIS, GDPR_BASIS, calculateFine, extractRevenueHeuristic } from "../src/fine.js";
import { quotesVisitor, ruleCheck } from "../src/moderation.js";
import { FINDING_PROVISIONS } from "../src/repo.js";
import { validateLine } from "../src/validator.js";
import { corpus, roster } from "./helpers.js";

describe("citation validator", () => {
  it("drops fake ids and keeps real ones", () => {
    const v = validateLine({ text: "Refused under GDPR Art. 33.", provisions: ["gdpr-33", "gdpr-999", "ai-act-annex-xx", "totally-fake"] }, corpus);
    expect(v.provisions).toEqual(["gdpr-33"]);
    expect(v.dropped).toEqual(["gdpr-999", "ai-act-annex-xx", "totally-fake"]);
    expect(v.reworded).toBe(false);
  });

  it("rewords citations in the text that are not backed by a surviving provision", () => {
    const v = validateLine({ text: "Article 999(2) forbids this, and so does Annex XX.", provisions: ["ai-act-999"] }, corpus);
    expect(v.provisions).toEqual([]);
    expect(v.reworded).toBe(true);
    expect(v.text).not.toMatch(/999|Annex XX/);
  });

  it("leaves backed citations alone", () => {
    const v = validateLine({ text: "Article 50 and Annex III apply.", provisions: ["ai-act-50", "ai-act-annex-iii"] }, corpus);
    expect(v).toMatchObject({ text: "Article 50 and Annex III apply.", provisions: ["ai-act-50", "ai-act-annex-iii"], reworded: false });
  });
});

describe("fine calculator", () => {
  it("AI Act: €35M floor, 7% above it", () => {
    expect(calculateFine(0, ["ai-act-5"])).toMatchObject({ fineEur: 35_000_000, fineBasis: AI_ACT_BASIS });
    expect(calculateFine(1_000_000_000, ["gdpr-6", "ai-act-5"]).fineEur).toBe(70_000_000);
  });
  it("GDPR: €20M floor, 4% above it", () => {
    expect(calculateFine(undefined, ["gdpr-6"])).toMatchObject({ fineEur: 20_000_000, fineBasis: GDPR_BASIS });
    expect(calculateFine(2_000_000_000, ["gdpr-6"]).fineEur).toBe(80_000_000);
  });
  it("extracts stated revenue heuristically", () => {
    expect(extractRevenueHeuristic("We do €2.5M ARR and growing")).toBe(2_500_000);
    expect(extractRevenueHeuristic("about 40k MRR")).toBe(480_000);
    expect(extractRevenueHeuristic("pre-revenue, vibes only")).toBeNull();
  });
});

describe("moderation rules", () => {
  it("blocks protected-group and body content, allows institutional satire", () => {
    expect(ruleCheck("Your pitch is as old as the Council's coffee machine.").ok).toBe(true);
    expect(ruleCheck("Refused, because of your religion.").ok).toBe(false);
    expect(ruleCheck("Refused, because of your weight.").ok).toBe(false);
    expect(ruleCheck("Your burn rate is a fire hazard and your deck is a crime.").ok).toBe(true);
    expect(ruleCheck("Look at your face.").ok).toBe(false);
  });
  it("detects copied visitor text", () => {
    expect(quotesVisitor("He said we are the uber for fridges in europe", ["we are the uber for fridges in europe, buy now"])).toBe(true);
    expect(quotesVisitor("Refused for fridge reasons.", ["we are the uber for fridges in europe"])).toBe(false);
  });
});

describe("model output parsing", () => {
  it("extracts NDJSON, pretty-printed and fenced objects, keeping incomplete tails", () => {
    expect(extractObjects('```json\n[{"a":1},\n{\n "b": "}"\n}]\n```')).toEqual([{ a: 1 }, { b: "}" }]);
    const s = scanObjects('{"a":1}\n{"b":');
    expect(s.objects).toEqual([{ a: 1 }]);
    expect('{"a":1}\n{"b":'.slice(s.consumed)).toBe('\n{"b":');
  });
});

describe("content data", () => {
  it("has ten personas with distinct voices and paired double acts", () => {
    expect(roster.specs).toHaveLength(10);
    expect(new Set(roster.specs.map((s) => s.voice.voice)).size).toBe(10);
    for (const s of roster.specs) expect(s.partner && roster.get(s.partner), s.id).toBeTruthy();
    expect(roster.pairs().length).toBeGreaterThanOrEqual(5);
  });
  it("every hard-coded provision id exists in the index", () => {
    const ids = [
      ...roster.specs.flatMap((s) => Object.values(s.canned).flatMap((c) => c!.provisions)),
      ...Object.values(FINDING_PROVISIONS).flat(),
      ...Object.values(GENERIC_CANNED).flatMap((c) => c.provisions),
    ];
    for (const id of ids) expect(corpus.has(id), id).toBe(true);
  });
  it("canned lines pass the moderation rules", () => {
    for (const s of roster.specs) for (const c of Object.values(s.canned)) expect(ruleCheck(c!.text).ok, `${s.id}: ${c!.text}`).toBe(true);
  });
  it("persona wire shape omits missing asset files", () => {
    const p = roster.toPersona("formblatt");
    expect(p).toMatchObject({ id: "formblatt", name: expect.any(String), color: expect.stringMatching(/^#/) });
    expect(Object.keys(p.stills).length).toBe(0);
    expect(p.clips).toBeUndefined();
  });
  it("corpus search finds relevant provisions", () => {
    expect(corpus.search("personal data breach notification", 5).map((p) => p.id)).toContain("gdpr-33");
  });
});
