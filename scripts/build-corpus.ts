/**
 * Builds corpus/provisions.json — the only list of provisions the officials may cite.
 *
 * Sources (shallow-cloned into .cache/corpus-src unless EU_AI_ACT_DIR / WARDEN_DIR point at
 * existing checkouts):
 *   - bioztar/EU-AI-Act  corpus/act/regulation-eu-2024-1689.md            (verbatim EUR-Lex)
 *   - bioztar/warden     corpus/eu-law/{gdpr,nis2,dora}*.md               (verbatim EUR-Lex)
 *                        corpus/nist/nist-ai-100-1.md                     (US Gov work)
 *                        frameworks/{iso-27001,iso-42001,soc2}.md          (ids + warden-authored titles)
 *                        corpus/standards/owasp-llm-top10.md               (ids + names)
 *   - EUR-Lex / Publications Office XHTML, fetched by CELEX from CELLAR into .cache/corpus-src/eurlex
 *     (or EURLEX_DIR): DSA, DMA, CRA, Data Act, ePrivacy (consolidated), eIDAS 2 and CSRD (the
 *     articles they insert into Reg. 910/2014 and Dir. 2013/34/EU). Verbatim, public domain.
 *
 * corpus/provisions.lock.json pins a hash of every provision ever published: the build fails if
 * an existing id disappears or changes, and appends new ids.
 *
 * ISO/IEC 27001, ISO/IEC 42001 and SOC 2 are copyrighted: only control ids and warden's own
 * authored descriptions go in, never standard text. Run: `npm run build:corpus`.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface IndexedProvision {
  id: string;
  label: string;
  title: string;
  url: string;
  framework: string;
  text: string;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".cache", "corpus-src");
const TEXT_CHARS = 700;

function checkout(name: string, url: string, envVar: string, branch?: string): string {
  const fromEnv = process.env[envVar];
  if (fromEnv) return fromEnv;
  const dir = path.join(CACHE, name);
  if (!existsSync(dir)) {
    mkdirSync(CACHE, { recursive: true });
    const args = ["clone", "--depth", "1", ...(branch ? ["--branch", branch] : []), url, dir];
    execFileSync("git", args, { stdio: "inherit" });
  }
  return dir;
}

function wardenBranch(): string | undefined {
  return process.env.WARDEN_BRANCH || undefined;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const EURLEX_TEXT_CHARS = 1200;
const clip = (s: string, n = TEXT_CHARS) => (s.length > n ? `${s.slice(0, n).replace(/\s\S*$/, "")}…` : s);

interface EuAct {
  file: string;
  prefix: string;
  short: string;
  celex: string;
}

/** `### Article N` + a plain title line, as produced by both repos' html2md.py. */
export function parseEuAct(md: string, act: EuAct): IndexedProvision[] {
  const lines = md.split("\n");
  const out: IndexedProvision[] = [];
  const base = `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${act.celex}`;
  for (let i = 0; i < lines.length; i++) {
    const art = /^###\s+Article\s+(\d+[a-z]?)\s*$/.exec(lines[i] ?? "");
    const anx = /^##\s+ANNEX\s+([IVXL]+)\s*$/.exec(lines[i] ?? "");
    if (!art && !anx) continue;
    let j = i + 1;
    while (j < lines.length && !(lines[j] ?? "").trim()) j++;
    const title = squash((lines[j] ?? "").replace(/^#+\s*/, ""));
    const body: string[] = [];
    for (let k = j + 1; k < lines.length; k++) {
      const l = lines[k] ?? "";
      if (/^##+\s+(Article|ANNEX|CHAPTER|SECTION|Section|TITLE|Footnotes)\b/.test(l)) break;
      body.push(l);
      if (body.join(" ").length > TEXT_CHARS * 2) break;
    }
    if (art) {
      const n = art[1]!;
      out.push({
        id: `${act.prefix}-${n}`,
        label: `${act.short} Art. ${n}`,
        title,
        url: `${base}#art_${n}`,
        framework: act.short,
        text: clip(squash(body.join(" "))),
      });
    } else {
      const n = anx![1]!;
      out.push({
        id: `${act.prefix}-annex-${n.toLowerCase()}`,
        label: `${act.short} Annex ${n}`,
        title,
        url: `${base}#anx_${n}`,
        framework: act.short,
        text: clip(squash(body.join(" "))),
      });
    }
  }
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}

/** NIST AI 100-1 Tables 1–4: "GOVERN 1.1: Legal and regulatory requirements…" in a two-column layout. */
export function parseNistRmf(txt: string): IndexedProvision[] {
  const lines = txt.split("\n");
  const re = /\b(GOVERN|MAP|MEASURE|MANAGE)\s+(\d+\.\d+):\s+(.*)$/;
  const out = new Map<string, IndexedProvision>();
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i] ?? "");
    if (!m) continue;
    const col = Math.max(0, (m.index ?? 0) - 3);
    const parts = [m[3] ?? ""];
    for (let k = i + 1; k < Math.min(lines.length, i + 8); k++) {
      const l = lines[k] ?? "";
      if (!l.trim() || re.test(l) || /Table \d|Categories\s+Subcategories/.test(l)) break;
      parts.push(l.slice(col));
    }
    const text = squash(parts.join(" ").replace(/-\s+(?=[a-z])/g, ""));
    const fn = m[1]!;
    const n = m[2]!;
    const id = `nist-rmf-${fn.toLowerCase()}-${n}`;
    if (out.has(id)) continue;
    const first = text.split(/(?<=\.)\s/)[0] ?? text;
    out.set(id, {
      id,
      label: `NIST AI RMF ${fn} ${n}`,
      title: clip(first.replace(/\.$/, ""), 160),
      url: "https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf",
      framework: "NIST AI RMF",
      text: clip(text),
    });
  }
  return [...out.values()];
}

const stripMd = (s: string) => squash(s.replace(/\*\*/g, "").replace(/`/g, ""));

function tableRows(md: string, heading: RegExp): string[][] {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) return [];
  const rows: string[][] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (/^##\s/.test(l)) break;
    if (!l.startsWith("|") || /^\|[\s-|]+\|$/.test(l)) continue;
    rows.push(l.split("|").slice(1, -1).map((c) => stripMd(c)));
  }
  return rows.slice(1);
}

function expand(range: string): string[] {
  const m = /^(\d+)\.(\d+)(?:\s*[–-]\s*(\d+)\.(\d+))?$/.exec(range.trim());
  if (!m) return [];
  const major = Number(m[1]);
  const from = Number(m[2]);
  const to = m[3] ? Number(m[4]) : from;
  const out: string[] = [];
  for (let n = from; n <= to; n++) out.push(`${major}.${n}`);
  return out;
}

/** ISO/IEC 27001 Annex A — ids with warden's authored theme as the title. No ISO text. */
export function parseIso27001(md: string): IndexedProvision[] {
  const out: IndexedProvision[] = [];
  for (const [theme, ranges] of tableRows(md, /Annex A reference controls/)) {
    if (!theme || !ranges) continue;
    for (const r of ranges.split(/,\s*/)) {
      for (const c of expand(r)) {
        out.push({
          id: `iso27001-a${c}`,
          label: `ISO/IEC 27001 A.${c}`,
          title: theme,
          url: "https://www.iso.org/standard/27001",
          framework: "ISO/IEC 27001",
          text: `ISO/IEC 27001:2022 Annex A control ${c} (theme: ${theme}). Control text not reproduced — copyright ISO/IEC.`,
        });
      }
    }
  }
  return out;
}

/** ISO/IEC 27001 management-system clauses the analyzer cites, as `iso27001-<clause>`. */
export const ISO27001_CLAUSES = ["6.1.2", "9.2"];

/** Clause ids + warden's authored requirement summary as the title (from the clauses 4–10 table). No ISO text. */
export function parseIso27001Clauses(md: string, wanted = ISO27001_CLAUSES): IndexedProvision[] {
  const rows = tableRows(md, /Key requirements \(management-system clauses 4–10\)/);
  const inRange = (c: string, range: string) => {
    const [from, to = from] = range.split(/\s*[–-]\s*/).map((x) => x.trim().split(".").map(Number));
    const n = c.split(".").map(Number);
    const cmp = (x: number[], y: number[]) => {
      for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
      return 0;
    };
    return cmp(n, from!) >= 0 && cmp(n, to!) <= 0;
  };
  const out: IndexedProvision[] = [];
  for (const c of wanted) {
    const row = rows.find((r) => r[2] && inRange(c, r[2]));
    if (!row) throw new Error(`ISO 27001 clause ${c} not found in warden's clauses table`);
    const title = squash(row[1]!.replace(/\*\*/g, "").replace(/\s*\([^)]*\)/g, ""));
    out.push({
      id: `iso27001-${c}`,
      label: `ISO/IEC 27001 cl. ${c}`,
      title,
      url: "https://www.iso.org/standard/27001",
      framework: "ISO/IEC 27001",
      text: `ISO/IEC 27001:2022 clause ${c} (requirement area: ${title}). Clause text not reproduced — copyright ISO/IEC.`,
    });
  }
  return out;
}

export function parseIso42001(md: string): IndexedProvision[] {
  const out: IndexedProvision[] = [];
  for (const [group, theme] of tableRows(md, /Annex A control groups/)) {
    if (!group || !theme || !/^A\.\d+$/.test(group)) continue;
    out.push({
      id: `iso42001-${group.toLowerCase()}`,
      label: `ISO/IEC 42001 ${group}`,
      title: theme.split(" — ")[0] ?? theme,
      url: "https://www.iso.org/standard/42001",
      framework: "ISO/IEC 42001",
      text: `ISO/IEC 42001:2023 Annex A control group ${group}: ${theme}. Control text not reproduced — copyright ISO/IEC.`,
    });
  }
  for (const [, area, clause] of tableRows(md, /Key requirements \(clauses 4–10\)/)) {
    if (!area || !clause) continue;
    const id = clause.split(/[–-]/)[0]!.trim();
    out.push({
      id: `iso42001-${id}`,
      label: `ISO/IEC 42001 cl. ${clause}`,
      title: area.split(";")[0]!,
      url: "https://www.iso.org/standard/42001",
      framework: "ISO/IEC 42001",
      text: `ISO/IEC 42001:2023 clause ${clause}: ${area}. Clause text not reproduced — copyright ISO/IEC.`,
    });
  }
  return out;
}

export function parseSoc2(md: string): IndexedProvision[] {
  const out: IndexedProvision[] = [];
  for (const [ids, area] of tableRows(md, /Criteria structure/)) {
    if (!ids || !area) continue;
    const series = /^([A-Z]+\d*)/.exec(ids)?.[1];
    if (!series) continue;
    const title = area.split(" — ")[0] ?? area;
    out.push({
      id: `soc2-${series.toLowerCase()}`,
      label: `SOC 2 ${ids.replace(/–/g, "–")}`,
      title,
      url: "https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022",
      framework: "SOC 2",
      text: `AICPA Trust Services Criteria ${ids}: ${area}. Criteria text not reproduced — copyright AICPA.`,
    });
  }
  return out;
}

export function parseOwasp(md: string): IndexedProvision[] {
  const out: IndexedProvision[] = [];
  const re = /LLM(\d{2}):2025 ([A-Z][A-Za-z ]+?)(?= ·|\.\s*$|$)/gm;
  for (const m of squash(md).matchAll(re)) {
    out.push({
      id: `owasp-llm${m[1]}`,
      label: `OWASP LLM${m[1]}:2025`,
      title: m[2]!.trim(),
      url: "https://genai.owasp.org/llm-top-10/",
      framework: "OWASP LLM Top 10",
      text: `OWASP Top 10 for LLM Applications 2025 — LLM${m[1]}: ${m[2]!.trim()}.`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// EUR-Lex XHTML (CELLAR). Both layouts are handled: OJ acts (`oj-ti-art` / `oj-sti-art`) and
// consolidated texts (`title-article-norm` / `stitle-article-norm`, with ▼M amendment markers).

export interface XEl {
  tag: string;
  attrs: Record<string, string>;
  children: XNode[];
  parent?: XEl;
}
export type XNode = XEl | string;

const VOID = new Set(["br", "hr", "img", "col", "meta", "link", "input", "area", "base", "wbr"]);
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
      : (ENTITIES[e.toLowerCase()] ?? m),
  );

/** Minimal well-formed-XHTML tree builder (CELLAR serves XHTML). */
export function parseXhtml(src: string): XEl {
  const root: XEl = { tag: "#root", attrs: {}, children: [] };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
  let last = 0;
  for (const m of src.matchAll(re)) {
    if (m.index! > last) cur.children.push(decode(src.slice(last, m.index)));
    last = m.index! + m[0].length;
    const tag = m[2]?.toLowerCase();
    if (!tag) continue;
    if (m[1]) {
      for (let e: XEl | undefined = cur; e && e !== root; e = e.parent) {
        if (e.tag === tag) {
          cur = e.parent!;
          break;
        }
      }
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of (m[3] ?? "").matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g)) {
      attrs[a[1]!.toLowerCase()] = decode(a[2] ?? a[3] ?? "");
    }
    const el: XEl = { tag, attrs, children: [], parent: cur };
    cur.children.push(el);
    if (!m[4] && !VOID.has(tag)) cur = el;
  }
  if (last < src.length) cur.children.push(decode(src.slice(last)));
  return root;
}

const isEl = (n: XNode): n is XEl => typeof n !== "string";
const hasClass = (e: XEl, ...cls: string[]) => (e.attrs.class ?? "").split(/\s+/).some((c) => cls.includes(c));
const elements = (e: XEl) => e.children.filter(isEl);

function* descendants(e: XEl): Generator<XEl> {
  for (const c of elements(e)) {
    yield c;
    yield* descendants(c);
  }
}

const SKIP_TEXT = new Set(["script", "style", "head"]);

/** Text of an element, block boundaries as spaces; amendment markers (▼B, ▼M2) dropped. */
export function textOf(n: XNode): string {
  if (!isEl(n)) return n;
  if (SKIP_TEXT.has(n.tag) || hasClass(n, "modref")) return "";
  return n.children.map((c) => (isEl(c) && c.tag !== "span" && c.tag !== "a" && c.tag !== "sup" ? ` ${textOf(c)} ` : textOf(c))).join("");
}

const ART_HEAD = ["oj-ti-art", "title-article-norm"];
const ART_TITLE = ["oj-sti-art", "stitle-article-norm"];
const containsHead = (e: XEl) => hasClass(e, ...ART_HEAD) || [...descendants(e)].some((d) => hasClass(d, ...ART_HEAD));

export interface RawArticle {
  /** "34", "15a", or the annex number ("I", "" for a lone ANNEX). */
  num: string;
  kind: "article" | "annex";
  title: string;
  paras: string[];
  /** EUR-Lex anchor (element id), e.g. `art_34`, `anx_I`. */
  anchor: string;
}

const paraTexts = (els: XEl[]) => els.map((e) => squash(textOf(e))).filter(Boolean);

/** Articles + annexes of a directly-applicable act (OJ or consolidated layout). */
export function eurlexArticles(doc: XEl): RawArticle[] {
  const out: RawArticle[] = [];
  for (const e of descendants(doc)) {
    const id = e.attrs.id ?? "";
    const art = /^art_(\d+[a-z]?)$/.exec(id);
    if (art && hasClass(e, "eli-subdivision")) {
      const kids = elements(e);
      const titleEl = [...descendants(e)].find((d) => hasClass(d, ...ART_TITLE));
      const body = kids.filter(
        (k) => !hasClass(k, ...ART_HEAD, "eli-title", "modref") && !(titleEl && (k === titleEl || [...descendants(k)].includes(titleEl))),
      );
      out.push({ num: art[1]!, kind: "article", title: titleEl ? squash(textOf(titleEl)) : "", paras: paraTexts(body), anchor: id });
      continue;
    }
    if (/^anx_/.test(id) && hasClass(e, "eli-container")) {
      const kids = elements(e);
      const heads = kids.filter((k) => hasClass(k, "oj-doc-ti"));
      const num = /^ANNEX\s*([IVXLC]+)?\b/i.exec(squash(textOf(heads[0] ?? e)))?.[1] ?? "";
      const title = heads[1] ? squash(textOf(heads[1])) : "Annex";
      out.push({ num, kind: "annex", title, paras: paraTexts(kids.filter((k) => !heads.includes(k))), anchor: id });
    }
  }
  return out;
}

/** Articles an amending act inserts or replaces (`‘Article 45 …’`) inside its own `art_<n>`. */
export function eurlexInsertedArticles(doc: XEl, inArticle = "art_1"): RawArticle[] {
  const host = [...descendants(doc)].find((e) => e.attrs.id === inArticle && hasClass(e, "eli-subdivision"));
  if (!host) throw new Error(`amending act has no ${inArticle}`);
  const out: RawArticle[] = [];
  for (const h of descendants(host)) {
    if (!hasClass(h, "oj-ti-art") || h.parent === host) continue;
    const num = /^‘?\s*Article\s+(\d+[a-z]?)$/i.exec(squash(textOf(h)))?.[1];
    if (!num) continue;
    const sibs = elements(h.parent!);
    let i = sibs.indexOf(h) + 1;
    let title = "";
    const t = sibs[i];
    if (t && (hasClass(t, "oj-sti-art") || hasClass(t, "eli-title"))) {
      title = squash(textOf(t));
      i++;
    }
    const body: XEl[] = [];
    for (; i < sibs.length && !containsHead(sibs[i]!); i++) body.push(sibs[i]!);
    const paras = paraTexts(body);
    if (paras.length) paras[paras.length - 1] = paras[paras.length - 1]!.replace(/\s*’\s*[;.,]?$/, "");
    out.push({ num, kind: "article", title: title.replace(/[’;]+$/, ""), paras, anchor: inArticle });
  }
  return out;
}

/** Cap-bearing paragraphs ("6 %", "EUR 15 000 000", "Article 83 of Regulation (EU) 2016/679"). */
const CAP = /\d\s?%|EUR\s?\d|Article 83/;

/**
 * A verbatim excerpt of whole paragraphs (≤ max chars). For penalty articles the paragraphs
 * carrying the caps are always kept; skipped paragraphs are marked with " … ".
 */
export function excerpt(paras: string[], penalty: boolean, max = EURLEX_TEXT_CHARS): string {
  const full = paras.join(" ");
  if (full.length <= max) return full;
  const keep = new Set<number>();
  if (penalty) paras.forEach((p, i) => CAP.test(p) && keep.add(i));
  if (!keep.size) return clip(full, max - 1);
  const render = (ks: Set<number>) => {
    const idx = [...ks].sort((a, b) => a - b);
    return idx.map((k, j) => (j === 0 ? (k > 0 ? "… " : "") : k === idx[j - 1]! + 1 ? " " : " … ") + paras[k]).join("");
  };
  for (let i = 0; i < paras.length; i++) {
    if (keep.has(i)) continue;
    const next = new Set([...keep, i]);
    if (render(next).length > max) break;
    keep.add(i);
  }
  return clip(render(keep), max - 1);
}

export interface EurlexAct {
  celex: string;
  prefix: string;
  short: string;
  /** `inserts`: take the articles the act's Article 1 inserts/replaces in the act it amends. */
  mode: "act" | "inserts";
  penalties: string[];
  annexes?: boolean;
}

export const EURLEX_ACTS: EurlexAct[] = [
  { celex: "32022R2065", prefix: "dsa", short: "DSA", mode: "act", penalties: ["52", "74", "76"] },
  { celex: "32022R1925", prefix: "dma", short: "DMA", mode: "act", penalties: ["30", "31"], annexes: true },
  { celex: "32024R2847", prefix: "cra", short: "CRA", mode: "act", penalties: ["64"], annexes: true },
  { celex: "32023R2854", prefix: "data-act", short: "Data Act", mode: "act", penalties: ["40"] },
  { celex: "02002L0058-20091219", prefix: "eprivacy", short: "ePrivacy", mode: "act", penalties: ["15a"] },
  { celex: "32024R1183", prefix: "eidas2", short: "eIDAS 2", mode: "inserts", penalties: ["16"] },
  { celex: "32022L2464", prefix: "csrd", short: "CSRD", mode: "inserts", penalties: [] },
];

export const eurlexUrl = (celex: string, anchor: string) =>
  `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celex}#${anchor}`;

export function parseEurlexAct(xhtml: string, act: EurlexAct): IndexedProvision[] {
  const doc = parseXhtml(xhtml);
  const raw = act.mode === "inserts" ? eurlexInsertedArticles(doc) : eurlexArticles(doc).filter((a) => a.kind === "article" || act.annexes);
  const out: IndexedProvision[] = [];
  const seen = new Set<string>();
  for (const a of raw) {
    const art = a.kind === "article";
    const id = art ? `${act.prefix}-${a.num}` : `${act.prefix}-annex${a.num ? `-${a.num.toLowerCase()}` : ""}`;
    if (seen.has(id)) throw new Error(`${act.short}: duplicate ${id}`);
    seen.add(id);
    out.push({
      id,
      label: art ? `${act.short} Art. ${a.num}` : `${act.short} Annex${a.num ? ` ${a.num}` : ""}`,
      title: a.title,
      url: eurlexUrl(act.celex, a.anchor),
      framework: act.short,
      text: excerpt(a.paras, art && act.penalties.includes(a.num)),
    });
  }
  return out;
}

const CELLAR = "http://publications.europa.eu/resource/celex";

async function eurlexXhtml(celex: string): Promise<string> {
  const dir = process.env.EURLEX_DIR || path.join(CACHE, "eurlex");
  const file = path.join(dir, `${celex}.xhtml`);
  if (!existsSync(file)) {
    const res = await fetch(`${CELLAR}/${celex}`, {
      headers: { Accept: "application/xhtml+xml", "Accept-Language": "en", "User-Agent": "dg-roast-corpus-builder" },
    });
    const body = await res.text();
    if (!res.ok || !body.includes("eli-subdivision")) throw new Error(`CELLAR ${celex}: HTTP ${res.status}, not an act XHTML`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, body);
  }
  return readFileSync(file, "utf8");
}

// ---------------------------------------------------------------------------------------------
// Lock: every provision ever published keeps its id and content.

export const LOCK_FILE = path.join(ROOT, "corpus", "provisions.lock.json");

export const provisionHash = (p: IndexedProvision) =>
  createHash("sha256").update(JSON.stringify([p.id, p.label, p.title, p.url, p.framework, p.text])).digest("hex").slice(0, 16);

/** Locked ids that are missing or whose content changed. */
export function lockViolations(lock: Record<string, string>, provisions: IndexedProvision[]): string[] {
  const byId = new Map(provisions.map((p) => [p.id, p]));
  return Object.entries(lock)
    .filter(([id, h]) => {
      const p = byId.get(id);
      return !p || provisionHash(p) !== h;
    })
    .map(([id]) => id);
}

async function main(): Promise<void> {
  const euAiAct = checkout("EU-AI-Act", "https://github.com/bioztar/EU-AI-Act.git", "EU_AI_ACT_DIR");
  const warden = checkout("warden", "https://github.com/bioztar/warden.git", "WARDEN_DIR", wardenBranch());
  const read = (...p: string[]) => readFileSync(path.join(...p), "utf8");

  const acts: [string, EuAct][] = [
    [path.join(euAiAct, "corpus/act/regulation-eu-2024-1689.md"), { file: "", prefix: "ai-act", short: "AI Act", celex: "32024R1689" }],
    [path.join(warden, "corpus/eu-law/gdpr-regulation-2016-679.md"), { file: "", prefix: "gdpr", short: "GDPR", celex: "32016R0679" }],
    [path.join(warden, "corpus/eu-law/nis2-directive-2022-2555.md"), { file: "", prefix: "nis2", short: "NIS2", celex: "32022L2555" }],
    [path.join(warden, "corpus/eu-law/dora-regulation-2022-2554.md"), { file: "", prefix: "dora", short: "DORA", celex: "32022R2554" }],
  ];
  const all: IndexedProvision[] = [];
  for (const [file, act] of acts) all.push(...parseEuAct(readFileSync(file, "utf8"), act));
  all.push(...parseNistRmf(read(warden, "corpus/nist/nist-ai-100-1.md")));
  all.push(...parseIso27001(read(warden, "frameworks/iso-27001.md")));
  all.push(...parseIso27001Clauses(read(warden, "frameworks/iso-27001.md")));
  all.push(...parseIso42001(read(warden, "frameworks/iso-42001.md")));
  all.push(...parseSoc2(read(warden, "frameworks/soc2.md")));
  all.push(...parseOwasp(read(warden, "corpus/standards/owasp-llm-top10.md")));
  for (const act of EURLEX_ACTS) all.push(...parseEurlexAct(await eurlexXhtml(act.celex), act));

  const lock: Record<string, string> = existsSync(LOCK_FILE) ? JSON.parse(readFileSync(LOCK_FILE, "utf8")) : {};
  const broken = lockViolations(lock, all);
  if (broken.length) throw new Error(`existing provisions removed or changed (see corpus/provisions.lock.json): ${broken.join(", ")}`);
  for (const p of all) lock[p.id] ??= provisionHash(p);
  writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 1)}\n`);

  const counts: Record<string, number> = {};
  for (const p of all) counts[p.framework] = (counts[p.framework] ?? 0) + 1;
  const outFile = path.join(ROOT, "corpus", "provisions.json");
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify({ builtAt: new Date().toISOString().slice(0, 10), counts, provisions: all }, null, 1)}\n`);
  console.log(`wrote ${all.length} provisions to corpus/provisions.json`, counts);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
