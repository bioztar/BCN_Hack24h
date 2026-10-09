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
| `packages/web/` | **Lane A** | built by Vite, served by the server as static files from `packages/web/dist` at `/` |
| `packages/pocket/` | **Lane C** | the phone app (PWA) — built by Vite, served from `packages/pocket/dist` at `/pocket/` |
| `packages/analyzer/` | **Lane D** | the real compliance analyzer: engine + vendored skills + Fastify plugin + its own UI at `/analyze/` |
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
```

## HTTP API (Lane B serves, Lane A calls)

| Method + path | Body / query | Returns |
|---|---|---|
| `GET /api/personas` | — | `Persona[]` |
| `POST /api/case` | `{ submission: Submission, officers?: [PersonaId, PersonaId] }` | `Case` (officers: one of the three fixed pairs in PERSONA.md, random, if omitted; the roster's pairings if omitted) |
| `GET /api/case/:caseId/stream` | SSE | `RoastEvent`s for the current round; ends after `awaiting` or `verdict` |
| `POST /api/case/:caseId/reply` | `{ text: string }` | `204`; next round streams on a fresh `GET …/stream`; each reply raises the tier; tier 5 ends in `verdict` |
| `POST /api/stt` | raw audio body; `Content-Type` is passed through to SLNG. Accepted: `audio/webm` (MediaRecorder), `audio/mp4` / `audio/m4a` / `audio/x-m4a` (iOS AVAudioRecorder), also ogg, mpeg, wav, aac, flac. Other types → 415 | `{ text: string }` |
| `GET /api/audio/:hash.mp3` | — | TTS clip (cached by hash) |
| `GET /api/wall/stream` | SSE | `WallEntry` events; on connect the last 30 |
| `GET /api/provision/:id` | — | `Provision` |
| `GET /api/health` | — | `{ ok: true }` |

Errors: JSON `{ error: string }` with a proper status; 429 from the rate limiter.

## Behaviour Lane B guarantees

- Every `Provision` in any event resolved from the corpus index. A model-proposed id not in
  the index is **dropped and the line regenerated or reworded without it** — never sent.
- `audioUrl` may be `null` if TTS fails or is not ready within ~2.5 s; the line still arrives (Lane A shows subtitles).
  If the audio finishes later, a follow-up `{type:"audio", id, audioUrl}` event (same `id` as the line) arrives before
  the round's `awaiting`/`verdict`. Clients may play it if that line has not been shown yet, or ignore it.
- Wall gets the officials' lines only. Never visitor text. No moderation filter (Vitaly, 2026-10-09).
- `GET /api/pairs` → `{ id: string; officers: [PersonaId, PersonaId] }[]` — the three fixed pairs.
- Repo intake per PLAN.md "Repo intake rules".
- First `line` event within ~6 s of opening the stream.

## Behaviour Lane A guarantees

- Works with only `stills` (clips and 3D optional per persona — fall back gracefully).
- Shows subtitles for every line; plays `audioUrl` when present; queues lines, never overlaps audio.
- Develops against fixtures matching the types above until Lane B's server is up; no
  dependency on Lane B being merged first.

## The analyzer (Lane D) — serious mode

The roast is the hook; the analyzer is the real tool. It productionises the two skills
(`bioztar/EU-AI-Act` → `eu-ai-act-compliance`, `bioztar/warden` → `warden-compliance`) as
a web app. Lane D owns its own types inside `packages/analyzer/` (not `packages/shared`).

- `packages/analyzer` exports `analyzerPlugin` (Fastify plugin). helm registers it in the
  server at merge: `app.register(analyzerPlugin, { prefix: "/api/analyze" })`, and serves
  `packages/analyzer/web/dist` at `/analyze/`.
- `POST /api/analyze` (multipart or JSON): `{ kind: "idea" | "document" | "repo", text?, repoUrl?, file? }`
  → `{ reportId }`; `GET /api/analyze/:reportId/stream` SSE progress + final report;
  `GET /api/analyze/:reportId.md` Markdown export.
- Reads `corpus/provisions.json` (Lane B builds it) for citation validation when present;
  never writes `corpus/`.
- The roast's verdict screen links to `/analyze/` ("Get the real report") — helm wires it.

## Assets

Generated media is served from `/assets/...` (Lane B serves `assets/generated/` statically).
Persona YAML references them by path. Missing files must not break the UI.

## Deploy target

One container, two hostnames (Vitaly, 2026-10-09 — DNS for both already points at uk-lon-1):

| Host | Serves |
|---|---|
| `eurocrat.pro7ocol.com` | the roast stage at `/`, the pocket PWA at `/pocket/` (the stage links to it — a QR code + "Get your Pocket Eurocrat" button), the wall at `/wall` |
| `warden.pro7ocol.com` | the analyzer: `/` redirects to `/analyze/`; the roast is not linked from here except a small footer easter egg |

Traefik labels as in `docs/reference/karen/compose.yaml` with a rule
`Host(\`eurocrat.pro7ocol.com\`) || Host(\`warden.pro7ocol.com\`)`, container bound to
`127.0.0.1:8796`, port 8796, SQLite under `/data`. The server redirects `/` → `/analyze/`
when the `Host` header is `warden.pro7ocol.com`. The roast verdict's "Get the real report"
links to `https://warden.pro7ocol.com/analyze/`. helm deploys.

## Merge order

Lane B (shared + server) → Lane A (web) → A0 (tools/content). helm resolves conflicts.
