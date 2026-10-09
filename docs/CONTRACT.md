# CONTRACT.md — the boundary between the build lanes

Three Devin sessions work in this repo at once. This file is the only thing they share.
Change it only through helm. Demo is **2026-10-10** — favour working over perfect.

## Ownership

| Path | Owner | Notes |
|---|---|---|
| `tools/`, `assets/manifest.yaml`, `content/gags.yaml`, `content/voices.md`, `content/clip-lines.md` | **A0** (asset pipeline) | already in flight |
| `content/personas/*.yaml` | **Lane B** | from `docs/PERSONA.md` roster, all 10 |
| `packages/shared/` | **Lane B** creates it **first commit**, exactly as below | Lane A imports, never edits |
| `packages/server/`, `corpus/`, `Dockerfile`, `compose.yaml`, `.env.example` | **Lane B** | |
| `packages/web/` | **Lane A** | built by Vite, served by the server as static files from `packages/web/dist` |
| `docs/` | helm | |

Root: npm workspaces (`"workspaces": ["packages/*"]`), Node ≥ 22, TypeScript, ESM, vitest.
Lane B creates the root `package.json`; Lane A adds only its own workspace. Reference code
from Karen (same stack, already proven in production) is in `docs/reference/karen/` —
adapt freely: Nebius client, SLNG STT/TTS, SSE helper, rate limiter, Dockerfile, compose
with Traefik labels.

## Shared types — `packages/shared/src/index.ts`

```ts
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
```

## HTTP API (Lane B serves, Lane A calls)

| Method + path | Body / query | Returns |
|---|---|---|
| `GET /api/personas` | — | `Persona[]` |
| `POST /api/case` | `{ submission: Submission, officers?: [PersonaId, PersonaId] }` | `Case` (officers random pair from the roster's pairings if omitted) |
| `GET /api/case/:caseId/stream` | SSE | `RoastEvent`s for the current round; ends after `awaiting` or `verdict` |
| `POST /api/case/:caseId/reply` | `{ text: string }` | `204`; next round streams on a fresh `GET …/stream`; each reply raises the tier; tier 5 ends in `verdict` |
| `POST /api/stt` | raw audio body (`audio/webm` from MediaRecorder) | `{ text: string }` |
| `GET /api/audio/:hash.mp3` | — | TTS clip (cached by hash) |
| `GET /api/wall/stream` | SSE | `WallEntry` events; on connect the last 30 |
| `GET /api/provision/:id` | — | `Provision` |
| `GET /api/health` | — | `{ ok: true }` |

Errors: JSON `{ error: string }` with a proper status; 429 from the rate limiter.

## Behaviour Lane B guarantees

- Every `Provision` in any event resolved from the corpus index. A model-proposed id not in
  the index is **dropped and the line regenerated or reworded without it** — never sent.
- `audioUrl` may be `null` if TTS fails; the line still arrives (Lane A shows subtitles).
- Wall gets the officials' lines only, after moderation. Never visitor text.
- Repo intake per PLAN.md "Repo intake rules".
- First `line` event within ~6 s of opening the stream.

## Behaviour Lane A guarantees

- Works with only `stills` (clips and 3D optional per persona — fall back gracefully).
- Shows subtitles for every line; plays `audioUrl` when present; queues lines, never overlaps audio.
- Develops against fixtures matching the types above until Lane B's server is up; no
  dependency on Lane B being merged first.

## Assets

Generated media is served from `/assets/...` (Lane B serves `assets/generated/` statically).
Persona YAML references them by path. Missing files must not break the UI.

## Deploy target

`roast.pro7ocol.com`, uk-lon-1, Traefik labels as in `docs/reference/karen/compose.yaml`,
container bound to `127.0.0.1:8796`, port 8796, SQLite under `/data`. helm deploys.

## Merge order

Lane B (shared + server) → Lane A (web) → A0 (tools/content). helm resolves conflicts.
