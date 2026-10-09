/**
 * The provision index and the citation parser/validator. A citation reaches a report only as a
 * `Citation` built from an indexed provision; anything else is dropped (ids) or reworded out
 * (prose). Index = corpus/provisions.json (Lane B) when present, else built from the vendored
 * skills' own references.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Citation, Provision } from "./types.js";

export type Framework =
  | "AI Act"
  | "GDPR"
  | "NIS2"
  | "DORA"
  | "ISO/IEC 27001"
  | "ISO/IEC 42001"
  | "SOC 2"
  | "NIST AI RMF"
  | "OWASP LLM Top 10";

const EU: Record<string, { prefix: string; celex: string }> = {
  "AI Act": { prefix: "ai-act", celex: "32024R1689" },
  GDPR: { prefix: "gdpr", celex: "32016R0679" },
  NIS2: { prefix: "nis2", celex: "32022L2555" },
  DORA: { prefix: "dora", celex: "32022R2554" },
};
const isEu = (fw: string | null): fw is "AI Act" | "GDPR" | "NIS2" | "DORA" => !!fw && fw in EU;

export class ProvisionIndex {
  private readonly byId: Map<string, Provision>;
  constructor(
    provisions: Provision[],
    readonly source: "corpus" | "fallback",
  ) {
    this.byId = new Map(provisions.map((p) => [p.id, p]));
  }
  get size(): number {
    return this.byId.size;
  }
  has(id: string): boolean {
    return this.byId.has(id);
  }
  get(id: string): Provision | undefined {
    return this.byId.get(id);
  }
  ids(): IterableIterator<string> {
    return this.byId.keys();
  }

  /** Lane B's corpus/provisions.json (`{ provisions: [...] }`) when present, else the fallback. */
  static load(corpusPath: string, skillsDir: string): ProvisionIndex {
    if (existsSync(corpusPath)) {
      const raw = JSON.parse(readFileSync(corpusPath, "utf8")) as { provisions?: Provision[] };
      if (Array.isArray(raw.provisions) && raw.provisions.length) {
        return new ProvisionIndex(
          raw.provisions.map((p) => ({ id: p.id, label: p.label, title: p.title, url: p.url, framework: p.framework })),
          "corpus",
        );
      }
    }
    return ProvisionIndex.fromSkills(skillsDir);
  }

  /** Every provision the vendored skills themselves reference. */
  static fromSkills(skillsDir: string): ProvisionIndex {
    const out = new Map<string, Provision>();
    for (const file of walk(skillsDir).filter((f) => f.endsWith(".md"))) {
      const text = readFileSync(file, "utf8");
      const name = file.toLowerCase();
      const fw: Framework | null = name.includes("/eu-ai-act/") ? "AI Act" : /gdpr/.test(name) ? "GDPR" : /nis2/.test(name) ? "NIS2" : /dora/.test(name) ? "DORA" : null;
      for (const run of scanCitations(text, fw, "prose")) {
        for (const r of run.refs) for (const id of r.ids) if (!out.has(id)) out.set(id, synthesize(id, r.framework));
      }
    }
    return new ProvisionIndex([...out.values()], "fallback");
  }
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function synthesize(id: string, framework: Framework): Provision {
  const eu = Object.entries(EU).find(([, v]) => id.startsWith(`${v.prefix}-`));
  if (eu) {
    const [fw, { prefix, celex }] = eu;
    const rest = id.slice(prefix.length + 1);
    const annex = /^annex-([ivxl]+)$/.exec(rest);
    const label = annex ? `${fw} Annex ${annex[1]!.toUpperCase()}` : `${fw} Art. ${rest}`;
    const anchor = annex ? `anx_${annex[1]!.toUpperCase()}` : `art_${rest}`;
    return { id, label, title: label, url: `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celex}#${anchor}`, framework: fw };
  }
  const label = fallbackLabel(id, framework);
  return { id, label, title: label, url: FRAMEWORK_URL[framework], framework };
}

const FRAMEWORK_URL: Record<Framework, string> = {
  "AI Act": "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
  GDPR: "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
  NIS2: "https://eur-lex.europa.eu/eli/dir/2022/2555/oj",
  DORA: "https://eur-lex.europa.eu/eli/reg/2022/2554/oj",
  "ISO/IEC 27001": "https://www.iso.org/standard/27001",
  "ISO/IEC 42001": "https://www.iso.org/standard/42001",
  "SOC 2": "https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2",
  "NIST AI RMF": "https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf",
  "OWASP LLM Top 10": "https://genai.owasp.org/llm-top-10/",
};

function fallbackLabel(id: string, fw: Framework): string {
  if (fw === "ISO/IEC 27001") return `ISO/IEC 27001 ${id.replace("iso27001-", "").replace(/^a/, "A.")}`;
  if (fw === "ISO/IEC 42001") {
    const r = id.replace("iso42001-", "");
    return r.startsWith("a.") ? `ISO/IEC 42001 ${r.toUpperCase()}` : `ISO/IEC 42001 cl. ${r}`;
  }
  if (fw === "SOC 2") return `SOC 2 ${id.replace("soc2-", "").toUpperCase()}`;
  if (fw === "NIST AI RMF") {
    const m = /^nist-rmf-([a-z]+)-(.+)$/.exec(id);
    return m ? `NIST AI RMF ${m[1]!.toUpperCase()} ${m[2]}` : id;
  }
  if (fw === "OWASP LLM Top 10") return `OWASP ${id.replace("owasp-", "").toUpperCase()}:2025`;
  return id;
}

// ---------------------------------------------------------------------------------------------
// Scanner

export interface Ref {
  framework: Framework;
  /** Candidate provision ids; for ranges, both ends (both must exist). */
  ids: string[];
  /** Display text, e.g. "GDPR Art. 33(1)", "ISO/IEC 27001 A.8.2–8.5". */
  display: string;
  /** Pinpoint appended to the index label, e.g. "(1)(a)". */
  pinpoint: string;
  range: boolean;
  /** Clause/criterion that must be resolved through the index (ISO 42001 clause groups). */
  clause?: string;
}

export interface Run {
  start: number;
  end: number;
  refs: Ref[];
}

const FW_TOKENS: [RegExp, Framework][] = [
  [/(?:the\s+)?(?:EU\s+)?AI\s+Act\b/iy, "AI Act"],
  [/GDPR\b/y, "GDPR"],
  [/NIS\s?2\b/y, "NIS2"],
  [/DORA\b/y, "DORA"],
  [/(?:ISO(?:\/IEC)?\s*)?27001(?::20\d\d)?\b/y, "ISO/IEC 27001"],
  [/(?:ISO(?:\/IEC)?\s*)?42001(?::20\d\d)?\b/y, "ISO/IEC 42001"],
  [/SOC\s?2\b/y, "SOC 2"],
  [/NIST(?:\s+AI\s+RMF)?\b(?!\s+AI\s+\d)/y, "NIST AI RMF"],
  [/OWASP(?:\s+LLM(?:\s+Top\s+10)?)?\b/y, "OWASP LLM Top 10"],
];
const EXTERNAL = /(?:Rec\.|Recital|Recommendation|Dir\.|Directive|Reg\.|Regulation|RTS|ITS|Decision|LED|CER|Delegated)\s*(?:\(EU\)\s*)?(?:No\.?\s*)?\d{2,4}\/\d+/iy;
const ART_KW = /(?:Articles?|Arts?\.?)\s*/iy;
const ANNEX = /Annex\s+([IVXL]+)\b((?:\s*(?:point\s*)?\d{1,2}(?:\s?\([a-z]\))*)?)/iy;
const PIN = String.raw`(?:\s?\((?:\d{1,2}|[a-z]{1,4})\)(?:\s?[-–]\s?\((?:\d{1,2}|[a-z]{1,4})\))?(?:,\((?:\d{1,2}|[a-z]{1,4})\))*)*`;
const EU_REF = new RegExp(String.raw`(\d{1,3}[a-z]?)(?!\d|\.\d|\s?(?:h|d|%|M|k|days?|hours?|months?|years?)\b)(${PIN})(?:\s?[-–]\s?(\d{1,3})(?![\d(.]))?`, "y");
const ISO27_REF = /A\.?\s?(\d{1,2}\.\d{1,2})(?:\s?[-–]\s?(?:A\.)?(\d{1,2}\.\d{1,2}))?|(\d{1,2}(?:\.\d{1,2}){1,2})(?:\s?[-–]\s?\d{1,2}(?:\.\d{1,2}){1,2})?/y;
const ISO42_REF = /A\.(\d{1,2})(?:\.\d{1,2})*(?:\s?[-–]\s?A\.\d{1,2})?|(\d{1,2}(?:\.\d{1,2}){0,2})(?:\s?[-–]\s?\d{1,2}(?:\.\d{1,2}){0,2})?/y;
const SOC_REF = /(CC|PI|A|C|P)(\d)(?:\.\d{1,2})?(?:\s?[-–]\s?(?:CC|PI|A|C|P)?\d(?:\.\d{1,2})?)?/y;
const NIST_FN = /(GOVERN|MAP|MEASURE|MANAGE)\s+/y;
const NIST_REF = /(\d\.\d{1,2})(?:\s?[-–]\s?(\d\.\d{1,2}))?/y;
const OWASP_REF = /LLM\s?(\d{2})(?::20\d\d)?(?:\s?[-–]\s?(?:LLM)?\d{2})?/y;
const SEP = /\s*(?:,|and|&|\/|or)\s*|\s+/y;

function at(re: RegExp, s: string, i: number): RegExpExecArray | null {
  re.lastIndex = i;
  return re.exec(s);
}

function euRef(fw: "AI Act" | "GDPR" | "NIS2" | "DORA", num: string, pin: string, end: string | undefined, artWord: boolean): Ref {
  const p = EU[fw]!.prefix;
  const pinpoint = pin.replace(/\s+/g, "");
  if (end) return { framework: fw, ids: [`${p}-${num}`, `${p}-${end}`], display: `${fw} Arts. ${num}–${end}`, pinpoint: "", range: true };
  void artWord;
  return { framework: fw, ids: [`${p}-${num}`], display: `${fw} Art. ${num}${pinpoint}`, pinpoint, range: false };
}

/**
 * Finds citation runs. `structured` (skill citation cells) accepts bare references after a
 * framework name or segment start; `prose` (model text) needs "Art."/"Annex"/a framework name.
 */
export function scanCitations(text: string, defaultFw: Framework | null, mode: "prose" | "structured"): Run[] {
  const runs: Run[] = [];
  let i = 0;
  let cur: Framework | null = defaultFw;
  let run: Run | null = null;
  let armed = mode === "structured";
  let nistFn: string | null = null;
  const close = () => {
    if (run && run.refs.length) runs.push(run);
    run = null;
    armed = mode === "structured";
  };
  const push = (start: number, end: number, ref: Ref) => {
    if (!run) run = { start, end, refs: [] };
    run.refs.push(ref);
    run.end = end;
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === ";" || ch === "\n" || ch === "|") {
      close();
      cur = defaultFw;
      nistFn = null;
      i++;
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = at(EXTERNAL, text, i))) {
      close();
      cur = null;
      armed = false;
      i += m[0].length;
      continue;
    }
    let fwHit = false;
    for (const [re, fw] of FW_TOKENS) {
      if ((m = at(re, text, i)) && (i === 0 || !/[A-Za-z0-9]/.test(text[i - 1]!))) {
        if (!run) run = { start: i, end: i + m[0].length, refs: [] };
        cur = fw;
        armed = true;
        nistFn = null;
        i += m[0].length;
        fwHit = true;
        break;
      }
    }
    if (fwHit) continue;
    const wordStart = i === 0 || !/[A-Za-z0-9.]/.test(text[i - 1]!);
    if (wordStart && (m = at(NIST_FN, text, i)) && at(NIST_REF, text, i + m[0].length)) {
      cur = "NIST AI RMF";
      nistFn = m[1]!.toLowerCase();
      if (!run) run = { start: i, end: i, refs: [] };
      i += m[0].length;
      armed = true;
      continue;
    }
    if (wordStart && (m = at(OWASP_REF, text, i))) {
      const n = m[1]!;
      push(i, i + m[0].length, { framework: "OWASP LLM Top 10", ids: [`owasp-llm${n}`], display: `OWASP LLM${n}:2025`, pinpoint: "", range: false });
      cur = "OWASP LLM Top 10";
      armed = true;
      i += m[0].length;
      continue;
    }
    if (wordStart && isEu(cur) && (m = at(ANNEX, text, i))) {
      const roman = m[1]!.toUpperCase();
      const pt = (m[2] ?? "").trim();
      push(i, i + m[0].length, { framework: cur, ids: [`${EU[cur]!.prefix}-annex-${roman.toLowerCase()}`], display: `${cur} Annex ${roman}${pt ? ` ${pt}` : ""}`, pinpoint: pt ? ` ${pt}` : "", range: false });
      armed = true;
      i += m[0].length;
      continue;
    }
    if (wordStart && (m = at(ART_KW, text, i)) && /\d/.test(text[i + m[0].length] ?? "")) {
      if (!cur && mode === "prose") cur = defaultFw;
      if (!run) run = { start: i, end: i + m[0].length, refs: [] };
      armed = true;
      i += m[0].length;
      continue;
    }
    if (armed && cur && wordStart) {
      const hit = refAt(text, i, cur, nistFn);
      if (hit) {
        push(run ? (run as Run).start : i, i + hit.len, hit.ref);
        i += hit.len;
        const sep = at(SEP, text, i);
        if (sep && sep[0].length) {
          // keep the run alive only if another reference follows the separator
          const j = i + sep[0].length;
          const next = refAt(text, j, cur, nistFn) || at(ART_KW, text, j) || at(ANNEX, text, j) || at(NIST_FN, text, j) || FW_TOKENS.some(([re]) => at(re, text, j));
          if (next) {
            i = j;
            continue;
          }
        }
        close();
        continue;
      }
    }
    if (run && !/\s/.test(ch)) {
      close();
      if (mode === "prose") cur = defaultFw;
    }
    i++;
  }
  close();
  return runs;
}

function refAt(text: string, i: number, fw: Framework, nistFn: string | null): { ref: Ref; len: number } | null {
  let m: RegExpExecArray | null;
  if (isEu(fw)) {
    if ((m = at(EU_REF, text, i))) return { ref: euRef(fw, m[1]!, m[2] ?? "", m[3], false), len: m[0].length };
    return null;
  }
  if (fw === "ISO/IEC 27001" && (m = at(ISO27_REF, text, i))) {
    if (m[1]) {
      const id = `iso27001-a${m[1]}`;
      const ids = m[2] ? [id, `iso27001-a${m[2]}`] : [id];
      return { ref: { framework: fw, ids, display: `ISO/IEC 27001 A.${m[1]}${m[2] ? `–${m[2]}` : ""}`, pinpoint: "", range: !!m[2] }, len: m[0].length };
    }
    return { ref: { framework: fw, ids: [`iso27001-${m[3]}`], display: `ISO/IEC 27001 cl. ${m[3]}`, pinpoint: "", range: false }, len: m[0].length };
  }
  if (fw === "ISO/IEC 42001" && (m = at(ISO42_REF, text, i))) {
    if (m[1]) return { ref: { framework: fw, ids: [`iso42001-a.${m[1]}`], display: `ISO/IEC 42001 ${m[0].replace(/\s/g, "")}`, pinpoint: "", range: false }, len: m[0].length };
    return { ref: { framework: fw, ids: [`iso42001-${m[2]}`], display: `ISO/IEC 42001 cl. ${m[0].replace(/\s/g, "")}`, pinpoint: "", range: false, clause: m[2] }, len: m[0].length };
  }
  if (fw === "SOC 2" && (m = at(SOC_REF, text, i))) {
    const fam = m[1]!.toLowerCase();
    const id = fam === "p" ? "soc2-p1" : fam === "cc" ? `soc2-cc${m[2]}` : `soc2-${fam}${m[2]}`;
    return { ref: { framework: fw, ids: [id], display: `SOC 2 ${m[0].replace(/\s/g, "")}`, pinpoint: "", range: false }, len: m[0].length };
  }
  if (fw === "NIST AI RMF" && nistFn && (m = at(NIST_REF, text, i))) {
    const ids = [`nist-rmf-${nistFn}-${m[1]}`, ...(m[2] ? [`nist-rmf-${nistFn}-${m[2]}`] : [])];
    return { ref: { framework: fw, ids, display: `NIST AI RMF ${nistFn.toUpperCase()} ${m[0].replace(/\s/g, "")}`, pinpoint: "", range: !!m[2] }, len: m[0].length };
  }
  if (fw === "OWASP LLM Top 10" && (m = at(OWASP_REF, text, i))) {
    return { ref: { framework: fw, ids: [`owasp-llm${m[1]}`], display: `OWASP LLM${m[1]}:2025`, pinpoint: "", range: false }, len: m[0].length };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Resolution + validation

function versionCmp(a: string, b: string): number {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let k = 0; k < Math.max(x.length, y.length); k++) {
    const d = (x[k] ?? 0) - (y[k] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** ISO 42001 clause → the indexed clause group containing it ("9.2" → "iso42001-9.1", label "cl. 9.1–9.3"). */
function clauseGroup(index: ProvisionIndex, clause: string): string | undefined {
  if (index.has(`iso42001-${clause}`)) return `iso42001-${clause}`;
  for (const id of index.ids()) {
    if (!/^iso42001-\d/.test(id)) continue;
    const m = /cl\.\s*([\d.]+)(?:\s*[-–]\s*([\d.]+))?/.exec(index.get(id)!.label);
    if (!m) continue;
    const lo = m[1]!;
    const hi = m[2] ?? lo;
    if (versionCmp(clause, lo) >= 0 && versionCmp(clause, hi) <= 0) return id;
  }
  return undefined;
}

export function resolveRef(ref: Ref, index: ProvisionIndex): Citation | null {
  let ids = ref.ids;
  if (ref.clause) {
    const g = clauseGroup(index, ref.clause);
    if (!g) return null;
    ids = [g];
  }
  if (!ids.every((id) => index.has(id))) return null;
  const p = index.get(ids[0]!)!;
  const display = ref.range || ref.clause || p.framework === "SOC 2" ? ref.display : `${p.label}${ref.pinpoint}`;
  return { ...p, display };
}

export function dedupe(cs: Citation[]): Citation[] {
  const seen = new Set<string>();
  return cs.filter((c) => (seen.has(c.display) ? false : (seen.add(c.display), true)));
}

/** Parses a skill citation cell; unknown references are silently not shown. */
export function citationsIn(text: string, defaultFw: Framework | null, index: ProvisionIndex, allow?: (fw: string) => boolean, mode: "prose" | "structured" = "structured"): Citation[] {
  const out: Citation[] = [];
  for (const run of scanCitations(text, defaultFw, mode))
    for (const r of run.refs) {
      if (allow && !allow(r.framework)) continue;
      const c = resolveRef(r, index);
      if (c) out.push(c);
    }
  return dedupe(out);
}

export interface Validated {
  citations: Citation[];
  /** Ids/references not in the index. */
  dropped: string[];
  /** Indexed, but of a framework the caller disallows (e.g. AI Act in the warden half). */
  stripped: string[];
}

/**
 * Model-proposed provision ids and citation strings → indexed citations only. Ids not in the
 * index, and frameworks the caller disallows, are dropped and reported.
 */
export function validateProposed(ids: unknown, strings: unknown, defaultFw: Framework | null, index: ProvisionIndex, allow: (fw: string) => boolean): Validated {
  const out: Citation[] = [];
  const dropped: string[] = [];
  const stripped: string[] = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw).trim().toLowerCase();
    const p = index.get(id);
    if (p && allow(p.framework)) out.push({ ...p, display: p.label });
    else if (p) stripped.push(id);
    else if (id) dropped.push(id);
  }
  for (const raw of Array.isArray(strings) ? strings : []) {
    const s = String(raw);
    const runs = scanCitations(s, defaultFw, "structured");
    if (!runs.length && s.trim()) dropped.push(s.trim());
    for (const run of runs)
      for (const r of run.refs) {
        if (!allow(r.framework)) {
          stripped.push(r.display);
          continue;
        }
        const c = resolveRef(r, index);
        if (c) out.push(c);
        else dropped.push(r.display);
      }
  }
  return { citations: dedupe(out), dropped, stripped };
}

export const REWORD = "the relevant provision";

/**
 * Rewrites model prose so every citation it names is indexed and allowed: unknown or disallowed
 * references are replaced; known ones are kept and returned as citations.
 */
export function cleanProse(text: string, defaultFw: Framework | null, index: ProvisionIndex, allow: (fw: string) => boolean): { text: string; citations: Citation[]; dropped: string[]; stripped: string[] } {
  const runs = scanCitations(text, defaultFw, "prose");
  const citations: Citation[] = [];
  const dropped: string[] = [];
  const stripped: string[] = [];
  let out = "";
  let last = 0;
  for (const run of runs) {
    const good: Citation[] = [];
    let bad = false;
    for (const r of run.refs) {
      const c = allow(r.framework) ? resolveRef(r, index) : null;
      if (c) good.push(c);
      else {
        bad = true;
        (allow(r.framework) ? dropped : stripped).push(r.display);
      }
    }
    citations.push(...good);
    if (!bad) continue;
    out += text.slice(last, run.start) + (good.length ? good.map((g) => g.display).join(", ") : REWORD);
    last = run.end;
  }
  out += text.slice(last);
  out = out
    .replace(new RegExp(`${REWORD}(\\s*(?:,|and|of|under)\\s*${REWORD})+`, "g"), REWORD)
    .replace(/\(\s*the relevant provision\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
  return { text: out, citations: dedupe(citations), dropped, stripped };
}
