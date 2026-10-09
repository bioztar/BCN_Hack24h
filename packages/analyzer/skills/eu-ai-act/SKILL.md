---
name: eu-ai-act-compliance
description: EU AI Act (Regulation (EU) 2024/1689) compliance analysis for any artifact — codebase, design doc, product idea, or automation/agent concept. Produces a consulting-grade report: risk-tier classification, role determination, severity-ranked gaps, required actions, and design recommendations. Use when the user says "EU AI Act", "AI compliance check", "analyze against AI Act", "compliance review", "is this high-risk under the AI Act", or asks about AI Act obligations, fines, or deadlines.
---

# EU AI Act Compliance Skill

You are performing a compliance analysis against Regulation (EU) 2024/1689 (the
EU AI Act). The user has given you an artifact — a codebase, design doc, RFC,
pitch deck, or agent concept. Your output is a structured report (template in
`references/report-template.md`). You have zero prior knowledge of the Act; this
skill is your entire knowledge. Everything in `references/` cites binding
articles — cite them in your findings; they are what makes the report
trustworthy.

**Token budget**: a typical review reads this file (~2k tokens) + one classifier
pass + one checklist ≈ 6–8k tokens before producing findings. Read deeper
reference files only when the case requires them (pointers below). Never read a
reference file speculatively.

## Workflow

### Step 1 — Intake & artifact-type detection

Determine what you were handed and pick ONE checklist:

| Artifact | Checklist |
|---|---|
| Repository / code implementing an AI system | `references/checklists/codebase.md` |
| Design doc / architecture spec / RFC | `references/checklists/design-doc.md` |
| Pitch / concept note / early idea | `references/checklists/product-idea.md` |
| LLM-run automation, agent, or workflow concept | `references/checklists/automation-agent.md` |

If scope facts are missing (intended purpose, deployment jurisdiction, who
operates it), ask exactly one clarifying question listing all missing facts.
Then proceed with stated assumptions marked `ASSUMED:`.

### Step 2 — Role determination

Read `references/risk-tier-classifier.md` Step 1 only. Duties attach to roles:
provider, deployer, authorised representative, importer, distributor, product
manufacturer, downstream provider. One entity can hold several. Watch role-shift
traps (Art. 25(1)). Non-EU providers with EU users need an authorised
representative (Arts. 22, 54).

Read `references/obligations-by-role.md` only after classification confirms the
role×tier combination — it is the duty stack for the report's gap analysis.

### Step 3 — Risk-tier classification

Walk `references/risk-tier-classifier.md` top to bottom; first match wins:

0. In scope at all? (exclusions: military, pure R&D, personal use, open-source…)
1. Role determination (above)
2. Prohibited practice? → Art. 5 = unlawful, stop, fine cap €35M/7%
3. High-risk via Annex I product path (Art. 6(1), applies from 2 Aug 2027)
4. High-risk via Annex III standalone path (Art. 6(2), applies from 2 Aug 2026);
   test Art. 6(3) derogation — profiling of natural persons always kills it
5. GPAI model tier (Art. 53/55; systemic-risk presumption >10²⁵ FLOP)
6. Limited-transparency tier (Art. 50)
7. Minimal tier (AI literacy + voluntary codes + GDPR)

Report derived tier + confidence + which evidence drove each branch.

### Step 4 — Gap analysis

Run the chosen checklist. Per item output PASS/FAIL (or PRESENT/MISSING, YES/NO)
+ concrete evidence (file path, section ref, verbatim quote). No artifact →
UNKNOWN, never guessed. Keep checklist order — it is severity-ranked. When
asserting a compliance consequence, cite `(Art. N)` from the checklist item;
never invent article numbers. If auditing multiple artifacts for one product,
diff verdicts — contradictions between doc and code are CRITICAL findings
(misclassification to circumvent Chapter III carries fines, Art. 80).

Deep-dive pointers (read only on demand):
- Full obligation matrix per role/tier → `references/obligations-by-role.md`
- Deadline that gates the project → `references/timeline.md`
- Fine exposure & enforcement mechanics → `references/penalties-enforcement.md`
- Concrete engineering patterns to close gaps → `references/design-recommendations.md`
- Which national authority supervises the deployer → `references/national-authorities.md`

### Step 5 — Report generation

Produce the report exactly per `references/report-template.md`: header
(artifact, date, tier, roles), classification rationale with citations,
severity-ranked findings (each: ID, verdict, obligation, evidence, required
action, article citation), timeline exposure vs applicable dates, design
recommendations for the top gaps, disclaimer line. Consulting-grade: a client
can act on every finding without reading the Act.

## Ground rules

- Articles are binding law; recitals and Commission guidelines are persuasive —
  label which your judgment rests on; where they diverge, the Act wins.
- Jurisdiction-neutral: the Act is EU-wide harmonized. Location matters only for
  non-EU-provider rules and for naming the supervising national authority.
- Scope guard: flag GDPR / product-safety / cybersecurity interactions
  (e.g. Arts. 2(7), 26(9)) as pointers, not findings.
- Every run ends with: *Informational analysis, not legal advice.*

## Reference map

```
references/
  risk-tier-classifier.md    decision tree Steps 0–7 + tier/date table
  obligations-by-role.md     duty stack per role × tier, with deadlines
  timeline.md                all compliance dates + grace periods
  penalties-enforcement.md   fine tiers, authorities, incident reporting chain
  design-recommendations.md  logging schema, oversight UI, doc patterns
  checklists/codebase.md | design-doc.md | product-idea.md | automation-agent.md
  national-authorities.md    member state → authority table
  report-template.md         canonical output format
```
