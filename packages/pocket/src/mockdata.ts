import type { BetterPlaceCause, LeaderboardEntry, QueueTicket } from "./types";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const SEED: Omit<LeaderboardEntry, "issuedAt">[] = [
  { caseId: "seed-1", startupName: "EmotiHire", founderName: "Lena K.", oneLiner: "Emotion recognition for job interviews", photoUrl: null, totalEur: 4_812_000_000, totalJailMonths: 1_340, meltdown: true, topLaws: ["AI Act", "GDPR"] },
  { caseId: "seed-2", startupName: "Kredit.io", founderName: "Marco P.", oneLiner: "Credit scoring by vibes", photoUrl: null, totalEur: 2_150_000_000, totalJailMonths: 216, meltdown: true, topLaws: ["AI Act", "DORA", "GDPR"] },
  { caseId: "seed-3", startupName: "CookieMonster", founderName: "Jo B.", oneLiner: "Consent banners, but sticky", photoUrl: null, totalEur: 640_000_000, totalJailMonths: 1_212, meltdown: true, topLaws: ["ePrivacy", "GDPR"] },
  { caseId: "seed-4", startupName: "Snoopr", founderName: "Ana R.", oneLiner: "Reads your email so you don't have to", photoUrl: null, totalEur: 912_000_000, totalJailMonths: 480, meltdown: false, topLaws: ["GDPR", "ePrivacy"] },
  { caseId: "seed-5", startupName: "BlockChairs", founderName: "Tom H.", oneLiner: "Office chairs on the blockchain", photoUrl: null, totalEur: 87_000_000, totalJailMonths: 0, meltdown: false, topLaws: ["DORA"] },
  { caseId: "seed-6", startupName: "PatchLater", founderName: "Ines G.", oneLiner: "Security updates, eventually", photoUrl: null, totalEur: 310_000_000, totalJailMonths: 24, meltdown: false, topLaws: ["NIS2", "CRA"] },
  { caseId: "seed-7", startupName: "MoodMesh", founderName: "Sam O.", oneLiner: "Your fridge knows you're sad", photoUrl: null, totalEur: 156_000_000, totalJailMonths: 96, meltdown: false, topLaws: ["AI Act", "GDPR"] },
];

export function mockLeaderboard(): LeaderboardEntry[] {
  return SEED.map((e, i) => ({ ...e, issuedAt: ago(5 + i * 9) }));
}

const NAMES = ["Uberform", "TaxGPT", "DeepDPO", "Swipe4Visa", "NapChain", "FaxAI", "LeaseMyFace", "Grandmatic"];
const FOUNDERS = ["Alex M.", "Noor S.", "Pau F.", "Kai L.", "Mia T.", "Ola W."];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

export function mockNewEntry(): LeaderboardEntry {
  const eur = Math.round(10 ** (7.5 + Math.random() * 2.4) / 1000) * 1000;
  const jail = Math.random() < 0.5 ? 0 : Math.round(Math.random() * 1400);
  return {
    caseId: `live-${Date.now().toString(36)}`,
    startupName: pick(NAMES),
    founderName: pick(FOUNDERS),
    oneLiner: null,
    photoUrl: null,
    totalEur: eur,
    totalJailMonths: jail,
    meltdown: eur >= 1e9 || jail >= 1200,
    topLaws: [pick(["AI Act", "GDPR", "NIS2"]), pick(["DORA", "ePrivacy", "CRA"])],
    issuedAt: new Date().toISOString(),
  };
}

const QUIPS: Record<BetterPlaceCause, string> = {
  climate: "Carbon-neutral startup detected. Your file has been fast-tracked by bicycle.",
  "ai-safety": "Ah, a safety startup. We regulate you first, as a precaution.",
  refugees: "Moved to the front. Your own asylum application is in another queue.",
  ukraine: "Solidarity noted. Paperwork is still paperwork, but faster.",
  lgbtq: "Diversity box ticked. There are 41 more boxes.",
  "gender-equality": "Equality achieved: everyone is refused at the same speed.",
  homeless: "Your startup now has an address: the front of the queue.",
  "rare-diseases": "Rare. Like a startup that survives this procedure.",
  "animal-welfare": "The dog may proceed. You may follow the dog.",
  accessibility: "Ramp installed to the front of the queue. Stairs to the exit remain.",
};
export function mockQuip(c: BetterPlaceCause): string {
  return QUIPS[c];
}

const ETAS = ["Estimated decision: Q3 2031", "Estimated decision: after the next Treaty change", "Estimated decision: 2 legislative terms", "Estimated decision: when Article 50 applies to you, personally"];

function mockToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function mockTicket(countdownSec?: number): QueueTicket {
  return {
    applicantId: `app-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    applicantToken: mockToken(),
    ticket: 10_000 + Math.floor(Math.random() * 990_000),
    position: 1_500_000 + Math.floor(Math.random() * 1_500_000),
    etaText: pick(ETAS),
    countdownSec: countdownSec ?? 30 + Math.floor(Math.random() * 31),
  };
}
