/** `?mock=1` and the `mock` case id: a complete NoticeV2 so clients can wire report/badge links before the server lands. */
import type { NoticeV2, Provision } from "@dg-roast/shared";

const P = (id: string, label: string, title: string, url: string): Provision => ({ id, label, title, url });
const AI = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R1689";
const GD = "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679";

export const MOCK_CASE_ID = "mock";

export function mockNotice(): NoticeV2 {
  const art5 = P("ai-act-5", "AI Act Art. 5", "Prohibited AI practices", `${AI}#art_5`);
  const art50 = P("ai-act-50", "AI Act Art. 50", "Transparency obligations for providers and deployers of certain AI systems", `${AI}#art_50`);
  const gdpr9 = P("gdpr-9", "GDPR Art. 9", "Processing of special categories of personal data", `${GD}#art_9`);
  const gdpr6 = P("gdpr-6", "GDPR Art. 6", "Lawfulness of processing", `${GD}#art_6`);
  const gdpr33 = P("gdpr-33", "GDPR Art. 33", "Notification of a personal data breach to the supervisory authority", `${GD}#art_33`);
  const nis23 = P("nis2-23", "NIS2 Art. 23", "Reporting obligations", "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022L2555#art_23");
  return {
    serial: "L-2026/04812",
    startup: "Fridgely",
    officers: ["formblatt", "annexe"],
    fineEur: 1_234_567_890,
    fineBasis: "€35M or 7% of worldwide turnover, whichever is higher — AI Act Art. 99(3)",
    findings: [
      { text: "Fridge infers the owner's mood from what they eat at 3 a.m. and nudges them to buy more ice cream.", provision: art5 },
      { text: "Fridge talks to guests without disclosing that it is an AI.", provision: art50 },
      { text: "Camera inside the fridge processes biometric and health data.", provision: gdpr9 },
      { text: "Eating habits sold to insurers with no lawful basis.", provision: gdpr6 },
      { text: "Data breach announced on LinkedIn instead of to the supervisory authority.", provision: gdpr33 },
      { text: "The pitch itself was declared a significant incident.", provision: nis23 },
    ],
    issuedAt: "2026-10-10T15:30:00.000Z",
    applicantId: "mock-applicant",
    startupName: "Fridgely",
    founderName: "Max Mustermann",
    totalEur: 1_234_567_890,
    totalJailMonths: 171,
    meltdown: true,
    tldr: [
      { law: "AI Act", oneLine: "Manipulative mood-based upselling (prohibited practice) and an undisclosed talking fridge." },
      { law: "GDPR", oneLine: "Biometric and health data from a fridge camera, sold to insurers without a lawful basis; breach disclosed on LinkedIn." },
      { law: "NIS2", oneLine: "The pitch was a significant incident; no early warning was filed within 24 hours." },
    ],
    recommendations: [
      { text: "Drop mood inference and any nudging based on it; recommend groceries only on explicit user settings.", provision: art5 },
      { text: "Have the fridge say it is an AI before it speaks to anyone, every time.", provision: art50 },
      { text: "Move recognition on-device, keep no images, and never sell eating habits to anyone.", provision: gdpr9 },
    ],
    reportUrl: `/api/case/${MOCK_CASE_ID}/report.pdf`,
    badgeUrl: `/api/case/${MOCK_CASE_ID}/badge.png`,
    meanwhile: {
      elapsedSec: 252,
      china: { models: 11, note: "one of them achieved superintelligence" },
      us: { models: 3, note: "and raised $40 bn" },
      eu: { regulations: 27, forms: 412, note: "you need all of them to open a bank account" },
    },
  };
}
