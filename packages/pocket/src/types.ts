// Local copy of packages/shared/src/index.ts (docs/CONTRACT.md). Swap for "@dg-roast/shared" once Lane B lands.
export type PersonaId = string;               // e.g. "formblatt", "annexe", "trilogue"
export type Tier = 1 | 2 | 3 | 4 | 5;         // Pre-consultation … Official Journal
export const TIER_NAMES = ["Pre-consultation", "Committee", "Trilogue", "Delegated Act", "Official Journal"] as const;

export interface Persona {
  id: PersonaId;
  name: string;                 // "Dr. Heinrich Formblatt"
  title: string;                // "Senior Rapporteur, Unit C.4 (Pre-Conformity)"
  stills: Partial<Record<"neutral" | "stamping" | "smug" | "appalled" | "asleep", string>>; // asset URLs
  model3d?: string;             // optional GLB URL
  clips?: Partial<Record<ClipSlot, string>>;  // optional video URLs
  color: string;                // accent hex for the UI
}
export type ClipSlot = "idle" | "listening" | "talking" | "intro" | "tier1" | "tier2" | "tier3" | "tier4" | "tier5" | "stamp" | "asleep" | "repo-horror" | "verdict";

export type SubmissionKind = "text" | "dictation" | "repo";
export interface Submission { kind: SubmissionKind; text?: string; repoUrl?: string; revenueEur?: number; }

export interface RepoFinding { key: string; detail: string; }    // key e.g. "no-license", "env-tracked", "llm-sdk"
export interface RepoIntake { repo: string; description: string; stars: number; language: string | null; findings: RepoFinding[]; summary: string; }

export interface Provision { id: string; label: string; title: string; url: string; }   // id "gdpr-33", label "GDPR Art. 33"

export interface Case { caseId: string; ticket: number; officers: [PersonaId, PersonaId]; }

// Server-sent events on GET /api/case/:caseId/stream
export type RoastEvent =
  | { type: "officers"; officers: [Persona, Persona]; ticket: number }
  | { type: "intake"; repo: RepoIntake }                                  // repo submissions only
  | { type: "tier"; tier: Tier; name: string }
  | { type: "line"; id: string; speaker: PersonaId; text: string; provisions: Provision[]; clip: ClipSlot; audioUrl: string | null; stamp?: "REFUSÉ" | "INCOMPLET" | "RENVOYÉ EN COMMISSION" }
  | { type: "audio"; id: string; audioUrl: string }                      // late TTS for an already-sent line (same id)
  | { type: "verdict"; notice: Notice }
  | { type: "awaiting"; prompt: string }                                  // pitcher may argue back
  | { type: "error"; message: string };

export interface Notice {
  serial: string;               // "L-2026/04812"
  startup: string;              // short name derived from the pitch
  officers: [PersonaId, PersonaId];
  fineEur: number;
  fineBasis: string;            // "€35M or 7% of worldwide turnover, whichever is higher — AI Act Art. 99(3)"
  findings: { text: string; provision: Provision }[];
  issuedAt: string;             // ISO
}

export interface WallEntry { speaker: PersonaId; text: string; at: string; }  // officials' lines ONLY

export interface Pair { id: string; officers: [PersonaId, PersonaId]; }

// ───────── v2 (docs/CONTRACT.md "v2" + "Meanwhile") — local copy of packages/shared v2 types ─────────

export interface ApplicantInput { startupName: string; founderName: string; oneLiner?: string; photo?: string; }
/** applicantId is public (leaderboard); the token, returned only by registration, authorises its case + better-place. */
export interface ApplicantAuth { applicantId: string; applicantToken: string; }
export interface QueueTicket { applicantId: string; applicantToken: string; ticket: number; position: number; etaText: string; countdownSec: number; }
export type BetterPlaceCause =
  | "climate" | "lgbtq" | "refugees" | "homeless" | "ukraine" | "rare-diseases"
  | "gender-equality" | "animal-welfare" | "accessibility" | "ai-safety";
export interface BetterPlaceResult { position: 1; skipped: number; cause: BetterPlaceCause; quip: string; }

export interface Meanwhile {
  elapsedSec: number;
  china: { models: number; note: string };
  us: { models: number; note: string };
  eu: { regulations: number; forms: number; note: string };
}

export type FineEvent = { type: "fine"; id: string; provision: Provision; amountEur: number; jailMonths: number; totalEur: number; totalJailMonths: number; caption: string };
export type RoastEventV2 =
  | FineEvent
  | { type: "meltdown"; totalEur: number; totalJailMonths: number }
  | { type: "analyzing"; stage: string; progress: number }
  | { type: "meanwhile"; meanwhile: Meanwhile };

export type AnyRoastEvent = RoastEvent | RoastEventV2;

export const MELTDOWN_EUR = 1_000_000_000;
export const MELTDOWN_JAIL_MONTHS = 1_200;

export interface NoticeV2 extends Notice {
  applicantId: string | null;
  startupName: string;
  founderName: string | null;
  totalEur: number;
  totalJailMonths: number;
  meltdown: boolean;
  tldr: { law: string; oneLine: string }[];
  recommendations: { text: string; provision?: Provision }[];
  reportUrl: string;
  badgeUrl: string;
  meanwhile?: Meanwhile;
  turnoverEstimate?: TurnoverEstimate;
}

/** Server's market-based guess; the PWA never asks for turnover. */
export interface TurnoverEstimate {
  eur: number;
  basis: string;
}

export interface LeaderboardEntry {
  caseId: string;
  startupName: string;
  founderName: string | null;
  oneLiner: string | null;
  photoUrl: string | null;
  totalEur: number;
  totalJailMonths: number;
  meltdown: boolean;
  topLaws: string[];
  issuedAt: string;
  meanwhile?: Meanwhile;
}
export type LeaderboardSort = "fines" | "jail" | "recent";
export interface LeaderboardDetail { entry: LeaderboardEntry; findings: Notice["findings"]; }
