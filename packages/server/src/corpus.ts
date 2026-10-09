/**
 * The provision index (corpus/provisions.json, built by scripts/build-corpus.ts) and a small
 * BM25 retriever over it. `get` is the only way a Provision reaches an event.
 */
import { readFileSync } from "node:fs";
import type { Provision } from "@dg-roast/shared";

export interface IndexedProvision extends Provision {
  framework: string;
  text: string;
}

const STOP = new Set(
  "a an and are as at be by for from has have in into is it its of on or that the this to was were will with we our you your their they i my app platform startup using use based".split(" "),
);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
    .map((t) => t.replace(/(ing|ers|er|es|s)$/, ""));
}

export class Corpus {
  private readonly byId: Map<string, IndexedProvision>;
  private readonly docs: { p: IndexedProvision; tf: Map<string, number>; len: number }[];
  private readonly df = new Map<string, number>();
  private readonly avgLen: number;

  constructor(readonly provisions: IndexedProvision[]) {
    this.byId = new Map(provisions.map((p) => [p.id, p]));
    this.docs = provisions.map((p) => {
      const toks = tokenize(`${p.label} ${p.title} ${p.title} ${p.text}`);
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return { p, tf, len: toks.length };
    });
    this.avgLen = this.docs.reduce((a, d) => a + d.len, 0) / Math.max(1, this.docs.length);
  }

  static load(file: string): Corpus {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { provisions: IndexedProvision[] };
    return new Corpus(raw.provisions);
  }

  get size(): number {
    return this.byId.size;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): IndexedProvision | undefined {
    return this.byId.get(id);
  }

  /** The wire shape: exactly the four contract fields, nothing from the index's extras. */
  provision(id: string): Provision | undefined {
    const p = this.byId.get(id);
    return p ? { id: p.id, label: p.label, title: p.title, url: p.url } : undefined;
  }

  search(query: string, k = 12): IndexedProvision[] {
    const q = [...new Set(tokenize(query))];
    if (!q.length) return [];
    const N = this.docs.length;
    const k1 = 1.4;
    const b = 0.75;
    const scored: { p: IndexedProvision; s: number }[] = [];
    for (const d of this.docs) {
      let s = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        s += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / this.avgLen));
      }
      if (s > 0) scored.push({ p: d.p, s });
    }
    return scored.sort((a, b2) => b2.s - a.s).slice(0, k).map((x) => x.p);
  }
}
