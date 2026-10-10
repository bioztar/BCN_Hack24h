# Card audit — Legal or Banned?

Every card checked against `EU-AI-Act/analysis/risk-tier-classifier.md` (AI Act) and warden's
`frameworks/{gdpr,dora,nis2}.md`, with full article text from the EU-AI-Act and warden corpora.
"High" = the verdict and the provision follow from the article text and the pitch as written.
"Medium" = the verdict holds, but the edges need a note.

**Removed as debatable:** `abduction-search` (Art. 5(1)(h) exception exists only if the Member
State legislates, Art. 5(5)), `shop-emotion` (AI Act says high-risk, but the GDPR basis for
biometric emotion analysis of shoppers is contested), `border-polygraph` and
`evidence-reliability` (Annex III(6)–(7) are high-risk only "in so far as their use is permitted
under relevant Union or national law").

**Reworded so the pitch states the deciding fact:** human sign-off on the Annex III decision
cards (no GDPR Art. 22 sole-automation trap), 'large' operators for the NIS2 size cap,
'launched in 2026' for GPAI, a notified body for the medical device, a professional deployer for
the deepfake, a password leak for the breach.

High-risk cards show their admission fee in one line (`costLine` in `src/game.ts`):
conformity assessment, CE mark, registration (EU database; national level for Annex III(2); none
for the Annex I product path) and human oversight — AI Act Arts. 43, 48, 49, 14.

| # | Card | Verdict | Provision | Conf. | Note |
|---|---|---|---|---|---|
| 1 | `emotion-webcam` | BANNED — prohibited | AI Act Art. 5(1)(f) | High |  |
| 2 | `emotion-classroom` | BANNED — prohibited | AI Act Art. 5(1)(f) | High |  |
| 3 | `emotion-callcentre` | BANNED — prohibited | AI Act Art. 5(1)(f) | High |  |
| 4 | `social-score-city` | BANNED — prohibited | AI Act Art. 5(1)(c) | High |  |
| 5 | `social-score-platform` | BANNED — prohibited | AI Act Art. 5(1)(c) | High |  |
| 6 | `face-scraper` | BANNED — prohibited | AI Act Art. 5(1)(e) | High |  |
| 7 | `cctv-scraper` | BANNED — prohibited | AI Act Art. 5(1)(e) | High |  |
| 8 | `precrime` | BANNED — prohibited | AI Act Art. 5(1)(d) | High |  |
| 9 | `orientation-face` | BANNED — prohibited | AI Act Art. 5(1)(g) | High |  |
| 10 | `religion-face` | BANNED — prohibited | AI Act Art. 5(1)(g) | High |  |
| 11 | `politics-face` | BANNED — prohibited | AI Act Art. 5(1)(g) | High |  |
| 12 | `union-biometric` | BANNED — prohibited | AI Act Art. 5(1)(g) | High |  |
| 13 | `toy-stunts` | BANNED — prohibited | AI Act Art. 5(1)(b) | High |  |
| 14 | `loan-distress` | BANNED — prohibited | AI Act Art. 5(1)(b) | High |  |
| 15 | `subliminal-shop` | BANNED — prohibited | AI Act Art. 5(1)(a) | Medium | Art. 5(1)(a) needs significant harm — pitch states it ('wreck their finances'). |
| 16 | `elderly-savings` | BANNED — prohibited | AI Act Art. 5(1)(b) | High |  |
| 17 | `police-live-fr` | BANNED — prohibited | AI Act Art. 5(1)(h) | High | 'Every street, all day, just in case' meets none of the three Art. 5(1)(h) objectives. |
| 18 | `driver-fatigue` | ALLOWED — exception | AI Act Art. 5(1)(f) | High | Art. 5(1)(f) exempts safety uses; Recital 18 also excludes fatigue from 'emotion'. |
| 19 | `face-unlock` | ALLOWED — not high-risk | AI Act Annex III(1)(a) | High | Annex III(1)(a) excludes 1:1 biometric verification. |
| 20 | `fraud-detection` | ALLOWED — not high-risk | AI Act Annex III(5)(b) | High | Annex III(5)(b) expressly excludes financial-fraud detection. |
| 21 | `cv-ranker` | ALLOWED — high-risk | AI Act Annex III(4)(a) | High |  |
| 22 | `warehouse-promote` | ALLOWED — high-risk | AI Act Annex III(4)(b) | High |  |
| 23 | `credit-score` | ALLOWED — high-risk | AI Act Annex III(5)(b) | High |  |
| 24 | `life-insurance` | ALLOWED — high-risk | AI Act Annex III(5)(c) | High |  |
| 25 | `ambulance-triage` | ALLOWED — high-risk | AI Act Annex III(5)(d) | High |  |
| 26 | `uni-admissions` | ALLOWED — high-risk | AI Act Annex III(3)(a) | High |  |
| 27 | `exam-grader` | ALLOWED — high-risk | AI Act Annex III(3)(b) | High |  |
| 28 | `proctoring` | ALLOWED — high-risk | AI Act Annex III(3)(d) | High |  |
| 29 | `grid-safety` | ALLOWED — high-risk | AI Act Annex III(2) | High |  |
| 30 | `traffic-lights` | ALLOWED — high-risk | AI Act Annex III(2) | High |  |
| 31 | `judge-assistant` | ALLOWED — high-risk | AI Act Annex III(8)(a) | Medium | Annex III(8)(a) wording; a purely preparatory tool could claim Art. 6(3) — verdict ALLOWED either way. |
| 32 | `asylum-assessor` | ALLOWED — high-risk | AI Act Annex III(7)(c) | High |  |
| 33 | `benefits-eligibility` | ALLOWED — high-risk | AI Act Annex III(5)(a) | High |  |
| 34 | `targeted-job-ads` | ALLOWED — high-risk | AI Act Annex III(4)(a) | High |  |
| 35 | `gig-allocation` | ALLOWED — high-risk | AI Act Annex III(4)(b) | High |  |
| 36 | `xray-device` | ALLOWED — high-risk | AI Act Art. 6(1) | High | Art. 6(1) needs third-party assessment — pitch says notified body. Applies from 2 Aug 2027. |
| 37 | `lift-brake` | ALLOWED — high-risk | AI Act Art. 6(1) | High | Lifts Directive safety components need a notified body. Applies from 2 Aug 2027. |
| 38 | `honest-chatbot` | ALLOWED — label | AI Act Art. 50(1) | High |  |
| 39 | `sandra-bot` | BANNED — non-compliant | AI Act Art. 50(1) | High |  |
| 40 | `watermarked-images` | ALLOWED — label | AI Act Art. 50(2) | High |  |
| 41 | `politician-deepfake` | BANNED — non-compliant | AI Act Art. 50(4) | High | Deployer is a professional agency, so no Art. 2(10) personal-use escape. |
| 42 | `labelled-satire` | ALLOWED — label | AI Act Art. 50(4) | High |  |
| 43 | `unmarked-voice` | BANNED — non-compliant | AI Act Art. 50(2) | High |  |
| 44 | `robot-news` | BANNED — non-compliant | AI Act Art. 50(4) | High |  |
| 45 | `spam-filter` | ALLOWED — minimal | AI Act Art. 95 | High |  |
| 46 | `game-enemies` | ALLOWED — minimal | AI Act Art. 95 | High |  |
| 47 | `inventory` | ALLOWED — minimal | AI Act Art. 95 | High |  |
| 48 | `recipe-ranker` | ALLOWED — minimal | AI Act Art. 95 | High |  |
| 49 | `email-sorter` | ALLOWED — minimal | AI Act Art. 95 | High |  |
| 50 | `bakery-routes` | ALLOWED — minimal | AI Act Art. 95 | High |  |
| 51 | `military` | ALLOWED — out of scope | AI Act Art. 2(3) | Medium | Out of AI Act scope (Art. 2(3)); other law (IHL) still applies — verdict is about EU AI rules. |
| 52 | `research-only` | ALLOWED — out of scope | AI Act Art. 2(6) | High |  |
| 53 | `personal-use` | ALLOWED — out of scope | AI Act Art. 2(10) | High |  |
| 54 | `gpai-no-copyright` | BANNED — non-compliant | AI Act Art. 53(1)(c) | High | 'Launched in 2026' rules out the Art. 111(3) grace period. |
| 55 | `gpai-documented` | ALLOWED — lawful | AI Act Art. 53(1) | High |  |
| 56 | `big-flops` | ALLOWED — lawful | AI Act Art. 51(2) | High |  |
| 57 | `preticked` | BANNED — unlawful | GDPR Art. 4(11) | High | Art. 4(11) 'clear affirmative action'; Recital 32: pre-ticked boxes are not consent. |
| 58 | `fax-unsubscribe` | BANNED — unlawful | GDPR Art. 7(3) | High |  |
| 59 | `pay-for-copy` | BANNED — unlawful | GDPR Art. 12(5) | High |  |
| 60 | `never-delete` | BANNED — unlawful | GDPR Art. 17(1) | High |  |
| 61 | `auto-loan` | BANNED — unlawful | GDPR Art. 22(3) | High |  |
| 62 | `health-inferred` | BANNED — unlawful | GDPR Art. 9(1) | High |  |
| 63 | `breach-72h` | ALLOWED — lawful | GDPR Art. 33(1) | High |  |
| 64 | `breach-6months` | BANNED — unlawful | GDPR Art. 33(1) | High | Password leak rules out the 'unlikely to result in a risk' exemption. |
| 65 | `address-book` | ALLOWED — out of scope | GDPR Art. 2(2)(c) | High |  |
| 66 | `kids-signup` | BANNED — unlawful | GDPR Art. 8(1) | High | Art. 8(1): Member States may lower 16 to no less than 13. |
| 67 | `ignore-objection` | BANNED — unlawful | GDPR Art. 21(3) | High |  |
| 68 | `export-data` | ALLOWED — lawful | GDPR Art. 20(1) | High |  |
| 69 | `order-delivery` | ALLOWED — lawful | GDPR Art. 6(1)(b) | High |  |
| 70 | `public-by-default` | BANNED — unlawful | GDPR Art. 25(2) | High |  |
| 71 | `cctv-forever` | BANNED — unlawful | GDPR Art. 5(1)(e) | High |  |
| 72 | `weather-bloodtype` | BANNED — unlawful | GDPR Art. 5(1)(c) | High |  |
| 73 | `no-dpo` | BANNED — unlawful | GDPR Art. 37(1)(b) | High |  |
| 74 | `no-dpia` | BANNED — unlawful | GDPR Art. 35(3)(b) | High |  |
| 75 | `latin-policy` | BANNED — unlawful | GDPR Art. 12(1) | High |  |
| 76 | `hospital-late` | BANNED — non-compliant | NIS2 Art. 23(4)(a) | Medium | NIS2 is a directive: bites via national transposition (pitch says 'large' for the size cap). |
| 77 | `energy-ontime` | ALLOWED — lawful | NIS2 Art. 23(4) | High |  |
| 78 | `board-ignores` | BANNED — non-compliant | NIS2 Art. 20(1) | Medium | Same: national transposition. |
| 79 | `water-no-plan` | BANNED — non-compliant | NIS2 Art. 21(2) | Medium | Same: national transposition; 'large' covers the size cap. |
| 80 | `bank-reports` | ALLOWED — lawful | DORA Art. 19(1) | High |  |
| 81 | `bank-hides` | BANNED — non-compliant | DORA Art. 19(1) | High |  |
| 82 | `bank-no-exit` | BANNED — non-compliant | DORA Art. 28(8) | High |  |
| 83 | `bank-no-backup` | BANNED — non-compliant | DORA Art. 12(1) | High |  |
| 84 | `bank-vague-contract` | BANNED — non-compliant | DORA Art. 30(2)(a) | High |  |
| 85 | `egate-verify` | ALLOWED — not high-risk | AI Act Annex III(1)(a) | High | Annex III(1)(a) excludes verification; (7)(d) excludes travel-document checks. |
| 86 | `film-deepfake` | ALLOWED — label | AI Act Art. 50(4) | High |  |
| 87 | `open-gpai` | ALLOWED — lawful | AI Act Art. 53(2) | High | Art. 53(2) exempts open-source non-systemic models from (1)(a)–(b) only; (c)–(d) are met. |
| 88 | `access-free` | ALLOWED — lawful | GDPR Art. 15(3) | High |  |
| 89 | `cafe-no-dpo` | ALLOWED — lawful | GDPR Art. 37(1) | High | None of Art. 37(1)(a)–(c) applies to a café loyalty list. |
| 90 | `weather-ai` | ALLOWED — minimal | AI Act Art. 95 | High |  |
| 91 | `salary` | ALLOWED — lawful | GDPR Art. 6(1)(b) | High |  |
| 92 | `music-recs` | ALLOWED — minimal | AI Act Art. 95 | High |  |
