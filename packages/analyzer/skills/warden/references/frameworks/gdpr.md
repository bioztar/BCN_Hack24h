# GDPR — Regulation (EU) 2016/679

> **Source:** Regulation (EU) 2016/679, OJ L 119, 4.5.2016 — CELEX 32016R0679 —
> <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679> · local copy
> `corpus/eu-law/gdpr-regulation-2016-679.md`. EU public law: quotes below are verbatim.
> **Type:** binding regulation, directly applicable in all EU/EEA Member States.
> **Last reviewed:** 2026-10-09.

## In plain language

If your product touches information about identifiable people in the EU — or you are in
the EU — GDPR applies. You need a legal reason for every use of that data, you must tell
people what you do with it, let them see/fix/delete it, keep it secure, report serious
leaks to the regulator within 72 hours, and sign proper contracts with every vendor that
touches it. Big fines exist (up to 4% of global revenue), but the everyday risk is a
regulator order to stop processing, or a customer's procurement team rejecting you.

## 1. Scope

| Question | Rule | Citation |
|---|---|---|
| What data? | "Personal data": any information relating to an identified or identifiable natural person. Pseudonymised data is still personal data. | Art. 4(1), Recital 26 |
| What activity? | Processing wholly or partly by automated means, or manual filing systems. Excludes purely personal/household activity. | Art. 2(1), 2(2)(c) |
| Establishment test | Processing in the context of an EU establishment's activities, regardless of where processing happens. | Art. 3(1) |
| Targeting test | Non-EU controller/processor that **offers goods/services** to people in the EU or **monitors their behaviour** in the EU. | Art. 3(2) |
| Size threshold | **None** for applicability. Only one carve-out: records of processing (Art. 30) are lighter for organisations under 250 staff *unless* processing is risky, not occasional, or includes special-category/criminal data. | Art. 30(5) |
| Sector | Horizontal — all sectors. Law-enforcement processing is under Directive (EU) 2016/680 instead. | Art. 2(2)(d) |

**Roles.** *Controller* decides purposes and means (Art. 4(7)); *processor* acts on the
controller's behalf (Art. 4(8)). A typical B2B SaaS is processor for customer data and
controller for its own account/billing/analytics data. Joint controllers: Art. 26.
Non-EU entities caught by Art. 3(2) must appoint an EU representative (Art. 27).

## 2. Key obligations

| # | Obligation | Who | Citation |
|---|---|---|---|
| G1 | Principles: lawfulness, fairness, transparency; purpose limitation; data minimisation; accuracy; storage limitation; integrity & confidentiality; accountability | C | Art. 5(1)–(2) |
| G2 | Lawful basis for each processing purpose (consent, contract, legal obligation, vital interests, public task, legitimate interests) | C | Art. 6(1) |
| G3 | Consent conditions: demonstrable, distinguishable, withdrawable as easily as given | C | Art. 7 |
| G4 | Special categories (health, biometrics for ID, etc.) prohibited unless an Art. 9(2) exception applies | C | Art. 9 |
| G5 | Transparency notices at collection (direct / indirect) | C | Arts. 12–14 |
| G6 | Data-subject rights: access, rectification, erasure, restriction, portability, objection; answer within one month (+2 months extension) | C (P assists, Art. 28(3)(e)) | Arts. 15–21, 12(3) |
| G7 | Automated decisions with legal/similarly significant effect: right not to be subject, safeguards incl. human intervention | C | Art. 22 |
| G8 | Accountability: appropriate technical & organisational measures, policies | C | Art. 24 |
| G9 | Data protection by design and by default | C | Art. 25 |
| G10 | Processor contract with mandatory terms; sub-processors only with authorisation, flow-down | C, P | Art. 28 |
| G11 | Records of processing activities | C, P | Art. 30 |
| G12 | Security of processing: risk-appropriate measures (pseudonymisation/encryption, CIA + resilience, restore, regular testing) | C, P | Art. 32 |
| G13 | Breach notification to supervisory authority without undue delay, where feasible ≤72h; processor informs controller without undue delay | C, P | Art. 33 |
| G14 | Breach communication to affected people when high risk | C | Art. 34 |
| G15 | DPIA for processing likely to result in high risk; prior consultation if residual high risk | C | Arts. 35–36 |
| G16 | DPO where public authority, or core activities involve large-scale regular & systematic monitoring or large-scale special-category data | C, P | Arts. 37–39 |
| G17 | International transfers only via adequacy, appropriate safeguards (SCCs, BCRs), or derogations | C, P | Arts. 44–49 |

Key quotes:

> "In the case of a personal data breach, the controller shall without undue delay and,
> where feasible, not later than 72 hours after having become aware of it, notify the
> personal data breach to the supervisory authority competent in accordance with Article
> 55, unless the personal data breach is unlikely to result in a risk to the rights and
> freedoms of natural persons." — Art. 33(1)

> "The processor shall not engage another processor without prior specific or general
> written authorisation of the controller." — Art. 28(2)

## 3. Deadlines & dates

| Date / clock | What | Citation |
|---|---|---|
| 24 May 2016 | Entry into force | Art. 99(1) |
| **25 May 2018** | Applies | Art. 99(2) |
| ≤72 h from awareness | Breach notification to SA | Art. 33(1) |
| 1 month (+2) | Respond to data-subject requests | Art. 12(3) |
| Ongoing | DPIA before high-risk processing starts | Art. 35(1) |
| VERIFY: | Procedural Regulation on cross-border GDPR enforcement (Commission proposal COM(2023) 348) — check adoption and application date on EUR-Lex before citing | — |

## 4. Penalties & enforcement

- **Tier 1 — up to €10 M or 2%** of total worldwide annual turnover (higher of): controller/
  processor obligations incl. Arts. 8, 11, 25–39, 42, 43. — Art. 83(4)
- **Tier 2 — up to €20 M or 4%** (higher of): principles (Arts. 5, 6, 7, 9), data-subject
  rights (Arts. 12–22), transfers (Arts. 44–49), non-compliance with SA orders. — Art. 83(5)–(6)
- Fines must be "effective, proportionate and dissuasive"; Art. 83(2) lists factors
  (nature/gravity/duration, intent, mitigation, prior infringements, cooperation…).
- Corrective powers beyond fines: warnings, orders, **temporary or definitive ban on
  processing**, order to suspend transfers. — Art. 58(2)
- One-stop-shop: lead supervisory authority = SA of main establishment. — Art. 56
- Private enforcement: complaints (Art. 77), judicial remedies (Arts. 78–79),
  compensation for material/non-material damage (Art. 82), representative actions (Art. 80).

## 5. Mapping onto a software product

| Area | What GDPR expects in the product | Citation |
|---|---|---|
| Data handling | Data inventory per purpose + lawful basis; field-level minimisation; retention TTLs enforced by jobs, not policy docs; pseudonymise analytics | Arts. 5(1)(c),(e), 6, 25, 30 |
| Data-subject rights | Self-serve or ticketed export (machine-readable), correction, deletion that propagates to replicas/backups on a documented schedule, objection/opt-out flags respected downstream | Arts. 15–21 |
| Consent | Consent records (who/when/what text/version), withdraw as easy as grant, no pre-ticked boxes | Art. 7, Recital 32 |
| Logging | Access/audit logs on personal-data stores — but logs are personal data too: minimise, retain on a schedule, restrict access | Arts. 5(1)(f), 32 |
| Access control | Least privilege, MFA for admin, role separation, encryption at rest/in transit | Art. 32(1) |
| Incident response | Breach runbook with a 72 h clock from *awareness*; breach register even for non-notified breaches (Art. 33(5)); processor→controller notification path in DPAs | Arts. 33–34 |
| Human oversight | Meaningful human review for automated decisions with legal/similar effect (credit, hiring, account termination) + explanation + contest path | Art. 22(3) |
| Vendor management | DPA with Art. 28(3) terms for every sub-processor; public sub-processor list + change notice; transfer mechanism + transfer impact assessment for non-adequate countries | Arts. 28, 44–46 |
| AI/ML | Lawful basis for training on personal data; DPIA for novel tech/profiling; memorisation/extraction risk treated as a security issue | Arts. 6, 35, 32 |

## 6. Interplay with the EU AI Act (reference only)

GDPR applies alongside the AI Act; the AI Act states it does not affect GDPR. Where an AI
system processes personal data, run both. Typical overlaps: DPIA (GDPR Art. 35) ↔ the AI
Act's deployer fundamental-rights impact assessment; GDPR Art. 22 ↔ AI Act human-oversight
duties. For AI Act classification and obligations use the **`eu-ai-act-compliance`** skill /
<https://github.com/bioztar/EU-AI-Act>. Do not re-derive AI Act logic here.

## 7. Common misconceptions

- "We're a small company, GDPR doesn't apply." — No size threshold for applicability (Art. 2–3).
- "Pseudonymised = anonymous." — Pseudonymised data remains personal data (Recital 26).
- "Consent is the safest basis." — It is one of six; often contract or legitimate interests fit better, and consent is withdrawable.
- "72 hours from the breach." — From *becoming aware* of it (Art. 33(1)).
- "Processor = no GDPR obligations." — Processors have direct duties: Arts. 28–33, 37, 44 and fines under Art. 83.

## Sources

- Regulation (EU) 2016/679 (GDPR), EUR-Lex: <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679>
- EDPB guidelines index (interpretive, non-binding): <https://www.edpb.europa.eu/our-work-tools/general-guidance/guidelines-recommendations-best-practices_en>
