# Gap Checklist — Product Idea Audit

Run against a pitch, concept note, or early product idea. Fast triage: classify, then list the compliance bill. Output per item: YES / NO / UNCLEAR with one-line reasoning. Order = severity.

## Gate questions

- [ ] **G1. Is it an AI system?** Machine-based, autonomous to a degree, infers outputs (predictions/content/recommendations/decisions) influencing environments. If it's plain deterministic software without inference — likely out of scope; say so and stop. (Art. 3(1))
- [ ] **G2. Any prohibited practice in the core value proposition?** Manipulation/vulnerability exploitation/social scoring/criminality prediction via profiling/facial scraping/workplace-or-school emotion inference/protected-attribute biometric categorisation/law-enforcement real-time biometric ID. One YES = idea dead as proposed; check whether a narrowed purpose avoids 5(1). (Art. 5)
- [ ] **G3. EU nexus?** Placing on market/putting into service in EU, or output used in EU by EU-established deployer, even for non-EU providers. No EU nexus → document and monitor customer usage. (Art. 2(1)(a)–(c))
- [ ] **G4. Exclusion applies?** Military/defence/national security; pure scientific R&D; pre-market research phase; personal non-professional use; open-source release not used as high-risk/Art. 50/prohibited system. (Art. 2)

## Classification

- [ ] **K1. High-risk by Annex I product path?** Safety component/product under Annex I legislation + third-party assessment required. Note: obligations bite from 2 Aug 2027. (Art. 6(1), 113(c))
- [ ] **K2. High-risk by Annex III path?** Walk all eight areas (biometrics, critical infrastructure, education, employment, essential services incl. credit scoring, law enforcement, migration/border, justice/elections).
- [ ] **K3. If K2 yes — does Art. 6(3) derogation plausibly apply?** Narrow procedural task / improving completed human activity / pattern detection / preparatory task AND no material influence on decisions AND **no profiling of natural persons** (profiling kills the derogation). Budget for the written assessment + registration duty. (Arts. 6(3)-(4), 49(2))
- [ ] **K4. Is the core asset a GPAI model?** Significant generality + wide task competence + integrability. Estimate training compute vs 10²⁵ FLOP systemic-risk presumption. (Arts. 3(63), 51)
- [ ] **K5. Transparency triggers present?** Direct user interaction, synthetic content generation, emotion recognition/biometric categorisation deployment, deepfakes, public-interest text generation. (Art. 50)
- [ ] **K6. Otherwise minimal tier** — residual duties: AI literacy, voluntary codes, GDPR. (Arts. 4, 95)

## Compliance bill estimate

For each tier hit above, enumerate:

- [ ] **B1. Provider duty stack**: Section 2 requirements (risk mgmt, data governance, tech doc, logging, transparency, oversight, accuracy/robustness/cybersecurity) + QMS + conformity assessment + declaration + CE + registration + PMM + incident reporting. (Arts. 8–15, 16–21, 72–73)
- [ ] **B2. Deployer duties your customers will face** (they'll ask): use per instructions, oversight staffing, input-data quality, monitoring, log retention ≥6 months, worker notification, affected-person notification, FRIA if public-body/public-service/credit-scoring context. (Arts. 26–27)
- [ ] **B3. Timeline fit**: Annex III obligations are already in force (applicable since 2 Aug 2026) — are you compliant now, not planning ahead? Annex I product-path obligations still have runway to 2 Aug 2027. Notified-body lead time where relevant.
- [ ] **B4. Fine exposure framing**: up to €35M/7% (prohibited), €15M/3% (most obligations), €7.5M/1% (misleading info); SME cap = lower of amount/percentage. (Art. 99)

## Red flags needing re-scoping

- [ ] **R1. "We'll figure out classification later"** — intended purpose drives classification; deferring means designing blind.
- [ ] **R2. Emotion features aimed at workplaces/schools** as a selling point — prohibition territory (5(1)(f)); medical/safety purposes are the only lane.
- [ ] **R3. Credit scoring without fraud-detection exemption awareness**, or insurance pricing on life/health without high-risk planning. (Annex III 5(b)-(c))
- [ ] **R4. Biometrics bundled casually** — remote ID is Annex III 1(a) with four-eyes verification; verification-only is excluded.
- [ ] **R5. Open-source as a compliance escape hatch** — works only outside high-risk/prohibited/Art. 50 uses, and only with weights+architecture+usage info actually public. (Arts. 2(12), 53(2))

Verdict rule: G2 YES → redesign required. K1/K2 YES → full provider program needed; estimate 6–18 months of process build-out alongside engineering. K5 YES only → modest transparency engineering. K6 → document and move on.
