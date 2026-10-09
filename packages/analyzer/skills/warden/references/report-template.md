# Report template — audit / readiness checklist (client-facing)

Canonical output for audit mode. Keep headings in this order; omit a section only if marked optional.
Every finding row must carry a citation. Fill only frameworks the classifier marked as applying.

```markdown
# Compliance readiness report — <artifact name>

**Date:** <YYYY-MM-DD> · **Artifact type:** <codebase | design doc | product idea | vendor>
**Checklist applied:** <file> · **Output mode:** audit · **Confidence:** <high | medium | low> — <why>

## 1. Executive summary
- Overall verdict: <Not ready | Ready with remediation | Substantially ready>
- Frameworks in scope: <list with status>
- Top 3 risks: <one line each, cited>
- EU AI Act: <not indicated | LIKELY RELEVANT — run `eu-ai-act-compliance`>

## 2. Applicability
| Framework | Status | Basis (cited) | Role / class |
|---|---|---|---|
| GDPR | APPLIES | Art. 3(1) — EU establishment | Controller + processor |
| … | | | |

Assumptions: <ASSUMED: …> · Open questions: <…>

## 3. Findings (severity-ranked)
| # | Sev. | Finding | Evidence | Frameworks & citations | Remediation | Overlap row |
|---|---|---|---|---|---|---|
| F1 | Critical | <what's wrong> | `path:line` / doc §x / "unverified" | GDPR Art. 33(1); NIS2 Art. 23(4) | <concrete fix> | O9 |

## 4. Consolidated remediation plan (build once, evidence many)
| Bundle / control | Fixes findings | Satisfies (evidence toward) | Owner | Target date |
|---|---|---|---|---|

## 5. Gaps that never transfer (only if client relies on ISO 27001 / SOC 2)
<checked items from overlap-matrix §3>

## 6. Deadlines & reporting clocks (optional)
| Clock / date | Framework | Citation |

## 7. Enforcement exposure (optional)
<binding-law ranges with citations; commercial consequences for standards>

## 8. EU AI Act hand-off
<handoff block from eu-ai-act-handoff.md, or "not indicated">

## 9. Sources
<numbered list of official sources actually cited: EUR-Lex CELEX links, ISO/AICPA/NIST/OWASP pages>

> Informational analysis for readiness and education. Not legal advice and not an audit
> opinion or certification. Verify against the official texts and, for binding obligations,
> with qualified counsel in the relevant jurisdiction.
```

## Style rules

- Findings are facts + evidence; recommendations are separate columns.
- Use the framework's own reference format: "Art. 21(2)(d)" (EU law), "clause 6.1.3" / "A.8.15" (ISO), "CC7.3" (SOC 2), "MEASURE 2.7" (NIST), "LLM01:2025" (OWASP).
- "Unverified" is a valid status; "pass without evidence" is not.
