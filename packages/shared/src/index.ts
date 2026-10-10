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

export interface Case { caseId: string; ticket: number; officers: [PersonaId, PersonaId]; mode?: CaseMode; }
/** "staged" (default): 5 rounds with replies. "express" (server flag EXPRESS_MODE): one stream, tiers 1→5, verdict; optional appeal. */
export type CaseMode = "staged" | "express";

// Server-sent events on GET /api/case/:caseId/stream
export type RoastEvent =
  | { type: "officers"; officers: [Persona, Persona]; ticket: number }
  | { type: "intake"; repo: RepoIntake }                                  // repo submissions only
  | { type: "tier"; tier: Tier; name: string }
  | { type: "line"; id: string; speaker: PersonaId; text: string; provisions: Provision[]; clip: ClipSlot; audioUrl: string | null; stamp?: "REFUSÉ" | "INCOMPLET" | "RENVOYÉ EN COMMISSION" }
  | { type: "verdict"; notice: Notice }
  | { type: "audio"; id: string; audioUrl: string }                      // late TTS for an already-sent line (same id)
  | { type: "awaiting"; prompt: string }                                  // pitcher may argue back
  | { type: "meanwhile"; meanwhile: Meanwhile }                           // v2: live counter tick (≈ every 5 s during a round) + final value before verdict
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

// ───────────────────────── v2 — 2026-10-10 (Vitaly): applicant flow, fines meter, leaderboard ─────────────────────────
// See docs/CONTRACT.md "v2". Additive only: every v1 type/route keeps working.

export interface ApplicantInput {
  startupName: string;          // "48K", required, ≤ 60 chars
  founderName?: string;         // required, ≤ 60 chars — optional only when `event` is set (batch pre-roast)
  event?: string;               // optional event slug, e.g. "bcn-hack-24h" (pre-roast amendment)
  oneLiner?: string;            // optional pitch teaser shown on the leaderboard
  photo?: string;               // optional data URL (image/jpeg|png), ≤ 400 KB after client downscale to 512 px
}
export interface QueueTicket {
  applicantId: string;
  applicantToken: string;       // secret, returned ONLY here; send as `applicantToken` with POST /api/case and better-place (header `x-applicant-token` also accepted)
  ticket: number;               // e.g. 48213 — random 5–6 digits
  position: number;             // starts huge (e.g. 2_417_906), client animates it to 0
  etaText: string;              // "Estimated decision: Q3 2031"
  countdownSec: number;         // random 30–60: client counts position → 0 over this many seconds
}
export type BetterPlaceCause =
  | "climate" | "lgbtq" | "refugees" | "homeless" | "ukraine" | "rare-diseases"
  | "gender-equality" | "animal-welfare" | "accessibility" | "ai-safety";
export interface BetterPlaceResult { position: 1; skipped: number; cause: BetterPlaceCause; quip: string; }

// New RoastEvents (the union above is extended by these; clients ignore unknown types)
export type RoastEventV2 =
  | { type: "fine"; id: string; provision: Provision; amountEur: number; jailMonths: number;
      totalEur: number; totalJailMonths: number; caption: string }   // one per violation cited; drives the meter
  | { type: "meltdown"; totalEur: number; totalJailMonths: number }   // threshold crossed → both officers burn
  | { type: "analyzing"; stage: string; progress: number };           // repo intake progress 0..1 for the loading screen

export const MELTDOWN_EUR = 1_000_000_000;      // €1 bn …
export const MELTDOWN_JAIL_MONTHS = 1_200;      // … or 100 years — whichever first

export interface NoticeV2 extends Notice {
  applicantId: string | null;
  startupName: string;
  founderName: string | null;
  totalEur: number;
  totalJailMonths: number;
  meltdown: boolean;
  tldr: { law: string; oneLine: string }[];     // one row per regulation violated — the TL;DR page
  recommendations: { text: string; provision?: Provision }[];
  reportUrl: string;                            // /api/case/:caseId/report.pdf
  badgeUrl: string;                             // /api/case/:caseId/badge.png  (1080×1080, shareable)
  meanwhile?: Meanwhile;                        // "While you were being processed…" — see CONTRACT v2 "Meanwhile"
  turnoverEstimate?: { eur: number; basis: string };  // set when no revenue was given: the Commission's estimate (TAM × share) used for the %-of-turnover caps
}

/** "While you were being processed": the global race, scaled to how long this case took. */
export interface Meanwhile {
  elapsedSec: number;                           // case start (applicant registered or case created) → verdict
  china: { models: number; note: string };      // e.g. 11, "one of them achieved superintelligence"
  us: { models: number; note: string };         // e.g. 3, "and raised $40 bn"
  eu: { regulations: number; forms: number; note: string };  // e.g. 27, 412, "you need all of them to open a bank account"
}

export interface LeaderboardEntry {
  caseId: string;
  startupName: string;
  founderName: string | null;
  oneLiner: string | null;
  photoUrl: string | null;                      // /api/photos/:id.jpg
  totalEur: number;
  totalJailMonths: number;
  meltdown: boolean;
  topLaws: string[];                            // up to 3 short labels, e.g. ["AI Act", "GDPR"]
  issuedAt: string;
  event?: string;                               // event slug, when the case was tagged
}
export type LeaderboardSort = "fines" | "jail" | "recent";
