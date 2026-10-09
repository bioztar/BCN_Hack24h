import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isMap, isSeq, parse, parseDocument } from "yaml";

export const TRIGGERS = ["text", "dictation", "repo", "any"] as const;
export const SPEAKERS = ["formblatt", "annexe", "both"] as const;
export const KNOWN_FINDINGS = [
  "no-license",
  "env-tracked",
  "llm-sdk",
  "no-security-md",
  "no-privacy-policy",
  "analytics-sdk",
  "no-tests",
  "no-readme",
  "secrets-in-history",
  "telemetry",
] as const;

export interface Gag {
  id: string;
  tier: number;
  trigger: (typeof TRIGGERS)[number];
  finding?: string;
  speaker: (typeof SPEAKERS)[number];
  line: string;
  provision: string;
  verified: boolean;
  source: string;
  checked?: string;
}

export type Framework = "AI-Act" | "GDPR" | "NIS2" | "DORA" | "ISO27001" | "ISO42001" | "SOC2";

export type ParsedProvision =
  | { framework: "AI-Act" | "GDPR" | "NIS2" | "DORA"; kind: "article"; article: number; para?: number; point?: string }
  | { framework: "AI-Act" | "GDPR" | "NIS2" | "DORA"; kind: "annex"; annex: string; point?: number }
  | { framework: "AI-Act" | "GDPR" | "NIS2" | "DORA"; kind: "recital"; recital: number }
  | { framework: "ISO27001" | "ISO42001" | "SOC2"; kind: "control"; control: string };

const EU_RE =
  /^(AI-Act|GDPR|NIS2|DORA) (?:Art\. (\d+)(?:\((\d+)\))?(?:\(([a-z]{1,3})\))?|Annex ([IVX]+)(?:\((\d+)\))?|Recital (\d+))$/;
const CONTROL_RE = /^(ISO27001 A\.[5-8]\.\d{1,2}|ISO42001 A\.\d{1,2}\.\d{1,2}(?:\.\d{1,2})?|SOC2 (?:CC|PI|A|C|P)\d\.\d{1,2})$/;

export function parseProvision(p: string): ParsedProvision | undefined {
  const m = EU_RE.exec(p);
  if (m) {
    const framework = m[1] as "AI-Act";
    if (m[2]) return { framework, kind: "article", article: +m[2], para: m[3] ? +m[3] : undefined, point: m[4] };
    if (m[5]) return { framework, kind: "annex", annex: m[5], point: m[6] ? +m[6] : undefined };
    return { framework, kind: "recital", recital: +m[7]! };
  }
  if (CONTROL_RE.test(p)) {
    const [fw, control] = p.split(" ") as [Framework, string];
    return { framework: fw as "SOC2", kind: "control", control };
  }
  return undefined;
}

export function validateGags(raw: unknown): { gags: Gag[]; errors: string[] } {
  const errors: string[] = [];
  const list = (raw as { gags?: unknown })?.gags;
  if (!Array.isArray(list)) return { gags: [], errors: ["gags.yaml: top-level `gags:` list missing"] };
  const seen = new Set<string>();
  for (const [i, g] of (list as Gag[]).entries()) {
    const w = `gags[${i}]${g?.id ? ` (${g.id})` : ""}`;
    if (!g?.id || !/^[a-z0-9][a-z0-9-]*$/.test(g.id)) errors.push(`${w}: bad id`);
    else if (seen.has(g.id)) errors.push(`${w}: duplicate id`);
    else seen.add(g.id);
    if (!Number.isInteger(g?.tier) || g.tier < 1 || g.tier > 5) errors.push(`${w}: tier must be 1–5`);
    if (!TRIGGERS.includes(g?.trigger)) errors.push(`${w}: trigger must be ${TRIGGERS.join("|")}`);
    if (g?.finding !== undefined && !/^[a-z0-9-]+$/.test(g.finding)) errors.push(`${w}: finding must be kebab-case`);
    if (g?.finding !== undefined && g.trigger !== "repo") errors.push(`${w}: finding only with trigger repo`);
    if (!SPEAKERS.includes(g?.speaker)) errors.push(`${w}: speaker must be ${SPEAKERS.join("|")}`);
    if (!g?.line || typeof g.line !== "string") errors.push(`${w}: line missing`);
    if (!g?.provision || !parseProvision(g.provision)) errors.push(`${w}: provision '${g?.provision}' not in a recognised format`);
    if (typeof g?.verified !== "boolean") errors.push(`${w}: verified must be true|false`);
    if (!g?.source || typeof g.source !== "string") errors.push(`${w}: source (file/URL checked) missing`);
  }
  return { gags: list as Gag[], errors };
}

const NB = "[\\s\\u00a0]";

interface Doc {
  path: string;
  label: string;
  lines: string[];
}

function loadDoc(path: string, label: string): Doc | undefined {
  return existsSync(path) ? { path, label, lines: readFileSync(path, "utf8").split("\n") } : undefined;
}

function section(lines: string[], start: RegExp, stop: RegExp): [number, number] | undefined {
  const s = lines.findIndex((l) => start.test(l));
  if (s < 0) return undefined;
  let e = s + 1;
  while (e < lines.length && !stop.test(lines[e]!)) e++;
  return [s, e];
}

function firstText(lines: string[], from: number, to: number): string {
  for (let i = from; i < to; i++) {
    const t = lines[i]!.replace(/^#+\s*/, "").trim();
    if (t) return t;
  }
  return "";
}

function findLine(lines: string[], from: number, to: number, re: RegExp): number {
  for (let i = from; i < to; i++) if (re.test(lines[i]!)) return i;
  return -1;
}

export interface Verification {
  verified: boolean;
  line?: number;
  checked: string;
}

export function verifyEu(doc: Doc, p: Exclude<ParsedProvision, { kind: "control" }>): Verification {
  const L = doc.lines;
  if (p.kind === "recital") {
    const i = findLine(L, 0, L.length, new RegExp(`^\\(${p.recital}\\)${NB}`));
    return i < 0 ? { verified: false, checked: `recital (${p.recital}) not found` } : { verified: true, line: i + 1, checked: `Recital ${p.recital}` };
  }
  if (p.kind === "annex") {
    const sec = section(L, new RegExp(`^#+ *ANNEX${NB}+${p.annex}${NB}*$`), new RegExp(`^#+ *ANNEX${NB}+[IVX]+${NB}*$`));
    if (!sec) return { verified: false, checked: `Annex ${p.annex} not found` };
    const title = firstText(L, sec[0] + 1, sec[1]);
    if (p.point === undefined) return { verified: true, line: sec[0] + 1, checked: `Annex ${p.annex} — ${title}` };
    const i = findLine(L, sec[0], sec[1], new RegExp(`^${p.point}\\.(?:${NB}|$)`));
    if (i < 0) return { verified: false, checked: `Annex ${p.annex} point ${p.point} not found` };
    return { verified: true, line: i + 1, checked: `Annex ${p.annex} — ${title} · ${L[i]!.trim().slice(0, 90)}` };
  }
  const sec = section(L, new RegExp(`^#+ *Article${NB}+${p.article}$`), new RegExp(`^#+ *(Article|ANNEX|CHAPTER|Section|SECTION)${NB}`));
  if (!sec) return { verified: false, checked: `Art. ${p.article} not found` };
  const title = firstText(L, sec[0] + 1, sec[1]);
  let from = sec[0];
  let to = sec[1];
  let at = sec[0];
  if (p.para !== undefined) {
    let i = findLine(L, from, to, new RegExp(`^${p.para}\\.(?:${NB}|$)`));
    if (i < 0 && p.point === undefined) i = findLine(L, from, to, new RegExp(`^\\(${p.para}\\)`));
    if (i < 0) return { verified: false, checked: `Art. ${p.article}(${p.para}) not found (${title})` };
    const next = findLine(L, i + 1, to, new RegExp(`^\\d+\\.(?:${NB}|$)`));
    from = i;
    to = next < 0 ? to : next;
    at = i;
  }
  if (p.point !== undefined) {
    const i = findLine(L, from, to, new RegExp(`^\\(${p.point}\\)`));
    if (i < 0) return { verified: false, checked: `Art. ${p.article}${p.para ? `(${p.para})` : ""}(${p.point}) not found (${title})` };
    at = i;
  }
  return { verified: true, line: at + 1, checked: `Art. ${p.article} — ${title}` };
}

/** Control ids listed (singly or as ranges like 5.1–5.37 / CC6.1–6.3) in warden's pointer + framework files. */
export function controlIds(text: string): Set<string> {
  const ids = new Set<string>();
  const re = /\b(CC|PI|A\.|A|C|P)?(\d{1,2})\.(\d{1,2})(?:\.(\d{1,2}))?(?:[–-](?:\1)?(?:(\d{1,2})\.)?(\d{1,2}))?/g;
  for (const m of text.matchAll(re)) {
    const pre = m[1] ?? "";
    const major = +m[2]!;
    const from = +m[3]!;
    if (m[4]) ids.add(`${pre}${major}.${from}.${m[4]}`);
    const toMajor = m[5] ? +m[5] : major;
    const to = m[6] && toMajor === major ? +m[6] : from;
    for (let n = from; n <= Math.min(to, from + 60); n++) ids.add(`${pre}${major}.${n}`);
  }
  return ids;
}

function gitRev(dir: string): string {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export interface Corpora {
  aiAct?: string;
  warden?: string;
}

export function makeVerifier(c: Corpora): ((p: ParsedProvision) => Verification & { source: string }) | undefined {
  if (!c.aiAct && !c.warden) return undefined;
  const docs: Partial<Record<Framework, Doc>> = {};
  if (c.aiAct) {
    const rev = gitRev(join(c.aiAct, ".."));
    docs["AI-Act"] = loadDoc(c.aiAct, `bioztar/EU-AI-Act@${rev}:corpus/act/regulation-eu-2024-1689.md`);
  }
  const pointer: Partial<Record<Framework, { label: string; ids: Set<string> }>> = {};
  if (c.warden) {
    const rev = gitRev(c.warden);
    const f = (p: string) => loadDoc(join(c.warden!, p), `bioztar/warden@${rev}:${p}`);
    docs.GDPR = f("corpus/eu-law/gdpr-regulation-2016-679.md");
    docs.NIS2 = f("corpus/eu-law/nis2-directive-2022-2555.md");
    docs.DORA = f("corpus/eu-law/dora-regulation-2022-2554.md");
    const ptr = (fw: Framework, files: string[]) => {
      const text = files.map((p) => (existsSync(join(c.warden!, p)) ? readFileSync(join(c.warden!, p), "utf8") : "")).join("\n");
      pointer[fw] = { label: files.map((p) => `bioztar/warden@${rev}:${p}`).join(" + "), ids: controlIds(text) };
    };
    ptr("ISO27001", ["corpus/standards/iso-iec-27001.md", "frameworks/iso-27001.md"]);
    ptr("ISO42001", ["corpus/standards/iso-iec-42001.md", "frameworks/iso-42001.md"]);
    ptr("SOC2", ["corpus/standards/aicpa-tsc-soc2.md", "frameworks/soc2.md"]);
  }
  return (p) => {
    if (p.kind === "control") {
      const ptr = pointer[p.framework];
      if (!ptr) return { verified: false, source: "not checked (no warden corpus)", checked: "no corpus" };
      const id = p.control.replace(/^A\./, "A.");
      const ok = ptr.ids.has(id) || ptr.ids.has(id.replace(/^A\./, ""));
      return { verified: ok, source: ptr.label, checked: ok ? `control id ${p.control} listed (id only; text is copyrighted)` : `control id ${p.control} not listed` };
    }
    const doc = docs[p.framework];
    if (!doc) return { verified: false, source: "not checked (corpus missing)", checked: "no corpus" };
    const v = verifyEu(doc, p);
    return { ...v, source: v.line ? `${doc.label}#L${v.line}` : doc.label };
  };
}

export function checkGagsFile(path: string, opts: Corpora & { write?: boolean }): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  const text = readFileSync(path, "utf8");
  const { gags, errors } = validateGags(parse(text));
  if (errors.length) return { ok: false, lines: ["gags.yaml invalid:", ...errors.map((e) => `  - ${e}`)] };
  const verify = makeVerifier(opts);
  let mismatches = 0;
  let verifiedNow: number | undefined;
  if (verify) {
    const doc = parseDocument(text);
    const seq = doc.get("gags");
    for (const [i, g] of gags.entries()) {
      const r = verify(parseProvision(g.provision)!);
      verifiedNow = (verifiedNow ?? 0) + (r.verified ? 1 : 0);
      if (r.verified !== g.verified || r.source !== g.source) mismatches++;
      if (!r.verified) lines.push(`UNVERIFIED ${g.id}: ${g.provision} — ${r.checked}`);
      if (opts.write && isSeq(seq)) {
        const item = seq.items[i];
        if (isMap(item)) {
          item.set("verified", r.verified);
          item.set("source", r.source);
          item.set("checked", r.checked);
        }
      }
    }
    if (opts.write) writeFileSync(path, doc.toString({ lineWidth: 0 }));
  }
  const v = opts.write && verifiedNow !== undefined ? verifiedNow : gags.filter((g) => g.verified).length;
  lines.push(`${gags.length} gags · verified ${v} · unverified ${gags.length - v}`);
  if (verify && mismatches && !opts.write) lines.push(`${mismatches} gag(s) disagree with the corpus — run check-gags --write`);
  return { ok: gags.length >= 150 && (!verify || opts.write || mismatches === 0), lines };
}
