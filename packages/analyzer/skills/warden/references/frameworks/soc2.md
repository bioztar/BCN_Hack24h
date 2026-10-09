# SOC 2 — AICPA Trust Services Criteria (TSC 2017, revised points of focus 2022)

> **Source:** AICPA, *2017 Trust Services Criteria … (With Revised Points of Focus — 2022)* —
> <https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022>.
> Pointer file: `corpus/standards/aicpa-tsc-soc2.md`.
> **Copyright:** no criteria text is reproduced here. Everything below is an **authored
> summary** with criterion IDs so a reader with the AICPA document can verify.
> **Type:** voluntary attestation report by an independent CPA firm. **Last reviewed:** 2026-10-09.

## In plain language

SOC 2 is the security report US (and increasingly global) enterprise buyers ask for. An
independent CPA firm checks your controls against AICPA criteria and writes an opinion.
Type I says "controls are well designed on this date"; Type II says "controls worked
throughout this period" (commonly 3–12 months). Security is always included; you can add
availability, processing integrity, confidentiality and privacy. It's not a certificate
and not law — it's evidence your customers' auditors rely on.

## 1. Scope

| Question | Answer |
|---|---|
| Who | **Service organisations** whose services affect customers' data/systems — typically SaaS, cloud, data processors, MSPs. Any size. |
| What | The **system** described in management's system description (infrastructure, software, people, procedures, data) for chosen **categories**: Security (mandatory, = Common Criteria), plus optional Availability, Processing Integrity, Confidentiality, Privacy. |
| Jurisdiction | US professional standard (AICPA attestation standards AT-C 105/205); used worldwide. ISAE 3000 / 3402 are international analogues. |
| Report types | **Type 1** — fairness of description and suitability of control *design* at a point in time. **Type 2** — adds **operating effectiveness** over a review period. |
| Distribution | Restricted-use report for customers and their auditors (often under NDA). SOC 3 is the general-use summary. |

## 2. Criteria structure (IDs + authored summaries)

| ID | Area (authored summary) | Typical control evidence |
|---|---|---|
| **CC1.1–1.5** | Control environment — integrity/ethics, board oversight, structure, competence, accountability (COSO principles 1–5) | Code of conduct acks, org chart, background checks, training |
| **CC2.1–2.3** | Communication & information — quality information, internal and external communication | Policies portal, customer-facing security docs, status page |
| **CC3.1–3.4** | Risk assessment — objectives, risk identification, **fraud risk**, change impact | Annual risk assessment, risk register |
| **CC4.1–4.2** | Monitoring activities — ongoing/separate evaluations, deficiency communication | Internal audit, control monitoring, remediation tracking |
| **CC5.1–5.3** | Control activities — selection, technology general controls, policies & procedures | Policy set, control matrix |
| **CC6.1–6.8** | **Logical & physical access** — access architecture, provisioning, removal, review, physical access, disposal, transmission protection, malware/unauthorised software prevention | SSO/MFA, JML tickets, quarterly access reviews, encryption in transit, EDR |
| **CC7.1–7.5** | **System operations** — vulnerability/config detection, anomaly monitoring, event evaluation, **incident response**, recovery | Vuln scans, SIEM alerts, IR runbooks, post-mortems |
| **CC8.1** | **Change management** — authorise, design, test, approve, implement changes | PR approval, CI tests, deployment logs, segregation of duties |
| **CC9.1–9.2** | Risk mitigation — business-disruption risk; **vendor & business-partner risk** | BC/DR plan, vendor inventory, vendor reviews |
| **A1.1–1.3** | Availability — capacity, environmental protections/backup/recovery infrastructure, recovery testing | Capacity monitoring, backups, DR tests |
| **PI1.1–1.5** | Processing integrity — definitions, inputs, processing, outputs, storage complete/accurate/timely | Input validation, reconciliation jobs, data-quality checks |
| **C1.1–1.2** | Confidentiality — identify/maintain confidential info, dispose | Classification, retention & deletion |
| **P1–P8** | Privacy — notice, choice/consent, collection, use/retention/disposal, access, disclosure/notification, quality, monitoring/enforcement | Privacy notice, consent records, DSR handling, breach notification |

## 3. Dates & cadence

| Date / cycle | What | Source |
|---|---|---|
| 2017 / 2022 | Current TSC (2017) with revised points of focus (2022) | AICPA |
| Type 2 period | Commonly 3–12 months; first reports often shorter, then rolling 12 months | AICPA SOC 2 Guide (practice) |
| Annual | Customers typically expect a new Type 2 every 12 months; **bridge letter** covers gaps between period end and today | Market practice |
| ASSUMED: | No announced replacement of the 2017 TSC as of 2026-10-09 — check AICPA before advising | — |

## 4. Enforcement mechanics

No statutory penalties. Outcomes are in the auditor's opinion:
- **Unqualified** (clean) opinion; **qualified** opinion where controls failed materially;
  **adverse** or **disclaimer** in severe cases. Individual **exceptions** are listed in Section 4 of a Type 2.
- Commercial consequences: deals blocked, contract breaches where a clean SOC 2 is a covenant.
- **Complementary user entity controls (CUECs)** shift responsibilities to customers;
  **carve-outs** exclude subservice organisations (e.g. cloud provider) whose own SOC reports must then be reviewed.

## 5. Mapping onto a software product

| Area | What the auditor samples | Criteria |
|---|---|---|
| Data handling | Classification, encryption at rest, retention/disposal | C1.1–1.2, CC6.1, CC6.5, P4 |
| Logging | Centralised security logs, alerting, alert triage evidence | CC7.2–7.3 |
| Access control | SSO/MFA, access requests approved, terminations removed within SLA, quarterly reviews | CC6.1–6.3 |
| Incident response | IR plan, tabletop exercise, incident tickets with timeline/RCA | CC7.3–7.5 |
| Change management | Every sampled production change has ticket, review, test, approval | CC8.1 |
| Availability | Backups, restore test, uptime monitoring, DR test | A1.2–1.3, CC9.1 |
| Vendor management | Vendor inventory, risk tiering, annual review of subservice SOC reports | CC9.2 |
| Human oversight | Management review of control monitoring; for AI features, processing-integrity controls on outputs | CC4.1, PI1.3 |

## 6. Interplay

- **ISO 27001:** ~80% evidence reuse is common in practice (ASSUMED: rule of thumb, not a published figure). SOC 2 tests *operating effectiveness by sampling*; 27001 audits the *management system*.
- **GDPR:** Privacy category (P1–P8) supports but does not establish GDPR compliance (lawful basis, transfers, DPO are outside TSC).
- **EU AI Act:** none directly; use **`eu-ai-act-compliance`** for AI-Act obligations.

## 7. Common misconceptions

- "SOC 2 certification." — There is no certificate; it is an attestation report.
- "Type 1 is enough." — Most enterprise buyers ask for Type 2.
- "Our cloud provider's SOC 2 covers us." — Only for the carved-out/inherited controls; your own controls still need testing.

## Sources

- AICPA Trust Services Criteria (2017, rev. 2022): <https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022>
- AICPA SOC suite overview: <https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2>
