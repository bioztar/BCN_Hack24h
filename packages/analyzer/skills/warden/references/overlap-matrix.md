# Overlap matrix — one control, many frameworks

**The highest-value page for client work.** Each row is a control *theme* an engineering or
security team actually implements once; the columns show the citation in every warden
framework that the same control (and the same evidence) helps satisfy. EU AI Act columns
are **references only** — follow the link to the sibling repo for the actual obligation.

How to read a cell: `—` = not addressed by that framework · *italic* = partial / supports only.
"Satisfies" always means **supplies evidence toward**; no framework accepts another's
certificate as automatic compliance (see §3 "gaps that never transfer").

Last reviewed: 2026-10-09. Citation keys: GDPR = Reg. (EU) 2016/679; NIS2 = Dir. (EU)
2022/2555; DORA = Reg. (EU) 2022/2554; 27001 = ISO/IEC 27001:2022 (clause / Annex A); 42001 =
ISO/IEC 42001:2023 (clause / Annex A); SOC 2 = AICPA TSC 2017; NIST = AI RMF 1.0 subcategory;
OWASP = LLM Top 10 2025.

## 1. Matrix

| # | Control theme | GDPR | NIS2 | DORA | 27001 | 42001 | SOC 2 | NIST AI RMF | EU AI Act (ref only) |
|---|---|---|---|---|---|---|---|---|---|
| O1 | **Governance & management accountability** — board-approved policy, named owners, management training | Art. 24 | Art. 20(1)–(2) | Art. 5(2)–(4) | 5.1–5.3 | 5.1–5.3, A.2–A.3 | CC1.1–1.5 | GOVERN 2.1–2.3 | → sibling: provider QMS / AI literacy |
| O2 | **Risk assessment & treatment** — documented method, register, periodic re-assessment | *Art. 32(1)–(2)*, Art. 35 | Art. 21(1), 21(2)(a) | Art. 6 | 6.1.2–6.1.3, 8.2–8.3 | 6.1.2–6.1.3, 8.2–8.3 | CC3.1–3.4 | MAP 1.5, 4.1, 5.1; MANAGE 1.1–1.4 | → sibling: risk-management system |
| O3 | **Impact assessment on people** | Art. 35 (DPIA) | — | — | — | 6.1.4, 8.4, A.5 | — | MAP 5.1–5.2 | → sibling: fundamental-rights impact assessment |
| O4 | **Asset & data inventory / records** | Art. 30 | Art. 21(2)(i) | Art. 8 | A.5.9–5.12 | 4.3, A.4 | CC6.1, C1.1 | GOVERN 1.6 | → sibling: technical documentation |
| O5 | **Access control, MFA, privileged access** | Art. 32(1)(b) | Art. 21(2)(i)–(j) | Art. 9(4)(c)–(d) | A.5.15–5.18, A.8.2–8.5 | *via 27001* | CC6.1–6.3 | *MEASURE 2.7* | → sibling: cybersecurity of high-risk AI |
| O6 | **Encryption & key management** | Art. 32(1)(a) | Art. 21(2)(h) | Art. 9(2)–(4) | A.8.24 | *via 27001* | CC6.1, CC6.7 | *MEASURE 2.7* | — |
| O7 | **Logging & monitoring** | *Art. 32(1)(d)*, Art. 5(2) | Art. 21(2)(b) | Art. 10 | A.8.15–8.17 | A.6 (event logs) | CC7.2–7.3 | MEASURE 3.1; MANAGE 4.1 | → sibling: record-keeping / logs |
| O8 | **Incident response process** | Art. 33(5) (breach register) | Art. 21(2)(b) | Art. 17 | A.5.24–5.28 | A.8, 10.2 | CC7.3–7.5 | MANAGE 2.3, 4.3; GOVERN 4.3 | → sibling: serious-incident reporting |
| O9 | **Regulatory incident notification clocks** | Art. 33 (72 h), 34 | Art. 23 (24 h / 72 h / 1 mo) | Art. 19 + RTS 2025/301 (4 h / 24 h / 72 h / 1 mo) | *A.5.26, A.5.31* | *A.8* | *CC2.3, P6* | *MANAGE 4.3* | → sibling |
| O10 | **Business continuity, backup & DR** | Art. 32(1)(b)–(c) | Art. 21(2)(c) | Arts. 11–12, 14 | A.5.29–5.30, A.8.13–8.14 | — | A1.2–1.3, CC9.1 | GOVERN 6.2 | — |
| O11 | **Secure SDLC & vulnerability management** | Art. 25 | Art. 21(2)(e) | Art. 9; RTS 2024/1774 | A.8.8, A.8.25–8.29 | A.6 | CC7.1, CC8.1 | MEASURE 2.7; OWASP LLM01–10 | → sibling: accuracy/robustness/cybersecurity |
| O12 | **Change management** | — | *Art. 21(2)(e)* | Art. 9(4)(e) | A.8.32 | 6.3, A.6 | CC8.1 | MANAGE 4.2 | → sibling: substantial modification |
| O13 | **Security & resilience testing** | Art. 32(1)(d) | Art. 21(2)(f) | Arts. 24–27 (yearly; TLPT 3-yearly) | A.8.29, A.5.35 | A.6 (V&V) | CC4.1, CC7.1 | MEASURE 1.3, 2.5–2.7 | → sibling |
| O14 | **Vendor / supply-chain risk** — inventory, due diligence, tiering, monitoring | Art. 28(1) | Art. 21(2)(d), 21(3) | Arts. 28–29 | A.5.19–5.22 | A.10 | CC9.2 | GOVERN 6.1; MANAGE 3.1 | → sibling: value-chain obligations |
| O15 | **Mandatory contract terms with vendors** | Art. 28(3) (DPA) | *Art. 21(2)(d)* | Art. 30 | A.5.20 | A.10 | CC9.2 | GOVERN 6.1 | → sibling |
| O16 | **Cloud-service security** | Art. 28, 44–46 (location) | Annex I (cloud = digital infra) | Arts. 28–30 | A.5.23 | A.10 | CC9.2 (carve-outs) | — | — |
| O17 | **International data transfers / data location** | Arts. 44–49 | — | Art. 30(2)(b) (locations) | *A.5.31, A.5.34* | — | *P6* | — | — |
| O18 | **Data minimisation, retention & deletion** | Art. 5(1)(c),(e), 17, 25 | — | *Art. 12(1) (backup scope)* | A.8.10–8.11 | A.7 | C1.2, P4 | MEASURE 2.10 | → sibling: data governance |
| O19 | **Data quality & provenance (incl. AI training data)** | Art. 5(1)(d) | — | — | — | A.7 | PI1.1–1.2 | MAP 2.1, 4.1; MEASURE 2.1 | → sibling: data governance |
| O20 | **Transparency to users** | Arts. 12–14 | — | — | — | A.8 | CC2.3, P1 | MEASURE 2.8–2.9 | → sibling: transparency obligations |
| O21 | **Data-subject / user rights & contest channel** | Arts. 15–22 | — | — | A.5.34 | A.8 | P5, P8 | MEASURE 3.3; MANAGE 4.1 | → sibling |
| O22 | **Human oversight / override / kill switch** | Art. 22(3) | — | — | — | A.9, A.6 | *PI1.3* | MAP 3.5; MANAGE 2.4 | → sibling: human oversight |
| O23 | **Bias / fairness evaluation** | *Art. 5(1)(a) fairness* | — | — | — | A.5, A.6 | — | MEASURE 2.11 | → sibling |
| O24 | **Awareness & training** | Art. 39(1)(b) (DPO task) | Art. 20(2), 21(2)(g) | Art. 13(6) | 7.2–7.3, A.6.3 | 7.2–7.3 | CC1.4 | GOVERN 2.2 | → sibling: AI literacy |
| O25 | **Internal audit & management review** | Art. 24(1) (review) | Art. 21(2)(f) | Art. 6(6) (internal audit) | 9.2–9.3 | 9.2–9.3 | CC4.1–4.2 | GOVERN 1.5 | → sibling: post-market monitoring |
| O26 | **Decommissioning / exit** | Art. 28(3)(g) (return/delete) | — | Art. 28(8) (exit strategies) | A.5.11 | A.6 | CC6.5 | GOVERN 1.7 | — |

EU AI Act cross-reference index (do not restate here):
<https://github.com/bioztar/EU-AI-Act/blob/main/analysis/obligations-matrix.md> — invoke
`eu-ai-act-compliance` for the actual AI-Act obligation behind any "→ sibling" cell.

## 2. Build-once bundles (how to pitch it to a client)

| Bundle | Rows | One implementation… | …evidences |
|---|---|---|---|
| **Security baseline** | O2, O4–O7, O10–O13 | ISO 27001 ISMS with Annex A controls operated and sampled | 27001 cert · SOC 2 CC6–CC9 · GDPR Art. 32 · most of NIS2 Art. 21(2) · much of DORA Arts. 6–14 |
| **Incident pipeline** | O7–O9 | One detection → classification → notification workflow with parallel clocks (DORA 4 h, NIS2 24 h, GDPR/NIS2 72 h, final reports 1 month) | GDPR 33–34 · NIS2 23 · DORA 17–19 · 27001 A.5.24–5.28 · SOC 2 CC7.3–7.5 |
| **Third-party programme** | O14–O17, O26 | Vendor register + tiering + due-diligence questionnaire + contract clause library (Art. 28 DPA ∪ DORA Art. 30 ∪ NIS2 supply-chain) + exit plans | GDPR 28 · NIS2 21(2)(d) · DORA 28–30 · 27001 A.5.19–5.23 · SOC 2 CC9.2 · 42001 A.10 |
| **AI governance** | O3, O19–O23 | AI inventory + per-system impact assessment + eval suite + oversight design | 42001 · NIST AI RMF · GDPR 22/35 · groundwork for AI Act (sibling) |
| **Accountability layer** | O1, O24–O25 | Board-approved policy set, training records, internal audit, management review | GDPR 24 · NIS2 20 · DORA 5, 13 · 27001/42001 cl. 5, 7, 9 · SOC 2 CC1, CC4 |

## 3. Gaps that never transfer

Things an ISO 27001 certificate or a clean SOC 2 report do **not** cover — always check separately:

1. **Statutory notification clocks and recipients** (GDPR Art. 33; NIS2 Art. 23; DORA Art. 19) — standards require an IR process, not the legal deadlines or authority channels.
2. **Lawful basis, transparency and data-subject rights** (GDPR Arts. 6, 12–22) — outside ISO 27001 and SOC 2 Security.
3. **International transfer mechanisms** (GDPR Arts. 44–49).
4. **Management-body training and personal accountability** (NIS2 Art. 20; DORA Art. 5).
5. **DORA Art. 30 contract terms and the register of information** (Art. 28(3)) — very specific; ISO A.5.20 is generic.
6. **TLPT** (DORA Art. 26) — beyond normal pen-testing.
7. **NIS2 registration and national specifics** (Art. 27; transposition law).
8. **AI-specific obligations** — ISO 27001/SOC 2 are silent; 42001/NIST are voluntary; binding AI rules → sibling repo.

## 4. Mapping caveats

- ISO and AICPA references point to clause/control/criterion *numbers*; wording lives in licensed documents.
- Mappings are authored judgement for readiness work — VERIFY against the licensed text and the client's auditor before relying on them in an attestation.
- "*Via 27001*" in the 42001 column means 42001 relies on the organisation's general information-security controls rather than repeating them.
