# Penalties & Enforcement

## 1. Fine tiers (Art. 99)

Member States lay down penalty rules; must be effective, proportionate, dissuasive; may include warnings and non-monetary measures; SME interests and economic viability considered (Art. 99(1)). Rules notified to Commission by date of entry into application (Art. 99(2)).

| Violation | Cap (whichever higher) | Citation |
|---|---|---|
| Prohibited practices (Art. 5) | **€35M or 7%** total worldwide annual turnover, preceding financial year | Art. 99(3) |
| Provider/authorised-rep/importer/distributor/deployer obligations (Arts. 16, 22, 23, 24, 26); notified-body obligations (31, 33(1),(3),(4), 34); transparency (50) | **€15M or 3%** | Art. 99(4) |
| Incorrect, incomplete or misleading information supplied to notified bodies or national competent authorities on request | **€7.5M or 1%** | Art. 99(5) |

**SME cap**: fines up to the *lower* of the amount or percentage above — SMEs never pay both maxima (Art. 99(6)).

Public authorities: each Member State decides to what extent administrative fines apply to them (Art. 99(8)). Fines may be imposed by national courts where legal systems so provide, with equivalent effect (Art. 99(9)). Procedural safeguards + judicial remedies guaranteed (Art. 99(10)). Annual Member-State reports to Commission on fines issued and litigation (Art. 99(11)).

### Aggravating/mitigating factors when setting the fine (Art. 99(7))

- Nature, gravity, duration of infringement and consequences; number of affected persons; damage level
- Prior fines by other MSAs for same infringement
- Prior fines under other Union/national law for same activity
- Size, annual turnover, market share
- Financial benefits gained / losses avoided
- Degree of cooperation with authorities
- Degree of responsibility given technical/organisational measures in place
- How the infringement became known — self-notification counts in your favour
- Intentional vs negligent character
- Action taken to mitigate harm to affected persons

## 2. Union institutions, bodies, offices and agencies (Art. 100)

EDPS enforces: up to €1.5M for prohibited-practice violations; €750k for other non-compliance. Hearing rights, file access, defence rights guaranteed; funds to EU general budget; EDPS reports annually to Commission.

## 3. GPAI providers (Art. 101)

Commission may impose fines up to **€15M or 3% worldwide turnover** for intentional/negligent:
- infringement of relevant provisions;
- failure to comply with Art. 91 documentation/information requests or supplying incorrect info;
- failure to comply with Art. 93 requested measures;
- denying model/API/source-code access for Art. 92 evaluations.

Procedural rights: preliminary findings communicated, opportunity to be heard (101(2)); CJEU has **unlimited jurisdiction** — can cancel, reduce, or increase fines (101(5)). Implementing acts set detailed procedure (101(6)). Applies from **2 Aug 2026**, one year after substantive GPAI duties (Art. 113(b)).

## 4. Governance architecture

### Union level (Chapter VII Section 1)
- **AI Office** (Art. 64): Commission function; implementation/monitoring/supervision of GPAI models and systems; secretariat of the Board.
- **European AI Board** (Arts. 65–66): one representative per Member State, EDPS observer; coordinates national competent authorities, issues opinions/recommendations, harmonises administrative practice; standing sub-groups for market surveillance (ADCO role per Reg. 2019/1020 Art. 30) and notified bodies.
- **Advisory forum** (Art. 67): stakeholder technical expertise (industry, start-ups/SMEs, civil society, academia).
- **Scientific panel** (Art. 68): independent experts supporting enforcement incl. qualified alerts on systemic risks (Art. 90).

### National level
Each Member State: ≥1 notifying authority + ≥1 market surveillance authority, independent, adequately resourced (Art. 70). Single point of contact designated and published by 2 Aug 2025 (70(2)). Biennial resource adequacy reports (70(6)). EDPS acts as authority for Union institutions (70(9), 74(9)).

Specialised MSA assignments (Art. 74):
- Annex I product high-risk → sectoral market surveillance authority (74(3))
- Financial institutions → financial supervisor, for AI use connected with financial services (74(6))
- Law enforcement/border/justice + Annex III points 6–8 → data protection supervisory authorities or equivalent-independence bodies (74(8))

Fundamental-rights authorities (Art. 77): document access, request MSA-run technical testing; lists published since 2 Nov 2024.

## 5. Market surveillance mechanics

Regulation (EU) 2019/1020 applies wholesale to AI systems (Art. 74(1)): "economic operator" includes all AI Act operators; "product" includes AI systems.

Powers beyond Reg. 2019/1020 baseline:
- Remote exercise of certain powers (74(5))
- Full access to documentation + training/validation/testing datasets, incl. remote API access where appropriate (74(12))
- Source code only upon reasoned request AND when documentation/data-based verification exhausted or insufficient (74(13)) — a two-condition gate protecting trade secrets (cf. Art. 78 confidentiality)
- Joint investigations across Member States with AI Office coordination support (74(11))

Risk procedures (Arts. 79–83):
1. **Art. 79**: system presenting risk → evaluation → corrective-action order (≤15 working days) → provisional measures → cross-border notification → Union-wide restriction if unchallenged within 3 months (30 days for Art. 5 violations).
2. **Art. 80**: provider claims non-high-risk under Art. 6(3) → MSA re-evaluates; misclassification to circumvent Chapter III = fines under Art. 99.
3. **Art. 81**: Union safeguard procedure — Commission decides within 6 months (60 days for Art. 5 violations); justified measures become Union-wide.
4. **Art. 82**: even fully compliant systems presenting risk can be restricted.
5. **Art. 83**: formal non-compliance (CE marking, declaration, registration, authorised rep, tech docs) → end non-compliance or face restriction/recall.

Derogation valve (Art. 46): MSA can authorise specific high-risk systems for exceptional public security/life-health/environment/key-infrastructure reasons pending conformity assessment; urgency regime for law-enforcement/civil-protection; Commission/Member-State objection window 15 days.

## 6. GPAI supervision (Arts. 88–94)

- Commission holds **exclusive** Chapter V enforcement powers, implemented through AI Office (88(1)).
- Vertical integration rule: model+system same provider → AI Office monitors the system too (75(1)).
- MSAs cooperate with AI Office on directly usable GPAI systems classifiable as high-risk (75(2)); can obtain model information via AI Office within 30 days when blocked (75(3)).
- Escalation ladder: structured dialogue → Art. 91 information requests → Art. 92 evaluations (incl. API/source-code access, independent experts) → Art. 93 binding measures (compliance measures, mitigation, restrict/withdraw/recall model); commitments may be made binding (93(3)).
- Qualified alerts from scientific panel trigger investigation powers (90).
- Procedural rights: Reg. 2019/1020 Art. 18 mutatis mutandis (94).

## 7. Serious-incident reporting chain (Art. 73)

Provider → MSA of incident Member State: 15 days standard; 2 days widespread infringement or critical-infrastructure disruption; 10 days death. Incomplete initial report permitted. Post-report investigation duty without altering the system before informing authorities (73(6)). MSA measures within 7 days via Reg. 2019/1020 Art. 19 (73(8)); immediate Commission notification (73(11)). Sectoral equivalents (MDR/IVDR) limit scope to fundamental-rights incidents (73(10)).

Deployers mirror the duty: inform provider first, then importer/distributor and MSA; suspend use on suspected Art. 79(1) risk (26(5)); law-enforcement sensitive operational data excluded.

## 8. Individual remedies

- Complaint right to any MSA (85).
- Explanation right against deployers using Annex III (excl. point 2) systems producing legal/adverse-significant effects: role of AI in procedure + main decision elements (86).
- Whistleblower protection via Dir. (EU) 2019/1937 (87).
- Downstream-provider complaints about model providers handled by AI Office (89(2)).

Confidentiality frame throughout: Art. 78 protects IP/trade secrets incl. source code obtained during enforcement; authorities request only strictly necessary data; law-enforcement technical documentation stays on premises with cleared-access copies for MSAs (78(3)).
