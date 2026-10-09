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
  | { type: "verdict"; notice: Notice }
  | { type: "audio"; id: string; audioUrl: string }                      // late TTS for an already-sent line (same id)
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
