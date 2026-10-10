import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_FORMS, DGS, FORMS, OMNIBUS, WILDCARDS, formsOf } from "../src/forms";

interface Provision { id: string; label: string; title: string; url: string; text: string }
const corpus: { provisions: Provision[] } = JSON.parse(
  readFileSync(new URL("../../../corpus/provisions.json", import.meta.url), "utf8"),
);
const byId = new Map(corpus.provisions.map((p) => [p.id, p]));
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

describe("forms data", () => {
  it("every citation exists in corpus/provisions.json with the same label and url", () => {
    for (const f of FORMS) {
      expect(f.cite, f.id).toBeTruthy();
      const p = byId.get(f.cite!);
      expect(p, `${f.id} cites ${f.cite}`).toBeDefined();
      expect(f.label).toBe(p!.label);
      expect(f.url).toBe(p!.url);
    }
  });

  it("every form title and quoted phrase is grounded in its provision", () => {
    for (const f of FORMS) {
      const p = byId.get(f.cite!)!;
      const hay = norm(`${p.title} ${p.text}`);
      expect(hay, `${f.id} title`).toContain(norm(f.title));
      expect(f.quote, f.id).toBeTruthy();
      expect(hay, `${f.id} quote`).toContain(norm(f.quote!));
    }
  });

  it("each DG inbox has its own frameworks and enough forms", () => {
    const frameworks: Record<string, string[]> = { cnect: ["AI Act", "NIS2"], just: ["GDPR"], fisma: ["DORA"] };
    for (const dg of DGS) {
      const forms = formsOf(dg.id);
      expect(forms.length, dg.id).toBeGreaterThanOrEqual(5);
      for (const f of forms) expect(frameworks[dg.id]!.some((fw) => f.label!.startsWith(fw)), f.id).toBe(true);
    }
  });

  it("fictional forms carry no citation", () => {
    for (const f of [...WILDCARDS, OMNIBUS]) {
      expect(f.cite).toBeUndefined();
      expect(f.dg).toBeNull();
    }
  });

  it("ids are unique and codes fit on a block", () => {
    const ids = ALL_FORMS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of ALL_FORMS) expect(f.code.length, f.id).toBeLessThanOrEqual(9);
  });
});
