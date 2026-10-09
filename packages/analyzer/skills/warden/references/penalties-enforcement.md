# Penalties & enforcement — side-by-side

Binding law (GDPR, NIS2, DORA) carries regulatory penalties; standards and frameworks
(ISO/IEC 27001, ISO/IEC 42001, SOC 2, NIST AI RMF, OWASP) carry **commercial** consequences
only. EU AI Act penalties: see
<https://github.com/bioztar/EU-AI-Act/blob/main/analysis/penalties-enforcement.md>.

Last reviewed: 2026-10-09.

## 1. Binding law

| | GDPR | NIS2 (via national law) | DORA |
|---|---|---|---|
| Max administrative fine | €10 M / 2% (Art. 83(4)); **€20 M / 4%** (Art. 83(5)–(6)) of worldwide annual turnover, higher of | Essential: **≥ €10 M / 2%** max; Important: **≥ €7 M / 1.4%** max (Art. 34(4)–(5)) | Set by Member States (Art. 50(3)); CTPPs: periodic penalty **≤ 1% avg daily worldwide turnover**, ≤ 6 months (Art. 35(6)–(8)) |
| Non-fine powers | Processing bans, transfer suspension, orders (Art. 58(2)) | Binding instructions, audits, monitoring officer, Art. 32(2), (4); suspension of certification / temporary ban on managers: Art. 32(5) (essential entities) | Cease-and-desist, remedial measures, public notices (Art. 50(4)); contract suspension/termination with CTPPs (Art. 42) |
| Personal liability | — (DPO protected, Art. 38(3)) | Management bodies liable (Art. 20(1)); individuals (Art. 32(6)) | Penalties on management-body members per national law (Art. 50(5)) |
| Private enforcement | Complaints, compensation, representative actions (Arts. 77–82) | National law | National law |
| Double jeopardy | — | No NIS2 fine for same conduct already fined under GDPR (Art. 35(2)) | Lex specialis over NIS2 for financial entities (NIS2 Art. 4) |
| Publication | National practice | National practice | Mandatory publication of final penalties (Art. 54) |

## 2. Voluntary standards / frameworks

| Framework | What "enforcement" means |
|---|---|
| ISO/IEC 27001, 42001 | Major nonconformity → certificate withheld, suspended or withdrawn by the certification body; contractual breach if certification is a covenant |
| SOC 2 | Qualified/adverse opinion or exceptions in a Type 2; lost deals; contractual breach |
| NIST AI RMF | None by NIST; contract/procurement consequences; VERIFY state-law references |
| OWASP LLM Top 10 | None; used as security requirements in contracts and pentests |

## 3. Plain-language framing

"EU law can fine you a percentage of global revenue and, under NIS2, bar a CEO from
managing; the standards can't fine you, but losing a certificate or a clean SOC 2 report
can lose you the customer."
