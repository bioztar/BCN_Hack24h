# Design Recommendations for AI Engineering Teams

Tangible architecture/process patterns that make an AI system provably compliant. Each recommendation states the articles that make it necessary. Target reader: engineering lead designing a system that will face conformity assessment.

---

## 1. Data governance (Art. 10)

**R1.1 — Dataset fact sheets as build artifacts.** For every training/validation/test set, record: origin and collection process, original collection purpose for personal data, preparation operations (annotation, labelling, cleaning, enrichment, aggregation), assumptions about what the data represents, availability/quantity/suitability assessment, bias examination results, identified gaps and remediation. Make these versioned files in the repo, not wiki prose — Art. 11/Annex IV requires them in technical documentation, and Art. 10(2)(a)–(h) defines the minimum fields.

**R1.2 — Statistical representativeness review per deployment context.** Document statistical properties relative to the persons/groups the system serves, and geographic/contextual/behavioural/functional setting of intended use (Arts. 10(3)–(4)). Training on data matching the target setting earns a presumption of compliance with 10(4) (Art. 42(1)) — design data acquisition around this.

**R1.3 — Bias pipeline with special-category data controls.** If bias detection needs special-category personal data (GDPR Art. 9 categories), you may process them only under all of: no-synthetic/anonymised-alternative proof, pseudonymisation + re-use limits, strict access control with documentation, no third-party transfer, deletion after correction or retention end, and recorded justification in GDPR Art. 30 records (Art. 10(5)(a)–(f)). Build this as a gated workflow, not a policy paragraph.

**R1.4 — Feedback-loop breakers.** Systems that keep learning post-market must prevent biased outputs contaminating future inputs (Art. 15(4) third subpara). Concretely: freeze online-learning paths or route updates through human-approved retraining; log output→input provenance so contamination is detectable.

## 2. Model & system documentation (Arts. 11, 13)

**R2.1 — Treat Annex IV as your doc template from day one.** Technical documentation must exist before market placement and stay updated (Art. 11(1)); Annex IV enumerates sections (general description, elements/instructions per Art. 13, detailed methodology incl. human-oversight measures, development/monitoring/testing info incl. metrics and validation, deployment monitoring plan). Generate the skeleton at project start; fill incrementally. SMEs may use the Commission's simplified form (11(1)).

**R2.2 — Instructions-for-use generator.** Art. 13(3)(a)–(f) fixes a minimum information set: identity/contact, capabilities and limitations, declared accuracy metrics + robustness/cybersecurity levels tested, risk-relevant foreseeable circumstances, explainability features, per-group performance where relevant, input-data specifications, pre-determined changes, oversight measures, hardware/computational resources, expected lifetime/maintenance cadence, log-collection mechanisms. Emit this document from the same source of truth as release metadata to avoid drift.

**R2.3 — Pre-determined change control.** Declare planned changes and performance evolution at initial conformity assessment; changes within that envelope are *not* substantial modifications and don't trigger re-assessment (Art. 43(4) second subpara, Annex IV point 2(f)). Design a release taxonomy: "in-envelope" vs "substantial modification" (Art. 3(23)) with an explicit sign-off gate for the latter.

## 3. Logging & traceability (Arts. 12, 19, 26(6))

**R3.1 — Automatic event logging over lifetime.** The system must technically allow automatic recording of events (12(1)) serving three consumers: risk/substantial-modification identification (12(2)(a)), post-market monitoring (12(2)(b), Art. 72), deployer operation monitoring (12(2)(c)).

Concrete minimal schema:

```text
ai_event {
  event_id        uuid
  system_id       string    // instance/version identifier
  model_version   string    // ties to tech-doc revision
  event_type      enum      // inference | override | stop | anomaly | config_change
  ts_start        timestamp // period of use
  ts_end          timestamp
  input_ref       hash      // reference, not raw payload (data-minimisation)
  input_metadata  json      // source dataset/db refs, e.g. reference database checked
  output_ref      hash
  confidence      float     // declared metric context
  match_ref       hash      // biometric ID systems: matched entry ref (12(3)(c))
  verifier_ids    [string]  // humans verifying results (12(3)(d); Art. 14(4)-(5))
  outcome         enum      // accepted | overridden | discarded
}
```

Annex III point 1(a) systems (remote biometric identification) additionally require: use-period recording, reference-database identity, match input data, verifier identities (12(3)(a)–(d)). Retention ≥6 months by provider and deployer where under their control (19(1), 26(6)); personal-data handling under GDPR.

**R3.2 — Log immutability + authority access path.** Logs feed conformity demonstrations on reasoned request (21(2)) and incident investigations (73). Append-only storage, tamper-evident hashing, export tooling that produces authority-readable formats without exposing unrelated personal data.

## 4. Human oversight (Art. 14) + deployer duties (Art. 26)

**R4.1 — Oversight UI requirements are explicit.** Enable the overseer to: understand capacities/limitations and monitor operation (14(4)(a)); be guarded against automation bias — surface confidence, uncertainty, counter-evidence (14(4)(b)); correctly interpret outputs incl. interpretation tools (14(4)(c)); **disregard/override/reverse any output** (14(4)(d)); **interrupt via stop button / safe-state halt** (14(4)(e)). Build these as first-class API/UI affordances, testable in conformity assessment. Split measures into built-in vs deployer-implemented and document both (14(3)(a)/(b)).

**R4.2 — Four-eyes rule for biometric identification.** Annex III 1(a) systems: no action based on identification unless verified by ≥2 competent natural persons; law-enforcement/migration/border/asylum exemption only where Union/national law deems it disproportionate (14(5)). Workflow engines should enforce two independent confirmations before downstream actions fire.

**R4.3 — Ship deployer enablement artifacts.** Deployers must assign trained, competent, authorised staff (26(2)), monitor operation (26(5)), inform workers before workplace deployment (26(7)), inform affected persons subject to decisions (26(11)). Provide: training curricula templates, monitoring dashboards fed by R3.1 logs, worker-notification letter templates, end-user notification strings. These reduce your deployers' failure modes — which are also your incident-reporting exposure (73).

## 5. Accuracy, robustness, cybersecurity testing regime (Art. 15)

**R5.1 — Declare accuracy metrics and stick to them.** Accuracy levels + relevant metrics must be declared in instructions for use (15(3)); consistency required across lifecycle (15(1)). Maintain benchmark suites against prior-defined metrics and probabilistic thresholds appropriate to intended purpose (9(8)); run at every release candidate, archive results into tech docs.

**R5.2 — Robustness engineering.** Resilience against errors/faults/environment inconsistencies (15(4)): redundancy solutions, backup/fail-safe plans named explicitly in the article — implement failover, graceful degradation, input-validation envelopes.

**R5.3 — AI-specific threat model.** Cybersecurity must address: data poisoning, model poisoning (pre-trained components), adversarial examples/model evasion, confidentiality attacks, model flaws (15(5)). Add these to your standard STRIDE-style threat model; certification under an EU cybersecurity scheme (Reg. 2019/881) referenced in OJ grants presumption of compliance with 15 (Art. 42(2)).

## 6. Transparency-by-design (Arts. 50, 13)

**R6.1 — Machine-readable content marking.** Synthetic audio/image/video/text outputs must be marked in machine-readable, detectable format — effective, interoperable, robust per state of art and technical standards (50(2)). Implement watermarking/metadata standards (e.g. C2PA-style provenance) in the generation pipeline; assistive-editing functions need not mark.

**R6.2 — Interaction disclosure hooks.** Direct-interaction systems need user-facing AI disclosure unless obviously AI (50(1)); deepfake/text-public-interest disclosures are deployer duties (50(4)) but provider UX should make them one flag away. Disclosure must be clear, distinguishable, at latest at first interaction/exposure, accessible (50(5)).

## 7. Conformity-assessment readiness (Arts. 16, 43–49)

**R7.1 — Know your module early.** Annex III points 2–8 → internal control (Annex VI), no notified body (43(2)). Point 1 biometrics → choice of Annex VI/VII when harmonised standards applied; forced Annex VII (notified body) without them (43(1)). Law-enforcement/migration/asylum/Union-institution deployments → MSA acts as notified body (43(1) third subpara). Annex I products → sectoral procedure (43(3)). This determines whether your timeline includes notified-body scheduling — book capacity months ahead.

**R7.2 — QMS as engineering process, not binder.** Art. 17(1)(a)–(m) maps onto normal SDLC: strategy/regulatory compliance = roadmap reviews; design control = RFC process; verification/validation = CI gates; data management = R1 practices; incident handling = on-call/severity process; corrective action = bug-fix SLAs; documentation control = R2; accountability framework = org chart with named responsibilities. Financial institutions can substitute internal-governance rules except 17(1)(g)–(i) (17(4)).

**R7.3 — Registration data pipeline.** Annex VIII Section A/B/C data feeds the EU database (49(1)–(3)); non-high-risk-under-6(3) claims also register (6(4), 49(2)). Generate registration payloads from the same release metadata store.

**R7.4 — Post-market monitoring loop closed with logs.** PMM plan is part of technical documentation (72(3)); it consumes 12(2) logs and deployer reports (26(5)), and its outputs trigger corrective actions (20). Define thresholds now: what metric movement triggers investigation, what triggers Art. 79(1)-risk reporting.

**R7.5 — Value-chain contracts.** Written agreements with suppliers of tools/services/components specifying information, capabilities, technical access needed for your compliance (25(4)) — e.g. GPAI vendors' Annex XII packages (53(1)(b)). Procurement checklists should make absence of these documents a blocker.

## 8. GPAI-specific engineering (Arts. 51–56)

- Compute accounting: track cumulative training FLOPs against the >10²⁵ systemic-risk presumption; notification due within two weeks once met/known-to-be-met (52(1)).
- Evaluation infrastructure: standardised protocols + documented adversarial testing (55(1)(a)) — red-team suites with reproducible reports.
- Incident pipeline to AI Office: serious-incident tracking/documentation/reporting without undue delay (55(1)(c)).
- Copyright compliance stack: TDM opt-out detection/respect with state-of-the-art technology (53(1)(c)); training-content summary generated per AI Office template (53(1)(d)).
- Open-source strategy decision is legal+technical: releasing weights/architecture/usage info publicly buys exemptions from Annex XI/XII duties and authorised rep (53(2), 54(6)) — unless systemic risk.
