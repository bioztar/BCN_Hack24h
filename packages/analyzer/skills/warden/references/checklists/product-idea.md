# Checklist — product idea triage

**Use for:** a pitch, one-pager, feature idea or "can we build X?" question — before any
design exists. Goal: a **fast scoping verdict** (which frameworks, biggest red flags, what to
design in from day one). Few facts → state assumptions, ask at most one consolidated question.

## 1. Ten triage questions

| # | Question | If "yes" → | Citation |
|---|---|---|---|
| P1 | Will it touch data about identifiable people in/from the EU? | GDPR applies | GDPR Arts. 2–3 |
| P2 | Sensitive data (health, biometrics, children, criminal, financial hardship)? | DPIA likely; Art. 9 basis needed | GDPR 9, 35 |
| P3 | Will it make or heavily shape decisions about people (credit, jobs, access, pricing)? | Art. 22 safeguards; human review; AI Act flag | GDPR 22; NIST MAP 3.5 |
| P4 | Is the company (or customer) a bank, insurer, investment/payment/crypto firm? | DORA (direct or via contract) | DORA Arts. 2, 30 |
| P5 | Is the company (or customer) in energy, health, transport, digital infra, cloud, MSP, marketplace, manufacturing…? And ≥ 50 staff / > €10 M? | NIS2 (direct or via supply chain) | NIS2 Arts. 2–3, 21(2)(d) |
| P6 | Selling to enterprises (esp. US)? | Expect SOC 2 Type 2 and/or ISO 27001 asks | SOC 2; 27001 |
| P7 | Uses AI/ML or an LLM? | NIST AI RMF baseline; ISO 42001 if customers ask; OWASP LLM; EU AI Act flag | NIST AI 100-1; 42001 |
| P8 | Will an AI agent take actions (send, pay, delete, deploy)? | Excessive-agency controls, kill switch | OWASP LLM06; NIST MANAGE 2.4 |
| P9 | Data stored or processed outside the EU/EEA, or by US vendors? | Transfer mechanism; DORA location disclosure | GDPR 44–49; DORA 30(2)(b) |
| P10 | Is the service something customers will rely on for continuity (uptime-critical)? | BC/DR, availability criteria | NIS2 21(2)(c); DORA 11; SOC 2 A1 |

## 2. Output

1. **Applicable frameworks** table (status vocabulary from `../applicability-classifier.md` Step 7).
2. **Top 3 red flags** with citations.
3. **Design-in-from-day-one list** — pick the relevant bundles from `../overlap-matrix.md` §2.
4. **EU AI Act**: "not indicated" or "likely relevant — run `eu-ai-act-compliance`" + trigger facts.
5. **Readiness horizon**: what must exist before first EU customer / first FS customer / first enterprise deal.
