import { lawOf, mockFine } from "./fines";
import { meltdownCrossed } from "./meter";
import type { AnyRoastEvent, NoticeV2, Pair, Persona, PersonaId, Provision, Tier } from "./types";

// Fallback roster + a full mock roast. Used with ?mock=1 and whenever the server is unreachable.

export const FIXTURE_PERSONAS: Persona[] = [
  { id: "formblatt", name: "Dr. Heinrich Formblatt", title: "Senior Rapporteur, Unit C.4 (Pre-Conformity)", stills: {}, color: "#8a8f98" },
  { id: "annexe", name: "Mme Ségolène Annexe-Vandamme", title: "Director, Directorate for the Proportionality of Proportionality", stills: {}, color: "#1f3a68" },
  { id: "grandma-gdpr", name: "Oma Gerda", title: "Knitting in the corner of the DPO's office", stills: {}, color: "#b5651d" },
  { id: "auditor-9000", name: "AUDITOR-9000", title: "1987 mainframe, Berlaymont basement", stills: {}, color: "#33ff66" },
  { id: "de-vries", name: "Inspector Pim de Vries", title: "NIS2 Incident Response Unit", stills: {}, color: "#d7263d" },
  { id: "the-cookie", name: "The Cookie", title: "A sentient consent banner", stills: {}, color: "#c68642" },
];

export const FIXTURE_PAIRS: Pair[] = [
  { id: "commission", officers: ["formblatt", "annexe"] },
  { id: "basement", officers: ["grandma-gdpr", "auditor-9000"] },
  { id: "raid", officers: ["de-vries", "the-cookie"] },
];

const AI_ACT = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689";
const GDPR = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679";
const NIS2 = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022L2555";
const DORA = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2554";
const EPRIVACY = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32002L0058";

export const PROVISIONS = {
  aiAct50: { id: "ai-act-50", label: "AI Act Art. 50", title: "Transparency obligations for providers and deployers of certain AI systems", url: AI_ACT },
  aiAct99: { id: "ai-act-99", label: "AI Act Art. 99", title: "Penalties", url: AI_ACT },
  aiActAnnex3: { id: "ai-act-annex-iii", label: "AI Act Annex III", title: "High-risk AI systems referred to in Article 6(2)", url: AI_ACT },
  gdpr5: { id: "gdpr-5", label: "GDPR Art. 5", title: "Principles relating to processing of personal data", url: GDPR },
  gdpr7: { id: "gdpr-7", label: "GDPR Art. 7", title: "Conditions for consent", url: GDPR },
  gdpr33: { id: "gdpr-33", label: "GDPR Art. 33", title: "Notification of a personal data breach to the supervisory authority", url: GDPR },
  nis2_23: { id: "nis2-23", label: "NIS2 Art. 23", title: "Reporting obligations", url: NIS2 },
  dora28: { id: "dora-28", label: "DORA Art. 28", title: "General principles (ICT third-party risk)", url: DORA },
  eprivacy5: { id: "eprivacy-5", label: "ePrivacy Dir. Art. 5", title: "Confidentiality of the communications", url: EPRIVACY },
} satisfies Record<string, Provision>;

const P = PROVISIONS;

type Step =
  | { tier: Tier }
  | { say: 0 | 1; text: string; prov?: Provision[]; stamp?: "REFUSÉ" | "INCOMPLET" | "RENVOYÉ EN COMMISSION" }
  | { awaiting: string }
  | { verdict: true };

const TIER_NAMES = ["Pre-consultation", "Committee", "Trilogue", "Delegated Act", "Official Journal"] as const;

const SCRIPTS: Record<string, { rounds: Step[][]; findings: { text: string; provision: Provision }[] }> = {
  commission: {
    rounds: [
      [
        { tier: 1 },
        { say: 1, text: "What a brave use of the word “disruptive”. We have a form for that. It is the same form as for fires." },
        { say: 0, text: "Before we proceed to the substance — which we will not — I note the irregularity of your existence. You are number {ticket}. Estimated wait: the next Multiannual Financial Framework." },
        { tier: 2 },
        { say: 1, text: "{startup} processes personal data. I can tell; you breathed near it. Article 5 requires data minimisation. Please minimise yourself.", prov: [P.gdpr5] },
        { say: 0, text: "Madame's draft refusal is noted. I refuse it, on procedural grounds. Then I refuse you. Twice is the minimum under our efficiency programme.", stamp: "REFUSÉ" },
        { awaiting: "You may now argue back. Briefly. In triplicate." },
      ],
      [
        { tier: 3 },
        { say: 0, text: "The Council has joined the call. It disagrees with both of us, and with you. It is the only thing we have agreed on today." },
        { tier: 4 },
        { say: 1, text: "Good news. We amended the rules while you were speaking. {startup} is now high-risk under Annex III. Retroactively. Since breakfast.", prov: [P.aiActAnnex3] },
        { say: 0, text: "The fine is thirty-five million euros or seven percent of turnover, whichever is higher. Your turnover is zero. So: thirty-five million. Payable in triplicate.", prov: [P.aiAct99] },
        { tier: 5 },
        { say: 1, text: "It is published. You are now Rejected Startup No. {serial}. Congratulations — this is the most read you will ever be.", prov: [P.aiAct99], stamp: "RENVOYÉ EN COMMISSION" },
        { verdict: true },
      ],
    ],
    findings: [
      { text: "Existence of the applicant not foreseen by any annex", provision: P.aiActAnnex3 },
      { text: "Data not minimised; neither was the pitch", provision: P.gdpr5 },
      { text: "Turnover insufficient to afford the fine", provision: P.aiAct99 },
    ],
  },
  basement: {
    rounds: [
      [
        { tier: 1 },
        { say: 0, text: "Hello, dear. Before I say anything — do you consent to being insulted? Tick here, here, and the other six. It must be freely given, so I'll wait.", prov: [P.gdpr7] },
        { say: 1, text: "FAX NOT RECEIVED. PITCH SUBMITTED BY MOUTH. MOUTH IS NOT AN APPROVED TRANSMISSION MEDIUM." },
        { tier: 2 },
        { say: 0, text: "Thank you, dear. In my day {startup} was called a hobby, and nobody asked the bank for eleven million euros for it." },
        { say: 1, text: "PROCESSING. PRINTING NON-COMPLIANCE. PAGE 1 OF 4,012. PLEASE DO NOT STAND IN FRONT OF THE PRINTER.", stamp: "INCOMPLET" },
        { awaiting: "Oma Gerda would like to hear your side, dear. She is knitting." },
      ],
      [
        { tier: 3 },
        { say: 1, text: "COUNCIL DIAL-UP CONNECTION ESTABLISHED. COUNCIL DISAGREES. CONNECTION LOST. COUNCIL STILL DISAGREES." },
        { tier: 4 },
        { say: 0, text: "A data breach must be reported within seventy-two hours, dear. I reported you already. I'm very quick for eighty-four.", prov: [P.gdpr33] },
        { say: 1, text: "FINE CALCULATED: {fine} EUR. REMAINDER CARRIED FORWARD TO THE NEXT CENTURY.", prov: [P.aiAct99] },
        { tier: 5 },
        { say: 0, text: "There. I've knitted your verdict into a cookie banner. You can't reject it, dear. Nobody can.", prov: [P.eprivacy5], stamp: "REFUSÉ" },
        { verdict: true },
      ],
    ],
    findings: [
      { text: "Consent to be roasted not freely given (applicant looked nervous)", provision: P.gdpr7 },
      { text: "Breach of the applicant's own business plan, unreported", provision: P.gdpr33 },
      { text: "Fine exceeds the printer's paper supply", provision: P.aiAct99 },
    ],
  },
  raid: {
    rounds: [
      [
        { tier: 1 },
        { say: 0, text: "NIS2 Incident Response, nobody move! Step away from the pitch deck. Slowly." },
        { say: 1, text: "Hi! Before you continue, may I store a small thing on your device? It's me. I'm the small thing.", prov: [P.eprivacy5] },
        { tier: 2 },
        { say: 0, text: "This is a significant incident. You have twenty-four hours to submit an early warning. The incident is your pitch.", prov: [P.nis2_23] },
        { say: 1, text: "You pressed “Reject all”. That's okay. I'll come back. Larger.", stamp: "REFUSÉ" },
        { awaiting: "Inspector de Vries is listening. Speak slowly. Everything is evidence." },
      ],
      [
        { tier: 3 },
        { say: 0, text: "Council on the radio. Over. Council says no. Over. Council says no to the radio. Over and out." },
        { tier: 4 },
        { say: 1, text: "We updated our terms while you were talking! You agreed by blinking. Also, by law I must tell you: I am a machine-generated cookie.", prov: [P.aiAct50] },
        { say: 0, text: "Your critical ICT third-party provider is your co-founder. Exit strategy required. Look at him. Now look at the exit.", prov: [P.dora28] },
        { tier: 5 },
        { say: 0, text: "Scene secured. {startup} neutralised. Bag the hoodie. And the fine.", prov: [P.aiAct99], stamp: "REFUSÉ" },
        { verdict: true },
      ],
    ],
    findings: [
      { text: "Pitch constitutes a significant incident; no early warning filed", provision: P.nis2_23 },
      { text: "Co-founder is an unmanaged ICT third-party risk", provision: P.dora28 },
      { text: "Applicant tried to reject a cookie", provision: P.eprivacy5 },
    ],
  },
};

export function pairFor(officers: [PersonaId, PersonaId]): string {
  return FIXTURE_PAIRS.find((p) => p.officers.includes(officers[0]) && p.officers.includes(officers[1]))?.id ?? "commission";
}

const NAME_STOP = /^(the|and|for|with|our|we|we're|its|it's|that|this|app|platform|startup|like|but|are|is|an|a|i|i'm|my|hi|hello)$/i;

export function startupName(pitch: string): string {
  const named =
    pitch.match(/\b(?:called|named)\s+([\p{L}\p{N}][\p{L}\p{N}.-]*)/iu)?.[1] ??
    pitch.match(/\b(?:we are|we're|i am|i'm|this is|meet)\s+([\p{Lu}\p{N}][\p{L}\p{N}.-]*)/u)?.[1] ??
    pitch.split(/\s+/).slice(1).find((w) => /^[\p{Lu}][\p{L}\p{N}.-]+/u.test(w) && !NAME_STOP.test(w.replace(/[^\p{L}']/gu, "")));
  const clean = named?.replace(/[.,;:!?-]+$/u, "");
  if (clean && !NAME_STOP.test(clean)) return /\.[a-z]{2,}$/i.test(clean) ? clean.slice(0, 24) : `${clean.slice(0, 18)}.ai`;
  const words = pitch.replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter((w) => w.length > 2 && !NAME_STOP.test(w));
  const name = words.slice(0, 2).map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()).join("");
  return name ? `${name.slice(0, 18)}.ai` : "Your Startup";
}

export function fineFor(revenueEur = 0): number {
  return Math.max(35_000_000, Math.round(revenueEur * 0.07));
}

export interface MockTotals { eur: number; jail: number; melted: boolean; n: number; }
export interface MockCtx {
  personas: [Persona, Persona];
  ticket: number;
  pitch: string;
  revenueEur?: number;
  serial: string;
  caseId?: string;
  totals?: MockTotals;
  applicant?: { applicantId: string; startupName: string; founderName: string } | null;
  repoUrl?: string;
}

const LAW_TLDR: Record<string, string> = {
  GDPR: "You process personal data. Nobody consented, least of all us.",
  "AI Act": "Your “AI” is an AI system. That is already a finding.",
  NIS2: "Your pitch is a significant incident. Report it within 24 hours.",
  DORA: "Your critical ICT third-party provider is your co-founder.",
  ePrivacy: "You stored something on a device. Possibly a cookie, possibly yourself.",
};
const LAW_RECO: Record<string, string> = {
  GDPR: "Write a record of processing (Art. 30), pick one lawful basis per purpose, and delete what you don't need.",
  "AI Act": "Classify the system against Art. 6 + Annex III before you build; disclose AI interaction (Art. 50).",
  NIS2: "Check whether you are an essential/important entity; set up 24 h / 72 h incident reporting.",
  DORA: "Keep a register of ICT third-party providers and an exit plan for each critical one.",
  ePrivacy: "Ask before you set non-essential cookies; make “Reject all” as easy as “Accept all”.",
};

export const REPO_STAGES = [
  "Cloning the repository (and all 4,000 forks)",
  "Reading the README, twice, with disgust",
  "Counting LLM SDKs",
  "Looking for a LICENSE",
  "Locating the .env file (found. committed.)",
  "Forwarding to Unit C.4",
];

/** One round of the mock roast as events (fines, meltdown and a NoticeV2 included). */
export function mockRoundEvents(ctx: MockCtx, round: number): AnyRoastEvent[] {
  const pairId = pairFor([ctx.personas[0].id, ctx.personas[1].id]);
  const script = SCRIPTS[pairId]!;
  const order: [Persona, Persona] = FIXTURE_PAIRS.find((p) => p.id === pairId)!.officers[0] === ctx.personas[0].id ? ctx.personas : [ctx.personas[1], ctx.personas[0]];
  const steps = script.rounds[Math.min(round, script.rounds.length - 1)]!;
  const startup = ctx.applicant?.startupName ?? (ctx.repoUrl ? ctx.repoUrl.split("/").filter(Boolean).pop() ?? "Your Repo" : startupName(ctx.pitch));
  const caseId = ctx.caseId ?? ctx.serial;
  const totals = (ctx.totals ??= { eur: 0, jail: 0, melted: false, n: 0 });
  const fine = fineFor(ctx.revenueEur);
  const fill = (t: string) => t.replace("{ticket}", ctx.ticket.toLocaleString("en-GB")).replace("{startup}", startup).replace("{serial}", ctx.serial).replace("{fine}", fine.toLocaleString("en-GB"));
  const events: AnyRoastEvent[] = [];
  if (round === 0) {
    events.push({ type: "officers", officers: ctx.personas, ticket: ctx.ticket });
    if (ctx.repoUrl) {
      REPO_STAGES.forEach((stage, i) => events.push({ type: "analyzing", stage, progress: (i + 1) / REPO_STAGES.length }));
      const repo = ctx.repoUrl.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/\.git$/, "");
      events.push({ type: "intake", repo: { repo, description: "A startup, apparently", stars: 3, language: "TypeScript", findings: [{ key: "no-license", detail: "No LICENSE file" }, { key: "env-tracked", detail: ".env is committed" }, { key: "llm-sdk", detail: "Uses an LLM SDK" }], summary: "No licence, a committed .env and an LLM SDK. Sufficient." } });
    }
  }
  let tier: Tier = 1;
  let n = 0;
  for (const s of steps) {
    if ("tier" in s) {
      tier = s.tier;
      events.push({ type: "tier", tier: s.tier, name: TIER_NAMES[s.tier - 1] });
    } else if ("say" in s) {
      events.push({ type: "line", id: `mock-${round}-${n++}`, speaker: order[s.say].id, text: fill(s.text), provisions: s.prov ?? [], clip: s.stamp ? "stamp" : "talking", audioUrl: null, ...(s.stamp ? { stamp: s.stamp } : {}) });
      for (const p of s.prov ?? []) {
        events.push(mockFine(caseId, p, tier, totals, ctx.revenueEur, totals.n++));
        if (!totals.melted && meltdownCrossed(totals.eur, totals.jail)) {
          totals.melted = true;
          events.push({ type: "meltdown", totalEur: totals.eur, totalJailMonths: totals.jail });
        }
      }
    } else if ("awaiting" in s) events.push({ type: "awaiting", prompt: s.awaiting });
    else {
      const laws = [...new Set(script.findings.map((f) => lawOf(f.provision.label)))];
      const notice: NoticeV2 = {
        serial: ctx.serial,
        startup,
        officers: [order[0].id, order[1].id],
        fineEur: totals.eur,
        fineBasis: "Sum of the statutory maxima, scaled by tier — AI Act Art. 99, GDPR Art. 83, and vibes",
        findings: script.findings,
        issuedAt: new Date().toISOString(),
        applicantId: ctx.applicant?.applicantId ?? null,
        startupName: startup,
        founderName: ctx.applicant?.founderName ?? null,
        totalEur: totals.eur,
        totalJailMonths: totals.jail,
        meltdown: totals.melted,
        tldr: laws.map((law) => ({ law, oneLine: LAW_TLDR[law] ?? "Non-compliant, comprehensively." })),
        recommendations: laws.map((law) => ({ text: LAW_RECO[law] ?? "Read the regulation. Then read it again.", provision: script.findings.find((f) => lawOf(f.provision.label) === law)?.provision })),
        reportUrl: "",
        badgeUrl: "",
      };
      events.push({ type: "verdict", notice });
    }
  }
  return events;
}

/** One round of the mock roast as a text/event-stream body (unnamed `data:` messages, like Lane B). */
export function mockRoundSse(ctx: MockCtx, round: number): string {
  return ":\n\n" + mockRoundEvents(ctx, round).map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
}

export const MOCK_DICTATION = "It's Uber for filling in forms. With AI. On the blockchain. We're pre-revenue but post-hype.";
