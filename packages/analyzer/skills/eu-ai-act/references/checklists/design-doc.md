# Gap Checklist — Design Document Audit

Run against a design doc / architecture spec / RFC for a system intended for the EU market. Output per item: PRESENT / MISSING / AMBIGUOUS + quote or section ref. Order = severity.

## Critical

- [ ] **C1. Intended purpose defined precisely** — use cases, context of use, users, affected persons. Everything else (classification, requirements, instructions) keys off this. (Art. 3(12))
- [ ] **C2. Risk-tier classification section exists** with reasoning: prohibited-practice check (Art. 5), Annex I product path (Art. 6(1)), Annex III list path (Art. 6(2)), Art. 6(3) derogation incl. profiling override, GPAI-model layering (Art. 51).
- [ ] **C3. Role map**: which legal entity is provider, deployer, importer, distributor; role-shift triggers if customers may rebrand/repurpose (Art. 25(1)); authorised representative planned for non-EU providers (Art. 22(1)).
- [ ] **C4. Compliance timeline acknowledged**: design decisions dated against 2 Feb 2025 / 2 Aug 2025 / 2 Aug 2026 / 2 Aug 2027 applicability and legacy carve-outs if replacing an existing system (Arts. 111, 113).

## High

- [ ] **H1. Data governance plan**: dataset sources, preparation ops, assumptions, bias examination method, representativeness strategy for target setting, gap handling. Special-category data justified under all six conditions if used for bias work. (Art. 10)
- [ ] **H2. Logging architecture**: event schema covering Art. 12(2) purposes (+12(3) biometric extras); retention ≥6 months; authority-access/export path.
- [ ] **H3. Human oversight design**: built-in vs deployer-side measures split (14(3)); override, stop/safe-state, automation-bias mitigation designed in; two-person verification for biometric ID systems (14(5)).
- [ ] **H4. Accuracy/robustness/cybersecurity targets**: metrics declared upfront; redundancy/fail-safe approach; AI-specific threat model (poisoning, evasion, confidentiality attacks). (Art. 15)
- [ ] **H5. Change-management policy**: pre-determined changes declared at conformity assessment vs substantial modification boundary. (43(4))
- [ ] **H6. Transparency UX spec**: user-facing AI disclosure, synthetic-content marking, deepfake/text disclosure hooks. (Art. 50)

## Medium

- [ ] **M1. Instructions-for-use outline** drafted against Art. 13(3)(a)–(f) minimum set.
- [ ] **M2. Conformity-assessment route chosen** with rationale (Annex VI vs VII; sectoral for Annex I products; MSA-as-notified-body special case). (Art. 43)
- [ ] **M3. Post-market monitoring concept**: data sources, thresholds, corrective-action triggers feeding risk management. (Arts. 9(2)(c), 20, 72)
- [ ] **M4. Registration data fields identified** (Annex VIII). (Art. 49)
- [ ] **M5. Supplier dependency list** with contract needs per Art. 25(4); downstream info duties if you are a GPAI provider (Annex XII).
- [ ] **M6. Fundamental-rights impact assessment trigger check**: will deployer be public body / private entity providing public services / credit-scoring / life-health-insurance pricing? If yes, design must expose FRIA-required inputs: process description, frequency, affected categories, risks, oversight implementation, complaint mechanism. (Art. 27)
- [ ] **M7. Deployer duty support**: worker notification plan, affected-person notification, DPIA linkage via your Art. 13 documentation. (26(9), 26(11))

## Low

- [ ] **L1. Accessibility conformance stated**. (16(l))
- [ ] **L2. Environmental/resource notes** — computational/hardware resource estimates belong in instructions anyway. (13(3)(e))
- [ ] **L3. Voluntary code-of-conduct alignment noted** even for minimal-risk features. (Art. 95)

Verdict rule: C-items missing → design not ready for EU-market commitment; H-item gaps block architecture sign-off; M/L feed iteration backlog.
