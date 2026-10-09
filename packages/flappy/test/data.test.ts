import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PICKUP_REGS, PILLAR_REGS } from "../src/logic";

interface Provision { id: string; label: string; title: string; url: string; text: string }
const corpus = JSON.parse(readFileSync(new URL("../../../corpus/provisions.json", import.meta.url), "utf8")) as { provisions: Provision[] };
const byId = new Map(corpus.provisions.map((p) => [p.id, p]));
const all = [...PILLAR_REGS, ...Object.values(PICKUP_REGS)];

describe("every regulation shown exists in corpus/provisions.json", () => {
  it.each(all.map((r) => [r.id, r] as const))("%s", (_id, r) => {
    const p = byId.get(r.id);
    expect(p, `${r.id} missing from corpus`).toBeDefined();
    expect(r.label).toBe(p!.label);
    expect(r.title).toBe(p!.title.replace(/`$/, ""));
    expect(r.url).toBe(p!.url);
    expect(r.url).toMatch(/^https:\/\/eur-lex\.europa\.eu\//);
    if (r.evidence) expect(p!.text).toContain(r.evidence);
    expect(r.fact.length).toBeGreaterThan(10);
    expect(r.fact.length).toBeLessThanOrEqual(140);
  });
  it("pillar short labels match the framework of the cited provision", () => {
    const fw: Record<string, RegExp> = { GDPR: /^GDPR /, "AI ACT": /^AI Act /, NIS2: /^NIS2 /, DORA: /^DORA / };
    for (const r of PILLAR_REGS) expect(r.label).toMatch(fw[r.short]);
  });
  it("facts only cite articles that are in the corpus", () => {
    for (const r of all) {
      const fw = r.label.split(" Art.")[0].split(" Annex")[0];
      for (const m of r.fact.matchAll(/Art\. (\d+)/g)) {
        expect(corpus.provisions.some((p) => p.label === `${fw} Art. ${m[1]}`), `${r.id}: Art. ${m[1]}`).toBe(true);
      }
    }
  });
  it("ids are unique and there is variety", () => {
    expect(new Set(PILLAR_REGS.map((r) => r.id)).size).toBe(PILLAR_REGS.length);
    expect(new Set(PILLAR_REGS.map((r) => r.short)).size).toBeGreaterThanOrEqual(4);
  });
});
