# Checklist — design document review

**Use for:** architecture/design docs, PRDs, RFCs, threat models. A design doc proves
*intent*, not implementation: findings are "designed / not designed / unclear", cite the
doc section. Run `../applicability-classifier.md` first.

| # | Question the design must answer | Sev. if absent | Citations |
|---|---|---|---|
| D1 | What personal data, whose, which categories (incl. special categories), for which purposes and lawful basis? | High | GDPR Arts. 5, 6, 9, 30 |
| D2 | Data flow diagram incl. every third party and hosting region | High | GDPR 28, 44–49; DORA 28(3), 30(2)(b); NIS2 21(2)(d) |
| D3 | Privacy by design/default: minimisation, retention periods, pseudonymisation | High | GDPR 25, 5(1)(c),(e) |
| D4 | Is a DPIA needed (profiling, large-scale special data, systematic monitoring, new tech)? Planned? | Critical if needed & absent | GDPR 35 |
| D5 | Threat model / security risk assessment with treatment decisions | High | NIS2 21(2)(a); DORA 6; 27001 6.1.2–6.1.3; SOC 2 CC3.2 |
| D6 | Identity & access model: roles, MFA, privileged access, tenant isolation | High | NIS2 21(2)(i)–(j); 27001 A.5.15–5.18; SOC 2 CC6.1–6.3 |
| D7 | Encryption & key-management design | Medium | GDPR 32(1)(a); NIS2 21(2)(h); 27001 A.8.24 |
| D8 | Logging & monitoring design (what's logged, where, retention, who sees it) | Medium | NIS2 21(2)(b); DORA 10; 27001 A.8.15–8.16; SOC 2 CC7.2 |
| D9 | Availability targets, RTO/RPO, backup & DR, capacity | Medium (High if FS/critical) | NIS2 21(2)(c); DORA 11–12; SOC 2 A1 |
| D10 | Incident detection → regulatory notification path & owners | High (if in scope) | GDPR 33–34; NIS2 23; DORA 17–19 |
| D11 | Data-subject rights handling designed (export, delete propagation incl. backups & vendors) | High (controller) | GDPR 15–21 |
| D12 | Change & release process (environments, approvals, rollback) | Medium | DORA 9(4)(e); 27001 A.8.32; SOC 2 CC8.1 |
| D13 | AI: intended purpose, users, affected people, foreseeable misuse | High (if AI) | NIST MAP 1.1, 3.3; 42001 6.1.4, A.5 |
| D14 | AI: data provenance for training / fine-tuning / RAG | High (if AI) | 42001 A.7; NIST MAP 4.1; GDPR 6 |
| D15 | AI: evaluation plan and acceptance criteria before launch | Medium | NIST MEASURE 2.3–2.11; 42001 A.6 |
| D16 | AI: human oversight design, override, decommissioning | High (decisions about people) | GDPR 22; NIST MAP 3.5, MANAGE 2.4, GOVERN 1.7; 42001 A.9 |
| D17 | LLM: threat model against OWASP LLM01–LLM10 | Medium | OWASP LLM Top 10; NIST MEASURE 2.7 |
| D18 | Vendor selection criteria & exit plan for critical vendors (incl. model providers) | Medium (High if DORA) | DORA 28(8), 29; GDPR 28(1); 42001 A.10 |

**EU AI Act flag:** if D13 shows AI use, list trigger facts and hand off to
`eu-ai-act-compliance` (design-doc checklist there). Don't assign a tier here.

**Verdict:** count Critical/High "not designed" items → Not ready / Ready with design changes / Substantially ready.
