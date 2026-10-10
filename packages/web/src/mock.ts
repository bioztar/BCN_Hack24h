import { TIER_NAMES, type Case, type Notice, type Persona, type PersonaId, type Provision, type RoastEvent, type Submission, type Tier, type WallEntry } from "./contract";
import { FIXED_PAIRS, type Api } from "./api";
import { fmtEur, sleep } from "./dom";

const AI_ACT = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689";
const GDPR = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679";
const NIS2 = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022L2555";
const DORA = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2554";

export const PROVISIONS: Record<string, Provision> = {
  "gdpr-6": { id: "gdpr-6", label: "GDPR Art. 6", title: "Lawfulness of processing", url: `${GDPR}#art_6` },
  "gdpr-7": { id: "gdpr-7", label: "GDPR Art. 7", title: "Conditions for consent", url: `${GDPR}#art_7` },
  "gdpr-13": { id: "gdpr-13", label: "GDPR Art. 13", title: "Information to be provided where personal data are collected from the data subject", url: `${GDPR}#art_13` },
  "gdpr-33": { id: "gdpr-33", label: "GDPR Art. 33", title: "Notification of a personal data breach to the supervisory authority", url: `${GDPR}#art_33` },
  "gdpr-44": { id: "gdpr-44", label: "GDPR Art. 44", title: "General principle for transfers", url: `${GDPR}#art_44` },
  "aiact-6": { id: "aiact-6", label: "AI Act Art. 6", title: "Classification rules for high-risk AI systems", url: `${AI_ACT}#art_6` },
  "aiact-11": { id: "aiact-11", label: "AI Act Art. 11", title: "Technical documentation", url: `${AI_ACT}#art_11` },
  "aiact-50": { id: "aiact-50", label: "AI Act Art. 50", title: "Transparency obligations for providers and deployers of certain AI systems", url: `${AI_ACT}#art_50` },
  "aiact-57": { id: "aiact-57", label: "AI Act Art. 57", title: "AI regulatory sandboxes", url: `${AI_ACT}#art_57` },
  "aiact-99": { id: "aiact-99", label: "AI Act Art. 99", title: "Penalties", url: `${AI_ACT}#art_99` },
  "nis2-23": { id: "nis2-23", label: "NIS2 Art. 23", title: "Reporting obligations", url: `${NIS2}#art_23` },
  "dora-28": { id: "dora-28", label: "DORA Art. 28", title: "General principles (ICT third-party risk)", url: `${DORA}#art_28` },
};

const still = (id: string) => ({
  neutral: `/assets/personas/${id}/neutral.png`,
  smug: `/assets/personas/${id}/smug.png`,
  appalled: `/assets/personas/${id}/appalled.png`,
  stamping: `/assets/personas/${id}/stamping.png`,
  asleep: `/assets/personas/${id}/asleep.png`,
});

export const MOCK_PERSONAS: Persona[] = [
  { id: "formblatt", name: "Dr. Heinrich Formblatt", title: "Senior Rapporteur, Unit C.4 (Pre-Conformity)", stills: still("formblatt"), color: "#7a6a4f" },
  { id: "annexe", name: "Mme Ségolène Annexe-Vandamme", title: "Director, Directorate for the Proportionality of Proportionality", stills: still("annexe"), color: "#1f3a6e" },
  { id: "trilogue", name: "The Trilogue", title: "Commission, Parliament and Council (jointly, severally)", stills: still("trilogue"), color: "#5a5a7a" },
  { id: "grandma-gdpr", name: "Oma Gerda", title: "Knitter-in-Residence, Office of the DPO", stills: still("grandma-gdpr"), color: "#8a4f6a" },
  { id: "kevin", name: "Kevin from Compliance", title: "Certified AI Governance Practitioner (pending)", stills: still("kevin"), color: "#2f7a6a" },
  { id: "auditor-9000", name: "AUDITOR-9000", title: "Mainframe, Berlaymont Basement Level -4", stills: still("auditor-9000"), color: "#3c7a2f" },
  { id: "chad", name: "Chad Whitmore III", title: "Head of EU Policy, a US Big Tech firm (fictional)", stills: still("chad"), color: "#a05a1f" },
  { id: "de-vries", name: "Inspector Pim de Vries", title: "NIS2 Incident Response Unit", stills: still("de-vries"), color: "#4f4f4f" },
  { id: "sandbox", name: "Baroness Brigitte von Sandbox", title: "Head of the Regulatory Sandbox", stills: still("sandbox"), color: "#b08a1f" },
  { id: "the-cookie", name: "The Cookie", title: "Consent Banner (sentient)", stills: still("the-cookie"), color: "#8a5a2f" },
];

type ScriptLine = { by: 0 | 1; text: string; cite?: string[]; clip?: Extract<RoastEvent, { type: "line" }>["clip"]; stamp?: Extract<RoastEvent, { type: "line" }>["stamp"] };

const ROUNDS: Record<Tier, { lines: ScriptLine[]; prompt: string }> = {
  1: {
    lines: [
      { by: 0, clip: "intro", text: "Good afternoon. Before we proceed to the substance, which we will not, I must note the irregularity of your existence. Please remain seated while I lose your file." },
      { by: 1, text: "What a brave use of the word 'disruptive'. We have a form for that. It is the same form as for fires." },
      { by: 0, text: "{startup} processes personal data. I can tell, because it exists. Article 6 asks on what lawful basis. You have none. You have a pitch deck.", cite: ["gdpr-6"], stamp: "INCOMPLET" },
    ],
    prompt: "You may now object. Objections are welcome, recorded, and ignored.",
  },
  2: {
    lines: [
      { by: 1, clip: "tier2", text: "The Committee has examined your objection with great care, for four seconds. Your product is high-risk. A lemonade stand would also be high-risk, if it were yours.", cite: ["aiact-6"] },
      { by: 0, text: "Article 11 requires technical documentation. Four hundred pages. You uploaded PDF/A-1a. We require PDF/A-1b. Have you no shame.", cite: ["aiact-11"], stamp: "REFUSÉ" },
      { by: 1, text: "During this hearing the United States shipped three models and China shipped eleven. We have produced a consultation. It is about you." },
    ],
    prompt: "The Committee will hear one further objection, in one of the twenty-four official languages. Preferably Maltese.",
  },
  3: {
    lines: [
      { by: 0, clip: "tier3", text: "Your objection has been referred to Trilogue. The Council will now join us. The Council does not have a face. The Council has a position." },
      { by: 1, text: "Parliament proposes that {startup} be banned. The Commission proposes it be consulted. The Council proposes both, in Strasbourg, monthly." },
      { by: 0, text: "Your critical ICT third-party provider is your co-founder. Article 28 requires an exit strategy. So, frankly, does he.", cite: ["dora-28"], stamp: "RENVOYÉ EN COMMISSION" },
    ],
    prompt: "Trilogue has reached provisional agreement that you are wrong. You may contest this, provisionally.",
  },
  4: {
    lines: [
      { by: 1, clip: "tier4", text: "While you were speaking, the Commission adopted a delegated act. You are now retroactively non-compliant. Congratulations. It is the first thing you have done early." },
      { by: 0, text: "This is a significant incident. Article 23: you have twenty-four hours to submit an early warning. The incident is your pitch.", cite: ["nis2-23"], stamp: "REFUSÉ" },
      { by: 1, text: "Article 50 obliges you to disclose AI-generated content. I note that your business plan is AI-generated, and was not disclosed.", cite: ["aiact-50"] },
    ],
    prompt: "Final objection. It will be published in the Official Journal, next to your shame.",
  },
  5: {
    lines: [
      { by: 0, clip: "tier5", text: "The file is closed. I found it, specifically so that I could close it." },
      { by: 1, text: "The Commission has estimated your turnover at {revenue}, generously. Article 99 sets the fine at thirty-five million euros or seven percent of worldwide turnover, whichever is higher. The higher one is thirty-five million. It is always thirty-five million.", cite: ["aiact-99"], stamp: "REFUSÉ" },
      { by: 0, clip: "verdict", text: "You are, however, admitted to the regulatory sandbox. The sandbox opens in 2027. The sand is not yet harmonised.", cite: ["aiact-57"], stamp: "RENVOYÉ EN COMMISSION" },
    ],
    prompt: "",
  },
};

const REPO_LINES: ScriptLine[] = [
  { by: 0, clip: "repo-horror", text: "I have read your repository. I would now like to unread it." },
  { by: 1, text: "There is a file called dot-env in your repository. Article 33: seventy-two hours to notify the supervisory authority. Sixty-nine of them passed while you were pitching.", cite: ["gdpr-33"], stamp: "REFUSÉ" },
];

export const MOCK_WALL_POOL: string[] = [
  "What a brave use of the word 'disruptive'. We have a form for that. It is the same form as for fires.",
  "Before we proceed to the substance, which we will not, I must note the irregularity of your existence.",
  "The sandbox opens in 2027. The sand is not yet harmonised.",
  "During this hearing the United States shipped three models and China eleven. We have produced a consultation.",
  "Your critical ICT third-party provider is your co-founder. Exit strategy required.",
  "You are now retroactively non-compliant. It is the first thing you have done early.",
  "The incident is your pitch. You have twenty-four hours.",
  "It is always thirty-five million euros. Payable in triplicate.",
  "PDF/A-1b required. This is PDF/A-1a. Have you no shame.",
  "Your file has been lost. This is not a finding, it is a service.",
];

export function startupName(sub: Submission): string {
  if (sub.repoUrl) return sub.repoUrl.replace(/\/$/, "").split("/").pop() || "Unnamed repository";
  const text = sub.text ?? "";
  const named = /\b(?:called|named|is)\s+([A-Z][\w.-]{1,30})/.exec(text)?.[1];
  const cap = named ?? /\b([A-Z][a-z]+(?:[A-Z][a-z]+|ly|ify|io|AI|\.ai))\b/.exec(text)?.[1];
  return cap ?? "Your Startup";
}

/** Rehearsal copy of the server's optional `turnoverEstimate` (not yet in the shared types). */
export const MOCK_TURNOVER = { turnoverEstimate: { eur: 40_000_000, basis: "EU HR-tech TAM €8 bn × 0.5 %" } };

export function fineFor(revenueEur: number | undefined): number {
  return Math.max(35_000_000, Math.round((revenueEur ?? 0) * 0.07));
}

const wallChannel = typeof BroadcastChannel !== "undefined" && typeof window !== "undefined" ? new BroadcastChannel("dg-roast-mock-wall") : null;

export function mockApi(opts: { pace?: number } = {}): Api {
  const pace = opts.pace ?? 1;
  const cases = new Map<string, { c: Case; sub: Submission; tier: Tier; cited: Set<string>; replies: string[] }>();
  const persona = (id: PersonaId) => MOCK_PERSONAS.find((p) => p.id === id) ?? MOCK_PERSONAS[0]!;

  return {
    mock: true,
    personas: async () => MOCK_PERSONAS,
    pairs: async () => FIXED_PAIRS,
    async createCase(submission, officers) {
      await sleep(400 * pace);
      const ticket = 4812 + Math.floor(Math.random() * 90);
      const c: Case = { caseId: `mock-${Date.now().toString(36)}`, ticket, officers: officers ?? FIXED_PAIRS[Math.floor(Math.random() * FIXED_PAIRS.length)]!.officers };
      cases.set(c.caseId, { c, sub: submission, tier: 1, cited: new Set(), replies: [] });
      return c;
    },
    async stream(caseId, onEvent, signal) {
      const st = cases.get(caseId);
      if (!st) {
        onEvent({ type: "error", message: "File not found. It has been lost, as is customary." });
        return;
      }
      const { c, sub } = st;
      const vars = {
        startup: startupName(sub),
        revenue: sub.revenueEur ? fmtEur(sub.revenueEur) : "zero",
      };
      const emit = async (e: RoastEvent, wait = 250) => {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        await sleep(wait * pace);
        onEvent(e);
      };
      if (st.tier === 1) {
        await emit({ type: "officers", officers: [persona(c.officers[0]), persona(c.officers[1])], ticket: c.ticket }, 300);
      }
      await emit({ type: "tier", tier: st.tier, name: TIER_NAMES[st.tier - 1] });
      const lines = [...ROUNDS[st.tier].lines];
      if (st.tier === 1 && sub.kind === "repo" && sub.repoUrl) {
        const repo = sub.repoUrl.replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "");
        await emit({
          type: "intake",
          repo: {
            repo,
            description: "A revolutionary platform (self-described)",
            stars: 3,
            language: "TypeScript",
            findings: [
              { key: "no-license", detail: "No LICENSE file. Unlicensed processing." },
              { key: "no-security", detail: "No SECURITY.md. Vulnerability handling: vibes." },
              { key: "env-tracked", detail: ".env is tracked in git (contents not read)." },
              { key: "llm-sdk", detail: "openai in package.json — third-country transfer." },
              { key: "no-privacy", detail: "No privacy policy found." },
            ],
            summary: "A to-do app with a seed round.",
          },
        });
        lines.splice(1, 0, ...REPO_LINES);
      }
      let i = 0;
      for (const l of lines) {
        const provisions = (l.cite ?? []).map((id) => PROVISIONS[id]!).filter(Boolean);
        provisions.forEach((p) => st.cited.add(p.id));
        const text = l.text.replace(/\{(\w+)\}/g, (_, k: keyof typeof vars) => vars[k] ?? "");
        await emit({
          type: "line",
          id: `${caseId}-${st.tier}-${i++}`,
          speaker: c.officers[l.by],
          text,
          provisions,
          clip: l.clip ?? (l.stamp ? "stamp" : "talking"),
          audioUrl: null,
          ...(l.stamp ? { stamp: l.stamp } : {}),
        });
      }
      if (st.tier < 5) {
        await emit({ type: "awaiting", prompt: ROUNDS[st.tier].prompt });
        return;
      }
      const findings = [...st.cited].map((id) => PROVISIONS[id]!).map((provision) => ({ text: FINDING_TEXT[provision.id] ?? provision.title, provision }));
      const notice: Notice = {
        serial: `L-2026/${String(c.ticket).padStart(5, "0")}`,
        startup: vars.startup,
        officers: c.officers,
        fineEur: fineFor(sub.revenueEur),
        fineBasis: "€35M or 7% of worldwide annual turnover, whichever is higher — AI Act Art. 99(3)",
        findings,
        issuedAt: new Date().toISOString(),
        ...MOCK_TURNOVER,
      };
      await emit({ type: "verdict", notice }, 400);
    },
    async reply(caseId, text) {
      const st = cases.get(caseId);
      if (!st) throw new Error("unknown case");
      st.replies.push(text);
      st.tier = Math.min(5, st.tier + 1) as Tier;
      await sleep(200 * pace);
    },
    async stt() {
      await sleep(900 * pace);
      return "Our startup is called Swipely. It is Tinder for regulatory filings, powered by AI, and we have zero revenue but very strong vibes.";
    },
    async wall(onEntry, signal) {
      const ids = MOCK_PERSONAS.slice(0, 4).map((p) => p.id);
      const make = (i: number, ago: number): WallEntry => ({
        speaker: ids[i % ids.length]!,
        text: MOCK_WALL_POOL[i % MOCK_WALL_POOL.length]!,
        at: new Date(Date.now() - ago).toISOString(),
      });
      for (let i = 0; i < 6; i++) onEntry(make(i, (6 - i) * 60_000));
      const onMsg = (e: MessageEvent<WallEntry>) => onEntry(e.data);
      wallChannel?.addEventListener("message", onMsg);
      let n = 6;
      try {
        while (!signal.aborted) {
          await sleep(9000);
          if (!signal.aborted) onEntry(make(n++, 0));
        }
      } finally {
        wallChannel?.removeEventListener("message", onMsg);
      }
    },
  };
}

/** Mock mode only: the stage posts officials' lines so a /wall tab on the same machine shows them. */
export function mockBroadcastLine(entry: WallEntry): void {
  wallChannel?.postMessage(entry);
}

const FINDING_TEXT: Record<string, string> = {
  "gdpr-6": "Processing of personal data without a lawful basis, other than optimism.",
  "gdpr-33": "Personal data breach (.env tracked in a public repository); notification not received.",
  "aiact-6": "High-risk AI system placed on the market by a low-credibility provider.",
  "aiact-11": "Technical documentation submitted in PDF/A-1a instead of PDF/A-1b.",
  "aiact-50": "Business plan generated by AI without the required disclosure.",
  "aiact-57": "Premature request for admission to a sandbox that is not yet harmonised.",
  "aiact-99": "Fine calculated; the higher figure applies. It always does.",
  "nis2-23": "Significant incident (the pitch) not reported within 24 hours.",
  "dora-28": "Critical ICT third-party provider (co-founder) without exit strategy.",
};
