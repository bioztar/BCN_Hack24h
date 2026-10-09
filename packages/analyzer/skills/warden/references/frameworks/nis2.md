# NIS2 — Directive (EU) 2022/2555

> **Source:** Directive (EU) 2022/2555, OJ L 333, 27.12.2022 — CELEX 32022L2555 —
> <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022L2555> · local copy
> `corpus/eu-law/nis2-directive-2022-2555.md`. Implementing Regulation (EU) 2024/2690 —
> CELEX 32024R2690 — `corpus/eu-law/nis2-implementing-regulation-2024-2690.md`.
> **Type:** directive — binds Member States, reaches companies **through national
> transposition laws**. Always check the national law of each Member State where the
> entity is established. **Last reviewed:** 2026-10-09.

## In plain language

NIS2 is the EU's cybersecurity baseline for organisations that keep society running —
energy, transport, health, banking infrastructure, water, digital infrastructure, cloud
and data centres, managed IT/security providers, online marketplaces, search engines,
social networks, and many manufacturers. If you're mid-sized or bigger in one of those
sectors, you must run proper security risk management, have senior management sign off
and be trained, and report significant incidents fast (first warning within 24 hours).
Leadership can be held personally accountable.

## 1. Scope

| Question | Rule | Citation |
|---|---|---|
| Sectors | **Annex I** "sectors of high criticality" (energy, transport, banking, FMI, health, drinking/waste water, **digital infrastructure**, **ICT service management (B2B)**, public administration, space) and **Annex II** "other critical sectors" (postal, waste, chemicals, food, manufacturing incl. medical devices/electronics/machinery/vehicles, **digital providers**: marketplaces, search engines, social networks, research). | Art. 2(1), Annexes I–II |
| Size-cap rule | Applies to entities that qualify as **medium-sized** or exceed medium ceilings under Commission Recommendation 2003/361/EC (≥50 staff, or turnover > €10 M and balance sheet > €10 M). | Art. 2(1) |
| Size-independent | Regardless of size: public e-comms providers, trust service providers, TLD registries and **DNS service providers**, sole national providers of essential services, entities whose disruption would have significant impact, critical entities under CER, certain public administration. Domain-registration services in scope for Art. 28. | Art. 2(2)–(4) |
| Essential vs important | **Essential:** Annex I entities exceeding medium ceilings; qualified trust service providers, TLD registries, DNS providers regardless of size; medium-sized public e-comms providers; central-government public administration; Member-State-designated entities (Art. 2(2)(b)–(e)); CER critical entities; pre-16 Jan 2023 operators of essential services (Art. 3(1)(a)–(g)). **Important:** everything else in scope. | Art. 3(1)–(2) |
| Jurisdiction | Member State of establishment; for DNS, TLD, cloud, data-centre, CDN, MSP/MSSP, marketplaces, search, social networks: **main establishment** in the EU, or EU representative if non-EU and offering services in the EU. | Arts. 26(1)–(3) |
| Sector-specific carve-out | Where a sector-specific EU act (e.g. **DORA** for financial entities) imposes at-least-equivalent measures, those provisions apply instead. | Art. 4 |

## 2. Key obligations

| # | Obligation | Citation |
|---|---|---|
| N1 | **Management bodies approve** cybersecurity risk-management measures, oversee implementation, and **can be held liable** for infringements | Art. 20(1) |
| N2 | Members of management bodies **must follow training**; entities encouraged to train staff regularly | Art. 20(2) |
| N3 | Appropriate and proportionate technical, operational and organisational **risk-management measures**, all-hazards approach | Art. 21(1) |
| N4 | Minimum measure set: (a) risk analysis & IS policies; (b) incident handling; (c) business continuity, backup, disaster recovery, crisis management; (d) **supply-chain security**; (e) security in acquisition, development and maintenance incl. vulnerability handling & disclosure; (f) effectiveness assessment; (g) cyber hygiene & training; (h) cryptography/encryption; (i) HR security, access control, asset management; (j) **MFA** / continuous authentication, secured communications | Art. 21(2)(a)–(j) |
| N5 | Supply-chain: consider each direct supplier's vulnerabilities, product quality, and secure-development practices; take into account coordinated EU supply-chain risk assessments | Art. 21(3) |
| N6 | Corrective measures without undue delay where non-compliance detected | Art. 21(4) |
| N7 | **Significant incident reporting**: early warning, notification, intermediate, final report to CSIRT/competent authority; notify service recipients where appropriate | Art. 23(1)–(4) |
| N8 | Use European cybersecurity certification schemes where Member State requires | Art. 24 |
| N9 | Registration with authorities (sector, contact, IP ranges, Member States served) for digital-infrastructure/digital-provider types | Art. 27 |
| N10 | Domain-registration data accuracy & access (TLD registries, registrars) | Art. 28 |

Detailed technical requirements for DNS, TLD, cloud, data-centre, CDN, MSP/MSSP,
marketplace, search, social-network and trust-service providers: Implementing Regulation
(EU) 2024/2690, Annex (point-by-point specification of Art. 21(2)(a)–(j)).

Key quote:

> "Member States shall ensure that the management bodies of essential and important
> entities approve the cybersecurity risk-management measures taken by those entities in
> order to comply with Article 21, oversee its implementation and can be held liable for
> infringements by the entities of that Article." — Art. 20(1)

## 3. Deadlines & dates

| Date / clock | What | Citation |
|---|---|---|
| 16 Jan 2023 | Entry into force | Art. 45 |
| **17 Oct 2024** | Transposition deadline | Art. 41(1) |
| **18 Oct 2024** | National measures apply | Art. 41(1) |
| 17 Jan 2025 | Registration of DNS/TLD/cloud/DC/CDN/MSP/MSSP/marketplace/search/social entities | Art. 27(2) |
| 17 Apr 2025 | Member States establish list of essential/important entities (review ≥ every 2 years) | Art. 3(3) |
| **≤24 h** of awareness | Early warning of significant incident (indicate suspected unlawful/malicious act, cross-border impact) | Art. 23(4)(a) |
| **≤72 h** of awareness | Incident notification (initial assessment, severity, impact, IoCs) | Art. 23(4)(b) |
| ≤1 month after notification | Final report (or progress report if ongoing, final within 1 month of handling) | Art. 23(4)(d)–(e) |
| 17 Oct 2027 | Commission review of the Directive | Art. 40 |
| VERIFY: | National transposition status varies; many Member States transposed late. Check the Commission's transposition tracker / national gazette before stating an entity's live obligations. | — |

## 4. Penalties & enforcement

| | Essential entities | Important entities |
|---|---|---|
| Supervision | **Ex ante + ex post**: on-site inspections, regular and targeted audits, security scans, information requests | **Ex post** (on evidence/indication of non-compliance) |
| Max fine (Art. 21/23 breaches) | at least **€10 M or 2%** of worldwide annual turnover, higher of | at least **€7 M or 1.4%**, higher of |
| Citation | Arts. 32, 34(4) | Arts. 33, 34(5) |

- Beyond fines for essential entities: binding instructions, orders to inform customers,
  designation of a monitoring officer, **temporary suspension of certifications/
  authorisations** and **temporary prohibition of a CEO/legal representative from
  managerial functions** (Art. 32(5)); natural persons responsible can be held liable
  (Art. 32(6)).
- Member States set the actual fine levels in national law within these floors-of-maximum (Art. 34).
- GDPR interplay: where an infringement also is a GDPR breach and the DPA fines under GDPR,
  NIS2 authorities may not fine for the same conduct (Art. 35(2)).

## 5. Mapping onto a software product

| Area | What NIS2 expects | Citation |
|---|---|---|
| Governance | Board-approved security policy, documented risk assessment, management training records | Arts. 20, 21(2)(a) |
| Incident response | Detection → classification against "significant incident" criteria → 24 h / 72 h / 1 month reporting pipeline; customer notification templates | Art. 23; IR 2024/2690 Arts. 3–14 |
| Logging | Security event logging and monitoring sufficient to detect, triage and report incidents | Art. 21(2)(b); IR 2024/2690 Annex §3 |
| Continuity | Backups tested by restore, DR plan with RTO/RPO, crisis-management roles | Art. 21(2)(c) |
| Access control | MFA, privileged-access management, joiner/mover/leaver, asset inventory | Art. 21(2)(i)–(j) |
| Secure SDLC | Secure development, dependency/vulnerability management, coordinated vulnerability disclosure (CVD) policy | Art. 21(2)(e), Art. 12 |
| Cryptography | Encryption policy, key management | Art. 21(2)(h) |
| Vendor management | Supplier security requirements, secure-development evidence from suppliers, supplier register | Art. 21(2)(d), 21(3) |
| Human oversight | Not an AI-specific concept here; covered by management accountability | Art. 20 |

**If you are a supplier** (not yourself in scope) to an in-scope entity: expect contractual
flow-down of Art. 21(2)(d) supply-chain requirements — security questionnaires, incident
notification SLAs, audit rights.

## 6. Interplay with the EU AI Act (reference only)

AI systems used as safety components in critical infrastructure (Annex III point 2 of the
AI Act) are a distinct AI Act topic; NIS2 governs the cybersecurity of the entity, not AI
risk tier. For AI Act classification use **`eu-ai-act-compliance`** /
<https://github.com/bioztar/EU-AI-Act>.

## 7. Common misconceptions

- "NIS2 applies directly." — It is a directive; obligations bite through national law, which may add requirements.
- "We're not critical infrastructure, so we're out." — Annex II covers manufacturers, digital providers and B2B managed services; size rule catches mid-sized firms.
- "Financial entities do both NIS2 and DORA." — DORA is lex specialis for ICT risk/incident reporting (NIS2 Art. 4; DORA Recital 16).
- "24 hours = full report." — 24 h is an early warning; full notification at 72 h.

## Sources

- Directive (EU) 2022/2555 (NIS2), EUR-Lex: <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022L2555>
- Commission Implementing Regulation (EU) 2024/2690: <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R2690>
- Commission Recommendation 2003/361/EC (SME definition): <https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32003H0361>
