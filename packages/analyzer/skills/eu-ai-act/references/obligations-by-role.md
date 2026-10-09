# Obligations Matrix — Role × Risk Tier

Complete obligation sets per role and per tier under Regulation (EU) 2024/1689. Citations are binding articles unless marked "(Rec. N)" for persuasive recital context. Enforcement column: who polices the duty.

**Horizontal deadlines used below:** log retention ≥6 months (Arts. 19(1), 26(6)); documentation retention 10 years (Arts. 18(1), 22(3)(b), 23(5), 47(1), 54(3)(b)); serious-incident reports 15 days standard / 2 days critical-infrastructure-or-widespread / 10 days death (Art. 73(2)–(4)).

**Status check (2026-08-29):** every section below marked "applies from"/"from" a date through 2 Aug 2026 (Sections 1, 3–9) is describing obligations already in force today, not future ones. Only Section 2 (Annex I product path, 2 Aug 2027) is still ahead.

---

## 1. Providers of high-risk AI systems (Annex III path — applies from 2 Aug 2026)

| # | Obligation | Article | Deadline | Enforced by |
|---|---|---|---|---|
| P1 | Ensure system meets all Section 2 requirements: risk management, data governance, technical documentation, record-keeping, transparency to deployers, human oversight, accuracy/robustness/cybersecurity | Art. 16(a); Arts. 8–15 | Before placing on market/putting into service; maintained through lifecycle | Market surveillance authority (MSA) |
| P2 | Affix name/trademark + contact address on system, packaging, or documentation | Art. 16(b) | Continuous | MSA |
| P3 | Operate quality management system covering strategy/regulatory compliance, resources, responsibilities, management review, design control, verification/validation, data management, incident handling, corrective action, documentation control | Art. 16(c); Art. 17(1)(a)–(m) | Before conformity assessment; proportionate to org size (17(2)) | MSA |
| P4 | Keep QMS docs, technical docs, change records, notified-body decisions, EU declaration of conformity | Art. 16(d); Art. 18(1) | 10 years after placement | MSA |
| P5 | Keep automatically generated logs under provider control | Art. 16(e); Art. 19(1) | ≥6 months | MSA |
| P6 | Run conformity assessment before placement: Annex VI internal control (points 2–8 Annex III) or Annex VI/VII with notified body (point 1 biometrics; mandatory Annex VII when no harmonised standards applied) | Arts. 16(f), 43 | Pre-market | MSA; notified body |
| P7 | Draw up machine-readable/signed EU declaration of conformity per Annex V | Art. 16(g); Art. 47 | Pre-market; keep 10 years | MSA |
| P8 | Affix CE marking (digital CE for digital systems; NB number where applicable) | Art. 16(h); Art. 48 | Before making available | MSA |
| P9 | Register self and system in EU database (Annex VIII Sec. A data) | Art. 16(i); Art. 49(1) | Before placement | Commission (database); MSA |
| P10 | Corrective actions: bring into conformity, withdraw, disable, recall non-compliant systems; inform distributors/deployers/importers; investigate risks, notify MSA and notified body | Arts. 16(j), 20 | Immediately upon knowledge | MSA |
| P11 | Demonstrate conformity on reasoned request incl. log access | Art. 16(k); Art. 21 | Upon request | National competent authority |
| P12 | Meet accessibility requirements (Web Accessibility Directive 2016/2102, Accessibility Act 2019/882) | Art. 16(l) | Continuous | MSA |
| P13 | Establish post-market monitoring system and plan (plan part of technical documentation) | Art. 72(1)–(3) | Ongoing from placement | MSA |
| P14 | Report serious incidents to MSA of Member State of occurrence | Art. 73(1) | 15d / 2d widespread or Art. 3(49)(b) critical-infrastructure disruption / 10d death; incomplete initial report allowed then completed | MSA; Commission informed immediately (73(11)) |
| P15 | Non-EU providers: appoint authorised representative by written mandate before making available | Art. 22(1) | Pre-market | MSA |

Financial institutions: QMS deemed fulfilled by Union financial-services internal-governance rules except 17(1)(g)-(i) (data governance, risk mgmt, testing); logs/docs kept under financial-services law (Arts. 17(4), 19(2)).

## 2. Providers of high-risk systems via Annex I product path (applies from 2 Aug 2027)

Same obligations as Section 1, with modifications:
- Conformity assessment follows the **sectoral legislation's** procedure; Chapter III S2 requirements are folded in (Art. 43(3)). Single set of technical documentation combining AI Act + sectoral law (Art. 11(2)).
- Post-market monitoring may integrate existing sectoral plans if equivalent (Art. 72(4)).
- Product manufacturer is deemed provider when product+AI placed under its name/trademark (Art. 25(3)).
- Certificates valid max **5 years** (vs 4 for Annex III) (Art. 44(2)).
- Derogation procedure of Art. 46 does not apply — only sectoral derogations (Art. 46(7)).
- Enforcement by sectoral market surveillance authority (Art. 74(3)); Arts. 79–83 procedures yield to equivalent sectoral procedures (Art. 74(4)).

## 3. Deployers of high-risk AI systems (from 2 Aug 2026)

| # | Obligation | Article | Deadline | Enforced by |
|---|---|---|---|---|
| D1 | Use per instructions for use; take appropriate technical/organisational measures | Art. 26(1) | Continuous | MSA |
| D2 | Assign human oversight to competent, trained, authorised, supported natural persons | Art. 26(2) | Continuous | MSA |
| D3 | Ensure input data relevance/representativeness where deployer controls it | Art. 26(4) | Continuous | MSA |
| D4 | Monitor operation; inform provider/MSA of risks per Art. 79(1); suspend use; report serious incidents | Art. 26(5); Art. 73 | Without undue delay / immediately | MSA |
| D5 | Keep automatically generated logs under deployer control | Art. 26(6) | ≥6 months | MSA |
| D6 | Employers: inform workers' representatives and affected workers before workplace deployment | Art. 26(7) | Before use | MSA / labour authorities |
| D7 | Public-authority deployers: register in EU database before putting into service; refuse unregistered systems | Art. 26(8); Art. 49(3) | Before use | Commission; MSA |
| D8 | Feed Art. 13 information into DPIA obligations (GDPR Art. 35 / LED Art. 27) where applicable | Art. 26(9) | As DPIA arises | DP authority |
| D9 | Post-remote biometric identification for criminal investigation: prior judicial/independent-administrative authorisation (≤48h after start), no untargeted use, document each use in police file, annual reports to MSA + DP authority | Art. 26(10) | Per use | Judicial authority; MSA; DP authority |
| D10 | Inform natural persons subject to Annex III decision-making systems that they are subject to it (law enforcement: LED Art. 13 instead) | Art. 26(11) | At decision-making | MSA |
| D11 | Cooperate with competent authorities | Art. 26(12) | Upon request | MSA |

**Fundamental rights impact assessment (FRIA)** — before first use, for: bodies governed by public law, private entities providing public services, and deployers of credit-scoring/life-health-insurance systems (Annex III 5(b),(c)); excludes Annex III point 2 (critical infrastructure). Content: process description, period/frequency of use, affected categories, specific risks of harm, human-oversight implementation, mitigation/governance/complaint mechanisms. Notify results to MSA using AI Office template; complements (does not replace) DPIA; update when elements change. Art. 27(1)–(5).

## 4. Authorised representatives (of non-EU providers)

High-risk systems: verify declaration/tech doc/conformity assessment exist; hold provider contact details, declaration copy, tech doc, certificates 10 years; provide info/logs to authorities; cooperate; ensure registration; terminate mandate if provider breaches and inform MSA/notified body. Art. 22.

GPAI models (non-EU providers): same pattern against Arts. 53–55 duties; hold Annex XI tech doc copy 10 years; open-source exemption unless systemic risk. Art. 54.

## 5. Importers (high-risk, from 2 Aug 2026)

Verify before placing on market: conformity assessment done (23(1)(a)), technical doc per Annex IV (23(1)(b)), CE marking + declaration + instructions present (23(1)(c)), authorised representative appointed (23(1)(d)). Refuse non-conforming or falsified systems; inform provider/rep/MSA where Art. 79(1) risk (23(2)). Indicate own identity on system/packaging/docs (23(3)). Preserve storage/transport conditions (23(4)). Keep certificate, instructions, declaration copies 10 years (23(5)). Provide info to authorities (23(6)). Cooperate (23(7)). Art. 23.

## 6. Distributors (high-risk, from 2 Aug 2026)

Verify before making available: CE marking, declaration copy, instructions for use, provider/importer compliance with 16(b),(c) and 23(3) (24(1)). Refuse non-conforming; inform and act on Art. 79(1) risks (24(2)). Safe storage/transport (24(3)). Corrective action/withdraw/recall for non-conforming stock; inform authorities (24(4)). Information to authorities (24(5)); cooperation (24(6)). Art. 24.

## 7. GPAI model providers (from 2 Aug 2025)

| # | Obligation | Article | Notes |
|---|---|---|---|
| G1 | Technical documentation per Annex XI (training/testing process, evaluation results), kept up to date, available to AI Office and national competent authorities on request | Art. 53(1)(a) |
| G2 | Information/documentation to downstream integrators per Annex XII enabling their compliance | Art. 53(1)(b) |
| G3 | Copyright policy incl. state-of-the-art respect of TDM rights reservations (Dir. 2019/790 Art. 4(3)) | Art. 53(1)(c) |
| G4 | Publicly available sufficiently detailed training-content summary per AI Office template | Art. 53(1)(d) |
| G5 | Cooperate with Commission/national authorities | Art. 53(3) |
| G6 | Demonstrate compliance via approved code of practice, harmonised standard, or alternative adequate means assessed by Commission | Art. 53(4) |
| G7 | Non-EU providers: authorised representative before model placement | Art. 54(1)–(5) |
| G8 | Open-source models exempt from G1/G2/G7 (not G3/G4) unless systemic risk | Art. 53(2), 54(6) |

**Systemic-risk models additionally (Art. 55):** model evaluations per standardised protocols incl. documented adversarial testing; assess/mitigate systemic risks at Union level; track/document/report serious incidents and corrective measures without undue delay; adequate cybersecurity for model and physical infrastructure. Same demonstration routes (codes/standards/alternatives).

**Classification mechanics:** notify Commission within two weeks of meeting/knowing you will meet the >10²⁵ FLOP threshold; rebuttal window; Commission designation ex officio/on qualified alert; reassessment requests earliest six months apart. Arts. 51–52.

Enforcement: exclusive Commission/AI Office supervision (Art. 88); fines up to €15M or 3% turnover (intentional/negligent infringement, information failures, access denial) (Art. 101(1)); CJEU unlimited jurisdiction over fine decisions (Art. 101(5)). Note: Art. 101 applies from **2 Aug 2026**, one year after the substantive obligations (Art. 113(b)).

## 8. Providers & deployers — limited-transparency tier (Art. 50, from 2 Aug 2026)

| Who | Duty | Paragraph |
|---|---|---|
| Provider | Direct-interaction systems: users must know it's AI unless obvious | 50(1) |
| Provider (incl. GPAI systems) | Synthetic content outputs marked machine-readable/detectable; effective, interoperable, robust solutions per state of art; assistive-editing exemption | 50(2) |
| Deployer | Emotion recognition/biometric categorisation: inform exposed persons; GDPR-compliant processing | 50(3) |
| Deployer | Deepfakes: disclose generation/manipulation; artistic/satirical reduced disclosure not hampering display | 50(4)(1st) |
| Deployer | AI text informing public interest: disclose; human editorial review exempts | 50(4)(2nd) |

All: clear, distinguishable, at latest at first interaction/exposure, accessible (50(5)). Law-enforcement carve-outs per paragraph with safeguards. Codes of practice on content labelling facilitated/approved at EU level (50(7)).

Fines: up to €15M / 3% turnover for breaching Art. 50 (Art. 99(4)(g)).

## 9. Everyone in scope

- **AI literacy**: providers AND deployers ensure sufficient staff literacy considering technical knowledge, experience, education, training, context, and affected persons. From 2 Feb 2025. Art. 4.
- **Prohibitions** bind all operators (provider, deployer, importer, distributor roles as applicable per practice). From 2 Feb 2025. Art. 5.
- **Confidentiality** duties on authorities (Art. 78) — mirror obligation for operators to expect protection of trade secrets/source code supplied to authorities.

## 10. Notified bodies & notifying authorities

Notifying authority per Member State: designate, assess, monitor conformity-assessment bodies; independence rules; competence in IT, AI, law incl. fundamental-rights supervision. Art. 28.

Notified bodies: legal personality; organisational/QM/resource/cybersecurity requirements (31(2)); independence from providers/competitors (31(4)–(6)); confidentiality (31(7)); proportionate procedures for SMEs (34(2)); liability insurance (31(9)); coordination via sectoral group (38). Verify conformity per Art. 43 (34(1)); inform notifying authority of certificates/refusals/suspensions (45(1)); mutual information between bodies (45(2)–(3)).

Special case: HR systems intended for law enforcement, immigration, asylum authorities or Union institutions → the market surveillance authority itself acts as notified body (Art. 43(1) third subpara).

Certificate lifecycle: validity ≤5y (Annex I) / ≤4y (Annex III), extendable on re-assessment; suspension/withdrawal with appeal right (Art. 44). Notification changes/cessation regime with certificate-survival windows (9 months typical) (Art. 36).

## 11. Market surveillance & fundamental-rights authorities

- MSA powers: full access to documentation and training/validation/test data incl. remote API access (74(12)); source code only when necessary and documentation-based checks exhausted (74(13)); remote exercise of certain Regulation 2019/1020 powers (74(5)).
- Risk procedures: evaluation + corrective-action order within shorter of 15 working days or sectoral period (79(2)); Union safeguard with 3-month objection window (30 days for Art. 5 violations) (79(8), 81).
- Misclassified "non-high-risk" systems: evaluation, forced compliance, fines for circumvention (Art. 80).
- Compliant-but-risky systems: still actionable (Art. 82).
- Formal non-compliance list: CE violations, missing/malformed declaration, no registration, no authorised rep, no tech documentation → end non-compliance or face restriction/recall (Art. 83).
- Fundamental-rights authorities: document access rights; lists notified to Commission since 2 Nov 2024; can request MSA-organised technical testing (Art. 77).

## 12. Remedies for affected persons

- Complaint to any MSA on infringement grounds (Art. 85).
- Right to explanation from deployer of Annex III (excl. point 2) high-risk systems whose output produces legal/significant adverse effects: role of system in procedure + main elements of decision (Art. 86).
- Whistleblower protection via Directive (EU) 2019/1937 (Art. 87).
- Downstream-provider complaint right against GPAI model providers (Art. 89(2)).
