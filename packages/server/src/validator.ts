/**
 * Hard rule 3: every citation is real. A provision id survives only if it is in the index;
 * a line whose *text* names an article/annex/recital number that is not backed by one of its
 * surviving provisions gets that citation reworded out. The result never carries an unknown id.
 */
import type { Corpus } from "./corpus.js";

export interface DraftLine {
  text: string;
  provisions: string[];
}

export interface ValidatedLine {
  text: string;
  provisions: string[];
  /** Ids the model proposed that are not in the index. */
  dropped: string[];
  /** True when the text had to be rewritten to remove an unbacked citation. */
  reworded: boolean;
}

// Standalone references only: "Art. 5", "Article 5(1)(f)", "ANNEX III" — never "Artificial" or "articles of association".
// Case-sensitive on purpose so roman numerals are upper-case only ("Arti" + "i" was matched before).
const CITATION = /\b(?:[Aa]rt(?:icle)?s?\.?|ART(?:ICLE)?S?\.?|[Aa]nnex|ANNEX|[Rr]ecital|RECITAL)\s*(\d+[a-z]?|[IVXL]+)\b(?:\s*\(\s*\d+\s*\)(?:\s*\(\s*[a-z]\s*\))?)?/g;
const CONTROL = /\b(?:A\.\s?\d+(?:\.\d+)?|CC\d\.\d|(?:GOVERN|MAP|MEASURE|MANAGE)\s+\d+\.\d+|LLM\d{2})\b/g;

/** Article / annex numbers a provision backs: "gdpr-33" → "33", "ai-act-annex-iii" → "III". */
function backedNumbers(ids: string[]): Set<string> {
  const out = new Set<string>();
  for (const id of ids) {
    const annex = /-annex-([ivxl]+)$/.exec(id);
    if (annex) out.add(annex[1]!.toUpperCase());
    const art = /^(?:ai-act|gdpr|nis2|dora)-(\d+[a-z]?)$/.exec(id);
    if (art) out.add(art[1]!);
    const ctl = /^(?:iso27001-a|iso42001-a\.|iso42001-)(\d+(?:\.\d+)*)$/.exec(id);
    if (ctl) out.add(ctl[1]!);
    const nist = /^nist-rmf-[a-z]+-(\d+\.\d+)$/.exec(id);
    if (nist) out.add(nist[1]!);
    const soc = /^soc2-cc(\d)$/.exec(id);
    if (soc) out.add(`CC${soc[1]}`);
    const owasp = /^owasp-llm(\d{2})$/.exec(id);
    if (owasp) out.add(`LLM${owasp[1]}`);
  }
  return out;
}

export function unbackedCitations(text: string, ids: string[]): string[] {
  const backed = backedNumbers(ids);
  const bad: string[] = [];
  for (const m of text.matchAll(CITATION)) {
    const n = m[1]!;
    if (!backed.has(n) && !backed.has(n.toUpperCase())) bad.push(m[0]);
  }
  for (const m of text.matchAll(CONTROL)) {
    const raw = m[0];
    const n = /CC(\d)/.exec(raw) ? `CC${/CC(\d)/.exec(raw)![1]}` : /LLM\d{2}/.test(raw) ? raw : (/(\d+(?:\.\d+)?)/.exec(raw)?.[1] ?? raw);
    if (!backed.has(n)) bad.push(raw);
  }
  return bad;
}

const ESC = /[.*+?^${}()|[\]\\]/g;
// A connector left orphaned when the citation it introduced is deleted and nothing follows in that clause.
const LEAD = String.raw`\s*\b(?:[Pp]ursuant\s+to|[Uu]nder|[Pp]er|[Oo]f)\s+`;
const CLAUSE_END = String.raw`(?=\s*(?:[.,;:!?\u2014\u2013)]|$|\b(?:and|or|but)\b))`;

/** Deletes unbacked citations (no placeholder phrase) and tidies the sentence around the gap. */
export function rewordWithout(text: string, citations: string[]): string {
  let out = text;
  for (const c of citations) {
    const esc = c.replace(ESC, "\\$&");
    out = out.replace(new RegExp(`${LEAD}${esc}(?![\\w])${CLAUSE_END}`, "g"), "");
    out = out.replace(new RegExp(`(?<![\\w])${esc}(?![\\w])`, "g"), "");
  }
  out = out
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+(?:and|or)(?=\s*(?:[.,;:!?]|$))/g, "")
    .replace(/\s+([.,;:!?)])/g, "$1")
    .replace(/[,;:]+([.,;:!?])/g, "$1")
    .replace(/(?<!\.[A-Za-z])([.!?])\s*[,;:\u2014\u2013-]+\s*/g, "$1 ")
    .replace(/^[\s,;:\u2014\u2013-]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (/^[A-Z]/.test(text.trim()) && /^[a-z]/.test(out)) out = out[0]!.toUpperCase() + out.slice(1);
  return out;
}

export function validateLine(line: DraftLine, corpus: Corpus): ValidatedLine {
  const unique = [...new Set(line.provisions.map((p) => String(p).trim()).filter(Boolean))];
  const kept = unique.filter((id) => corpus.has(id));
  const dropped = unique.filter((id) => !corpus.has(id));
  const bad = unbackedCitations(line.text, kept);
  const text = bad.length ? rewordWithout(line.text, bad) : line.text;
  return { text, provisions: kept, dropped, reworded: bad.length > 0 };
}
