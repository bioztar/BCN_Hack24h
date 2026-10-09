# Gap Checklist — Codebase Audit

Run against a repository implementing (or claimed to implement) an AI system. For each item output: PASS / FAIL / UNKNOWN + evidence (file paths, code refs). Order = severity. Citations are binding articles.

## Critical — market-entry blockers

- [ ] **C1. Prohibited-practice scan**: does any code path implement Art. 5(1)(a)–(h) functionality (subliminal/manipulative techniques; vulnerability exploitation; social scoring; criminal-risk prediction via profiling alone; untargeted facial scraping; workplace/education emotion inference; biometric categorisation of protected attributes; law-enforcement real-time biometric ID without the 5(1)(h) regime)? Any hit → system is unlawful regardless of other compliance.
- [ ] **C2. Tier determination artifact exists**: documented classification decision (high-risk path Annex I vs Annex III, or Art. 6(3) derogation with profiling check). If claiming non-high-risk under 6(3): is there a pre-market written assessment + EU-database registration? (Arts. 6(4), 49(2))
- [ ] **C3. Technical documentation**: repo generates/contains Annex IV content — general description, instructions-for-use elements, methodology incl. human oversight, development/testing/validation data on metrics, evaluation results, deployment monitoring plan. (Art. 11)
- [ ] **C4. Conformity-assessment evidence**: which module applies (Annex VI internal control / Annex VII notified body)? Certificates, EU declaration of conformity (Annex V), CE marking artifacts present where required. (Arts. 43–48)

## High — legal exposure if missing

- [ ] **H1. Logging capability**: automatic event recording over lifetime covering risk identification, post-market monitoring, operation monitoring; for remote biometric ID also use-periods, reference DB, match inputs, verifier IDs. ≥6-month retention implemented. (Arts. 12, 19)
- [ ] **H2. Human-oversight affordances in product surface**: override/reject output path; stop button / safe-state interruption; automation-bias mitigations (confidence display, uncertainty); interpretation support. Four-eyes verification workflow for Annex III 1(a) identifications unless lawful exemption. (Art. 14(4)-(5))
- [ ] **H3. Accuracy/robustness test gates**: CI runs benchmarks against declared metrics and probabilistic thresholds; declared accuracy levels match what instructions ship. Feedback-loop protection if online learning exists. (Arts. 9(8), 15)
- [ ] **H4. AI-specific security controls** addressing data poisoning, model poisoning, adversarial evasion, confidentiality attacks; or cybersecurity certification under Reg. 2019/881 scheme referenced in OJ. (Art. 15(5), 42(2))
- [ ] **H5. Data governance records**: dataset provenance/preparation/bias-review files per training/validation/test set; special-category data processing (if any) meets all six conditions of 10(5)(a)–(f).
- [ ] **H6. Incident pipeline**: code/config to detect, classify (serious incident definitions Art. 3(49)), and report within 15d/10d/2d windows; deployer-side suspension logic. (Art. 73, 26(5))

## Medium — audit findings waiting to happen

- [ ] **M1. Instructions-for-use content generator** covering all Art. 13(3) minimum fields incl. pre-determined changes list.
- [ ] **M2. Substantial-modification gate**: release process distinguishes in-envelope changes vs substantial modifications requiring re-assessment (43(4)); change taxonomy documented.
- [ ] **M3. QMS traces**: version control of tech docs; corrective-action workflow; management review records; resource/accountability assignments. (Art. 17)
- [ ] **M4. Registration payload generation** from release metadata (Annex VIII Section A fields). (Arts. 49, 71)
- [ ] **M5. Post-market monitoring ingestion**: logs actually flow into PMM analysis; thresholds defined; loop back to risk management. (Arts. 9(2)(c), 72)
- [ ] **M6. Transparency features**: AI-interaction disclosure flag (50(1)); synthetic-content machine-readable marking (50(2)); hooks enabling deployer disclosures (50(3)–(4)).
- [ ] **M7. Value-chain contracts**: written agreements with component/model/tool suppliers granting info + technical access needed for your conformity work; GPAI vendor provides Annex XII package. (25(4), 53(1)(b))

## Low — polish

- [ ] **L1. Accessibility requirements met** (Web Accessibility Directive 2016/2102, Accessibility Act 2019/882). (16(l))
- [ ] **L2. Provider identity/contact embedded** in system/packaging/docs. (16(b))
- [ ] **L3. AI literacy enablement for staff operating/onboarding the system** (docs, training material). (Art. 4)
- [ ] **L4. Deployer-enablement artifacts shipped**: worker-notification template, monitoring dashboards, affected-person notification strings. (26(7), 26(11))

Verdict rule: any C-item FAIL → do not ship into EU market. Any H-item UNKNOWN → schedule assessment before conformity assessment. M/L items feed the remediation backlog ordered by severity.
