export type DgId = "cnect" | "just" | "fisma";

export interface Dg {
  id: DgId;
  name: string;
  remit: string;
  color: string;
}

/** Column order on the board, left → right. */
export const DGS: readonly Dg[] = [
  { id: "cnect", name: "DG CNECT", remit: "AI Act · NIS2", color: "#29b6f6" },
  { id: "just", name: "DG JUST", remit: "GDPR", color: "#ec407a" },
  { id: "fisma", name: "DG FISMA", remit: "DORA", color: "#5fd068" },
];

export type FormKind = "form" | "wild" | "omnibus";

export interface FormDef {
  id: string;
  /** Short code printed on the block. */
  code: string;
  title: string;
  dg: DgId | null;
  kind: FormKind;
  /** corpus/provisions.json id — every regulation fact we show is grounded there. */
  cite?: string;
  label?: string;
  url?: string;
  /** A phrase that must appear in the provision text (checked by test/data.test.ts). */
  quote?: string;
  fact: string;
}

const EURLEX_AI = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1689";
const EURLEX_GDPR = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679";
const EURLEX_NIS2 = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022L2555";
const EURLEX_DORA = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022R2554";

const f = (
  dg: DgId,
  id: string,
  code: string,
  title: string,
  cite: string,
  label: string,
  url: string,
  quote: string,
  fact: string,
): FormDef => ({ id, code, title, dg, kind: "form", cite, label, url, quote, fact });

export const FORMS: readonly FormDef[] = [
  // DG CNECT — AI Act
  f("cnect", "annex-iv", "ANNEX IV", "Technical documentation", "ai-act-annex-iv", "AI Act Annex IV", `${EURLEX_AI}#anx_IV`,
    "general description", "Technical documentation. It opens with a general description of the AI system."),
  f("cnect", "eu-doc", "EU DoC", "EU declaration of conformity", "ai-act-47", "AI Act Art. 47", `${EURLEX_AI}#art_47`,
    "10 years", "Keep it at the disposal of the national competent authorities for 10 years."),
  f("cnect", "ce", "CE", "CE marking", "ai-act-48", "AI Act Art. 48", `${EURLEX_AI}#art_48`,
    "digital CE marking", "Provided digitally? Then a digital CE marking. Still a form."),
  f("cnect", "reg-49", "ART. 49", "Registration", "ai-act-49", "AI Act Art. 49", `${EURLEX_AI}#art_49`,
    "Before placing on the market", "Register before placing a high-risk system on the market. Then wait."),
  f("cnect", "qms", "QMS", "Quality management system", "ai-act-17", "AI Act Art. 17", `${EURLEX_AI}#art_17`,
    "systematic and orderly manner", "Written policies, procedures and instructions, in a systematic and orderly manner."),
  f("cnect", "rms", "RMS", "Risk management system", "ai-act-9", "AI Act Art. 9", `${EURLEX_AI}#art_9`,
    "continuous iterative process", "A continuous iterative process. It does not end. Neither does this queue."),
  f("cnect", "fria", "FRIA", "Fundamental rights impact assessment", "ai-act-27", "AI Act Art. 27", `${EURLEX_AI}#art_27`,
    "Prior to deploying a high-risk AI system", "Certain deployers assess fundamental rights prior to deploying. In writing."),
  f("cnect", "pmm", "PMM", "Post-market monitoring plan", "ai-act-72", "AI Act Art. 72", `${EURLEX_AI}#art_72`,
    "post-market monitoring system", "Establish and document a post-market monitoring system. Monitor the monitoring."),
  f("cnect", "inc-73", "ART. 73", "Reporting of serious incidents", "ai-act-73", "AI Act Art. 73", `${EURLEX_AI}#art_73`,
    "serious incident", "Report any serious incident to the market surveillance authorities."),
  f("cnect", "gpai", "GPAI DOC", "Obligations for providers of general-purpose AI models", "ai-act-53", "AI Act Art. 53", `${EURLEX_AI}#art_53`,
    "Annex XI", "General-purpose model? Technical documentation with, at a minimum, Annex XI."),
  // DG CNECT — NIS2
  f("cnect", "nis2-23", "NIS2 §23", "Reporting obligations", "nis2-23", "NIS2 Art. 23", `${EURLEX_NIS2}#art_23`,
    "without undue delay", "Notify your CSIRT of any significant incident without undue delay."),
  f("cnect", "nis2-21", "NIS2 §21", "Cybersecurity risk-management measures", "nis2-21", "NIS2 Art. 21", `${EURLEX_NIS2}#art_21`,
    "appropriate and proportionate", "Appropriate and proportionate technical, operational and organisational measures."),
  // DG JUST — GDPR
  f("just", "dpia", "DPIA", "Data protection impact assessment", "gdpr-35", "GDPR Art. 35", `${EURLEX_GDPR}#art_35`,
    "prior to the processing", "Likely high risk? Assess the impact prior to the processing. Not after."),
  f("just", "ropa", "ROPA", "Records of processing activities", "gdpr-30", "GDPR Art. 30", `${EURLEX_GDPR}#art_30`,
    "record of processing activities", "Maintain a record of processing activities. A record of the records."),
  f("just", "breach", "72 H", "Notification of a personal data breach", "gdpr-33", "GDPR Art. 33", `${EURLEX_GDPR}#art_33`,
    "72 hours", "Notify the supervisory authority, where feasible, not later than 72 hours."),
  f("just", "dpo", "DPO", "Designation of the data protection officer", "gdpr-37", "GDPR Art. 37", `${EURLEX_GDPR}#art_37`,
    "public authority", "Public authorities must designate a data protection officer. Ours is on leave."),
  f("just", "dpa", "ART. 28", "Processor", "gdpr-28", "GDPR Art. 28", `${EURLEX_GDPR}#art_28`,
    "sufficient guarantees", "Use only processors providing sufficient guarantees. Guaranteed by form."),
  f("just", "scc", "SCC", "Transfers subject to appropriate safeguards", "gdpr-46", "GDPR Art. 46", `${EURLEX_GDPR}#art_46`,
    "appropriate safeguards", "Third-country transfer only with appropriate safeguards. Clauses attached."),
  f("just", "consent", "CONSENT", "Conditions for consent", "gdpr-7", "GDPR Art. 7", `${EURLEX_GDPR}#art_7`,
    "able to demonstrate", "The controller shall be able to demonstrate consent. Hence this form."),
  // DG FISMA — DORA
  f("fisma", "dora-19", "MAJOR ICT", "Reporting of major ICT-related incidents", "dora-19", "DORA Art. 19", `${EURLEX_DORA}#art_19`,
    "major ICT-related incidents", "Report major ICT-related incidents to the relevant competent authority."),
  f("fisma", "dora-17", "ICT LOG", "ICT-related incident management process", "dora-17", "DORA Art. 17", `${EURLEX_DORA}#art_17`,
    "record all ICT-related incidents", "Record all ICT-related incidents and significant cyber threats. All of them."),
  f("fisma", "dora-24", "DOR TEST", "Digital operational resilience testing", "dora-24", "DORA Art. 24", `${EURLEX_DORA}#art_24`,
    "assessing preparedness", "Resilience testing, for assessing preparedness for handling ICT-related incidents."),
  f("fisma", "tlpt", "TLPT", "Advanced testing of ICT tools", "dora-26", "DORA Art. 26", `${EURLEX_DORA}#art_26`,
    "at least every 3 years", "Identified entities: advanced testing by TLPT at least every 3 years. Again."),
  f("fisma", "dora-28", "ICT 3RD", "ICT third-party risk", "dora-28", "DORA Art. 28", `${EURLEX_DORA}#art_28`,
    "remain fully responsible", "Outsourced your ICT? You remain fully responsible. For the outsourcing too."),
];

/** Fictional permits: accepted in any inbox. No regulation claim. */
export const WILDCARDS: readonly FormDef[] = [
  { id: "a-38", code: "A-38", title: "Permit A-38", dg: null, kind: "wild",
    fact: "Permit A-38: accepted by every inbox, issued by none. (Fictional, thankfully.)" },
  { id: "27b-6", code: "27B/6", title: "Form 27B/6", dg: null, kind: "wild",
    fact: "Form 27B/6: valid everywhere, as long as nobody asks for the original. (Fictional.)" },
];

export const OMNIBUS: FormDef = {
  id: "omnibus", code: "OMNIBUS", title: "Simplification package", dg: null, kind: "omnibus",
  fact: "Simplification package adopted: the returned forms in this inbox are repealed. New forms pending.",
};

export const ALL_FORMS: readonly FormDef[] = [...FORMS, ...WILDCARDS, OMNIBUS];
export const formById = new Map(ALL_FORMS.map((x) => [x.id, x]));
export const formsOf = (dg: DgId): FormDef[] => FORMS.filter((x) => x.dg === dg);
