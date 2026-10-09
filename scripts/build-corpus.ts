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
 *
 * ISO/IEC 27001, ISO/IEC 42001 and SOC 2 are copyrighted: only control ids and warden's own
 * authored descriptions go in, never standard text. Run: `npm run build:corpus`.
 */
import { execFileSync } from "node:child_process";
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

function main(): void {
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
  all.push(...parseIso42001(read(warden, "frameworks/iso-42001.md")));
  all.push(...parseSoc2(read(warden, "frameworks/soc2.md")));
  all.push(...parseOwasp(read(warden, "corpus/standards/owasp-llm-top10.md")));

  const counts: Record<string, number> = {};
  for (const p of all) counts[p.framework] = (counts[p.framework] ?? 0) + 1;
  const outFile = path.join(ROOT, "corpus", "provisions.json");
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify({ builtAt: new Date().toISOString().slice(0, 10), counts, provisions: all }, null, 1)}\n`);
  console.log(`wrote ${all.length} provisions to corpus/provisions.json`, counts);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
