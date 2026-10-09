/** Lane D's own types (not packages/shared). The wire shapes of the analyzer API. */

export type IntakeKind = "idea" | "document" | "repo";
export type ChecklistName = "product-idea" | "design-doc" | "codebase" | "vendor-assessment";
export type SkillName = "eu-ai-act" | "warden";
export type Severity = "critical" | "high" | "medium" | "low";
export type ItemStatus = "met" | "gap" | "unclear" | "n/a";
export type StageName = "intake" | "classify" | "checklist" | "report" | "validate";

/** A provision from the index (corpus/provisions.json or the fallback built from the skills). */
export interface Provision {
  id: string;
  label: string;
  title: string;
  url: string;
  framework: string;
}

/** A citation as shown: always backed by an indexed provision; `pinpoint` narrows it, e.g. "(1)(a)". */
export interface Citation extends Provision {
  display: string;
}

export interface AnalyzeRequest {
  kind: IntakeKind;
  text?: string;
  repoUrl?: string;
  file?: { name: string; data: Buffer };
  /** Override the warden checklist (e.g. "vendor-assessment"). */
  checklist?: ChecklistName;
  explainer?: boolean;
}

export interface IntakeFile {
  path: string;
  bytes: number;
  /** Untrusted. Present only for files read for evidence. */
  content?: string;
}

export interface Intake {
  kind: IntakeKind;
  title: string;
  /** Untrusted artifact text, already capped. Never followed as instructions. */
  text: string;
  facts: string[];
  warnings: string[];
  /** Repo only: tracked secret-like files reported by name; their contents are never fetched. */
  sensitiveFiles: string[];
  files: IntakeFile[];
  source?: { repo?: string; filename?: string; bytes?: number };
}

export interface Decision {
  step: string;
  verdict: string;
  reasoning: string;
  evidence?: string;
  citations: Citation[];
}

export const AI_ACT_TIERS = [
  "prohibited",
  "high-risk (Annex I)",
  "high-risk (Annex III)",
  "GPAI model",
  "GPAI model (systemic risk)",
  "limited-transparency",
  "minimal",
  "out of scope",
  "undetermined",
] as const;
export type AiActTier = (typeof AI_ACT_TIERS)[number];

export const AI_ACT_ROLES = [
  "provider",
  "deployer",
  "importer",
  "distributor",
  "authorised representative",
  "product manufacturer",
  "downstream provider",
] as const;
export type AiActRole = (typeof AI_ACT_ROLES)[number];

export interface AiActClassification {
  isAiSystem: boolean;
  tier: AiActTier;
  roles: AiActRole[];
  confidence: "high" | "medium" | "low";
  decisions: Decision[];
  assumptions: string[];
}

export const WARDEN_FRAMEWORKS = ["GDPR", "NIS2", "DORA", "ISO/IEC 27001", "ISO/IEC 42001", "SOC 2", "NIST AI RMF", "OWASP LLM Top 10"] as const;
export type WardenFramework = (typeof WARDEN_FRAMEWORKS)[number];
export const APPLICABILITY = ["APPLIES", "APPLIES (contractual)", "VIA SUPPLY CHAIN", "RECOMMENDED", "NOT TRIGGERED", "UNCLEAR"] as const;
export type Applicability = (typeof APPLICABILITY)[number];

export interface FrameworkApplicability {
  framework: WardenFramework;
  status: Applicability;
  basis: string;
  role: string;
  citations: Citation[];
}

export interface WardenClassification {
  frameworks: FrameworkApplicability[];
  decisions: Decision[];
  aiActHandoff: { relevant: boolean; triggers: string[] };
  assumptions: string[];
}

export interface ChecklistResult {
  skill: SkillName;
  checklist: ChecklistName;
  itemId: string;
  title: string;
  severity: Severity;
  status: ItemStatus;
  /** The skill's own verdict vocabulary: PASS/FAIL/UNKNOWN, PRESENT/MISSING/AMBIGUOUS, YES/NO/UNCLEAR, designed/… */
  verdict: string;
  evidence: string;
  citations: Citation[];
}

export interface Finding {
  id: string;
  skill: SkillName;
  severity: Severity;
  status: "gap" | "unclear";
  title: string;
  what: string;
  why: string;
  fix: string;
  effort: "S" | "M" | "L";
  evidence: string;
  citations: Citation[];
  overlap: string[];
  sourceItem: string;
}

export interface OverlapRow {
  id: string;
  theme: string;
  cells: { framework: string; citations: Citation[] }[];
  findings: string[];
}

export interface Deadline {
  date: string;
  framework: string;
  event: string;
  citations: Citation[];
}

export interface Penalty {
  framework: string;
  cap: string;
  basis: string;
  citations: Citation[];
}

export interface Explainer {
  body: string;
  sources: Citation[];
}

export interface Report {
  id: string;
  createdAt: string;
  kind: IntakeKind;
  title: string;
  checklists: { "eu-ai-act": ChecklistName | null; warden: ChecklistName };
  summary: {
    aiAct: { tier: AiActTier; roles: AiActRole[]; confidence: string; headline: string };
    wardenVerdict: string;
    frameworksTriggered: { framework: string; status: Applicability }[];
    counts: Record<Severity, number>;
    headlinePenalty: Penalty | null;
  };
  aiAct: AiActClassification;
  warden: WardenClassification;
  findings: Finding[];
  checklist: ChecklistResult[];
  overlap: OverlapRow[];
  deadlines: Deadline[];
  penalties: Penalty[];
  explainer: Explainer | null;
  handoff: string;
  assumptions: string[];
  warnings: string[];
  intake: { facts: string[]; sensitiveFiles: string[]; filesRead: string[] };
  validation: { droppedIds: string[]; strippedAiAct: number; reworded: number; index: "corpus" | "fallback"; indexSize: number };
  usage: { calls: number; promptTokens: number; completionTokens: number };
  disclaimer: string;
}

export type ProgressEvent =
  | { type: "stage"; stage: StageName; status: "start" | "done"; detail?: string }
  | { type: "report"; report: Report }
  | { type: "error"; message: string };
