# Risk-Tier Classifier

Decision tree for classifying an AI system under Regulation (EU) 2024/1689. Walk it top to bottom; the first match wins. Every terminal node cites the governing article. **Articles are binding law; recitals are persuasive interpretation only.**

---

## Step 0 — Is this even in scope?

The Regulation applies to (Art. 2(1)): providers placing on the market/putting into service AI systems or placing GPAI models on the Union market regardless of where they are established (a); deployers established or located in the Union (b); providers/deployers in third countries where the **output is used in the Union** (c); importers and distributors (d); product manufacturers integrating AI under their own name (e); authorised representatives of non-EU providers (f).

Out of scope — stop here if any applies:

| Exclusion | Citation |
|---|---|
| Military, defence, national security purposes (incl. outputs used exclusively for these) | Art. 2(3) |
| Third-country public authorities / international organisations in law-enforcement cooperation with adequate safeguards | Art. 2(4) |
| AI systems/models solely for scientific research and development | Art. 2(6) |
| Pre-market research, testing, development (but **not** real-world testing) | Art. 2(8) |
| Natural persons using AI in purely personal non-professional activity | Art. 2(10) |
| Free and open-source AI systems — *unless* prohibited practice, high-risk, or Art. 50 transparency system | Art. 2(12) |

GPAI models used for research/development/prototyping before placement on the market are excluded from the model definition itself (Art. 3(63)).

Also confirm the artifact is an "AI system" per Art. 3(1): machine-based, varying autonomy, may exhibit adaptiveness post-deployment, infers from input how to generate predictions/content/recommendations/decisions influencing environments. Commission guidance exists on this definition (Art. 96(1)(f)); guidelines are persuasive.

## Step 1 — Determine the role of your client

Duties attach to roles, not to systems. One entity can hold several roles simultaneously.

| Role | Definition | Key articles |
|---|---|---|
| Provider | Develops (or has developed) an AI system/GPAI model and places it on the market or puts it into service **under its own name**, paid or free | Art. 3(3) |
| Deployer | Uses an AI system under its authority, except personal non-professional use | Art. 3(4) |
| Authorised representative | EU-established person with written mandate to perform provider's obligations | Art. 3(5), Arts. 22, 54 |
| Importer | EU-established party placing on the market a system bearing a third-country provider's name/trademark | Art. 3(6), Art. 23 |
| Distributor | Supply-chain party other than provider/importer making available on the Union market | Art. 3(7), Art. 24 |
| Product manufacturer | Places on the market or puts into service a product with an integrated AI system under its own name — deemed **provider** of the high-risk safety component | Art. 25(3), Art. 3(8) operator |
| Downstream provider | Provider of an AI system that integrates an AI model (own or third-party) | Art. 3(68), Art. 25(4) |

**Role-shift traps** (Art. 25(1)) — you become a full provider, with all Art. 16 obligations, if you:
- put your name/trademark on an existing high-risk system;
- make a substantial modification (Art. 3(23)) keeping it high-risk;
- modify the intended purpose of a non-high-risk system so it becomes high-risk.

Conversely, the original provider is released but must cooperate and hand over documentation — unless it explicitly forbade conversion to high-risk (Art. 25(2)). Written agreements with suppliers of tools/components are mandatory for high-risk integration (Art. 25(4)); open-source component vendors are exempt from that duty.

Financial institutions: internal-governance rules under Union financial services law substitute for parts of the QMS, logs, and monitoring duties (Arts. 17(4), 19(2), 26(5)-(6)).

## Step 2 — Prohibited? (Chapter II)

If the system's purpose matches Art. 5(1), it cannot be placed, served, or used in the Union at all. Fines up to €35M / 7% worldwide turnover (Art. 99(3)).

1. Subliminal/manipulative/deceptive techniques materially distorting behaviour causing significant harm — 5(1)(a)
2. Exploiting vulnerabilities due to age, disability, social/economic situation — 5(1)(b)
3. Social scoring: evaluation over time based on social behaviour/personal traits with detrimental treatment in unrelated contexts or disproportionate treatment — 5(1)(c)
4. Criminal-offence risk prediction based solely on profiling or personality traits (human assessment on objective verifiable facts is allowed) — 5(1)(d)
5. Untargeted scraping of facial images (internet/CCTV) to build facial-recognition databases — 5(1)(e)
6. Emotion inference in workplaces and educational institutions (medical/safety purposes exempt) — 5(1)(f)
7. Biometric categorisation inferring race, political opinions, trade-union membership, religious/philosophical beliefs, sex life, sexual orientation — 5(1)(g)
8. Real-time remote biometric identification in publicly accessible spaces **for law enforcement**, outside the three exhaustively listed objectives (victim search incl. missing persons; imminent life-safety/terror threat; Annex II offences punishable ≥4 years) — 5(1)(h)

Point 8 is not absolute: each use needs prior judicial/independent-authority authorisation (24h to regularise urgent starts), fundamental-rights impact assessment + registration before deployment, notification to market surveillance and DP authorities, annual reporting chain to Commission (Art. 5(2)–(7)). Member States may be stricter (Art. 5(5), last subpara).

Note asymmetry: points (d)–(h) prohibit only specific uses ("putting into service for this specific purpose" or "use") — the same technology sold for other purposes is lawful and will usually land in another tier below.

## Step 3 — High-risk via the product path (Annex I)?

High-risk under **Art. 6(1)** when BOTH:
- (a) intended as safety component of, or itself, a product covered by Annex I Union harmonisation legislation; AND
- (b) that product requires **third-party conformity assessment** under that legislation.

Annex I Section A (New Legislative Framework products): machinery (2006/42/EC), toys (2009/48/EC), recreational craft (2013/53/EU), lifts (2014/33/EU), ATEX equipment (2014/34/EU), radio equipment (2014/53/EU), pressure equipment (2014/68/EU), cableways (2016/424), PPE (2016/425), gas appliances (2016/426), medical devices (2017/745), IVDs (2017/746). Section B (other legislation, e.g. aviation, vehicles, rail, marine equipment): for Section B products only Arts. 6(1), 102–109, 112 apply (Art. 2(2)).

If yes → high-risk; requirements apply from **2 August 2027** (Art. 113(c)); conformity assessment follows the sectoral legislation, with Chapter III Section 2 requirements folded in (Art. 43(3)).

## Step 4 — High-risk via the standalone path (Annex III)?

Annex III areas (Art. 6(2)):
1. Biometrics (permitted uses): remote biometric identification (excl. pure verification); biometric categorisation by sensitive attributes; emotion recognition
2. Critical infrastructure: safety components in management/operation of critical digital infrastructure, road traffic, water/gas/heating/electricity supply
3. Education & vocational training: admission decisions; learning-outcome evaluation; level assessment; exam proctoring
4. Employment: recruitment/selection/targeted ads/application filtering/candidate evaluation; decisions affecting work relationships (promotion, termination, task allocation, monitoring)
5. Essential services: public-benefit eligibility (incl. healthcare benefits); **creditworthiness/credit scoring** (fraud detection exempt); life & health insurance risk pricing; emergency-call classification/dispatch/triage
6. Law enforcement (permitted uses): victim-risk assessment; polygraphs; evidence-reliability evaluation; re-offending risk; profiling in detection/investigation/prosecution
7. Migration/asylum/border: polygraphs; security/irregular-migration/health risk checks; asylum/visa application assistance; detection/recognition of persons (excl. travel-doc verification)
8. Justice & democratic processes: judicial fact/law research and interpretation aid; election/referendum outcome or voting-behaviour influence

**Art. 6(3) derogation**: an Annex III system is NOT high-risk if it does not pose significant harm risk including by not materially influencing decision outcomes — available only if it performs a narrow procedural task (a), improves a completed human activity (b), detects decision patterns/deviations without replacing human review (c), or performs a preparatory task (d). **Always overridden if the system profiles natural persons** (final subparagraph). The provider claiming the derogation must document the assessment pre-market and register the system in the EU database (Art. 6(4), Art. 49(2)); authorities can challenge misclassification (Art. 80). Draft Commission guidelines exist on this classification exercise (persuasive until finalised; Art. 6(5) required them by 2 Feb 2026).

If yes → high-risk; most obligations apply from 2 August 2026 (Art. 113 main paragraph); conformity assessment = internal control (Annex VI) for Annex III points 2–8, notified body possible/required for point 1 biometrics (Art. 43(1)–(2)).

## Step 5 — GPAI model tier

Is the artifact a model (not a system)? GPAI model = displays significant generality, competent across a wide range of distinct tasks, integrable into downstream systems (Art. 3(63)).

- Plain GPAI model → Art. 53 duties: Annex XI technical documentation, Annex XII downstream-provider information, copyright policy incl. TDM opt-out respect (Dir. 2019/790 Art. 4(3)), public training-content summary. Open-source exemption (parameters/weights/architecture/usage public) unless systemic-risk (Art. 53(2)).
- **Systemic-risk GPAI model** → Art. 55 additionally: standardised model evaluation incl. documented adversarial testing, systemic-risk assessment/mitigation, serious-incident tracking/reporting to AI Office, cybersecurity protection for model and physical infrastructure.
- Systemic-risk triggers: >10²⁵ FLOP cumulative training compute presumption (Art. 51(2)); provider must notify Commission within two weeks of meeting/knowing it will meet the threshold (Art. 52(1)); rebuttal possible with substantiated arguments (Art. 52(2)); Commission designation ex officio or on qualified scientific-panel alert per Annex XIII criteria (Art. 51(1)(b), 52(4)).
- Model + system same provider: AI Office supervises the whole stack (Art. 75(1)).
- GPAI model placed before 2 Aug 2025 → comply by 2 Aug 2027 (Art. 111(3)).

A GPAI **system** (system built on a GPAI model, Art. 3(66)) takes the ordinary system path (Steps 2–4); the model layer stays with the model provider.

## Step 6 — Limited-transparency tier (Art. 50)

Not prohibited, not high-risk, not GPAI — but one of:

1. Direct interaction with natural persons → provider must ensure people know they talk to an AI, unless obvious to a reasonable observer (50(1))
2. Synthetic audio/image/video/text generation → provider must mark output machine-readable/detectable as artificial (50(2))
3. Deploying emotion recognition or biometric categorisation → inform exposed persons (50(3))
4. Deepfake generation/manipulation → disclose artificial origin; artistic/satirical works get reduced disclosure (50(4) first subpara)
5. AI text published to inform the public on matters of public interest → disclose; human editorial review exempts (50(4) second subpara)

Law-enforcement-authorised uses are carved out of each (with safeguards). Timing: disclosure at latest at first interaction/exposure, clear, distinguishable, accessible (50(5)).

## Step 7 — Minimal tier

Everything else: no direct obligations beyond:
- AI literacy of staff (providers AND deployers) — Art. 4
- Voluntary codes of conduct encouraged (Art. 95)
- Market surveillance can still act on any AI system presenting risk (Art. 79(1))
- GDPR/data protection law continues to apply (Art. 2(7))

## Quick reference — tier × start date

**Status check (2026-08-29):** every "applies from" row through 2 Aug 2026 is already in force today; only the Annex I product-safety row (2 Aug 2027) is still future.

| Tier | Governing article(s) | Applies from |
|---|---|---|
| Prohibitions + AI literacy | Ch. I–II | 2 Feb 2025 (Art. 113(a)) |
| GPAI model obligations | Ch. V | 2 Aug 2025 (Art. 113(b)) |
| Governance, notifying bodies, penalties, confidentiality | Ch. VII, XII, Art. 78 | 2 Aug 2025 (Art. 113(b)) |
| High-risk (Annex III path) + transparency (Art. 50) | Ch. III–IV | 2 Aug 2026 (Art. 113) |
| High-risk (Annex I product path) | Art. 6(1) + corresponding obligations | 2 Aug 2027 (Art. 113(c)) |
| Commission fines on GPAI providers | Art. 101 | 2 Aug 2026 (carved out of 113(b)) |

## Legacy carve-outs

- Systems already on the market before 2 Aug 2026: only caught by **significant design changes** after that date; public-authority-use high-risk systems must comply by 2 Aug 2030 regardless (Art. 111(2)).
- Large-scale IT systems of Annex X legal acts placed before 2 Aug 2027: comply by 31 Dec 2030 (Art. 111(1)).
