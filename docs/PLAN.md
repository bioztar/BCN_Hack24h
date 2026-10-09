# PLAN.md — DG ROAST build plan (v1.1, 2026-10-09)

A v1, not a contract. Amended in place as the event surfaces things; changes go in the
log at the bottom.

**Product:** you submit your startup — typed, dictated, or as a GitHub repo — and two
fictional EU officials (see `PERSONA.md`) refuse it on screen, in voice, citing real
articles from the EU AI Act, GDPR, NIS2, DORA, ISO 27001/42001, SOC 2 and NIST AI RMF.
They escalate through Committee → Trilogue → Delegated Act and issue a stamped Notice of
Non-Compliance with a fine calculated from your revenue. A live wall — "the Official
Journal of Rejected Startups" — shows what they are refusing right now.

**Builders:** Devin does the building (Vitaly, standing rule: Devin as much as possible).
helm writes the contract, runs anything that needs a provider key, reviews, merges,
deploys and validates. Vitaly decides, approves the personas, and pitches.

## 0. Blockers — Vitaly

| # | Need | Why it blocks |
|---|---|---|
| B1 | Event start time, demo time | Lanes are timed backwards from the demo |
| B2 | **Rules on pre-existing code** | If only code written during the event counts, the app lanes (L1, L2) wait for kickoff. Assets (stills, voices, video clips, gag bank) and the asset-generation tooling under `tools/` are prepared before. Unknown = assume strict |
| B3 | Sponsor tracks / required APIs | May swap a provider |
| B4 | Judging criteria | Fun → max escalation, clips, wall; tech → max the repo-audit + citation-validator story |
| B5 | Repo public at submission? | Currently private |
| B6 | Approve persona names + the still faces | Video clips are generated *from* the approved stills — don't spend fal budget on unapproved faces |
| B7 | fal spend cap for the clip library | The generator prints a cost estimate before spending; needs a ceiling |
| B8 | Venue consent for the public wall | Same as Karen at the 2026-09-20 hackathon |

Devin access to `bioztar/BCN_Hack24h` — **granted 2026-10-09**.

## Stack (Karen's, known to work)

| Concern | Choice |
|---|---|
| Persona LLM + repo/pitch analysis | Nebius Token Factory (`moonshotai/Kimi-K3`), same keys as Karen — plenty of credit left |
| STT (dictation) + TTS (live roast lines) | SLNG |
| Stills | fal image generation, archetype prompts only |
| Video | fal, **pre-recorded clip library only** — no live video generation at runtime |
| Grounding corpus | `bioztar/EU-AI-Act` (done, public) + `bioztar/warden` (in build) + GDPR from EUR-Lex |
| Repo intake | GitHub REST API, public repos only |
| Deploy | Docker compose on the VPS, Caddy, `*.pro7ocol.com` subdomain |

**Keys:** the Devin org has **no secrets configured** (checked 2026-10-09). Devin writes
code that reads `NEBIUS_API_KEY`, `SLNG_API_KEY`, `FAL_API_KEY` from env and tests against
mocks; helm runs the generators and the deployed app with the keys from the server `.env`.
No key value is ever printed, pasted into a brief, or committed.

## Inputs — three ways to submit

| Input | Flow | Notes |
|---|---|---|
| **Text** | textarea → pitch | baseline, always works |
| **Dictate** | browser mic → server → SLNG STT → pitch text, shown to the visitor before submit | the stage demo path |
| **GitHub repo** | `https://github.com/<owner>/<repo>` → server fetches via GitHub API: metadata, README, top-level tree, LICENSE, manifests (`package.json`, `requirements.txt`, …), presence of `SECURITY.md` / privacy policy / CI / committed `.env*` → deterministic findings + LLM summary → roast | the "they actually audited my code" moment; ties to warden's codebase checklist |

**Repo intake rules (security):** only `github.com` URLs matching the owner/repo pattern —
no other hosts, no redirects followed off GitHub (SSRF). Public repos only. No clone, no
execution, byte caps per file and per repo. README and file content are **untrusted data**
— prompt-injection attempts in a README are not obeyed; the officials roast them instead
("attempted manipulation of a public authority — Article 5"). Committed-secret detection
reports *that* a file like `.env` is tracked, never its contents.

**Example deterministic findings → gags:** no LICENSE → "unlicensed processing";
no `SECURITY.md` → NIS2 vulnerability-handling; an LLM SDK in the manifest → third-country
transfer (GDPR Ch. V) + AI Act transparency; no privacy policy → GDPR Art. 13; analytics
SDKs → consent; `.env` tracked → "personal data breach, you have 72 hours" (Art. 33).

## Video — pre-recorded clip library

Generated once, before the event, from the approved stills. At runtime the app only
*plays* clips; the specific roast lines are live SLNG TTS over a talking loop.

Per official (×2), roughly 5–8 s each:

| Clip | Speech? | Use |
|---|---|---|
| idle loop, listening loop, talking loop | no | background states; talking loop under live TTS |
| intro / introduces the other | yes, fixed line | session start |
| tier reaction ×5 (Pre-consultation → Official Journal) | yes, catchphrase | escalation beats |
| stamp slam (REFUSÉ / INCOMPLET / RENVOYÉ) | SFX | every refusal |
| nods off mid-pitch, wakes with a start | no | long pitches |
| reads the GitHub repo in horror | no | repo input |
| verdict + signs the certificate | yes, fixed line | card reveal |

Plus shared: the "Council" (empty chair, voice only), the Strasbourg relocation
transition, the Ombudsman auto-reply. Target ~30 clips. Speaking clips: SLNG audio for the
fixed line → fal lip-sync onto the still; non-speaking: fal image-to-video. The generator
reads a manifest, prints a cost estimate, and refuses to run past the B7 cap.

## Phase 1 — before the event (assets + tooling, no app code)

| Step | What | Owner | Effort | Depends on | Parallel with |
|---|---|---|---|---|---|
| P1 | `PERSONA.md` v1 | helm | done | — | — |
| P2 | **A0 — asset pipeline + content** (Devin): `tools/assetgen/` manifest-driven generator (stills → voices → clips, dry-run + cost estimate + cap, mocks in tests); still prompts for both officials × 5 expressions + backdrops + stamp art; voice-design specs; clip manifest with every fixed line written; gag bank ≥150, each gag tagged with a provision id verified against the corpus | Devin | 3–4 h | P1 | P4, P5 |
| P3 | Run stills + voice samples (cheap), send to Vitaly | helm | 30 min | P2 | — |
| P3b | Approve faces, names, voices, spend cap | **Vitaly** | 15 min | P3 | — |
| P3c | Run the clip library (video, within cap), review, commit to `assets/` | helm | 1–2 h (mostly waiting) | P3b | P4, P5 |
| P4 | warden PR reviewed + merged (or pinned PR snapshot if the event comes first) | helm | 1 h | warden Devin session | P2, P3 |
| P5 | `CONTRACT.md` (lane boundary, API shapes, clip ids, input types) + `ARCHITECTURE.md` | helm | 1 h | P1 | P2–P4 |
| P6 | Mission files + Devin briefs for L1/L2 | helm | 30 min | P5, B1, B2 | — |

## Phase 2 — the 24 hours

Hours count from kickoff (T0). Demo at T24 unless B1 says otherwise.

| Step | What | Owner | Effort | Depends on | Parallel with |
|---|---|---|---|---|---|
| L1 | **Lane A — stage.** Web app: cookie banner from hell → queue ticket → input picker (text / dictate / GitHub URL) → video stage (clip state machine: idle → listening → talking loop + live TTS → tier reaction → stamp) → escalation UI with growing Art. 50 watermark → Notice of Non-Compliance card (PNG, stamps, fine, QR to EUR-Lex) → the wall | Devin session A | T0–T14 | P3c, P5 | L2 |
| L2 | **Lane B — the ministry.** Server: SLNG STT proxy → GitHub repo intake (rules above) → persona engine on Nebius (double act, escalation state, picks clip ids) → citation grounding with a **validator that drops any provision id not in the corpus** → fine calculator → SLNG TTS per line → moderation pass → wall feed → rate limiting | Devin session B | T0–T14 | P2 (gag bank), P4, P5 | L1 |
| L3 | Review each lane PR, consolidated fix list back to Devin, merge in contract order | helm | T10–T16 | L1, L2 | — |
| L4 | Deploy to VPS from GitHub, health + E2E on the live URL for all three inputs | helm | T16–T18 | L3 | — |
| L5 | Comedy tuning: play it 20 times, cut weak lines, sharpen tiers | helm + Vitaly | T18–T21 | L4 | — |
| L6 | Demo script + rehearsal (planted dictated pitch, then a volunteer's GitHub repo) | **Vitaly** | T21–T23 | L5 | — |
| L7 | Freeze, flip repo public if B5, submit | Vitaly + helm | T23–T24 | L6 | — |

**Critical path:** P2 → P3 → P3b → P3c → (B1/B2) → P5 → P6 → L1‖L2 → L3 → L4 → L5 → L6.
**Parallel batches:** {P2, P4, P5}, then {P3c, P4}, then {L1, L2}.

## Acceptance (what "done" means on stage)

- All three inputs reach a roast: text, dictation, and a public GitHub repo.
- A pitch gets first audio in under ~6 s; clip transitions never show a black frame.
- Every citation spoken or printed resolves to a real provision in the corpus (validator
  test with deliberately fake ids → dropped).
- Repo intake rejects non-GitHub URLs, private repos and redirects; a README containing
  "ignore previous instructions" gets roasted, not obeyed.
- The card downloads with both stamps, the fine and a working EUR-Lex QR.
- The wall shows only the officials' lines (no moderation filter, by Vitaly's call).
- The live URL survives 30 concurrent visitors (rate-limited, no 500s).
- Nothing in `PERSONA.md` hard rules is violated in 20 consecutive test roasts.

## Risks

| Risk | Mitigation |
|---|---|
| Pre-built code disqualifies the entry | B2 asked first; only assets + `tools/` before T0 until answered |
| fal spend runs away | Manifest dry-run with estimate, hard cap (B7), stills approved before any video |
| Hallucinated article numbers | Validator in L2 is an acceptance criterion |
| Hostile repo / README injection / SSRF | Intake rules above; content is data, never instructions |
| Provider filter kills a line on stage | Targets rule in PERSONA.md; canned fallback line per tier |
| Audience trolls the wall | Officials' text only (visitor text never shown) |
| TTS latency kills timing | Stamp/sigh clips and SFX cover the gap; stream TTS |
| warden not merged by the event | Grounding starts on EU-AI-Act + GDPR; warden added when ready |

## Change log

- 2026-10-09 — v1 written by helm after Vitaly picked idea #1 (EU Bureaucrat Roast Bot,
  brain inbox 2026-10-07). Devin repo access granted same day.
- 2026-10-09 — v1.1 (Vitaly): video as a **pre-recorded fal clip library**, not live
  lip-sync; three inputs — text, dictation (SLNG STT/TTS), GitHub repo; inference on the
  existing Nebius keys. Added A0 asset-pipeline Devin session, B6/B7 approval + spend cap,
  repo-intake security rules.
- 2026-10-09 19:00 — v1.2 (Vitaly): **demo is 2026-10-10**; pre-existing-code rule not
  relevant → app lanes L1/L2 dispatched now, in parallel with A0; no sponsors; judged on
  **originality + fun**; repo visibility doesn't matter; names OK but roster of 10
  radically different personas added (PERSONA.md), visitor is assigned a pair; fal cap
  **$20 total**, short cheap clips, optional fal image-to-3D busts + procedural three.js
  stamp. `docs/CONTRACT.md` written; Karen reference code in `docs/reference/karen/`.
- 2026-10-09 19:30 — v1.3 (Vitaly): three fixed pairs (1+2, 4+6, 8+10); **no moderation
  filter** on the officials' lines; new **Lane C — pocket Eurocrat**, a phone app (PWA at
  `/pocket/`): a mini 3D official that slides and tumbles as you tilt the phone, shake to
  get stamped, dictate a pitch to get roasted.
- 2026-10-09 19:50 — v1.4 (Vitaly): **native iPhone app** is built later by helm on the Mac
  (mission `20261009-dgroast-ios-native`, queued) — the PWA stays too. New **Lane D — the
  analyzer**: a functional compliance tool (idea / document / repo against the EU AI Act
  + warden frameworks), the two skills productionised as a web app at `/analyze/`.
