/**
 * The analysis pipeline — the two skills' workflows as explicit stages:
 *   intake → classify (eu-ai-act tier/role, then warden applicability + AI-Act hand-off)
 *   → checklist (both skills, batched) → report (findings, overlap, dates, penalties, explainer)
 *   → validate (every citation re-checked against the provision index).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { documentIntake, ideaIntake } from "./intake/document.js";
import { IntakeError } from "./intake/errors.js";
import type { GitHubIntake } from "./intake/github.js";
import { parseJsonReply, type ChatMessage, type Llm } from "./llm.js";
import {
  aiActClassifyMessages,
  checklistMessages,
  classificationContext,
  explainerMessages,
  findingsMessages,
  wardenClassifyMessages,
} from "./prompts.js";
import { cleanProse, dedupe, validateProposed, type Framework, type ProvisionIndex } from "./provisions.js";
import { SKILLS_DIR, type ChecklistItem, type Skills } from "./skills.js";
import {
  AI_ACT_ROLES,
  AI_ACT_TIERS,
  APPLICABILITY,
  WARDEN_FRAMEWORKS,
  type AiActClassification,
  type AiActRole,
  type AiActTier,
  type AnalyzeRequest,
  type Applicability,
  type ChecklistName,
  type ChecklistResult,
  type Citation,
  type Deadline,
  type Decision,
  type Explainer,
  type Finding,
  type Intake,
  type ItemStatus,
  type OverlapRow,
  type Penalty,
  type ProgressEvent,
  type Report,
  type Severity,
  type SkillName,
  type StageName,
  type WardenClassification,
} from "./types.js";

export interface Deps {
  llm: Llm;
  index: ProvisionIndex;
  skills: Skills;
  github: GitHubIntake;
  now?: () => Date;
  batchSize?: number;
  concurrency?: number;
  skillsDir?: string;
}

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITIES = Object.keys(SEVERITY_RANK) as Severity[];
const ACTIVE: Applicability[] = ["APPLIES", "APPLIES (contractual)", "VIA SUPPLY CHAIN"];
const NOT_AI_ACT = (fw: string) => fw !== "AI Act";
const ANY = () => true;

export const CHECKLIST_FOR: Record<Intake["kind"], ChecklistName> = { idea: "product-idea", document: "design-doc", repo: "codebase" };

/** Collects what validation dropped or rewrote, for the report's validation block. */
class Ledger {
  dropped = new Set<string>();
  reworded = 0;
  prose(text: unknown, fw: Framework | null, index: ProvisionIndex, allow: (f: string) => boolean): { text: string; citations: Citation[] } {
    const r = cleanProse(redact(String(text ?? "")), fw, index, allow);
    if (r.dropped.length) {
      this.reworded++;
      r.dropped.forEach((d) => this.dropped.add(d));
    }
    return r;
  }
  proposed(ids: unknown, strings: unknown, fw: Framework | null, index: ProvisionIndex, allow: (f: string) => boolean): Citation[] {
    const v = validateProposed(ids, strings, fw, index, allow);
    v.dropped.forEach((d) => this.dropped.add(d));
    return v.citations;
  }
}

/** Masks anything shaped like a credential in model output or quoted evidence. */
export function redact(s: string): string {
  return s
    .replace(/\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, "[redacted]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, "[redacted private key]")
    .replace(/\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))\s*[=:]\s*["']?[^\s"'`]{6,}/g, "$1=[redacted]");
}

const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const k = next++;
        out[k] = await fn(items[k]!);
      }
    }),
  );
  return out;
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let k = 0; k < xs.length; k += n) out.push(xs.slice(k, k + n));
  return out;
}

export async function runIntake(req: AnalyzeRequest, deps: Deps): Promise<Intake> {
  if (req.kind === "idea") return ideaIntake(req.text ?? "");
  if (req.kind === "document") {
    if (!req.file) throw new IntakeError("attach a .pdf, .docx, .md or .txt file");
    return documentIntake(req.file.name, req.file.data);
  }
  if (req.kind === "repo") return deps.github.fetch(req.repoUrl ?? "");
  throw new IntakeError("kind must be idea, document or repo");
}

export async function analyze(req: AnalyzeRequest, deps: Deps, emit: (e: ProgressEvent) => void, id: string): Promise<Report> {
  const usage = { calls: 0, promptTokens: 0, completionTokens: 0 };
  const ledger = new Ledger();
  const { index, skills } = deps;
  const batchSize = deps.batchSize ?? 10;
  const concurrency = deps.concurrency ?? 3;

  const ask = async (stage: string, messages: ChatMessage[], maxOutputTokens: number): Promise<Record<string, unknown>> => {
    let msgs = messages;
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await deps.llm.complete({ stage, messages: msgs, maxOutputTokens });
      usage.calls++;
      usage.promptTokens += r.promptTokens;
      usage.completionTokens += r.completionTokens;
      try {
        return obj(parseJsonReply(r.text));
      } catch {
        msgs = [...messages, { role: "assistant", content: r.text.slice(0, 2000) }, { role: "user", content: "That was not a single valid JSON object. Reply again with only the JSON object matching <output_schema>." }];
      }
    }
    throw new Error(`the model returned unreadable output at ${stage}`);
  };
  const stage = async <T>(name: StageName, fn: () => Promise<T>, detail?: (t: T) => string): Promise<T> => {
    emit({ type: "stage", stage: name, status: "start" });
    const t = await fn();
    emit({ type: "stage", stage: name, status: "done", detail: detail?.(t) });
    return t;
  };

  // 1. Intake
  const intake = await stage("intake", () => runIntake(req, deps), (i) => i.facts[0] ?? "");

  // 2. Classify — eu-ai-act first (tier + role), then warden (applicability + hand-off flag only).
  const { aiAct, warden } = await stage(
    "classify",
    async () => {
      const [a, w] = await Promise.all([ask("classify.ai-act", aiActClassifyMessages(intake, skills), 3000), ask("classify.warden", wardenClassifyMessages(intake, skills), 3000)]);
      return { aiAct: normaliseAiAct(a, index, ledger), warden: normaliseWarden(w, index, ledger) };
    },
    ({ aiAct: a, warden: w }) => `AI Act: ${a.tier}${a.roles.length ? ` (${a.roles.join(", ")})` : ""} · ${w.frameworks.filter((f) => ACTIVE.includes(f.status)).length} frameworks apply`,
  );
  const context = classificationContext(aiAct, warden);

  // 3. Checklists — both skills, matching artifact type (warden selectable), batched.
  const euList: ChecklistName = CHECKLIST_FOR[intake.kind];
  const wardenList: ChecklistName = req.checklist ?? CHECKLIST_FOR[intake.kind];
  const statusOf = new Map(warden.frameworks.map((f) => [f.framework as string, f.status]));
  const checklist = await stage(
    "checklist",
    async () => {
      const results: { item: ChecklistItem; result: ChecklistResult }[] = [];
      const batches: { skill: SkillName; items: ChecklistItem[] }[] = [];
      const plan = (skill: SkillName, items: ChecklistItem[]) => {
        const live: ChecklistItem[] = [];
        for (const item of items) {
          const auto = autoNa(skill, item, aiAct, statusOf);
          if (auto) results.push({ item, result: toResult(item, "n/a", "N/A", auto, item.severity ?? "low") });
          else live.push(item);
        }
        for (const b of chunk(live, batchSize)) batches.push({ skill, items: b });
      };
      plan("eu-ai-act", skills.checklist("eu-ai-act", euList));
      plan("warden", skills.checklist("warden", wardenList));
      const evaluated = await pool(batches, concurrency, async (b) => {
        const raw = await ask(`checklist.${b.skill}`, checklistMessages(intake, skills, b.skill, b.items, context), 220 * b.items.length + 400).catch(() => ({ results: [] }));
        const byId = new Map(arr(raw.results).map((r) => [str(obj(r).id, 10).toUpperCase(), obj(r)]));
        return b.items.map((item) => {
          const r = byId.get(item.id);
          if (!r) return { item, result: toResult(item, "unclear", "UNKNOWN", "Not assessed — the model did not return this item.", item.severity ?? "medium") };
          const status = normStatus(r.status, r.verdict);
          const allow = b.skill === "warden" ? NOT_AI_ACT : ANY;
          const evidence = ledger.prose(str(r.evidence, 400) || "No evidence in the artifact.", b.skill === "warden" ? null : "AI Act", index, allow).text;
          const sev = item.severity ?? (SEVERITIES.includes(r.severity as Severity) ? (r.severity as Severity) : "medium");
          return { item, result: toResult(item, status, str(r.verdict, 30).toUpperCase() || status.toUpperCase(), evidence, sev) };
        });
      });
      results.push(...evaluated.flat());
      const order = (x: { item: ChecklistItem }) => `${x.item.skill === "eu-ai-act" ? 0 : 1}`;
      const ids = [...skills.checklist("eu-ai-act", euList), ...skills.checklist("warden", wardenList)];
      results.sort((a, b) => order(a).localeCompare(order(b)) || ids.indexOf(a.item) - ids.indexOf(b.item));
      return results;
    },
    (r) => `${r.length} items · ${r.filter((x) => x.result.status === "gap").length} gaps`,
  );

  // 4. Report — findings per skill (batched), overlap, dates, penalties, explainer.
  const reportParts = await stage(
    "report",
    async () => {
      const findings: Finding[] = [];
      for (const skill of ["eu-ai-act", "warden"] as SkillName[]) {
        const open = checklist.filter((x) => x.item.skill === skill && (x.result.status === "gap" || x.result.status === "unclear")).sort((a, b) => SEVERITY_RANK[a.result.severity] - SEVERITY_RANK[b.result.severity] || (a.result.status === "gap" ? -1 : 1));
        const written = await pool(chunk(open, 12), concurrency, async (batch) => {
          const raw = await ask(`report.${skill}`, findingsMessages(skills, skill, batch, context, intake), 260 * batch.length + 400).catch(() => ({ findings: [] }));
          const byId = new Map(arr(raw.findings).map((f) => [str(obj(f).id, 10).toUpperCase(), obj(f)]));
          return batch.map(({ item, result }) => buildFinding(skill, item, result, byId.get(item.id) ?? {}, index, ledger));
        });
        findings.push(...written.flat());
      }
      findings.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.status === b.status ? 0 : a.status === "gap" ? -1 : 1) || (a.skill === b.skill ? 0 : a.skill === "eu-ai-act" ? -1 : 1));
      const overlap = buildOverlap(skills, warden, findings);
      const deadlines = buildDeadlines(skills, aiAct, warden);
      const penalties = buildPenalties(skills, aiAct, warden);
      let explainer: Explainer | null = null;
      if (req.explainer !== false) {
        const summary = [
          context,
          "Top findings:",
          ...findings.slice(0, 8).map((f) => `- [${f.severity}] ${f.title}: ${f.what} Fix: ${f.fix}`),
          `Deadlines: ${deadlines.slice(0, 6).map((d) => `${d.date} ${d.framework} — ${d.event}`).join("; ")}`,
        ].join("\n");
        const raw = await ask("report.explainer", explainerMessages(skills, plainLanguage(deps.skillsDir ?? SKILLS_DIR, warden), summary), 1200).catch(() => null);
        if (raw && str(raw.body, 6000)) {
          const body = ledger.prose(str(raw.body, 6000), null, index, NOT_AI_ACT);
          explainer = { body: body.text, sources: dedupe([...body.citations, ...ledger.proposed(raw.provisions, raw.sources, null, index, NOT_AI_ACT)]) };
        }
      }
      return { findings, overlap, deadlines, penalties, explainer };
    },
    (p) => `${p.findings.length} findings`,
  );

  // 5. Validate — final sweep: every citation must be an indexed provision; warden carries no AI Act.
  const report = await stage(
    "validate",
    async () => {
      const keep = (cs: Citation[], allow: (f: string) => boolean = ANY) =>
        cs.filter((c) => {
          const p = index.get(c.id);
          const ok = !!p && p.framework === c.framework && allow(c.framework);
          if (!ok) ledger.dropped.add(c.id);
          return ok;
        });
      aiAct.decisions.forEach((d) => (d.citations = keep(d.citations)));
      warden.frameworks.forEach((f) => (f.citations = keep(f.citations, NOT_AI_ACT)));
      warden.decisions.forEach((d) => (d.citations = keep(d.citations, NOT_AI_ACT)));
      const items = checklist.map((x) => ({ ...x.result, citations: keep(x.result.citations, x.result.skill === "warden" ? NOT_AI_ACT : ANY) }));
      reportParts.findings.forEach((f) => (f.citations = keep(f.citations, f.skill === "warden" ? NOT_AI_ACT : ANY)));
      reportParts.overlap.forEach((o) => o.cells.forEach((c) => (c.citations = keep(c.citations, NOT_AI_ACT))));
      reportParts.deadlines.forEach((d) => (d.citations = keep(d.citations)));
      reportParts.penalties.forEach((p) => (p.citations = keep(p.citations)));
      if (reportParts.explainer) reportParts.explainer.sources = keep(reportParts.explainer.sources, NOT_AI_ACT);
      return assemble(id, deps.now?.() ?? new Date(), intake, euList, wardenList, aiAct, warden, items, reportParts, skills, usage, ledger, index);
    },
    (r) => `${r.validation.droppedIds.length} unverified citations removed`,
  );
  emit({ type: "report", report });
  return report;
}

function toResult(item: ChecklistItem, status: ItemStatus, verdict: string, evidence: string, severity: Severity): ChecklistResult {
  return { skill: item.skill, checklist: item.checklist, itemId: item.id, title: item.title, severity, status, verdict, evidence, citations: item.citations };
}

export function normStatus(status: unknown, verdict: unknown): ItemStatus {
  const s = String(status ?? "").toLowerCase().trim();
  if (s === "met" || s === "gap" || s === "unclear" || s === "n/a") return s;
  if (s === "na" || s === "not applicable") return "n/a";
  const v = String(verdict ?? "").toUpperCase();
  if (/^(PASS|PRESENT|MET|ANSWERED)/.test(v)) return "met";
  if (/^(FAIL|MISSING|GAP)/.test(v)) return "gap";
  if (/^N\/?A/.test(v)) return "n/a";
  return "unclear";
}

/** Deterministic n/a: AI Act items when out of scope; warden items whose frameworks are all not triggered. */
function autoNa(skill: SkillName, item: ChecklistItem, ai: AiActClassification, status: Map<string, Applicability>): string | null {
  if (skill === "eu-ai-act" && ai.tier === "out of scope") return "Not applicable: the AI Act classification found the artifact out of scope.";
  if (skill === "warden" && item.frameworks.length && item.frameworks.every((f) => status.get(f) === "NOT TRIGGERED"))
    return `Not applicable: ${item.frameworks.join(", ")} not triggered by the applicability classifier.`;
  return null;
}

function decisions(raw: unknown, fw: Framework, index: ProvisionIndex, ledger: Ledger, allow: (f: string) => boolean): Decision[] {
  return arr(raw)
    .slice(0, 14)
    .map((d) => {
      const o = obj(d);
      const reasoning = ledger.prose(str(o.reasoning, 800), fw, index, allow);
      const verdict = ledger.prose(str(o.verdict, 200), fw, index, allow);
      return {
        step: str(o.step, 120) || "Decision",
        verdict: verdict.text,
        reasoning: reasoning.text,
        evidence: redact(str(o.evidence, 300)) || undefined,
        citations: dedupe([...ledger.proposed(o.provisions, o.citations, fw, index, allow), ...reasoning.citations, ...verdict.citations]),
      };
    });
}

export function normaliseAiAct(raw: Record<string, unknown>, index: ProvisionIndex, ledger: Ledger = new Ledger()): AiActClassification {
  const tierRaw = str(raw.tier, 60).toLowerCase();
  let tier: AiActTier = AI_ACT_TIERS.find((t) => t.toLowerCase() === tierRaw) ?? AI_ACT_TIERS.find((t) => tierRaw && t.toLowerCase().startsWith(tierRaw)) ?? "undetermined";
  const isAiSystem = raw.isAiSystem !== false;
  if (!isAiSystem && tier !== "GPAI model" && tier !== "GPAI model (systemic risk)") tier = "out of scope";
  const roles = arr(raw.roles)
    .map((r) => String(r).toLowerCase().trim())
    .filter((r): r is AiActRole => (AI_ACT_ROLES as readonly string[]).includes(r));
  const conf = str(raw.confidence, 10).toLowerCase();
  return {
    isAiSystem,
    tier,
    roles: tier === "out of scope" ? [] : [...new Set(roles)],
    confidence: conf === "high" || conf === "low" ? conf : "medium",
    decisions: decisions(raw.decisions, "AI Act", index, ledger, ANY),
    assumptions: arr(raw.assumptions).map((a) => ledger.prose(str(a, 300), "AI Act", index, ANY).text).filter(Boolean).slice(0, 10),
  };
}

export function normaliseWarden(raw: Record<string, unknown>, index: ProvisionIndex, ledger: Ledger = new Ledger()): WardenClassification {
  const given = arr(raw.frameworks).map(obj);
  const frameworks = WARDEN_FRAMEWORKS.map((fw) => {
    const g = given.find((x) => str(x.framework, 40).toLowerCase().replace(/\s|iso\/iec/g, "") === fw.toLowerCase().replace(/\s|iso\/iec/g, "")) ?? {};
    const st = str(g.status, 30).toUpperCase();
    const status: Applicability = APPLICABILITY.find((a) => a === st) ?? (st.startsWith("APPLIES") ? "APPLIES" : "UNCLEAR");
    const basis = ledger.prose(str(g.basis, 400) || "Not enough scope facts to decide.", fw as Framework, index, NOT_AI_ACT);
    return { framework: fw, status, role: str(g.role, 60) || "—", basis: basis.text, citations: dedupe([...ledger.proposed(g.provisions, g.citations, fw as Framework, index, NOT_AI_ACT), ...basis.citations]) };
  });
  const h = obj(raw.aiActHandoff);
  return {
    frameworks,
    decisions: decisions(raw.decisions, "GDPR", index, ledger, NOT_AI_ACT),
    aiActHandoff: { relevant: h.relevant === true, triggers: arr(h.triggers).map((t) => ledger.prose(str(t, 200), null, index, NOT_AI_ACT).text).filter(Boolean).slice(0, 6) },
    assumptions: arr(raw.assumptions).map((a) => ledger.prose(str(a, 300), null, index, NOT_AI_ACT).text).filter(Boolean).slice(0, 10),
  };
}

function buildFinding(skill: SkillName, item: ChecklistItem, result: ChecklistResult, raw: Record<string, unknown>, index: ProvisionIndex, ledger: Ledger): Finding {
  const allow = skill === "warden" ? NOT_AI_ACT : ANY;
  const fw: Framework | null = skill === "warden" ? null : "AI Act";
  const p = (v: unknown, fallback: string) => ledger.prose(str(v, 900) || fallback, fw, index, allow);
  const what = p(raw.what, result.status === "gap" ? `${item.title}: not satisfied. ${result.evidence}` : `${item.title}: the artifact does not show whether this is handled.`);
  const why = p(raw.why, `Checklist ${item.checklist} ${item.id} (${skill}) flags this as ${result.severity} severity.`);
  const fix = p(raw.fix, "Address the checklist item and record the evidence.");
  const effort = str(raw.effort, 2).toUpperCase();
  return {
    id: `${skill === "eu-ai-act" ? "AI" : "W"}-${item.id}`,
    skill,
    severity: result.severity,
    status: result.status === "gap" ? "gap" : "unclear",
    title: ledger.prose(str(raw.title, 140) || item.title, fw, index, allow).text,
    what: what.text,
    why: why.text,
    fix: fix.text,
    effort: effort === "S" || effort === "L" ? effort : "M",
    evidence: result.evidence,
    citations: dedupe([...item.citations, ...ledger.proposed(raw.provisions, raw.citations, fw, index, allow), ...what.citations, ...why.citations, ...fix.citations]).slice(0, 8),
    overlap: [],
    sourceItem: `${skill}/${item.checklist}#${item.id}`,
  };
}

function buildOverlap(skills: Skills, warden: WardenClassification, findings: Finding[]): OverlapRow[] {
  const live = new Set(warden.frameworks.filter((f) => f.status !== "NOT TRIGGERED").map((f) => f.framework as string));
  const rows = skills.overlap
    .map((o) => {
      const cells = o.cells.filter((c) => live.has(c.framework) && c.citations.length).map((c) => ({ framework: c.framework as string, citations: c.citations }));
      const ids = new Set(cells.flatMap((c) => c.citations.map((x) => x.id)));
      const linked = findings.filter((f) => f.skill === "warden" && f.citations.some((c) => ids.has(c.id)));
      return { row: { id: o.id, theme: o.theme, cells, findings: linked.map((f) => f.id) }, linked };
    })
    .filter((r) => r.row.cells.length >= 2);
  for (const r of rows) for (const f of r.linked) f.overlap.push(r.row.id);
  const withFindings = rows.filter((r) => r.linked.length);
  const chosen = withFindings.length >= 4 ? withFindings : [...withFindings, ...rows.filter((r) => !r.linked.length).sort((a, b) => b.row.cells.length - a.row.cells.length).slice(0, 4 - withFindings.length)];
  return chosen.map((r) => r.row).sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

function buildDeadlines(skills: Skills, ai: AiActClassification, w: WardenClassification): Deadline[] {
  const out: Deadline[] = [];
  const highRisk = ai.tier.startsWith("high-risk");
  const gpai = ai.tier.startsWith("GPAI");
  if (ai.tier !== "out of scope") {
    const want = [/^2 Feb 2025$/, /^2 Aug 2026$/, ...(gpai ? [/^2 Aug 2025$/] : []), ...(ai.tier === "high-risk (Annex I)" ? [/^2 Aug 2027$/] : [])];
    for (const d of skills.deadlines.filter((d) => d.framework === "AI Act" && d.kind === "milestone" && want.some((re) => re.test(d.date))))
      if (d.date !== "2 Aug 2026" || /General application/i.test(d.event)) out.push({ date: d.date, framework: d.framework, event: shorten(d.event), citations: d.citations });
    if (highRisk) for (const d of skills.deadlines.filter((d) => d.framework === "AI Act" && d.kind === "in-article" && /serious-incident report after|log retention/i.test(d.event))) out.push({ date: d.date, framework: d.framework, event: d.event, citations: d.citations });
  }
  const active = new Set(w.frameworks.filter((f) => ACTIVE.includes(f.status)).map((f) => f.framework as string));
  for (const d of skills.deadlines.filter((d) => d.framework !== "AI Act" && active.has(d.framework)))
    if (d.kind === "clock" || /applies|apply|transposition|expire/i.test(d.event)) out.push({ date: d.date, framework: d.framework, event: shorten(d.event), citations: d.citations });
  return out;
}

const shorten = (s: string) => (s.length > 220 ? `${s.slice(0, 217).replace(/\s+\S*$/, "")}…` : s);

function pct(cap: string): number {
  return Math.max(0, ...[...cap.matchAll(/(\d+(?:\.\d+)?)\s?%/g)].map((m) => Number(m[1])));
}

function buildPenalties(skills: Skills, ai: AiActClassification, w: WardenClassification): Penalty[] {
  const out: Penalty[] = [];
  const pick = (fw: string, key: string) => skills.penalties.find((p) => p.framework === fw && p.key === key);
  const aiKey = ai.tier === "prohibited" ? "prohibited" : ai.tier.startsWith("GPAI") ? "gpai" : ai.tier.startsWith("high-risk") || ai.tier === "limited-transparency" ? "operator" : null;
  const a = aiKey ? pick("AI Act", aiKey) : null;
  if (a) out.push({ framework: "AI Act", cap: a.cap, basis: a.basis, citations: a.citations });
  for (const f of w.frameworks.filter((f) => ACTIVE.includes(f.status))) {
    const p = pick(f.framework, "fine") ?? pick(f.framework, "voluntary");
    if (p) out.push({ framework: f.framework, cap: p.cap, basis: p.basis, citations: p.citations });
  }
  return out;
}

/** The `## In plain language` sections of the triggered frameworks' reference files. */
function plainLanguage(dir: string, w: WardenClassification): string {
  const fdir = join(dir, "warden", "references", "frameworks");
  const live = w.frameworks.filter((f) => f.status !== "NOT TRIGGERED").map((f) => f.framework.replace("ISO/IEC ", ""));
  const parts: string[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(fdir).filter((f) => f.endsWith(".md"));
  } catch {
    return "";
  }
  for (const f of files) {
    const md = readFileSync(join(fdir, f), "utf8");
    const head = md.split("\n").find((l) => l.startsWith("# ")) ?? f;
    if (!live.some((fw) => head.replace(/\s/g, "").toLowerCase().includes(fw.replace(/\s/g, "").toLowerCase()))) continue;
    const m = /## In plain language\n([\s\S]*?)(?=\n## )/.exec(md);
    if (m) parts.push(`${head}\n${m[1]!.trim()}`);
  }
  return parts.join("\n\n");
}

function assemble(
  id: string,
  now: Date,
  intake: Intake,
  euList: ChecklistName,
  wardenList: ChecklistName,
  aiAct: AiActClassification,
  warden: WardenClassification,
  items: ChecklistResult[],
  parts: { findings: Finding[]; overlap: OverlapRow[]; deadlines: Deadline[]; penalties: Penalty[]; explainer: Explainer | null },
  skills: Skills,
  usage: Report["usage"],
  ledger: Ledger,
  index: ProvisionIndex,
): Report {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of parts.findings) counts[f.severity]++;
  const euGaps = items.filter((i) => i.skill === "eu-ai-act" && i.status === "gap");
  const blocking =
    euList === "codebase" ? euGaps.some((i) => i.itemId.startsWith("C")) && "DO NOT SHIP into EU market"
    : euList === "design-doc" ? euGaps.some((i) => i.itemId.startsWith("C")) && "not EU-market-ready"
    : euGaps.some((i) => i.itemId === "G2") && "redesign required";
  const tierLabel = aiAct.tier === "undetermined" ? "Tier undetermined — more facts needed" : aiAct.tier === "out of scope" ? "Outside the AI Act" : aiAct.tier[0]!.toUpperCase() + aiAct.tier.slice(1);
  const headline = [tierLabel, aiAct.roles.length ? aiAct.roles.join(" + ") : "", blocking ? `→ ${blocking}` : ""].filter(Boolean).join(" · ");
  const wGaps = parts.findings.filter((f) => f.skill === "warden" && f.status === "gap");
  const wardenVerdict = wGaps.some((f) => f.severity === "critical" || f.severity === "high") ? "Not ready" : wGaps.length ? "Ready with remediation" : "Substantially ready";
  const headlinePenalty = [...parts.penalties].sort((a, b) => pct(b.cap) - pct(a.cap))[0] ?? null;
  const triggers = warden.aiActHandoff.triggers.length ? warden.aiActHandoff.triggers.join("; ") : "AI system or model with an EU nexus";
  const handoff = warden.aiActHandoff.relevant || aiAct.isAiSystem
    ? `EU AI Act — LIKELY RELEVANT. Trigger facts: ${triggers}. Risk tier, role and obligations come from the eu-ai-act-compliance stage of this analysis (see "EU AI Act" above), not from warden.`
    : "EU AI Act — not flagged: no AI system or general-purpose AI model observed.";
  return {
    id,
    createdAt: now.toISOString(),
    kind: intake.kind,
    title: intake.title,
    checklists: { "eu-ai-act": euList, warden: wardenList },
    summary: {
      aiAct: { tier: aiAct.tier, roles: aiAct.roles, confidence: aiAct.confidence, headline },
      wardenVerdict,
      frameworksTriggered: warden.frameworks.filter((f) => f.status !== "NOT TRIGGERED").map((f) => ({ framework: f.framework, status: f.status })),
      counts,
      headlinePenalty,
    },
    aiAct,
    warden,
    findings: parts.findings,
    checklist: items,
    overlap: parts.overlap,
    deadlines: parts.deadlines,
    penalties: parts.penalties,
    explainer: parts.explainer,
    handoff,
    assumptions: [...aiAct.assumptions, ...warden.assumptions],
    warnings: intake.warnings,
    intake: { facts: intake.facts, sensitiveFiles: intake.sensitiveFiles, filesRead: intake.files.map((f) => f.path) },
    validation: { droppedIds: [...ledger.dropped], reworded: ledger.reworded, index: index.source, indexSize: index.size },
    usage,
    disclaimer: `${skills.disclaimer.warden} ${skills.disclaimer["eu-ai-act"]}`,
  };
}
