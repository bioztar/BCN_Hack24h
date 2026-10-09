---
name: warden-compliance
description: Multi-framework compliance & security readiness analysis (GDPR, NIS2, DORA, ISO/IEC 27001, ISO/IEC 42001, SOC 2, NIST AI RMF, OWASP LLM Top 10) for any artifact — codebase, design doc, product idea, or vendor. Determines which frameworks apply, which obligations are triggered (each cited to article/clause/control), where one control satisfies several frameworks, and whether the EU AI Act likely also applies (hands off to `eu-ai-act-compliance`). Outputs a client-facing audit/readiness checklist with citations, or a plain-language explainer with a sources footer. Use when the user says "GDPR", "NIS2", "DORA", "ISO 27001", "ISO 42001", "SOC 2", "NIST AI RMF", "OWASP LLM", "compliance check", "security readiness", "audit readiness", "which regulations apply", "vendor assessment", "DPA review", "explain GDPR/NIS2/DORA in plain language", or asks about breach-notification deadlines, fines or overlapping controls.
---

# warden — compliance & security readiness (non-AI-Act frameworks)

Analyze an artifact against the warden framework set and produce either an **audit/readiness
checklist** (client-facing, every claim cited) or a **plain-language explainer**
(content-facing, citations moved to a short sources footer). The EU AI Act is out of scope
here — it is covered by the sibling skill **`eu-ai-act-compliance`**; flag it, don't restate it.

> **Token economy.** A normal review reads: this file + `references/applicability-classifier.md`
> + **one** checklist + `references/report-template.md` (or `references/explainer-template.md`).
> Open a `references/frameworks/<slug>.md` file **only** for frameworks the classifier marks
> as applying and only when you need a citation you don't have. Open `overlap-matrix.md`,
> `timeline.md` or `penalties-enforcement.md` only when the output needs them. Never read
> files speculatively; never read `corpus/` (it is not shipped with the skill).
>
> **Estimated cost:** ≈ 5–6k tokens for a typical review (entry + classifier + one checklist + template); each framework file opened adds ≈ 1–3k.

## Workflow

1. **Intake.** Identify artifact type and pick exactly one checklist:
   - repo / service / diff → `references/checklists/codebase.md`
   - PRD / RFC / architecture / threat model → `references/checklists/design-doc.md`
   - pitch / one-pager / "can we build X" → `references/checklists/product-idea.md`
   - supplier, SaaS, model API, DPA, security questionnaire → `references/checklists/vendor-assessment.md`
   Identify output mode: **audit** (default) or **explainer** (user asks for plain language, a post, a summary for non-specialists).
2. **Scope facts.** From `references/applicability-classifier.md` "Inputs", extract: establishment & markets, personal data, sector, size, customer type, AI use, existing certifications. If key facts are missing, ask **one** consolidated question; if the user can't answer, proceed with explicit `ASSUMED:` statements.
3. **Applicability.** Run classifier Steps 1–7. Produce the applicability table (status: APPLIES / APPLIES (contractual) / VIA SUPPLY CHAIN / RECOMMENDED / NOT TRIGGERED / UNCLEAR). Skip all checks for NOT TRIGGERED frameworks.
4. **EU AI Act flag.** Classifier Step 8: if any AI system / GPAI model with an EU nexus is present, output "EU AI Act: LIKELY RELEVANT — run `eu-ai-act-compliance`" with the trigger facts. **Do not** assign an AI-Act risk tier, role or obligation — see `references/eu-ai-act-handoff.md` for the exact hand-off wording. If that skill is installed, invoke it after this report; if not, link <https://github.com/bioztar/EU-AI-Act>.
5. **Evidence pass.** Walk the chosen checklist. Every finding needs evidence (`path:line`, doc section, or quoted statement) or is marked **unverified**. Never mark "pass" on absence of evidence.
6. **Cite.** Each finding cites the specific article/clause/control/criterion (e.g. "GDPR Art. 33(1)", "NIS2 Art. 21(2)(d)", "DORA Art. 30(3)(e)", "ISO/IEC 27001 A.8.15", "SOC 2 CC7.3", "NIST AI RMF MANAGE 2.4"). Open the framework reference only if you need to confirm a citation.
7. **Consolidate.** Group remediation by shared control using `references/overlap-matrix.md` (rows O1–O26, bundles in §2) so one fix is listed once with all frameworks it serves. Always include the "gaps that never transfer" check (§3) when a client relies on an ISO certificate or SOC 2 report.
8. **Deadlines & exposure** (only if relevant): reporting clocks and dates from `references/timeline.md`; penalty ranges from `references/penalties-enforcement.md`.
9. **Render.** Audit mode → `references/report-template.md`. Explainer mode → `references/explainer-template.md`. Always end with the disclaimer.

## Rules

- **Citations or it didn't happen.** No obligation claim without article/clause/control number and framework name. Dates you cannot source: `VERIFY:`; inferred facts: `ASSUMED:`. Never invent a date or a fine amount.
- **Binding vs voluntary.** GDPR, NIS2, DORA are law (NIS2 via national transposition — say so). ISO/IEC 27001, ISO/IEC 42001, SOC 2, NIST AI RMF, OWASP are voluntary unless contractually required. Never say "required by ISO" without "if certified/contractually committed".
- **Copyright.** ISO/IEC and AICPA texts are copyrighted: paraphrase, cite numbers, never reproduce clause or criteria wording. EU law may be quoted.
- **No AI-Act logic.** Never restate AI-Act tiers, roles, articles or deadlines; hand off.
- **No client data retention.** Don't write client artifacts or findings into this skill's files.
- **Severity:** Critical (likely breach / reportable exposure now) · High (fails audit/customer review) · Medium (weak/partial evidence) · Low (hygiene).

## Reference map

| File | Read when |
|---|---|
| `references/applicability-classifier.md` | Always (step 2–4) |
| `references/checklists/{codebase,design-doc,product-idea,vendor-assessment}.md` | Exactly one, per artifact type |
| `references/report-template.md` | Audit output |
| `references/explainer-template.md` | Explainer output |
| `references/eu-ai-act-handoff.md` | AI present (step 4) |
| `references/overlap-matrix.md` | Step 7; any "does X also cover Y?" question |
| `references/timeline.md` | Deadlines / incident clocks asked or in scope |
| `references/penalties-enforcement.md` | Exposure / fines asked |
| `references/frameworks/gdpr.md` · `nis2.md` · `dora.md` · `iso-27001.md` · `iso-42001.md` · `soc2.md` · `nist-ai-rmf.md` · `owasp-llm-top10.md` | Only for frameworks that APPLY and only to confirm a citation, scope rule or explainer wording |

## Disclaimer (append to every output)

> Informational analysis for readiness and education. Not legal advice and not an audit
> opinion or certification. Verify against the official texts (EUR-Lex, ISO, AICPA, NIST,
> OWASP) and, for binding obligations, with qualified counsel in the relevant jurisdiction.
