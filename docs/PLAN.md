# PLAN.md — DG ROAST build plan (v1, 2026-10-09)

A v1, not a contract. Amended in place as the event surfaces things; changes go in the
log at the bottom.

**Product:** you pitch your startup out loud; two fictional EU officials (see
`PERSONA.md`) roast it in voice, citing real articles from the EU AI Act, GDPR, NIS2,
DORA, ISO 27001/42001, SOC 2 and NIST AI RMF, escalate through Committee → Trilogue →
Delegated Act, and issue a stamped Notice of Non-Compliance with a fine calculated from
your revenue. A live wall — "the Official Journal of Rejected Startups" — shows what they
are refusing right now.

**Builders:** Devin does the building (Vitaly, standing rule: Devin as much as possible).
helm writes the contract, reviews, merges, deploys and validates. Vitaly decides, approves
the personas, and pitches.

## 0. Blockers — Vitaly, before anything else is dispatched

| # | Need | Why it blocks |
|---|---|---|
| B1 | Event start time, demo time | Lanes are timed backwards from the demo |
| B2 | **Rules on pre-existing code** | If only code written during the event counts, every Devin coding lane waits for kickoff; only non-code prep (persona, faces, voices, comedy bank, docs) may run before. Unknown = assume strict |
| B3 | Sponsor tracks / required APIs | May swap the voice or model stack |
| B4 | Judging criteria | Fun → max the escalation and wall; tech → max the grounding/validator story |
| B5 | Repo public at submission? | Currently private |
| B6 | Approve persona names + faces | They are the product |
| B7 | Venue consent for the public wall | Same as Karen at the 2026-09-20 hackathon |

Devin access to `bioztar/BCN_Hack24h` — **granted 2026-10-09**.

## Stack (reused from Karen — known to work)

| Concern | Choice | Source |
|---|---|---|
| Persona LLM | Nebius Token Factory, `moonshotai/Kimi-K3` | karen `config/models.yaml` |
| Voice | SLNG, two *designed* voices (no cloning) | karen |
| Faces / stills | fal image generation, archetype prompts only | karen / gavel |
| Live lip-sync video (stretch) | fal, Karen Live Director pattern | mission 20260923-karen-live-director |
| Grounding corpus | `bioztar/EU-AI-Act` (done, public) + `bioztar/warden` (in build) + GDPR text from EUR-Lex | — |
| Deploy | Docker compose on the VPS, Caddy, `*.pro7ocol.com` subdomain | karen DEPLOYMENT.md |

## Phase 1 — before the event (non-code only if B2 is strict)

| Step | What | Owner | Effort | Depends on | Parallel with |
|---|---|---|---|---|---|
| P1 | `PERSONA.md` v1 (this repo) | helm | done | — | — |
| P2 | Vitaly approves names, looks, voices brief | **Vitaly** | 15 min | P1 | — |
| P3 | Face pack: 2 officials × 5 expressions (neutral, stamping, smug, appalled, asleep) + 2 office backdrops + stamp art, watermark overlays per tier | Devin (asset session) | 1–2 h | P2 | P4, P5 |
| P4 | Voice design: Formblatt (old, wheezy, Central-European) + Annexe-Vandamme (cool, French-accented) + a "Council" sound-only voice; 10 test lines each | Devin | 1 h | P2 | P3, P5 |
| P5 | Comedy bank: ≥150 gags, each tagged with the provision it hangs off, provision ids verified against the corpus | Devin | 2–3 h | P1, P6 for warden frameworks | P3, P4 |
| P6 | warden PR reviewed + merged (or pinned PR-branch snapshot if the event comes first) | helm | 1 h | Devin warden session | P3–P5 |
| P7 | `CONTRACT.md` (lane boundary, API shapes, event bus) + `ARCHITECTURE.md` | helm | 1 h | P1 | P3–P5 |
| P8 | Mission files + Devin briefs for L1/L2 | helm | 30 min | P7, B1, B2 | — |

## Phase 2 — the 24 hours

Hours count from kickoff (T0). Demo at T24 unless B1 says otherwise.

| Step | What | Owner | Effort | Depends on | Parallel with |
|---|---|---|---|---|---|
| L1 | **Lane A — stage.** Web app: cookie banner from hell → queue ticket → mic capture → officials on screen speaking (stills + expression swaps, SLNG audio) → tier escalation UI with growing Art. 50 watermark → Notice of Non-Compliance card (PNG, stamps, QR to EUR-Lex) → the wall | Devin session A | T0–T14 | P3, P4, P7 | L2 |
| L2 | **Lane B — the ministry.** Server: STT → persona engine (two-voice double act, escalation state) → citation grounding over the corpus with a **validator that drops any provision id not found** → fine calculator → moderation pass → wall feed → rate limiting | Devin session B | T0–T14 | P5, P6, P7 | L1 |
| L3 | Review each lane PR, consolidated fix list back to Devin, merge in contract order | helm | T10–T16 | L1, L2 | — |
| L4 | Deploy to VPS from GitHub, health + E2E on the live URL (pitch → roast → card → wall) | helm | T16–T18 | L3 | L5 |
| L5 | Stretch: live lip-synced video of the officials (fal) | Devin session C | T14–T20 | L4 green | L4 |
| L6 | Comedy tuning: play it 20 times, cut the weak lines, sharpen the tiers | helm + Vitaly | T18–T21 | L4 | — |
| L7 | Demo script + rehearsal (one planted pitch from Vitaly, then a volunteer from the audience) | **Vitaly** | T21–T23 | L6 | — |
| L8 | Freeze, flip repo public if B5, submit | Vitaly + helm | T23–T24 | L7 | — |

**Critical path:** B1/B2 → P2 → P3/P4/P5 → P7 → P8 → L1‖L2 → L3 → L4 → L6 → L7.
**Parallel batches:** {P3, P4, P5, P6, P7}, then {L1, L2}, then {L4, L5}.

## Acceptance (what "done" means on stage)

- A spoken pitch gets a two-voice roast in under ~6 s to first audio.
- Every citation spoken or printed resolves to a real provision in the corpus (validator
  test with deliberately fake ids → dropped).
- The card downloads, carries both stamps, the fine, and a working EUR-Lex QR.
- The wall shows only the officials' lines; moderation blocks a seeded abusive input.
- The live URL survives 30 concurrent visitors (rate-limited, no 500s).
- Nothing in `PERSONA.md` hard rules is violated in 20 consecutive test roasts.

## Risks

| Risk | Mitigation |
|---|---|
| Pre-built code disqualifies entry | B2 asked first; strict reading assumed until answered |
| Hallucinated article numbers | Validator in L2 is an acceptance criterion, not a nice-to-have |
| Provider filter kills a line on stage | Targets rule in PERSONA.md; fallback canned line per tier |
| Audience trolls the wall | Officials' text only + moderation pass |
| Voice latency kills comedic timing | Pre-synthesised stamp/sigh SFX fill the gap; stream TTS |
| warden not merged by event | Grounding starts on EU-AI-Act + GDPR; warden snapshot added when ready |
| Too close to Karen | Different format: double act, procedural escalation, real-law grounding, the certificate |

## Change log

- 2026-10-09 — v1 written by helm after Vitaly picked idea #1 (EU Bureaucrat Roast Bot,
  brain inbox 2026-10-07). Devin repo access granted same day.
