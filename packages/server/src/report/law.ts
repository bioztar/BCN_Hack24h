/**
 * What the report says about each law: real penalty ceilings, real fixes, and the Directorate's
 * (fictional, satirical) tone. Penalty texts follow the regulations' own penalty articles.
 */
import type { Provision } from "@dg-roast/shared";

export interface Framework {
  key: string;
  /** Short label used in the TL;DR and on the badge, e.g. "GDPR". */
  short: string;
  /** Full instrument name. */
  name: string;
  /** Real penalty regime, one paragraph. */
  penalty: string;
  /** Generic, genuinely useful advice when no article-specific remedy is known. */
  remedy: string;
  binding: boolean;
}

const FRAMEWORKS: Framework[] = [
  {
    key: "ai-act",
    short: "AI Act",
    name: "Artificial Intelligence Act — Regulation (EU) 2024/1689",
    penalty:
      "Art. 99: prohibited practices (Art. 5) up to €35M or 7% of worldwide annual turnover; most other operator obligations (incl. Art. 16, 26 and 50) up to €15M or 3%; incorrect or misleading information to authorities up to €7.5M or 1% — whichever is higher (for SMEs and start-ups, whichever is lower).",
    remedy:
      "Classify the system first (prohibited / high-risk / transparency-only / minimal). Keep a written classification memo, an AI inventory, and evidence of AI literacy training (Art. 4). If anything is high-risk, budget for the Chapter III obligations before launch, not after.",
    binding: true,
  },
  {
    key: "gdpr",
    short: "GDPR",
    name: "General Data Protection Regulation — Regulation (EU) 2016/679",
    penalty:
      "Art. 83(5): up to €20M or 4% of worldwide annual turnover for breaches of the principles, lawful basis, consent, special categories, data-subject rights and transfers; Art. 83(4): up to €10M or 2% for controller/processor obligations (Arts. 25–39). Art. 84 lets Member States add criminal penalties (e.g. DE BDSG § 42: up to 3 years; FR Code pénal art. 226-16: up to 5 years).",
    remedy:
      "Map every personal-data flow (Art. 30 record), pick and document a lawful basis per purpose (Art. 6), publish an honest privacy notice (Arts. 13–14), sign Art. 28 agreements with every processor, and minimise: data you never collect cannot be breached.",
    binding: true,
  },
  {
    key: "nis2",
    short: "NIS2",
    name: "NIS2 Directive — Directive (EU) 2022/2555",
    penalty:
      "Art. 34: essential entities up to at least €10M or 2% of worldwide annual turnover, important entities up to at least €7M or 1.4%. Art. 32(5): management can be temporarily banned from managerial functions; Art. 20: management bodies approve the cyber-risk measures and can be held liable.",
    remedy:
      "Check whether you are in scope (Annexes I/II, size cap). If so: board-approved risk-management measures (Art. 21), an incident runbook that can produce a 24 h early warning, a 72 h notification and a one-month final report (Art. 23), and supply-chain security clauses.",
    binding: true,
  },
  {
    key: "dora",
    short: "DORA",
    name: "Digital Operational Resilience Act — Regulation (EU) 2022/2554",
    penalty:
      "Art. 50: Member States set administrative penalties for financial entities; Art. 35: critical ICT third-party providers face periodic penalty payments of up to 1% of average daily worldwide turnover, per day, for up to six months.",
    remedy:
      "If you sell to EU financial entities, expect DORA to flow down by contract: an ICT risk framework, incident classification and reporting, resilience testing, and a register of ICT third-party arrangements with exit strategies (Art. 28).",
    binding: true,
  },
  {
    key: "dsa",
    short: "DSA",
    name: "Digital Services Act — Regulation (EU) 2022/2065",
    penalty: "Art. 52: up to 6% of worldwide annual turnover; periodic penalty payments up to 5% of average daily turnover.",
    remedy: "Publish terms and a notice-and-action mechanism, give statements of reasons for moderation, and add transparency reporting once you host user content.",
    binding: true,
  },
  {
    key: "dma",
    short: "DMA",
    name: "Digital Markets Act — Regulation (EU) 2022/1925",
    penalty: "Art. 30: up to 10% of worldwide turnover, 20% for repeat infringements. (Applies only to designated gatekeepers. Congratulations on the ambition.)",
    remedy: "You are almost certainly not a gatekeeper. Keep it that way, or hire the building.",
    binding: true,
  },
  {
    key: "cra",
    short: "CRA",
    name: "Cyber Resilience Act — Regulation (EU) 2024/2847",
    penalty: "Art. 64: up to €15M or 2.5% of worldwide turnover for the essential cybersecurity requirements.",
    remedy: "Secure-by-default products, an SBOM, coordinated vulnerability disclosure and security updates for the support period.",
    binding: true,
  },
  {
    key: "iso27001",
    short: "ISO/IEC 27001",
    name: "ISO/IEC 27001:2022 — Information security management systems",
    penalty: "Voluntary standard: no statutory fine. The penalty is every enterprise procurement questionnaire you will now fail.",
    remedy: "Start an ISMS light: scope, risk assessment and treatment plan (cl. 6.1), Statement of Applicability, internal audit (cl. 9.2). Certification can wait; the controls cannot.",
    binding: false,
  },
  {
    key: "iso42001",
    short: "ISO/IEC 42001",
    name: "ISO/IEC 42001:2023 — AI management systems",
    penalty: "Voluntary standard: no statutory fine. Increasingly expected by buyers as evidence of AI Act readiness.",
    remedy: "Define an AI policy, an AI impact assessment and an AI system inventory; align them with your AI Act classification so one effort serves both.",
    binding: false,
  },
  {
    key: "soc2",
    short: "SOC 2",
    name: "AICPA SOC 2 — Trust Services Criteria",
    penalty: "Voluntary attestation: no fine. Without it, US enterprise sales cycles last roughly as long as an EU trilogue.",
    remedy: "Access control, change management and logging (CC6–CC8) are the bulk of it; collect evidence from day one.",
    binding: false,
  },
  {
    key: "nist-rmf",
    short: "NIST AI RMF",
    name: "NIST AI Risk Management Framework 1.0",
    penalty: "Voluntary US framework: no fine. Cited here because the Directorate likes to be thorough about other people's rules too.",
    remedy: "Use GOVERN / MAP / MEASURE / MANAGE as the checklist behind your AI Act risk management.",
    binding: false,
  },
  {
    key: "owasp",
    short: "OWASP LLM Top 10",
    name: "OWASP Top 10 for LLM Applications",
    penalty: "Community guidance: no fine. Attackers, however, do not need a legal basis.",
    remedy: "Treat model input and output as untrusted: prompt-injection defences, output encoding, least-privilege tools, and no secrets in prompts.",
    binding: false,
  },
];

const FALLBACK: Framework = {
  key: "other",
  short: "EU law",
  name: "Union law (miscellaneous)",
  penalty: "Penalties as laid down by the instrument and by Member States.",
  remedy: "Read the provision, write down how you comply, and keep the evidence.",
  binding: true,
};

export function frameworkOf(p: Pick<Provision, "id" | "label">): Framework {
  const id = p.id.toLowerCase();
  return FRAMEWORKS.find((f) => id === f.key || id.startsWith(`${f.key}-`)) ?? FRAMEWORKS.find((f) => p.label.startsWith(f.short)) ?? FALLBACK;
}

/** Article-specific, real remedies for the provisions the officers cite most. */
const REMEDIES: Record<string, string> = {
  "ai-act-4": "Train everyone who builds or operates the system (AI literacy) and keep the attendance list; it is the cheapest obligation in the Act.",
  "ai-act-5": "Remove the feature that falls under a prohibited practice (manipulative or exploitative techniques, social scoring, untargeted face scraping, emotion recognition at work or school, biometric categorisation by sensitive traits). There is no compliance path for Art. 5 — only a redesign.",
  "ai-act-6": "Write a classification memo against Art. 6 and Annex III. If high-risk, plan for risk management (Art. 9), data governance (Art. 10), technical documentation (Art. 11, Annex IV), logging (Art. 12), human oversight (Art. 14), conformity assessment (Art. 43) and EU database registration (Art. 49). If you rely on the Art. 6(3) exception, document why.",
  "ai-act-9": "Run and document a lifecycle risk-management process: identify foreseeable risks and misuse, test against them, and record residual risk.",
  "ai-act-10": "Document training, validation and test data: provenance, representativeness, bias examination and gaps.",
  "ai-act-11": "Prepare Annex IV technical documentation before market placement and keep it up to date. Yes, all of it.",
  "ai-act-12": "Log events automatically over the system's lifetime so incidents and drift can be traced.",
  "ai-act-13": "Ship instructions for use that tell deployers the system's purpose, accuracy, limits and oversight measures.",
  "ai-act-14": "Design for effective human oversight: a human who understands the output and can override or stop it.",
  "ai-act-26": "As a deployer, use the system per its instructions, assign competent human oversight, keep logs, and inform affected workers.",
  "ai-act-50": "Tell people when they are talking to an AI, mark synthetic audio/image/video/text in a machine-readable way, and label deepfakes. A banner and a C2PA manifest go a long way.",
  "ai-act-53": "General-purpose model providers: technical documentation, information for downstream providers, a copyright policy and a public summary of training content.",
  "ai-act-57": "Apply to a national AI regulatory sandbox; it is real, free, and slower than your runway.",
  "ai-act-99": "Know the ceilings before you meet them. SMEs get the lower of the fixed amount and the percentage — keep proof that you are one.",
  "ai-act-annex-iii": "Check every Annex III area (biometrics, critical infrastructure, education, employment, essential services, law enforcement, migration, justice). If you are in one, you are high-risk unless the Art. 6(3) exception genuinely applies.",
  "gdpr-5": "Apply the principles literally: purpose limitation, data minimisation, storage limitation. Delete what you do not need, on a schedule.",
  "gdpr-6": "Choose one lawful basis per purpose and write it down. Consent is not the default; contract or legitimate interest (with a documented balancing test) often fit better.",
  "gdpr-7": "If you rely on consent: freely given, specific, informed, unambiguous, as easy to withdraw as to give, and recorded. Pre-ticked boxes are not consent.",
  "gdpr-9": "Avoid special-category data (health, biometrics, beliefs, sexual orientation…). If you truly need it, rely on explicit consent or another Art. 9(2) condition, and run a DPIA first.",
  "gdpr-12": "Answer data-subject requests within one month, in plain language, free of charge.",
  "gdpr-13": "Publish a privacy notice at collection: who you are, purposes, lawful basis, recipients, transfers, retention, rights, and how to complain.",
  "gdpr-15": "Build a data-export path: people may ask for a copy of everything you hold on them.",
  "gdpr-17": "Build a real delete button that reaches backups and processors within a defined period.",
  "gdpr-22": "Do not let a model alone make decisions with legal or similarly significant effects; add meaningful human review and a way to contest.",
  "gdpr-25": "Privacy by design and by default: the most private setting is the default one.",
  "gdpr-28": "Sign a data-processing agreement with every vendor that touches personal data (cloud, LLM API, analytics).",
  "gdpr-30": "Keep a record of processing activities — a spreadsheet is fine, an empty spreadsheet is not.",
  "gdpr-32": "Encrypt in transit and at rest, enforce MFA, restrict access, test backups, and log access to personal data.",
  "gdpr-33": "Have a breach runbook: notify the supervisory authority within 72 hours of becoming aware, and document every breach.",
  "gdpr-34": "Tell affected people without undue delay when a breach is likely to result in a high risk to them.",
  "gdpr-35": "Run a DPIA before high-risk processing (profiling, large-scale sensitive data, systematic monitoring, new tech like AI).",
  "gdpr-37": "Appoint a DPO if your core activity is large-scale monitoring or special-category data.",
  "gdpr-44": "For transfers outside the EEA: rely on an adequacy decision (e.g. the EU-US Data Privacy Framework for certified recipients) or SCCs plus a transfer impact assessment.",
  "nis2-20": "Have the management body approve the cybersecurity measures and take the training. Personally.",
  "nis2-21": "Implement the Art. 21(2) baseline: risk analysis, incident handling, business continuity, supply-chain security, secure development, MFA, cryptography, staff training.",
  "nis2-23": "Report significant incidents: early warning within 24 hours, incident notification within 72 hours, final report within one month.",
  "dora-5": "The management body owns ICT risk: approve the framework and allocate the budget.",
  "dora-6": "Maintain a documented ICT risk-management framework, reviewed at least yearly.",
  "dora-17": "Define an ICT incident management process: detect, classify, log, escalate.",
  "dora-19": "Report major ICT-related incidents to the competent authority on the prescribed timelines.",
  "dora-28": "Keep a register of all ICT third-party arrangements, assess concentration risk, and write exit strategies — including for your co-founder.",
  "dora-30": "Put the mandatory clauses into ICT contracts: service levels, locations, access, audit, termination rights.",
};

export function remedyFor(p: Provision): string {
  return REMEDIES[p.id] ?? frameworkOf(p).remedy;
}

/** The Directorate's assessment: satirical register, never a factual claim about the applicant. */
export const ASSESSMENTS = [
  "The Directorate notes with concern that the applicant appears to have had an idea without prior authorisation.",
  "Having examined the file in its entirety, the Directorate has concluded that the file is too long to examine in its entirety.",
  "The applicant's submission was received in good order, filed in the appropriate cabinet, and then the cabinet was refused.",
  "The infringement is aggravated by the applicant's use of the word “disruptive”, for which a separate form exists. It is the same form as for fires.",
  "Mitigating factors were sought. The search remains open and is expected to conclude in the next Multiannual Financial Framework.",
  "The Directorate is not opposed to innovation in principle. In practice, it is opposed to this one.",
  "The applicant argued that the rule was unclear. The Directorate agrees and finds this to be the applicant's fault.",
  "During the assessment, three new models were released in Shenzhen. The Directorate has opened a consultation on the matter.",
  "The applicant is reminded that ignorance of the law is no excuse, and that knowledge of the law is no excuse either.",
  "The provision is clear, proportionate and has been in force since a date the Directorate is unable to locate.",
  "The officer in charge stamped the finding twice, once for the infringement and once for the inconvenience.",
  "A request for clarification was sent to the applicant by fax. No reply was received, which the Directorate treats as a confession.",
];

export const CLOSERS = [
  "Done at Brussels, in one original copy, which has been lost.",
  "Done at Brussels and Strasbourg, alternately, at considerable expense.",
  "Done at Luxembourg, where the file was sent by mistake and has remained ever since.",
];
