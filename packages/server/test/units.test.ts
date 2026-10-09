import { describe, expect, it } from "vitest";
import { GENERIC_CANNED, extractObjects, gagProvisionId, loadGags, pickGags, scanObjects, type CaseState } from "../src/engine.js";
import { sttExt } from "../src/voice.js";
import { AI_ACT_BASIS, GDPR_BASIS, calculateFine, extractRevenueHeuristic } from "../src/fine.js";
import { quotesVisitor } from "../src/visitor.js";
import { FINDING_PROVISIONS } from "../src/repo.js";
import { validateLine } from "../src/validator.js";
import path from "node:path";
import { ROOT, corpus, roster } from "./helpers.js";

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

describe("wall guard", () => {
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
  it("has ten personas with distinct voices and exactly the three fixed pairs", () => {
    expect(roster.specs).toHaveLength(10);
    expect(new Set(roster.specs.map((s) => s.voice.voice)).size).toBe(10);
    expect(roster.pairs()).toEqual([
      { id: "commission", officers: ["formblatt", "annexe"] },
      { id: "basement", officers: ["grandma-gdpr", "auditor-9000"] },
      { id: "raid", officers: ["de-vries", "the-cookie"] },
    ]);
    for (const p of roster.pairs()) {
      expect(roster.get(p.officers[0])!.partner).toBe(p.officers[1]);
      expect(roster.get(p.officers[1])!.partner).toBe(p.officers[0]);
    }
  });
  it("every hard-coded provision id exists in the index", () => {
    const ids = [
      ...roster.specs.flatMap((s) => Object.values(s.canned).flatMap((c) => c!.provisions)),
      ...Object.values(FINDING_PROVISIONS).flat(),
      ...Object.values(GENERIC_CANNED).flatMap((c) => c.provisions),
    ];
    for (const id of ids) expect(corpus.has(id), id).toBe(true);
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

describe("gag bank (content/gags.yaml)", () => {
  const gags = loadGags(path.join(ROOT, "content", "gags.yaml"), corpus);

  it("maps A0's provision labels onto corpus ids", () => {
    expect(gagProvisionId("AI-Act Art. 3(1)", corpus)).toBe("ai-act-3");
    expect(gagProvisionId("AI-Act Annex III(4)", corpus)).toBe("ai-act-annex-iii");
    expect(gagProvisionId("GDPR Art. 83(5)(a)", corpus)).toBe("gdpr-83");
    expect(gagProvisionId("NIS2 Art. 21(2)(d)", corpus)).toBe("nis2-21");
    expect(gagProvisionId("DORA Art. 19(1)", corpus)).toBe("dora-19");
    expect(gagProvisionId("ISO27001 A.8.29", corpus)).toBe("iso27001-a8.29");
    expect(gagProvisionId("SOC2 CC6.1", corpus)).toBe("soc2-cc6");
    expect(gagProvisionId("GDPR Art. 999", corpus)).toBeNull();
  });

  it("loads verified gags only, every provision in the index", () => {
    expect(gags.length).toBeGreaterThan(100);
    for (const g of gags) for (const id of g.provisions) expect(corpus.has(id)).toBe(true);
  });

  it("picks gags for the officers, tier and submission kind", () => {
    const state = { officers: ["formblatt", "annexe"], tier: 2, submission: { kind: "text", text: "x" } } as unknown as CaseState;
    const picked = pickGags(gags, state, 6, () => 0.5);
    expect(picked).toHaveLength(6);
    for (const g of picked) {
      expect(["formblatt", "annexe", "both", undefined]).toContain(g.speaker);
      expect(Math.abs((g.tier ?? 2) - 2)).toBeLessThanOrEqual(1);
      expect(["any", "text", undefined]).toContain(g.trigger);
    }
  });
});

describe("stt upload names", () => {
  it("maps recording types to file extensions", () => {
    expect(sttExt("audio/webm;codecs=opus")).toBe("webm");
    expect(sttExt("audio/mp4")).toBe("mp4");
    expect(sttExt("audio/m4a")).toBe("m4a");
    expect(sttExt("audio/x-m4a")).toBe("m4a");
    expect(sttExt("audio/mpeg")).toBe("mp3");
  });
});
