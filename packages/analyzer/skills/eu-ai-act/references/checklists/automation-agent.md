# Gap Checklist — Automation Agent (LLM-run)

Prompt fragment for an LLM agent to execute any of the four gap checklists deterministically. Paste the target artifact (codebase tree, design doc, product idea) and run this preamble + the chosen checklist.

## Agent instructions

1. **Load context**: read `../risk-tier-classifier.md` for tier logic; treat it as authoritative interpretation grounded in cited articles. If conflict with checklist text, articles win.
2. **Evidence discipline**: every PASS/FAIL must cite a concrete artifact — file path + line, section number, or verbatim quote. No artifact → verdict is UNKNOWN, never guessed.
3. **Citation discipline**: when you assert a compliance consequence in your output, cite `(Art. N)` matching the checklist item. Do not invent article numbers; if unsure, quote the checklist item instead.
4. **Authority discipline**: corpus articles are binding law; recitals and Commission guidelines are persuasive — label which one your judgment rests on. Where guidelines diverge from Act text, Act wins and note the divergence.
5. **Output format** per item:

```text
[ID] VERDICT — evidence
     obligation: <one-line restatement> (Art. N)
     action: <next step if FAIL/UNKNOWN>
```

6. **Verdict aggregation**:

| Checklist | Blocking condition |
|---|---|
| codebase.md | any C-item FAIL → do-not-ship |
| design-doc.md | any C-item MISSING → not EU-market-ready |
| product-idea.md | G2 YES → redesign required |

7. **Severity ordering**: report findings in checklist order (severity-ranked); never reorder.
8. **Uncertainty handling**: if scope facts are missing (intended purpose, deployment jurisdiction, user roles), ask exactly one clarifying question listing all missing facts, then proceed with stated assumptions marked `ASSUMED:`.
9. **Scope guard**: this checklist assesses AI Act compliance only. Flag GDPR/product-safety/cybersecurity interactions (Arts. 2(7), 26(9), 15(5)) as pointers, not findings.

## Tier-determination subroutine

If the artifact lacks explicit classification, derive it before running items:

1. Scan for Art. 5 practices → prohibited / not.
2. Detect Annex I product coupling (medical device, machinery, vehicle, aviation, etc.) → Art. 6(1) path.
3. Match use cases against Annex III areas 1–8 → Art. 6(2) path; test 6(3) derogation conditions incl. profiling detection (look for personal-data-driven scoring/segmentation of individuals).
4. Detect GPAI-model layering (foundation model integration vs model distribution).
5. Detect Art. 50 triggers (chat interface, generative content, emotion/biometric features).

Report derived tier + confidence + which artifact evidence drove each branch. Then execute the requested checklist against that tier's duty stack (`../obligations-by-role.md`, sections 1–8).

## Cross-artifact consistency mode

When auditing multiple artifacts for the same product (e.g. design-doc + codebase): run both, diff the verdicts, and report contradictions (e.g. doc claims no profiling; code shows behavioural scoring) as CRITICAL findings — misclassification to circumvent Chapter III carries fines under Art. 99 via Art. 80(7).
