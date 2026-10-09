# Report Template — Canonical Output Format

Every compliance run produces this report, in this order, with these headings.
Keep it self-contained: a client must be able to act on every finding without
reading the Act. Cite articles inline.

```markdown
# EU AI Act Compliance Review — <artifact name>

- **Date**: YYYY-MM-DD
- **Artifact type**: codebase | design doc | product idea | automation/agent concept
- **Checklist applied**: references/checklists/<file>
- **Risk tier**: prohibited | high-risk (Annex I) | high-risk (Annex III) |
  GPAI model (+ systemic risk?) | limited-transparency | minimal | out of scope
- **Roles held**: provider / deployer / importer / distributor /
  authorised representative / product manufacturer / downstream provider
- **Confidence**: HIGH | MEDIUM | LOW — one line on what would raise it

## 1. Classification rationale
Walk the decision tree: scope (Art. 2), role map (Art. 3 + Art. 25 traps),
prohibited-practice scan (Art. 5), Annex I vs Annex III path (Art. 6),
6(3) derogation test incl. profiling override, GPAI layering (Arts. 51–52),
Art. 50 triggers. Each branch: verdict + evidence + citation.

## 2. Findings (severity-ranked)
Per checklist item, in checklist order:

### [C1] <short title> — FAIL
- **Obligation**: one-line restatement (Art. N)
- **Evidence**: file path / section ref / verbatim quote; UNKNOWN if absent
- **Required action**: concrete next step
- **Exposure**: fine band or market-entry consequence (Art. 99)

(Repeat for H-, M-, L-items. Verdicts: PASS / FAIL / UNKNOWN for codebases;
PRESENT / MISSING / AMBIGUOUS for design docs; YES / NO / UNCLEAR for ideas.)

## 3. Timeline exposure
Applicable-from date(s) for this tier vs today: what must be ready by when,
grace periods available (legacy systems, GPAI pre-Aug-2025 models), and any
in-article deadlines that bite earlier (incident windows, registration).

## 4. Design recommendations
For each FAIL/UNKNOWN critical or high finding, the engineering pattern that
closes it (from design-recommendations.md): logging schema, oversight UI,
dataset fact sheets, QMS-as-process, etc. Order by severity.

## 5. Enforcement context
Who supervises this system (MSA / DPA / AI Office / sectoral regulator — see
national-authorities.md), fine bands applicable to the findings above, and
serious-incident reporting duties if deployed as proposed.

## 6. Assumptions & open questions
Every `ASSUMED:` made, and the single clarifying question if scope facts
remain missing.

---
*Informational analysis, not legal advice.*
```

## Aggregation rules

| Checklist | Blocking condition (headline of report) |
|---|---|
| codebase.md | any C-item FAIL → **DO NOT SHIP into EU market** |
| design-doc.md | any C-item MISSING → **not EU-market-ready** |
| product-idea.md | G2 YES → **redesign required** |
| automation-agent.md | per underlying checklist |

Cross-artifact mode: when multiple artifacts cover the same product, run each,
diff verdicts, and report contradictions (e.g. doc claims no profiling, code
shows behavioural scoring) as CRITICAL findings — misclassification to
circumvent Chapter III is fined under Art. 99 via Art. 80.
