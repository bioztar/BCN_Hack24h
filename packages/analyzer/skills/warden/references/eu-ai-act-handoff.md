# EU AI Act hand-off

warden **never** classifies under the EU AI Act. It only decides whether to hand off to the
sibling skill **`eu-ai-act-compliance`** (repo <https://github.com/bioztar/EU-AI-Act>,
entry `skill/SKILL.md`).

## When to flag

Flag "LIKELY RELEVANT" if the artifact involves an AI system or general-purpose AI model
**and** any EU nexus (placed on the EU market, put into service in the EU, used by an EU
deployer, or output used in the EU). Record the trigger facts you observed — e.g. "model
scores job applicants", "chatbot talks to consumers", "generates images", "fine-tunes an
open-weights model", "used by an EU bank for credit decisions" — without characterising them
in AI-Act terms.

## Hand-off block (paste into report §8 / explainer footer)

```markdown
**EU AI Act — LIKELY RELEVANT.** Trigger facts: <bullets>.
Run the `eu-ai-act-compliance` skill on the same artifact for risk-tier, role and obligations
(<https://github.com/bioztar/EU-AI-Act>). warden findings that the AI-Act analysis may reuse
as evidence: <overlap-matrix rows, e.g. O3, O7, O19–O23>.
```

## If the sibling skill is installed

Invoke it after delivering the warden report and pass the same artifact plus the trigger
facts. Don't merge its output into warden's findings table; append its report as a separate
section or document.

## Never

- State an AI-Act risk tier, role, article, obligation, fine or date.
- Treat ISO/IEC 42001 or NIST AI RMF alignment as AI-Act conformity.
