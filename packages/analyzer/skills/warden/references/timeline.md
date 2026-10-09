# Timeline & compliance dates — warden frameworks

Consolidated dates and reporting clocks. Each row cites its source; anything unconfirmed is
marked `VERIFY:` or `ASSUMED:` — never stated as fact. EU AI Act dates are **not** here:
see <https://github.com/bioztar/EU-AI-Act/blob/main/analysis/timeline-compliance-dates.md>.

Last reviewed: 2026-10-09.

## 1. Application dates

| Date | Framework | Event | Source |
|---|---|---|---|
| 25 May 2018 | GDPR | Applies | GDPR Art. 99(2) |
| Oct 2022 | ISO/IEC 27001 | 2022 edition published | ISO catalogue |
| 26 Jan 2023 | NIST AI RMF | 1.0 released | NIST AI 100-1 |
| Dec 2023 | ISO/IEC 42001 | Published | ISO catalogue |
| Jul 2024 | NIST AI RMF | Generative AI Profile released | NIST AI 600-1 |
| 17 Oct 2024 | NIS2 | Transposition deadline | NIS2 Art. 41(1) |
| 18 Oct 2024 | NIS2 | National measures apply | NIS2 Art. 41(1) |
| 17 Jan 2025 | DORA | Applies | DORA Art. 64 |
| 17 Jan 2025 | NIS2 | Art. 27 registration (DNS, TLD, cloud, DC, CDN, MSP/MSSP, marketplaces, search, social) | NIS2 Art. 27(2) |
| 17 Apr 2025 | NIS2 | Member-State lists of essential/important entities | NIS2 Art. 3(3) |
| 31 Oct 2025 | ISO/IEC 27001 | 2013-edition certificates expire (transition end) | IAF MD 26 |
| 17 Oct 2027 | NIS2 | Commission review | NIS2 Art. 40 |
| ≤ 2028 | NIST AI RMF | Formal review with community input expected | NIST AI 100-1 |
| VERIFY: | NIS2 | Actual national application per Member State (many transposed late) | Commission transposition tracker |
| VERIFY: | GDPR | Procedural Regulation on cross-border enforcement — adoption/application date | EUR-Lex procedure 2023/0202(COD) |

## 2. Incident & request clocks (the ones engineering must build for)

| Clock | Framework | Trigger → deadline | Source |
|---|---|---|---|
| ≤ 4 h after classifying as major, ≤ 24 h after awareness | DORA | Initial notification of major ICT incident | RTS 2025/301 Art. 5(1)(a) |
| ≤ 24 h | NIS2 | Early warning of significant incident | NIS2 Art. 23(4)(a) |
| ≤ 72 h | GDPR | Breach notification to SA from awareness (where feasible) | GDPR Art. 33(1) |
| ≤ 72 h | NIS2 | Incident notification | NIS2 Art. 23(4)(b) |
| ≤ 72 h after initial | DORA | Intermediate report | RTS 2025/301 Art. 5(1)(b) |
| Without undue delay | GDPR | Processor → controller breach notice | GDPR Art. 33(2) |
| Without undue delay | GDPR | Communication to data subjects (high risk) | GDPR Art. 34(1) |
| ≤ 1 month after notification | NIS2 | Final report | NIS2 Art. 23(4)(d) |
| ≤ 1 month after latest intermediate | DORA | Final report | RTS 2025/301 Art. 5(1)(c) |
| 1 month (+2) | GDPR | Data-subject request response | GDPR Art. 12(3) |
| Contractual | SOC 2 / ISO | No statutory clock — set by customer contracts/SLAs (e.g. "notify within 48 h") | — |

## 3. Recurring cadences

| Cadence | Framework | What | Source |
|---|---|---|---|
| Yearly | DORA | Review ICT risk framework; test critical-function systems; report register-of-information summary | DORA Arts. 6(5), 24(6), 28(3) |
| Every 3 years | DORA | TLPT for identified entities | DORA Art. 26(1) |
| At least every 2 years | NIS2 | Member States review entity lists | NIS2 Art. 3(3) |
| Yearly surveillance, 3-year recert | ISO 27001 / 42001 | Certification cycle | ISO/IEC 17021-1 |
| Annual Type 2 (market practice) | SOC 2 | New report + bridge letters | Market practice — ASSUMED |
| Planned intervals | ISO 27001 / 42001 | Internal audit, management review, risk re-assessment | Clauses 8.2, 9.2, 9.3 |
