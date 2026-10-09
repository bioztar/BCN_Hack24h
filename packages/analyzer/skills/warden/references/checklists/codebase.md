# Checklist — codebase review

**Use for:** a repository, service or diff. Verify each item against **actual code, config,
infra-as-code or CI files** — cite `path:line`. No evidence → mark **unverified**, never "pass".
Run `../applicability-classifier.md` first; skip rows whose framework is NOT TRIGGERED.

Severity: **Critical** = likely regulatory breach / reportable exposure now · **High** = will
fail an audit or customer review · **Medium** = weak evidence / partial · **Low** = hygiene.

## 1. Discovery (record before judging)

- [ ] Data stores and schemas holding personal data (models, migrations, ORM files) — list fields with special categories (health, biometrics…) → GDPR Arts. 4(1), 9
- [ ] External services/SDKs receiving data (HTTP clients, analytics, LLM APIs, email/SMS, error trackers) → vendor list for `vendor-assessment.md`
- [ ] Hosting regions (IaC: Terraform/CDK/Helm) → GDPR Arts. 44–49, DORA Art. 30(2)(b)
- [ ] AI/LLM features (model calls, prompts, embeddings, agents/tools) → NIST/42001/OWASP rows + EU AI Act flag

## 2. Findings checklist

| # | Check | Evidence to look for | Sev. if missing | Citations |
|---|---|---|---|---|
| C1 | Secrets not in repo | No keys/tokens in code, `.env` gitignored, secret manager used | Critical | GDPR Art. 32; NIS2 21(2)(h),(i); 27001 A.8.24, A.5.17; SOC 2 CC6.1 |
| C2 | Encryption in transit & at rest | TLS enforced, DB/storage encryption flags in IaC | High | GDPR Art. 32(1)(a); NIS2 21(2)(h); DORA 9; 27001 A.8.24; SOC 2 CC6.1, CC6.7 |
| C3 | AuthN with MFA for admin/privileged paths; least-privilege authz | Auth middleware, RBAC/ABAC checks, IAM policies without `*` | High | NIS2 21(2)(i)–(j); DORA 9(4); 27001 A.5.15, A.8.2–8.5; SOC 2 CC6.1–6.3 |
| C4 | Tenant isolation | Tenant IDs enforced in queries/row-level security; RAG retrieval scoped | Critical (multi-tenant) | GDPR Art. 32; 27001 A.8.3; SOC 2 CC6.1; OWASP LLM08 |
| C5 | Security/audit logging | Auth events, admin actions, data exports logged; logs immutable/centralised; no secrets/excess PII in logs | High | NIS2 21(2)(b); DORA 10; 27001 A.8.15–8.16; SOC 2 CC7.2; GDPR 5(1)(c) |
| C6 | Retention & deletion implemented | TTL jobs, deletion endpoints, backup expiry | High | GDPR 5(1)(e), 17; 27001 A.8.10; SOC 2 C1.2, P4 |
| C7 | Data-subject rights tooling | Export (machine-readable), rectify, delete, objection flags | High (controller) | GDPR Arts. 15–21 |
| C8 | Consent / preference storage | Consent records with version+timestamp, withdrawal path | High (if consent basis) | GDPR Art. 7 |
| C9 | Minimisation & pseudonymisation | Analytics/telemetry strip identifiers; non-prod uses masked data | Medium | GDPR 5(1)(c), 25, 32(1)(a); 27001 A.8.11, A.8.33 |
| C10 | Dependency & vulnerability management | Lockfiles, SCA (Dependabot/Renovate/etc.) in CI, SAST, container scanning | High | NIS2 21(2)(e); DORA 9; 27001 A.8.8, A.8.28; SOC 2 CC7.1 |
| C11 | Change management | Branch protection, required reviews, CI tests gate deploy, deploy logs | High | DORA 9(4)(e); 27001 A.8.32; SOC 2 CC8.1 |
| C12 | Environment separation | Separate prod/non-prod accounts, no prod data in dev | Medium | 27001 A.8.31; SOC 2 CC8.1 |
| C13 | Backups & restore | Backup config in IaC, documented restore test | High | NIS2 21(2)(c); DORA 12; 27001 A.8.13; SOC 2 A1.2 |
| C14 | Monitoring & alerting | Alert rules, on-call routing, anomaly detection | Medium | DORA 10; NIS2 21(2)(b); SOC 2 CC7.2 |
| C15 | Incident runbook in repo/wiki linked from code | IR doc with legal clocks (GDPR 72 h; NIS2 24/72 h; DORA 4/24/72 h) | High (if in scope) | GDPR 33; NIS2 23; DORA 19; SOC 2 CC7.4 |
| C16 | LLM: prompt-injection and output handling | Untrusted-content separation, tool allow-lists, output encoding, no `eval` of model output | High | OWASP LLM01, LLM05; NIST MEASURE 2.7 |
| C17 | LLM: no secrets/PII in prompts or system prompt | Prompt templates, redaction before API calls | High | OWASP LLM02, LLM07; GDPR 5(1)(c), 32 |
| C18 | LLM: agency limits | Scoped tool credentials, confirmation for destructive/financial actions, rate/cost limits | High | OWASP LLM06, LLM10; NIST MANAGE 2.4 |
| C19 | AI: human override / kill switch | Feature flag or config to disable model path; human-review queue for consequential decisions | High (decisions about people) | GDPR 22(3); NIST MAP 3.5, MANAGE 2.4; 42001 A.9 |
| C20 | AI: eval suite in CI | Accuracy/safety/bias/regression evals gating model or prompt changes | Medium | NIST MEASURE 2.3–2.11; 42001 A.6 |
| C21 | AI: input/output logging for monitoring | Privacy-aware logging of prompts/outputs/tool calls with retention | Medium | NIST MEASURE 3.1; 42001 A.6; GDPR 5(1)(e) |
| C22 | Vendor data flows match DPAs | Every external data recipient in C-discovery has a DPA/sub-processor entry | High | GDPR 28; DORA 28(3); SOC 2 CC9.2 |

## 3. EU AI Act flag

If discovery found AI features: list the trigger facts (what the AI does, who it affects)
and hand off to `eu-ai-act-compliance` (its codebase checklist). Do not grade AI-Act items here.

## 4. Verdict aggregation

- Any Critical → **Not ready**. High only → **Ready with remediation**. Medium/Low only → **Substantially ready**.
- Report framework-by-framework (applicable only) + overlap bundle from `../overlap-matrix.md` §2 to group fixes.
