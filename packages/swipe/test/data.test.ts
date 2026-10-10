import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BANNED_KINDS, CARDS, KIND_STAMP, type Kind } from "../src/game";

const corpus = JSON.parse(readFileSync(new URL("../../../corpus/provisions.json", import.meta.url), "utf8")) as {
  provisions: { id: string; label: string; url: string }[];
};
const byId = new Map(corpus.provisions.map((p) => [p.id, p]));

/** Citations shown outside cards.json (default quips in game.ts). */
const EXTRA_CITES = ["ai-act-99"];

describe("cards.json", () => {
  it("has at least 80 cards with unique ids", () => {
    expect(CARDS.length).toBeGreaterThanOrEqual(80);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
  });

  it("every citation exists in corpus/provisions.json", () => {
    for (const id of [...CARDS.map((c) => c.cite), ...EXTRA_CITES]) expect(byId.has(id), id).toBe(true);
  });

  it("every ref starts with the corpus label and the url is the corpus url", () => {
    for (const c of CARDS) {
      const p = byId.get(c.cite)!;
      expect(c.ref.startsWith(p.label), `${c.id}: ${c.ref} vs ${p.label}`).toBe(true);
      const rest = c.ref.slice(p.label.length);
      expect(rest === "" || /^(\(\w+\))+$/.test(rest), `${c.id}: suffix ${rest}`).toBe(true);
      expect(c.url).toBe(p.url);
      expect(c.url.startsWith("https://eur-lex.europa.eu/")).toBe(true);
    }
  });

  it("verdict matches the kind of basis", () => {
    for (const c of CARDS) {
      expect(Object.keys(KIND_STAMP)).toContain(c.kind);
      expect(c.verdict, c.id).toBe(BANNED_KINDS.has(c.kind as Kind) ? "banned" : "allowed");
    }
  });

  it("Art. 5 cards cite a real Art. 5(1) point; Annex III cards a real area", () => {
    for (const c of CARDS.filter((c) => c.cite === "ai-act-5")) expect(c.ref).toMatch(/^AI Act Art\. 5\(1\)\([a-h]\)$/);
    for (const c of CARDS.filter((c) => c.cite === "ai-act-annex-iii")) expect(c.ref).toMatch(/^AI Act Annex III\([1-8]\)(\([a-e]\))?$/);
    for (const c of CARDS.filter((c) => c.kind === "prohibited")) expect(c.cite).toBe("ai-act-5");
    for (const c of CARDS.filter((c) => c.kind === "highrisk")) expect(["ai-act-annex-iii", "ai-act-6"]).toContain(c.cite);
  });

  it("is balanced and covers every tier and framework", () => {
    const banned = CARDS.filter((c) => c.verdict === "banned").length;
    expect(Math.abs(banned * 2 - CARDS.length)).toBeLessThanOrEqual(CARDS.length * 0.2);
    for (const t of [1, 2, 3]) {
      for (const v of ["banned", "allowed"]) expect(CARDS.filter((c) => c.tier === t && c.verdict === v).length).toBeGreaterThanOrEqual(8);
    }
    const prefixes = new Set(CARDS.map((c) => c.cite.split("-")[0]));
    for (const f of ["ai", "gdpr", "nis2", "dora"]) expect(prefixes.has(f)).toBe(true);
  });

  it("pitches fit on a phone card", () => {
    for (const c of CARDS) {
      expect(c.pitch.length, c.id).toBeLessThanOrEqual(120);
      expect(c.pitch.trim()).toBe(c.pitch);
      expect(c.basis.length).toBeGreaterThan(5);
    }
  });
});
