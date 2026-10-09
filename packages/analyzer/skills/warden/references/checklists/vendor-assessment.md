# Checklist — vendor / third-party assessment

**Use for:** assessing a supplier (SaaS, cloud, model API, MSP, contractor) **or** preparing
your own answers when *your* customer assesses you. Same rows, either direction.
Run `../applicability-classifier.md` on the **buyer** to know which rows are mandatory.

## 1. Tier the vendor first

| Tier | Criteria | Depth |
|---|---|---|
| Critical | Supports a critical/important function (DORA Art. 3(22)); processes special-category or large-volume personal data; production access; AI model in a decision path | All rows + contract clause review + exit plan |
| Standard | Processes personal or confidential data, no prod access | Rows V1–V14 |
| Low | No customer data, no system access | V1, V2, V10 |

## 2. Assessment rows

| # | Check | Evidence | Mandatory for | Citations |
|---|---|---|---|---|
| V1 | Inventory entry: service, owner, data categories, functions supported, locations | Vendor register / register of information | DORA (all), GDPR (processors) | DORA 28(3); GDPR 30(1)(d); 27001 A.5.19; SOC 2 CC9.2 |
| V2 | Independent assurance | ISO 27001 cert (check scope & CB accreditation) / SOC 2 Type 2 (period, exceptions, CUECs, carve-outs) / ISO 42001 for AI vendors | Good practice; often contractual | 27001 9.2; SOC 2 CC9.2; 42001 A.10 |
| V3 | DPA with all Art. 28(3) terms (instructions, confidentiality, security, sub-processors, assistance, deletion/return, audits) | Signed DPA | GDPR processor | GDPR 28(3) |
| V4 | Sub-processor list & change notification | Public list, notice period, objection right | GDPR | GDPR 28(2), 28(4) |
| V5 | Data location & transfers | Regions, transfer mechanism (adequacy/SCCs), transfer impact assessment | GDPR; DORA | GDPR 44–49; DORA 30(2)(b) |
| V6 | Security measures | MFA, encryption, vuln mgmt, secure SDLC, logging | All | GDPR 32; NIS2 21(2)–(3); 27001 A.5.20 |
| V7 | Incident notification SLA to you (hours) — must leave room for **your** clocks (DORA 4 h/24 h; NIS2 24 h; GDPR 72 h) | Contract clause | GDPR, NIS2, DORA | GDPR 33(2); NIS2 21(2)(d); DORA 30(2)(f) |
| V8 | Business continuity & availability commitments | SLA, RTO/RPO, BC plan tested | DORA critical; SOC 2 A1 | DORA 30(3)(a)–(c); SOC 2 A1 |
| V9 | Audit & access rights (incl. for regulators) | Contract clause; pooled audits allowed | DORA (critical: unrestricted) | DORA 30(2)(g), 30(3)(e); GDPR 28(3)(h) |
| V10 | Termination rights & exit strategy, data return/deletion | Contract + exit plan with transition period | DORA, GDPR | DORA 28(7)–(8), 30(2)(d),(h), 30(3)(f); GDPR 28(3)(g) |
| V11 | Subcontracting of critical functions disclosed and controlled | Subcontractor chain, conditions | DORA critical | DORA 30(2)(a), 30(3) ; GDPR 28(2) |
| V12 | Concentration risk / substitutability | Alternatives, multi-vendor strategy | DORA | DORA 29; 6(9) |
| V13 | Participation in your testing (incl. TLPT) & security training | Clause | DORA critical | DORA 30(2)(i), 30(3)(d) |
| V14 | Vendor's own supply-chain & secure development | SBOM, SDLC evidence, vulnerability disclosure policy | NIS2 buyers | NIS2 21(3) |
| V15 | **AI vendor:** model/data provenance, training on your data (opt-out?), eval results, usage policy, model change/deprecation notice | Model card, terms, DPA AI clauses | AI use | 42001 A.10, A.7; NIST GOVERN 6.1–6.2, MANAGE 3.1; OWASP LLM03 |
| V16 | **AI vendor:** prompt/output retention & isolation | Data-retention terms, zero-retention option, tenant isolation | AI + personal data | GDPR 5(1)(e), 28; OWASP LLM02 |

## 3. EU AI Act

If the vendor supplies an AI system or general-purpose AI model you build on, value-chain
obligations may apply — hand off to `eu-ai-act-compliance`. Do not restate them here.

## 4. Verdict

**Approve** · **Approve with conditions** (list contract changes / remediation, owner, date)
· **Reject**. For DORA critical vendors, record the decision in the register of information.
