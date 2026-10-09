/**
 * Loads the vendored skills (skills/{eu-ai-act,warden}) and parses the structured parts the
 * pipeline runs on: checklists, the overlap matrix, timelines, penalty tables, disclaimers.
 * Narrative references (classifier trees, applicability rules, handoff) are passed to the model
 * verbatim as method — the skills stay the source of truth.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { citationsIn, type Framework, type ProvisionIndex } from "./provisions.js";
import type { ChecklistName, Citation, Severity, SkillName } from "./types.js";

export const SKILLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "skills");

export interface ChecklistItem {
  skill: SkillName;
  checklist: ChecklistName;
  id: string;
  title: string;
  /** Full item text from the skill (question, evidence hint, consequence). */
  body: string;
  section: string;
  /** Severity fixed by the skill; null when the checklist leaves it to the assessor. */
  severity: Severity | null;
  citations: Citation[];
  frameworks: string[];
}

export interface OverlapDef {
  id: string;
  theme: string;
  description: string;
  cells: { framework: Framework; text: string; citations: Citation[] }[];
}

export interface DeadlineDef {
  date: string;
  framework: string;
  event: string;
  source: string;
  citations: Citation[];
  kind: "milestone" | "clock" | "in-article";
}

export interface PenaltyDef {
  framework: string;
  key: string;
  cap: string;
  basis: string;
  citations: Citation[];
}

export interface Skills {
  doc: (skill: SkillName, rel: string) => string;
  checklist: (skill: SkillName, name: ChecklistName) => ChecklistItem[];
  overlap: OverlapDef[];
  deadlines: DeadlineDef[];
  penalties: PenaltyDef[];
  disclaimer: { "eu-ai-act": string; warden: string };
}

const WARDEN_ONLY = (fw: string) => fw !== "AI Act";
const AI_ACT_ONLY = (fw: string) => fw === "AI Act";

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}
const strip = (s: string) => s.replace(/\*\*|\*|`/g, "").trim();

function sevFrom(s: string): Severity | null {
  const m = /\b(critical|high|medium|low)\b/i.exec(s);
  return m ? (m[1]!.toLowerCase() as Severity) : null;
}

function frameworksNamed(text: string): string[] {
  const out = new Set<string>();
  const pairs: [RegExp, string][] = [
    [/\bGDPR\b/, "GDPR"],
    [/\bNIS\s?2\b/, "NIS2"],
    [/\bDORA\b/, "DORA"],
    [/27001/, "ISO/IEC 27001"],
    [/42001/, "ISO/IEC 42001"],
    [/\bSOC\s?2\b/, "SOC 2"],
    [/\bNIST\b/, "NIST AI RMF"],
    [/\bOWASP\b|\bLLM\d{2}\b/, "OWASP LLM Top 10"],
  ];
  for (const [re, fw] of pairs) if (re.test(text)) out.add(fw);
  return [...out];
}

function parseEuChecklist(md: string, name: ChecklistName, index: ProvisionIndex): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  let section = "";
  for (const line of md.split("\n")) {
    const h = /^##\s+(.+)/.exec(line);
    if (h) {
      section = h[1]!.trim();
      continue;
    }
    const m = /^- \[ \] \*\*([A-Z]\d+)\.\s*(.+?)\*\*:?\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, id, title, rest] = m as unknown as [string, string, string, string];
    const body = `${title} ${rest}`.trim();
    const sev =
      sevFrom(section) ??
      (/gate/i.test(section) ? "critical" : /red flag|classification/i.test(section) ? "high" : /bill|estimate/i.test(section) ? "medium" : null);
    items.push({
      skill: "eu-ai-act",
      checklist: name,
      id,
      title: strip(title).replace(/[?:]$/, ""),
      body: strip(body),
      section,
      severity: sev,
      citations: citationsIn(body, "AI Act", index, AI_ACT_ONLY, "prose").concat(
        ...[...body.matchAll(/(?<![\w)])\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)]
          .map((g) => g[1]!)
          .filter((g) => /^\s*(?:Arts?\.?\s*)?\d/.test(g))
          .map((g) => citationsIn(g, "AI Act", index, AI_ACT_ONLY)),
      ).filter((c, i, a) => a.findIndex((x) => x.display === c.display) === i),
      frameworks: ["AI Act"],
    });
  }
  return items;
}

function parseWardenChecklist(md: string, name: ChecklistName, index: ProvisionIndex): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  let section = "";
  let header: string[] = [];
  for (const line of md.split("\n")) {
    const h = /^##\s+(.+)/.exec(line);
    if (h) section = h[1]!.trim();
    if (!line.startsWith("|")) continue;
    const c = cells(line);
    if (c[0] === "#") {
      header = c.map((x) => x.toLowerCase());
      continue;
    }
    if (!/^[A-Z]\d+$/.test(c[0] ?? "")) continue;
    const citeCol = header.findIndex((x) => x.startsWith("citation"));
    const sevCol = header.findIndex((x) => x.startsWith("sev"));
    const cite = c[citeCol >= 0 ? citeCol : c.length - 1] ?? "";
    const body = c
      .slice(1)
      .map((x, k) => (k + 1 === citeCol ? "" : header[k + 1] ? `${header[k + 1]}: ${x}` : x))
      .filter(Boolean)
      .join(" · ");
    items.push({
      skill: "warden",
      checklist: name,
      id: c[0]!,
      title: strip(c[1] ?? ""),
      body: strip(body),
      section,
      severity: sevCol >= 0 ? sevFrom(c[sevCol] ?? "") : null,
      citations: citationsIn(cite, null, index, WARDEN_ONLY),
      frameworks: frameworksNamed(`${cite} ${c[1] ?? ""}`),
    });
  }
  return items;
}

const OVERLAP_COLS: Record<string, Framework> = {
  gdpr: "GDPR",
  nis2: "NIS2",
  dora: "DORA",
  "27001": "ISO/IEC 27001",
  "42001": "ISO/IEC 42001",
  "soc 2": "SOC 2",
  "nist ai rmf": "NIST AI RMF",
};

function parseOverlap(md: string, index: ProvisionIndex): OverlapDef[] {
  const out: OverlapDef[] = [];
  let header: string[] = [];
  for (const line of md.split("\n")) {
    if (!line.startsWith("|")) continue;
    const c = cells(line);
    if (c[0] === "#") header = c.map((x) => x.toLowerCase());
    if (!/^O\d+$/.test(c[0] ?? "")) continue;
    const [theme, ...desc] = (c[1] ?? "").split(/\s+—\s+/);
    const row: OverlapDef = { id: c[0]!, theme: strip(theme ?? ""), description: strip(desc.join(" — ")), cells: [] };
    header.forEach((h, k) => {
      const fw = OVERLAP_COLS[h];
      const text = c[k] ?? "";
      if (!fw || !text || text === "—" || /^\*?via\b/i.test(text)) return;
      const citations = citationsIn(text.replace(/\*/g, ""), fw, index, WARDEN_ONLY);
      // Also catch "OWASP LLM01–10" style mentions inside other columns.
      row.cells.push({ framework: fw, text: strip(text), citations });
    });
    const owasp = citationsIn(c.join(" ; "), null, index, (f) => f === "OWASP LLM Top 10");
    if (owasp.length) row.cells.push({ framework: "OWASP LLM Top 10", text: owasp.map((o) => o.display).join(", "), citations: owasp });
    out.push(row);
  }
  return out;
}

function tableRows(md: string, from: RegExp, to = /^##\s/): string[][] {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => from.test(l));
  if (start < 0) return [];
  const rows: string[][] = [];
  for (const l of lines.slice(start + 1)) {
    if (to.test(l)) break;
    if (l.startsWith("|") && !/^\|\s*-/.test(l)) rows.push(cells(l));
  }
  return rows.slice(1);
}

const fwKey = (s: string): Framework | null => {
  if (/GDPR/.test(s)) return "GDPR";
  if (/NIS\s?2/.test(s)) return "NIS2";
  if (/DORA/.test(s)) return "DORA";
  if (/27001/.test(s)) return "ISO/IEC 27001";
  if (/42001/.test(s)) return "ISO/IEC 42001";
  if (/SOC/.test(s)) return "SOC 2";
  if (/NIST/.test(s)) return "NIST AI RMF";
  if (/OWASP/.test(s)) return "OWASP LLM Top 10";
  return null;
};

function parseDeadlines(eu: string, euPen: string, warden: string, index: ProvisionIndex): DeadlineDef[] {
  const out: DeadlineDef[] = [];
  for (const [date, what, src] of tableRows(eu, /^## Binding milestones/))
    out.push({ date: strip(date ?? ""), framework: "AI Act", event: strip(what ?? ""), source: src ?? "", citations: citationsIn(src ?? "", "AI Act", index, AI_ACT_ONLY), kind: "milestone" });
  for (const [date, what, src] of tableRows(eu, /^## In-article deadlines/))
    out.push({ date: strip(date ?? ""), framework: "AI Act", event: strip(what ?? ""), source: src ?? "", citations: citationsIn(src ?? "", "AI Act", index, AI_ACT_ONLY), kind: "in-article" });
  void euPen;
  for (const [date, fw, what, src] of tableRows(warden, /^## 1\. Application dates/)) {
    const f = fwKey(fw ?? "");
    if (f) out.push({ date: strip(date ?? ""), framework: f, event: strip(what ?? ""), source: src ?? "", citations: citationsIn(src ?? "", f, index, WARDEN_ONLY), kind: "milestone" });
  }
  for (const [clock, fw, what, src] of tableRows(warden, /^## 2\. Incident & request clocks/)) {
    const f = fwKey(fw ?? "");
    if (f && f !== "SOC 2") out.push({ date: strip(clock ?? ""), framework: f, event: strip(what ?? ""), source: src ?? "", citations: citationsIn(src ?? "", f, index, WARDEN_ONLY), kind: "clock" });
  }
  return out;
}

function parsePenalties(euPen: string, warden: string, index: ProvisionIndex): PenaltyDef[] {
  const out: PenaltyDef[] = [];
  const keys = ["prohibited", "operator", "information"];
  tableRows(euPen, /^## 1\. Fine tiers/).forEach(([violation, cap, cite], k) => {
    out.push({ framework: "AI Act", key: keys[k] ?? `row${k}`, cap: strip(cap ?? ""), basis: strip(violation ?? ""), citations: citationsIn(cite ?? "", "AI Act", index, AI_ACT_ONLY) });
  });
  const gpai = /up to \*\*(€[^*]+)\*\*/.exec(euPen.slice(euPen.indexOf("## 3. GPAI")));
  if (gpai) out.push({ framework: "AI Act", key: "gpai", cap: gpai[1]!, basis: "GPAI model providers (Commission fines)", citations: citationsIn("Art. 101", "AI Act", index, AI_ACT_ONLY, "prose") });
  const head = tableRows(warden, /^## 1\. Binding law/);
  const lines = warden.split("\n");
  const hdr = lines.find((l) => /^\|\s*\|\s*GDPR/.test(l));
  const cols = hdr ? cells(hdr) : [];
  const fine = head.find((r) => /max administrative fine/i.test(r[0] ?? ""));
  if (fine)
    cols.forEach((col, k) => {
      const f = fwKey(col);
      if (!f || !fine[k]) return;
      out.push({ framework: f, key: "fine", cap: strip(fine[k]!), basis: "Max administrative fine", citations: citationsIn(fine[k]!, f, index, WARDEN_ONLY, "prose") });
    });
  for (const [fw, what] of tableRows(warden, /^## 2\. Voluntary standards/)) {
    for (const part of (fw ?? "").split(",")) {
      const f = fwKey(part.includes("42001") ? "42001" : part);
      if (f) out.push({ framework: f, key: "voluntary", cap: "No statutory fine", basis: strip(what ?? ""), citations: [] });
    }
  }
  return out;
}

function quoteBlockAfter(md: string, startsWith: string): string {
  const lines = md.split("\n");
  const i = lines.findIndex((l) => l.startsWith(`> ${startsWith}`));
  if (i < 0) return "";
  const out: string[] = [];
  for (const l of lines.slice(i)) {
    if (!l.startsWith(">")) break;
    out.push(l.replace(/^>\s?/, ""));
  }
  return out.join(" ").trim();
}

const CHECKLISTS: Record<SkillName, ChecklistName[]> = {
  "eu-ai-act": ["product-idea", "design-doc", "codebase"],
  warden: ["product-idea", "design-doc", "codebase", "vendor-assessment"],
};

export function loadSkills(index: ProvisionIndex, dir = SKILLS_DIR): Skills {
  const cache = new Map<string, string>();
  const doc = (skill: SkillName, rel: string) => {
    const p = join(dir, skill, rel);
    if (!cache.has(p)) cache.set(p, readFileSync(p, "utf8"));
    return cache.get(p)!;
  };
  const lists = new Map<string, ChecklistItem[]>();
  for (const skill of Object.keys(CHECKLISTS) as SkillName[])
    for (const name of CHECKLISTS[skill]) {
      const md = doc(skill, `references/checklists/${name}.md`);
      lists.set(`${skill}:${name}`, skill === "eu-ai-act" ? parseEuChecklist(md, name, index) : parseWardenChecklist(md, name, index));
    }
  const euTimeline = doc("eu-ai-act", "references/timeline.md");
  const euPen = doc("eu-ai-act", "references/penalties-enforcement.md");
  const wTimeline = doc("warden", "references/timeline.md");
  const wPen = doc("warden", "references/penalties-enforcement.md");
  const wardenDisclaimer = quoteBlockAfter(doc("warden", "references/report-template.md"), "Informational analysis");
  const euDisclaimer = /\*(Informational analysis, not legal advice\.)\*/.exec(doc("eu-ai-act", "references/report-template.md"))?.[1] ?? "Informational analysis, not legal advice.";
  return {
    doc,
    checklist: (skill, name) => lists.get(`${skill}:${name}`) ?? [],
    overlap: parseOverlap(doc("warden", "references/overlap-matrix.md"), index),
    deadlines: parseDeadlines(euTimeline, euPen, wTimeline, index),
    penalties: parsePenalties(euPen, wPen, index),
    disclaimer: { "eu-ai-act": euDisclaimer, warden: wardenDisclaimer },
  };
}
