# Explainer template — plain language (content-facing)

For LinkedIn posts, newsletters, client briefings to non-specialists. **Same accuracy as
audit mode; different surface.** No article numbers in the body — they move to a short
"Sources" footer. Source the facts from the `## In plain language` and obligation tables
of the relevant `frameworks/*.md` file.

## Rules

1. **No jargon in the body.** Replace terms: "controller" → "the company that decides what happens to the data"; "processor" → "a vendor handling data for you"; "competent authority" → "the regulator"; "ICT third-party service provider" → "tech supplier"; "TLPT" → "an officially-scoped red-team exercise".
2. **Keep every number exact** (72 hours, 4% of global turnover, 24 hours) — and only use numbers that appear in a cited source.
3. **Hedge only where the law hedges** ("where feasible", "when there is high risk"). Don't add certainty the law doesn't have; don't dilute obligations it does have.
4. **Binding vs voluntary** must stay visible: "law" for GDPR/NIS2/DORA; "standard" / "framework" for ISO, SOC 2, NIST.
5. **No AI-Act explanations** — at most one line pointing to the EU AI Act explainer in the sibling repo.
6. Length: post ≤ 250 words; briefing ≤ 600 words.
7. Uncertain facts: leave them out of the body, or say "check the latest national rules".

## Shape

```markdown
<Hook: one sentence on the real-world consequence>

<What it is: 1–2 sentences>

<Who it applies to: 1–3 bullets>

<What you actually have to do: 3–5 bullets, verbs first>

<The one thing people get wrong: 1 sentence (from the "Common misconceptions" section)>

<Optional: "If you already have ISO 27001 / SOC 2, here's what's still missing" — from overlap-matrix §3>

---
Sources: <framework> <Art./clause list> — <official URL>; …
Not legal advice.
```

## Example (GDPR breach clock)

> If your app leaks customer data on Friday night, the regulator expects to hear from you by Monday night.
>
> Under the EU's GDPR, companies must report a personal-data breach to their data-protection
> regulator without undue delay and, where feasible, within 72 hours of finding out — unless
> the breach is unlikely to put anyone at risk. If it's high-risk for the people affected,
> you tell them too. Vendors handling data for you must tell you "without undue delay".
>
> What to build now: a breach runbook with the 72-hour clock starting at *discovery*; a log of
> every breach, even the ones you don't report; and contracts that make vendors tell you fast.
>
> ---
> Sources: GDPR Arts. 33(1), 33(2), 33(5), 34(1) — https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679 · Not legal advice.
