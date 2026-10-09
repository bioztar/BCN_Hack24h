# OWASP Top 10 for LLM Applications — 2025 (supplementary)

> **Source:** OWASP GenAI Security Project — <https://genai.owasp.org/llm-top-10/> (2025 list,
> released Nov 2024; CC BY-SA 4.0). Pointer file: `corpus/standards/owasp-llm-top10.md`.
> warden stores IDs/names plus **authored** summaries only; follow the link for OWASP's text.
> **Type:** voluntary security awareness list, not a legal or certifiable standard.
> **Status in warden v1:** supplementary — lighter coverage than the seven core frameworks.
> **Last reviewed:** 2026-10-09.

## In plain language

The ten most common ways LLM features get hacked or go wrong — tricking the model with
hidden instructions, leaking secrets, trusting its output too much, letting an agent do
too much, and running up a giant bill. It's the security engineer's checklist for any
chatbot, copilot or agent, and the place where legal frameworks' vague "appropriate
security" meets concrete tests.

## 1. Scope

Any application that integrates an LLM (chat, RAG, agents, tool use). No jurisdiction,
no penalties. Becomes binding only via contract/security policy.

## 2. The ten risks → controls → framework hooks

| ID | Risk | Product control (authored) | Framework hooks |
|---|---|---|---|
| LLM01:2025 | Prompt Injection | Treat all retrieved/user content as untrusted; separate instructions from data; tool-call allow-lists; human approval for high-impact actions | NIST MEASURE 2.7; ISO 42001 A.6; 27001 A.8.28; GDPR Art. 32 |
| LLM02:2025 | Sensitive Information Disclosure | Don't put secrets/PII in prompts or training data; output filtering; tenant isolation in RAG | GDPR Arts. 5(1)(f), 25, 32; 27001 A.8.11–8.12; SOC 2 C1 |
| LLM03:2025 | Supply Chain | Model/dataset provenance, signed artefacts, vendor assessment of model APIs | NIS2 Art. 21(2)(d); DORA Art. 28; 42001 A.10; NIST GOVERN 6.1 |
| LLM04:2025 | Data and Model Poisoning | Data provenance and validation, anomaly detection on fine-tune data | 42001 A.7; NIST MEASURE 2.7; AI 600-1 information security |
| LLM05:2025 | Improper Output Handling | Encode/validate output before it reaches browsers, shells, SQL; never `eval` model output | 27001 A.8.28; SOC 2 PI1.3 |
| LLM06:2025 | Excessive Agency | Least-privilege tool scopes, rate limits, confirmation gates, kill switch | NIST MAP 3.5, MANAGE 2.4; 42001 A.9; GDPR Art. 22 where decisions affect people |
| LLM07:2025 | System Prompt Leakage | Assume system prompt is public; no credentials or authz logic in prompts | 27001 A.5.17, A.8.4; SOC 2 CC6.1 |
| LLM08:2025 | Vector and Embedding Weaknesses | Per-tenant/permission-aware retrieval, embedding-store access control, inversion risk treated as PII | GDPR Art. 32; 27001 A.5.15, A.8.3 |
| LLM09:2025 | Misinformation | Grounding with citations, uncertainty display, human review for consequential outputs | NIST MEASURE 2.5, AI 600-1 confabulation; 42001 A.8 |
| LLM10:2025 | Unbounded Consumption | Quotas, max tokens, timeouts, cost alerts, abuse detection | SOC 2 A1.1; NIS2 Art. 21(2)(c); DORA Art. 7 (capacity) |

## 3. Testing hooks

Map each risk to a red-team/eval case in your pre-release suite (NIST MEASURE 2.7, ISO
42001 A.6 V&V). Retest on model upgrade, prompt change, or new tool.

## 4. EU AI Act

Robustness and cybersecurity duties for high-risk AI systems and GPAI models are AI-Act
topics — use **`eu-ai-act-compliance`** / <https://github.com/bioztar/EU-AI-Act>.

## Sources

- OWASP Top 10 for LLM Applications 2025: <https://genai.owasp.org/llm-top-10/>
