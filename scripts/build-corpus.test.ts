import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EURLEX_ACTS,
  LOCK_FILE,
  eurlexArticles,
  eurlexInsertedArticles,
  excerpt,
  lockViolations,
  parseXhtml,
  textOf,
  type IndexedProvision,
} from "./build-corpus.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const corpus = JSON.parse(readFileSync(path.join(ROOT, "corpus", "provisions.json"), "utf8")) as {
  counts: Record<string, number>;
  provisions: IndexedProvision[];
};
const lock = JSON.parse(readFileSync(LOCK_FILE, "utf8")) as Record<string, string>;
const all = corpus.provisions;
const byId = new Map(all.map((p) => [p.id, p]));
const NEW = new Set(EURLEX_ACTS.map((a) => a.short));

const COUNTS: Record<string, number> = {
  "AI Act": 126,
  GDPR: 99,
  NIS2: 49,
  DORA: 64,
  "NIST AI RMF": 72,
  "ISO/IEC 27001": 76,
  "ISO/IEC 42001": 19,
  "SOC 2": 13,
  "OWASP LLM Top 10": 10,
  DSA: 93,
  DMA: 55,
  CRA: 79,
  "Data Act": 50,
  ePrivacy: 23,
  "eIDAS 2": 41,
  CSRD: 10,
};

describe("corpus/provisions.json", () => {
  it("has the contract shape", () => {
    expect(Array.isArray(all)).toBe(true);
    for (const p of all) {
      expect(Object.keys(p).sort()).toEqual(["framework", "id", "label", "text", "title", "url"]);
      for (const v of Object.values(p)) expect(typeof v).toBe("string");
      for (const k of ["id", "label", "url", "framework"] as const) expect(p[k], `${p.id}.${k}`).not.toBe("");
    }
  });

  it("has unique lowercase ids", () => {
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    for (const p of all) expect(p.id).toMatch(/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/);
  });

  it("keeps every published id byte-identical (provisions.lock.json)", () => {
    expect(lockViolations(lock, all)).toEqual([]);
    for (const p of all) expect(lock[p.id], `${p.id} not in lock`).toBeDefined();
  });

  it("has the expected frameworks and counts", () => {
    const counts: Record<string, number> = {};
    for (const p of all) counts[p.framework] = (counts[p.framework] ?? 0) + 1;
    expect(counts).toEqual(COUNTS);
    expect(corpus.counts).toEqual(COUNTS);
  });

  it("links EU law to EUR-Lex deep anchors", () => {
    const eurlex = /^https:\/\/eur-lex\.europa\.eu\/legal-content\/EN\/TXT\/HTML\/\?uri=CELEX:[0-9]{5}[A-Z][0-9]{4}(?:-[0-9]{8})?#(?:art|anx)_[0-9A-Za-z]+$/;
    for (const p of all) {
      expect(p.url, p.id).toMatch(/^https:\/\//);
      if (NEW.has(p.framework) || ["AI Act", "GDPR", "NIS2", "DORA"].includes(p.framework)) expect(p.url, p.id).toMatch(eurlex);
    }
  });

  it("gives new provisions labelled ids, titles and ≤ 1,200-char excerpts", () => {
    const fresh = all.filter((p) => NEW.has(p.framework));
    for (const p of fresh) {
      const act = EURLEX_ACTS.find((a) => a.short === p.framework)!;
      expect(p.id.startsWith(`${act.prefix}-`), p.id).toBe(true);
      expect(p.label.startsWith(`${act.short} `), p.id).toBe(true);
      expect(p.title, p.id).not.toBe("");
      expect(p.text.length, p.id).toBeLessThanOrEqual(1200);
      expect(p.text.length, p.id).toBeGreaterThan(40);
    }
    for (const id of ["dsa-34", "dma-5", "cra-14", "data-act-3", "eprivacy-5", "eidas2-45", "csrd-19a", "cra-annex-i"]) {
      expect(byId.has(id), id).toBe(true);
    }
  });

  it("carries the real caps in the penalty articles", () => {
    const caps: [string, string[]][] = [
      ["dsa-52", ["6 %", "1 %", "5 %"]],
      ["dsa-74", ["6 %", "1 %"]],
      ["dsa-76", ["5 %"]],
      ["dma-30", ["10 %", "20 %"]],
      ["dma-31", ["5 %"]],
      ["cra-64", ["EUR 15 000 000", "2,5 %", "EUR 10 000 000", "EUR 5 000 000"]],
      ["data-act-40", ["Article 83(5) of that Regulation"]],
      ["eidas2-16", ["EUR 5 000 000", "1 %"]],
      ["eprivacy-15a", ["effective, proportionate and dissuasive"]],
    ];
    for (const [id, want] of caps) for (const w of want) expect(byId.get(id)?.text, id).toContain(w);
  });
});

const CACHE = process.env.EURLEX_DIR || path.join(ROOT, ".cache", "corpus-src", "eurlex");
const cached = EURLEX_ACTS.every((a) => existsSync(path.join(CACHE, `${a.celex}.xhtml`)));

describe.skipIf(!cached)("new excerpts are verbatim EUR-Lex (needs `npm run build:corpus` cache)", () => {
  it.each(EURLEX_ACTS.map((a) => [a.short, a] as const))("%s", (_, act) => {
    const source = textOf(parseXhtml(readFileSync(path.join(CACHE, `${act.celex}.xhtml`), "utf8"))).replace(/\s+/g, " ");
    for (const p of all.filter((x) => x.framework === act.short)) {
      for (const seg of p.text.split(" … ")) {
        const s = seg.replace(/^… /, "").replace(/…$/, "");
        expect(source.includes(s), `${p.id}: "${s.slice(0, 80)}"`).toBe(true);
      }
      expect(source.includes(p.title), `${p.id} title`).toBe(true);
    }
  });
});

describe("EUR-Lex XHTML parser", () => {
  it("reads OJ articles, annexes and footnote-free titles", () => {
    const doc = parseXhtml(`<html><head><title>x</title></head><body>
      <div class="eli-subdivision" id="art_52"><p class="oj-ti-art">Article&#160;52</p>
        <div class="eli-title" id="art_52.tit_1"><p class="oj-sti-art">Penalties</p></div>
        <div id="052.001"><p class="oj-normal">1.   Rules &amp; penalties.</p></div>
        <div id="052.002"><p class="oj-normal">2.   Up to 6&#160;% of turnover.</p></div></div>
      <div class="eli-container" id="anx_I"><p class="oj-doc-ti">ANNEX I</p><p class="oj-doc-ti">ESSENTIAL</p>
        <table><col width="4%"/><tr><td><p class="oj-normal">(1)</p></td><td><span>Be secure.</span></td></tr></table></div>
      </body></html>`);
    expect(eurlexArticles(doc)).toEqual([
      { num: "52", kind: "article", title: "Penalties", paras: ["1. Rules & penalties.", "2. Up to 6 % of turnover."], anchor: "art_52" },
      { num: "I", kind: "annex", title: "ESSENTIAL", paras: ["(1) Be secure."], anchor: "anx_I" },
    ]);
  });

  it("drops consolidated-text amendment markers", () => {
    const doc = parseXhtml(`<div class="eli-subdivision" id="art_5"><p class="title-article-norm">Article 5</p>
      <div class="eli-title"><p class="stitle-article-norm">Confidentiality</p></div>
      <div class="norm"><span class="no-parag">1.  </span><div class="norm inline-element">One.</div></div>
      <p class="modref"><a href="x">▼M2</a></p>
      <div class="norm"><span class="no-parag">3.  </span><div class="norm inline-element">Three.</div></div></div>`);
    expect(eurlexArticles(doc)[0]).toMatchObject({ num: "5", title: "Confidentiality", paras: ["1. One.", "3. Three."] });
  });

  it("reads articles an amending act inserts, quotes stripped", () => {
    const doc = parseXhtml(`<div class="eli-subdivision" id="art_1"><p class="oj-ti-art">Article 1</p>
      <p class="oj-normal">Article 45 is replaced by the following:</p>
      <div id="045"><p class="oj-ti-art">‘Article 45</p><p class="oj-sti-art">Certificates</p>
        <div><p class="oj-normal">1.   Shall meet Annex IV.</p></div>
        <div><p class="oj-normal">2.   Browsers shall comply.’;</p></div></div>
      <div id="cpt"><p class="oj-ti-section-1">‘CHAPTER 6a</p>
        <div id="029B"><p class="oj-ti-art">Article 29b</p><p class="oj-sti-art">Standards</p><p class="oj-normal">Text b.</p></div>
        <div id="029C"><p class="oj-ti-art">Article 29c</p><p class="oj-sti-art">SME standards</p><p class="oj-normal">Text c.’;</p></div></div>
      </div>`);
    expect(eurlexInsertedArticles(doc).map((a) => [a.num, a.title, a.paras])).toEqual([
      ["45", "Certificates", ["1. Shall meet Annex IV.", "2. Browsers shall comply."]],
      ["29b", "Standards", ["Text b."]],
      ["29c", "SME standards", ["Text c."]],
    ]);
  });

  it("keeps cap paragraphs in penalty excerpts", () => {
    const paras = ["1. " + "x ".repeat(400), "2. " + "y ".repeat(300), "3. Fines up to 6 % of turnover."];
    const text = excerpt(paras, true);
    expect(text.length).toBeLessThanOrEqual(1200);
    expect(text).toContain("… 3. Fines up to 6 % of turnover.");
    expect(excerpt(paras, false)).not.toContain("6 %");
  });
});
