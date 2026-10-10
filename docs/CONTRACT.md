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
`127.0.0.1:8806` (host; 8796 is taken by mirrors-api), port 8796, SQLite under `/data`. The server redirects `/` → `/analyze/`
when the `Host` header is `warden.pro7ocol.com`. The roast verdict's "Get the real report"
links to `https://warden.pro7ocol.com/analyze/`. helm deploys.

## Merge order

Lane B (shared + server) → Lane A (web) → A0 (tools/content). helm resolves conflicts.

---

## v2 — applicant flow, fines meter, leaderboard (2026-10-10, Vitaly)

Additive to v1. Types in `packages/shared/src/index.ts` (section "v2"). The **same flow** runs on
the iPhone app (`ios/`), the PWA (`packages/pocket`, reached by the QR code shown at the start of
the talk) and is mirrored on the stage (`packages/web`, big screen: QR intro + live leaderboard).

### Flow (all clients)

1. **Register** — cringe "Register your startup and build a real business in the EU!" →
   `POST /api/applicants` `ApplicantInput` → `QueueTicket`. Optional selfie.
2. **Queue** — show ticket, `etaText`, animate `position` → 0 over `countdownSec` (30–60 s).
   Button **"But we're making the world a better place"** → cause tiles →
   `POST /api/applicants/:id/better-place {cause}` → `BetterPlaceResult` → jump to front.
3. **Pitch** — voice (`/api/stt`), text, or GitHub URL. `POST /api/case` body gains optional
   `applicantId`. Repo pitches stream `analyzing` events (loading screen with officers holding
   their heads / throwing papers) before the roast.
4. **Roast mini-game** — v1 `line`/`tier`/`audio` events plus `fine` events: the meter (€ and jail
   months) runs up fast. Crossing `MELTDOWN_EUR` or `MELTDOWN_JAIL_MONTHS` emits `meltdown` once →
   both officers burn (you "win").
5. **Verdict** — `verdict.notice` is a `NoticeV2`: TL;DR per law + recommendations + `badgeUrl`
   (shareable 1080² stamp: "EUROCRAT — REFUSÉ — €X fines, Y years" with startup name) + `reportUrl`
   (branded PDF: TL;DR page, then detailed non-compliance analysis + how to adjust the idea).
6. **Leaderboard** — public, synced across app/web/stage.

### Routes

| Route | Body / query | Response |
|---|---|---|
| `POST /api/applicants` | `ApplicantInput` (JSON) | `QueueTicket` |
| `POST /api/applicants/:id/better-place` | `{ cause: BetterPlaceCause }` | `BetterPlaceResult` |
| `POST /api/case` | v1 body + `applicantId?` | v1 |
| `GET /api/leaderboard` | `?sort=fines\|jail\|recent&limit=50&cursor=` | `{ entries: LeaderboardEntry[], next: string \| null }` |
| `GET /api/leaderboard/stream` | SSE | `LeaderboardEntry` per new verdict; on connect top 20 by fines |
| `GET /api/leaderboard/:caseId` | — | `{ entry: LeaderboardEntry, findings: Notice["findings"] }` (no full report) |
| `GET /api/case/:caseId/report.pdf` | — | `application/pdf` |
| `GET /api/case/:caseId/badge.png` | — | `image/png` 1080×1080 |
| `GET /api/photos/:id.jpg` | — | applicant selfie (server re-encodes to 512 px JPEG, EXIF stripped) |

### Fines model (server)

Each cited provision yields one `fine` event. `amountEur` is a deterministic share (seeded by
caseId) of the **real statutory maximum** (AI Act Art. 99: €35M/7%, €15M/3%, €7.5M/1%; GDPR
Art. 83: €20M/4%, €10M/2%; DSA Art. 52: 6%; DMA Art. 30: 10%; NIS2 Art. 34: €10M/2%; CRA Art. 64:
€15M/2.5%; Data Act; ePrivacy national), scaled up for comedy as the tier rises. `jailMonths`
comes from real national criminal provisions where they exist (e.g. DE BDSG §42 up to 3 years,
FR Code pénal art. 226-16 up to 5 years) else 0; `caption` is the gag line. Totals are monotonic.

### Meanwhile — "while you were being processed" (Vitaly, 2026-10-10 01:50)

The running joke of the whole product: while the applicant sits in the EU queue and gets
roasted, the rest of the world ships. Every case carries a live **Meanwhile** counter:

> *While you were being processed (4 min 12 s): **China** built 11 new AI models — one of
> them achieved superintelligence. **The US** built 3 and raised $40 bn. **Europe** adopted
> 27 new regulations and 412 forms you now have to fill in to start your startup.*

- **Server (server-v2)** computes it from elapsed seconds since the applicant registered
  (or the case was created): deterministic per caseId, monotonic, absurd rates (China ≫ US;
  EU counts regulations + forms, forms ≫ regulations). Emits `{ type: "meanwhile" }`
  roughly every 5 s while a round streams and once right before `verdict`; puts the final
  value in `NoticeV2.meanwhile`. Rotating `note` quips per country (a small list, seeded by
  caseId). The tier-5 verdict prompt gets the final numbers so an officer can deliver it as
  the closing line ("Meanwhile, Monsieur, China built eleven models. We built you a form.").
  Leaderboard entries may carry it too (optional).
- **Stage (stage-v2)**: a persistent three-column "MEANWHILE" scoreboard (🇨🇳 models · 🇺🇸
  models · 🇪🇺 regulations + forms) ticking on the live-case view; a global version (sum
  across all cases today) on the QR intro and leaderboard views.
- **PWA (pwa-v2)**: the same three counters small at the top during queue + roast; full
  "While you were being processed…" card at the verdict, above Share.
- **Report + badge (report-badge)**: one line on the badge under the fine ("Meanwhile: 🇨🇳 11
  AI models · 🇺🇸 3 · 🇪🇺 27 regulations + 412 forms"), a boxed paragraph on the PDF TL;DR page.
- Flags as emoji or plain text only — no official EU emblem.

## Game — "Eurocrat: Whack-a-Model" (Vitaly, 2026-10-10 02:00)

A side game outside the main roast flow: a 3×3 grid of holes, AI models pop up and vanish
fast, you **stamp every non-EU model** as fast as you can. Stamp a European model and you
lose points. Mostly Chinese and American models (the real distribution), very rarely
**Mistral** — the only European one. Score + rank at the end, shareable, global leaderboard.

- **Package** `packages/game` (Lane G), built by Vite with base `/game/`, served by the
  server at `/game/` (like `/pocket/`). Plain TS + canvas/DOM, no framework required,
  mobile-first, touch + mouse, 60 fps on a mid phone. Works standalone in any browser and
  embedded: the PWA (`/pocket/`) and the stage link to it, the **iPhone app embeds it in a
  WKWebView** (`https://eurocrat.pro7ocol.com/game/?embed=1` hides the site chrome and posts
  `{type:"score", ...}` to `window.webkit?.messageHandlers?.eurocrat` when a game ends).
- **Models**: name + maker + flag + brand-ish colour tile. **No real company logos** (trademark)
  — names, flags and colours only. Pool (weights ≈ share of real releases): CN — DeepSeek,
  Qwen, Kimi, GLM, MiniMax, Doubao, Ernie, Hunyuan, Yi; US — GPT, Claude, Gemini, Llama, Grok,
  Phi, Nova, Command (Cohere is CA — counts as non-EU); EU — **Mistral** only (≈ 3–5 % of pops).
  `models.json` so the list is data.
- **Rules**: 45 s round; pop-up lifetime starts ~1.1 s and shrinks to ~0.45 s; up to 3 holes
  live at once later on. Hit non-EU = +100 × combo (combo grows each consecutive hit, resets
  on a miss or a Mistral hit); stamping Mistral = −500 + big red "YOU BANNED THE ONLY ONE WE
  HAD" + screen shake; a non-EU model that escapes = −25 ("escaped into the single market").
  Stamp words random per hit: REFUSÉ, VERBOTEN, INTERDIT, BANNED, PROHIBITED ART. 5,
  NON-CONFORME, VIETATO, PROHIBIDO, ZAKAZANE, SEE ANNEX III, PENDING DELEGATED ACT. Ink splat,
  stamp sound (WebAudio, synthesized), haptic `navigator.vibrate(15)` where supported.
- **End screen**: score, hits, Mistral accidents, best combo, **rank title** by score
  (Intern (stagiaire) → Desk Officer → Head of Unit → Director → Director-General →
  Commissioner → "President of the Commission"), the Meanwhile joke ("During your 45 s,
  China released 2 more models"), share card PNG (Web Share API / download), "play again",
  and link back to the roast.
- **Leaderboard** (server, Lane G owns it as a Fastify plugin `gamePlugin` in
  `packages/game/server/`, helm registers it at merge): `POST /api/game/score`
  `{ name: string (≤ 24), score, hits, mistralHits, bestCombo, durationMs, seed, token }` →
  `{ rank }`; `GET /api/game/leaderboard?limit=20` → top scores today; light anti-cheat:
  server-issued `GET /api/game/start` → `{ seed, token }` (HMAC, 2 min TTL), score capped by
  a plausible max for the seed/duration; per-IP rate limit. Stored in SQLite under DATA_DIR
  (own table/file — don't touch the roast DB schema).

## Arcade — four Eurocrat games (Vitaly, 2026-10-10 02:10)

`/game/` becomes the **Eurocrat Arcade**: a landing page with four game tiles + today's
top score per game. Each game is its own workspace package, Vite build, own base path,
same look (EU blue/yellow, Arial, form numbers, stamps), mobile-first, `?mock=1` (no server),
`?embed=1` (no chrome; posts `{type:"score", game, score, rank, ...}` to
`window.webkit?.messageHandlers?.eurocrat` and `window.parent`), share card PNG at the end,
synthesized WebAudio SFX. **No real company logos, no official EU emblem image.**

| Game | Package | Path | Owner |
|---|---|---|---|
| Whack-a-Model (+ arcade landing + shared leaderboard plugin) | `packages/game` | `/game/` (landing), `/game/whack/` | Lane G |
| Legal or Banned? (swipe) | `packages/swipe` | `/swipe/` | Lane S |
| Regulatory Flappy | `packages/flappy` | `/flappy/` | Lane F |
| In Triplicate (falling forms) | `packages/triplicate` | `/triplicate/` | Lane T |

**Shared leaderboard** (Lane G's `gamePlugin`): every route takes a `game` id
(`"whack" | "swipe" | "flappy" | "triplicate"`): `GET /api/game/start?game=…` → `{seed, token}`,
`POST /api/game/score` `{game, name, score, durationMs, seed, token, stats}` → `{rank}`,
`GET /api/game/leaderboard?game=…&limit=20`. Plausibility caps per game live in the plugin
(each game lane documents its max-score formula in its README; Lane G encodes it).

### Legal or Banned? (`/swipe/`)
Tinder-style cards, each a short product pitch ("An app that reads employees' emotions from
their webcam during meetings"). Swipe **left = BANNED**, **right = ALLOWED**. After each swipe
the card flips: the verdict stamp + the real basis in one deadpan line + citation chip
(EUR-Lex link) — e.g. "PROHIBITED — emotion recognition at work, AI Act Art. 5(1)(f)" or
"ALLOWED — high-risk, Annex III(4). Bring 400 forms." 20 cards per round, 8 s timer per
card, streak bonus. ≥ 80 cards in `cards.json`, drawn from the AI Act (Art. 5 prohibitions,
Annex III high-risk, Art. 50 transparency, minimal-risk) and GDPR/DORA/NIS2 where it's a
clear yes/no. **Every citation must exist in `corpus/provisions.json`** (test enforces it);
the verdict must be legally right (the comedy is that the law is real). End screen: score,
rank ("Would pass the bar in Luxembourg" … "Should not be allowed near a startup"), and
"Analyse your own idea for real →" link to `https://warden.pro7ocol.com/analyze/`.

### Regulatory Flappy (`/flappy/`)
Tap to flap your startup (a tiny rocket/unicorn) through gaps between pillars labelled with
regulations (GDPR, AI Act, DORA, NIS2, CRA, DSA, DMA, Data Act, eIDAS 2, CSRD…). Gaps narrow
and pillars speed up; pickups: "Regulatory sandbox" (brief invincibility, "the sand is not
yet harmonised"), "Delegated act" (pillars suddenly move). Crash → stamp "DISSOLVED" + the
regulation that killed you + one real fact line about it. Score = pillars passed; the
Meanwhile joke on the end screen.

### In Triplicate (`/triplicate/`)
Falling forms (Tetris-like blocks shaped as documents: A-38, Annex IV, DPIA, CE declaration,
Form 27B/6…) drop into three Directorate-General inbox columns; steer/rotate so each form
lands in the matching DG (colour + label). Filling a row of three matched forms stamps
"APPROVED IN TRIPLICATE" and clears it; a wrong inbox sends the form "back to the queue"
(adds a grey junk block). Speeds up; game over when the stack hits the ceiling ("Your file
has been archived"). Touch: swipe to move, tap to rotate; keyboard on desktop.

### v2 amendment — applicant token + photo id (2026-10-10 02:45, helm review of #14)

`applicantId` is public (leaderboard), so it can't authorise anything. Registration
(`POST /api/applicants`) now also returns `applicantToken` (random, 32+ bytes base64url),
returned **only** there. `POST /api/case` with an `applicantId` and
`POST /api/applicants/:id/better-place` require the matching `applicantToken` (JSON body
field, or header `x-applicant-token`) → 403 otherwise; one case per applicant (a second
`POST /api/case` returns the existing caseId). Photos are served under a separate random
`photoId` (`/api/photos/:photoId.jpg`), never the applicantId. `GET
/api/leaderboard/:caseId` returns `{ entry: LeaderboardEntry, findings: … }` as specified.
Clients (pocket PWA, iOS) keep the token in memory/session storage for the session only.

### v2 amendment — stage feeds (2026-10-10 02:25, from stage-v2 #21)

- `GET /api/live` → `{ caseId: string | null, startedAt: string | null }` — the most recently
  *started* case still in progress (null if none in the last 10 min). The stage opens that
  case's stream read-only (replay + live) for its C view. Stream replay must be safe for
  multiple concurrent readers.
- `GET /api/stats` → `{ inQueue: number, refusedToday: number, totalEurToday: number,
  totalJailMonthsToday: number, meanwhileToday: Meanwhile }` — Q view counter and the
  day-total MEANWHILE board. `GET /api/stats/stream` SSE pushes it on every change
  (throttled to ≤ 1/s).

## v2 amendment — express mode, appeal, turnover estimate (server, additive)

- `POST /api/case` accepts optional `mode: "staged" | "express"` (default `"staged"`, unchanged). `"express"` is
  accepted only when the server runs with `EXPRESS_MODE=1` (else 400). The `Case` response echoes `mode` for express cases.
- Express: ONE `GET /api/case/:id/stream` runs tiers 1→5 (`tier` events in order), 5–7 alternating `line`s
  (1 per tier, the tier-5 Meanwhile closer, plus the turnover jibe below), `fine`s per cited provision, `meltdown`
  if crossed, then `verdict`. No `awaiting`; `POST /reply` → 409.
- `POST /api/case/:id/appeal` `{ text?, applicantToken? }` (token / `x-applicant-token` required when the case has
  an applicant) → 204 once, after the verdict; the next stream is one short tier-5 round (2 lines + closer), more
  fines, and a new `verdict`. Second appeal or staged case → 409. Leaderboard/report/badge reflect the new verdict.
- Turnover: never asked from the applicant. If `submission.revenueEur` is absent and the pitch states none, the
  server estimates it once per case (TAM × early share, clamped €50k…€5bn, cached) for the %-of-turnover caps;
  `NoticeV2.turnoverEstimate = { eur, basis }`, and an officer says "The Commission has estimated your turnover
  generously, as is our custom." in round 1. `revenueEur` is still accepted.
- `QUEUE_COUNTDOWN_SEC` (server env): `"6"` or `"5-8"` → `QueueTicket.countdownSec` in that range; unset → 30–60.
