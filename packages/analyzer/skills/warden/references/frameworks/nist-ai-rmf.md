# NIST AI RMF — AI Risk Management Framework 1.0 (NIST AI 100-1) + Generative AI Profile (NIST AI 600-1)

> **Source:** NIST AI 100-1 (26 Jan 2023) <https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf>
> and NIST AI 600-1 (July 2024) <https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf>.
> Local copies: `corpus/nist/nist-ai-100-1.md`, `corpus/nist/nist-ai-600-1.md` (US Government
> works, not subject to US copyright — quotes are verbatim).
> **Type:** voluntary framework. **Not law.** **Last reviewed:** 2026-10-09.

## In plain language

NIST's AI RMF is a practical playbook for "how do we know our AI is trustworthy?" It has
four verbs: **Govern** (set policy, owners, culture), **Map** (understand what the system is
for, who it affects and what could go wrong), **Measure** (test it — accuracy, safety,
security, bias, privacy), and **Manage** (fix, monitor, respond to incidents, switch off if
needed). No one fines you for ignoring it, but US buyers, government agencies and auditors
use it as the common vocabulary — and the Generative AI Profile adds a checklist of risks
specific to chatbots and LLM features.

## 1. Scope

| Question | Answer |
|---|---|
| Who | Any organisation designing, developing, deploying, evaluating or using AI ("AI actors"). Sector-, size- and jurisdiction-agnostic. |
| Status | Voluntary, non-certifiable. "Use-case profiles" adapt it to a sector or technology. |
| Binding through | Contracts, procurement requirements, sector regulator expectations. VERIFY: some US state laws (e.g. Colorado SB 24-205) reference recognised AI risk frameworks such as the NIST AI RMF or ISO/IEC 42001 as a basis for a defence/presumption — check current text and effective date before relying on it. |

**Trustworthy-AI characteristics** (AI 100-1 §3): valid and reliable; safe; secure and
resilient; accountable and transparent; explainable and interpretable; privacy-enhanced;
fair with harmful bias managed.

## 2. Core structure — functions, categories, subcategories

6 GOVERN, 5 MAP, 4 MEASURE, 4 MANAGE categories; 72 subcategories (AI 100-1 §5, Tables 1–4).
Cite as e.g. "NIST AI RMF MEASURE 2.7".

| Function | Categories (authored short titles) | Subcategories most used for product reviews |
|---|---|---|
| **GOVERN** (cross-cutting) | 1 Policies & processes · 2 Accountability structures · 3 Workforce diversity & inclusion in decisions · 4 Risk culture · 5 Engagement with AI actors / affected parties · 6 Third-party risk | 1.1 legal & regulatory requirements understood · 1.5 ongoing monitoring & periodic review · 1.6 **AI inventory** · 1.7 safe decommissioning · 2.1 roles & lines of communication · 2.3 executive accountability · 4.3 testing, incident identification & information sharing · 6.1 third-party IP/data/software risk policies · 6.2 contingency for third-party failures |
| **MAP** | 1 Context established · 2 System categorised · 3 Capabilities, usage, benefits & costs understood · 4 Risks/benefits mapped for all components incl. third-party · 5 Impacts characterised | 1.1 intended purpose & context · 1.5 risk tolerance · 1.6 system requirements · 2.3 TEVV considerations · 3.3 application scope · 3.4 operator proficiency · **3.5 human oversight processes defined** · 4.1 legal/technology risk mapping incl. third-party · 5.1 likelihood & magnitude of impacts |
| **MEASURE** | 1 Methods & metrics identified · 2 Evaluated for trustworthy characteristics · 3 Risks tracked over time · 4 Measurement efficacy feedback | 1.3 independent assessors · 2.3 performance criteria · 2.5 validity & reliability · 2.6 safety · **2.7 security & resilience** · 2.8 transparency & accountability · 2.9 explainability · **2.10 privacy** · **2.11 fairness & bias** · 2.12 environmental impact · 3.3 end-user feedback / appeal |
| **MANAGE** | 1 Risks prioritised & responded to · 2 Strategies to maximise benefit / minimise harm · 3 Third-party risks managed · 4 Treatments, response, recovery & communication monitored | 1.3 responses to high-priority risks · 1.4 residual risk documented · 2.3 respond to/recover from unknown risks · **2.4 supersede, disengage or deactivate** · 3.1 third-party risks monitored · 4.1 post-deployment monitoring incl. appeal, override, decommissioning · **4.3 incidents & errors communicated** |

Key quote:

> "The AI RMF is intended to be voluntary, rights-preserving, non-sector-specific, and
> use-case agnostic, providing flexibility to organizations of all sizes and in all sectors
> and throughout society to implement the approaches in the framework." — NIST AI 100-1

### Generative AI Profile (AI 600-1) — 12 GAI risks (§2)

CBRN information or capabilities · confabulation · dangerous, violent or hateful content ·
data privacy · environmental impacts · harmful bias & homogenisation · human-AI
configuration · information integrity · information security · intellectual property ·
obscene, degrading and/or abusive content · value chain & component integration. §3 maps
suggested actions to AI RMF subcategories (action IDs like GV-1.1-001, MS-2.7-xxx).

## 3. Dates

| Date | What | Source |
|---|---|---|
| 26 Jan 2023 | AI RMF 1.0 released | NIST AI 100-1 |
| Jul 2024 | Generative AI Profile released | NIST AI 600-1 |
| No later than 2028 | Formal review with input from the AI community expected | NIST AI 100-1, Overview |
| — | No compliance deadlines (voluntary) | — |

## 4. Enforcement mechanics

None by NIST. Consequences arise only where adopted by contract, procurement or a law that
references it (see VERIFY note in §1). Misrepresenting alignment in marketing could raise
consumer-protection issues under general law — outside this repo's scope.

## 5. Mapping onto a software product

| Area | What "aligned" looks like | Subcategory |
|---|---|---|
| AI inventory & ownership | Register of AI features/models with owner, purpose, risk tier | GOVERN 1.6, 2.1 |
| Data handling | Provenance and consent of training/fine-tune/RAG data; PII minimisation | MAP 4.1, MEASURE 2.10; AI 600-1 data privacy |
| Logging | Prompts/outputs/tool calls logged (privacy-aware) for incident analysis and evals | MEASURE 3.1, MANAGE 4.1 |
| Testing | Pre-release eval suite: accuracy, safety, red-team, bias, robustness; independent reviewers | MEASURE 1.3, 2.3–2.11 |
| Security | Prompt-injection, model/data poisoning, extraction defences (see `owasp-llm-top10.md`) | MEASURE 2.7; AI 600-1 information security |
| Human oversight | Defined human-in/on-the-loop points, override and kill switch | MAP 3.5, MANAGE 2.4 |
| Incident response | AI incident definition, escalation, user/regulator communication | GOVERN 4.3, MANAGE 2.3, 4.3 |
| Vendor management | Foundation-model provider due diligence, contingency if API/model deprecated | GOVERN 6.1–6.2, MANAGE 3.1 |
| Feedback & appeal | User feedback and contest channels feeding improvement | MEASURE 3.3, MANAGE 4.1 |
| Decommissioning | Safe phase-out plan for models | GOVERN 1.7 |

## 6. Interplay

- **ISO/IEC 42001:** NIST is the "what to think about"; 42001 is the certifiable "prove you run it". Mapping in `analysis/overlap-matrix.md`.
- **EU AI Act:** NIST alignment is useful evidence but not AI-Act conformity. Use **`eu-ai-act-compliance`** / <https://github.com/bioztar/EU-AI-Act>.

## 7. Common misconceptions

- "NIST AI RMF is mandatory for US companies." — Voluntary.
- "We can be certified to it." — No certification scheme exists.
- "It's only for big models." — It's use-case agnostic; a rules-assisted scoring model counts.

## Sources

- NIST AI 100-1: <https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf>
- NIST AI 600-1: <https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf>
- NIST AI RMF resource centre: <https://airc.nist.gov/>
