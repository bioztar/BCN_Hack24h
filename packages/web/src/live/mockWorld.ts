import { MOCK_TURNOVER } from "../mock";
import { MELTDOWN_EUR, MELTDOWN_JAIL_MONTHS, type LeaderboardEntry, type Meanwhile, type NoticeV2, type Provision, type Submission, type Tier } from "../contract";
import { sleep } from "../dom";
import { MOCK_PERSONAS, mockApi } from "../mock";
import type { AnyEvent, GameId, LiveApi } from "./api";
import { applyFine, emptyMeter, type Meter } from "./fines";

/** Rehearsal (`?mock=1`): a small fake world — a leaderboard that grows, a queue, and a case on loop. */

const STARTUPS: { startupName: string; founderName: string; oneLiner: string; text: string; repoUrl?: string }[] = [
  { startupName: "Swipely", founderName: "Marta R.", oneLiner: "Tinder for regulatory filings", text: "Our startup is called Swipely. Tinder for regulatory filings, powered by AI." },
  { startupName: "GrannyGPT", founderName: "Jonas K.", oneLiner: "An AI that calls your grandmother so you don't have to", text: "GrannyGPT is an AI that calls your grandmother and reads her your emails.", repoUrl: "https://github.com/grannygpt/grannygpt" },
  { startupName: "MoodCam", founderName: "Inès D.", oneLiner: "Emotion recognition for Zoom meetings", text: "MoodCam reads employees' emotions from their webcam during meetings." },
  { startupName: "48K", founderName: "Pau S.", oneLiner: "Payroll in 48 hours, compliance in 48 years", text: "48K does payroll for remote teams in 48 hours, powered by AI." },
  { startupName: "CookieMonster", founderName: "Lea W.", oneLiner: "Accepts all cookie banners for you", text: "CookieMonster is a browser extension called CookieMonster that accepts all cookie banners automatically." },
];

const SEED: LeaderboardEntry[] = [
  ["ByteBank", "Ola N.", 2_410_000_000, 1_320, true, ["DORA", "GDPR"]],
  ["Faceblock", "Tom V.", 1_870_000_000, 864, true, ["AI Act", "GDPR"]],
  ["Uberish", "Ana P.", 640_000_000, 60, false, ["DSA", "GDPR"]],
  ["DeepFarm", "Kai L.", 415_000_000, 0, false, ["AI Act"]],
  ["PetPal AI", "Noor H.", 212_500_000, 36, false, ["GDPR", "AI Act"]],
  ["LegalLlama", "Erik S.", 98_000_000, 18, false, ["AI Act"]],
  ["Tradr", "Sofia M.", 61_000_000, 120, false, ["DORA", "NIS2"]],
  ["VibeCheck", "Luca B.", 35_000_000, 0, false, ["AI Act"]],
  ["Dronely", "Mia F.", 22_000_000, 6, false, ["CRA"]],
].map(([startupName, founderName, totalEur, totalJailMonths, meltdown, topLaws], i) => ({
  caseId: `mock-seed-${i}`,
  startupName: startupName as string,
  founderName: founderName as string,
  oneLiner: null,
  photoUrl: null,
  totalEur: totalEur as number,
  totalJailMonths: totalJailMonths as number,
  meltdown: meltdown as boolean,
  topLaws: topLaws as string[],
  issuedAt: new Date(Date.now() - (i + 1) * 7 * 60_000).toISOString(),
}));

const CAPTIONS = [
  "Lawful basis: optimism. Not listed in Article 6.",
  "Fine reduced by 0% for good behaviour.",
  "Payable in triplicate, by fax, to an office that closed in 2009.",
  "The higher one. It is always the higher one.",
  "Your co-founder counts as a critical ICT third-party provider.",
  "Annex IV attached. Annex IV is 400 pages. You attached a GIF.",
  "Repeat offence: you existed twice.",
];

const LAW: Record<string, string> = { gdpr: "GDPR", aiact: "AI Act", nis2: "NIS2", dora: "DORA" };
const lawOf = (p: Provision) => LAW[p.id.split("-")[0] ?? ""] ?? p.label.split(" Art")[0] ?? p.label;

/** Deterministic fine per citation; climbs with the tier so the meter crosses €1 bn around tier 4. */
export function mockFine(index: number, tier: Tier, p: Provision): { amountEur: number; jailMonths: number; caption: string } {
  const base = [0, 9e6, 45e6, 160e6, 420e6, 900e6][tier]!;
  const wobble = 0.7 + ((index * 37 + p.id.length * 11) % 60) / 100;
  const jail = p.id.startsWith("gdpr") ? 36 : p.id.startsWith("nis2") ? 24 : 0;
  return { amountEur: Math.round((base * wobble) / 1e5) * 1e5, jailMonths: jail * Math.min(tier, 3), caption: CAPTIONS[(index + tier) % CAPTIONS.length]! };
}

function meanwhileAt(sec: number): Meanwhile {
  const t = Math.floor(sec);
  return {
    elapsedSec: t,
    china: { models: 1 + Math.floor(t / 18), note: "one of them achieved superintelligence" },
    us: { models: Math.floor(t / 75), note: `and raised $${5 + Math.floor(t / 75) * 12} bn` },
    eu: { regulations: 2 + Math.floor(t / 9), forms: 5 + Math.floor(t * 1.7), note: "you need all of them to open a bank account" },
  };
}

interface Round {
  events: AnyEvent[];
  done: boolean;
  listeners: Set<(e: AnyEvent) => void>;
  closers: Set<() => void>;
}

export function mockWorld(opts: { pace?: number; replyDelayMs?: number; nextCaseMs?: number } = {}): LiveApi & { board: LeaderboardEntry[] } {
  const pace = opts.pace ?? 1;
  const v1 = mockApi({ pace });
  let board = SEED.slice();
  const boardListeners = new Set<(e: LeaderboardEntry) => void>();
  const rounds = new Map<string, Round>();
  let current: { caseId: string; ticket: number; startupName: string } | null = null;
  let started = false;
  let queue = 37;
  let n = 0;

  function push(r: Round, e: AnyEvent) {
    r.events.push(e);
    r.listeners.forEach((l) => l(e));
  }

  async function runCase() {
    const who = STARTUPS[n++ % STARTUPS.length]!;
    const sub: Submission = who.repoUrl ? { kind: "repo", repoUrl: who.repoUrl } : { kind: "text", text: who.text };
    const kase = await v1.createCase(sub);
    const t0 = Date.now() - 45_000 * pace;
    current = { caseId: kase.caseId, ticket: kase.ticket, startupName: who.startupName };
    let meter: Meter = emptyMeter();
    let tier: Tier = 1;
    let fines = 0;
    for (;;) {
      const r: Round = { events: [], done: false, listeners: new Set(), closers: new Set() };
      rounds.set(kase.caseId, r);
      const tick = setInterval(() => push(r, { type: "meanwhile", meanwhile: meanwhileAt((Date.now() - t0) / 1000 / pace) }), 5000 * pace);
      push(r, { type: "meanwhile", meanwhile: meanwhileAt((Date.now() - t0) / 1000 / pace) });
      let verdict: NoticeV2 | null = null;
      if (tier === 1 && sub.kind === "repo") {
        const stages = ["Cloning repository (in triplicate)", "Reading README in 24 official languages", "Counting .env files", "Looking for a DPIA", "Consulting the committee"];
        for (let i = 0; i < stages.length; i++) {
          push(r, { type: "analyzing", stage: stages[i]!, progress: i / stages.length });
          await sleep(1800 * pace);
        }
        push(r, { type: "analyzing", stage: "Done. Horrified.", progress: 1 });
      }
      await v1.stream(kase.caseId, (e) => {
        if (e.type === "tier") tier = e.tier;
        if (e.type === "verdict") {
          const notice: NoticeV2 = {
            ...e.notice,
            ...MOCK_TURNOVER,
            startup: who.startupName,
            applicantId: null,
            startupName: who.startupName,
            founderName: who.founderName,
            totalEur: meter.totalEur,
            totalJailMonths: meter.totalJailMonths,
            meltdown: meter.meltdown,
            tldr: [],
            recommendations: [],
            reportUrl: `/api/case/${kase.caseId}/report.pdf`,
            badgeUrl: `/api/case/${kase.caseId}/badge.png`,
            meanwhile: meanwhileAt((Date.now() - t0) / 1000 / pace),
          };
          verdict = notice;
          push(r, { type: "meanwhile", meanwhile: notice.meanwhile! });
          push(r, { type: "verdict", notice });
          return;
        }
        push(r, e);
        if (e.type !== "line") return;
        e.provisions.forEach((p, k) => {
          const f = mockFine(fines++, tier, p);
          const before = meter.meltdown;
          meter = applyFine(meter, { type: "fine", id: `${e.id}-f${k}`, provision: p, ...f, totalEur: meter.totalEur + f.amountEur, totalJailMonths: meter.totalJailMonths + f.jailMonths });
          push(r, meter.fines.at(-1)!);
          if (!before && (meter.totalEur >= MELTDOWN_EUR || meter.totalJailMonths >= MELTDOWN_JAIL_MONTHS)) {
            meter = { ...meter, meltdown: true };
            push(r, { type: "meltdown", totalEur: meter.totalEur, totalJailMonths: meter.totalJailMonths });
          }
        });
      });
      clearInterval(tick);
      r.done = true;
      r.closers.forEach((c) => c());
      if (verdict) {
        const v = verdict as NoticeV2;
        const laws = [...new Set(meter.fines.map((f) => lawOf(f.provision)))].slice(0, 3);
        const entry: LeaderboardEntry = { caseId: kase.caseId, startupName: who.startupName, founderName: who.founderName, oneLiner: who.oneLiner, photoUrl: null, totalEur: v.totalEur, totalJailMonths: v.totalJailMonths, meltdown: v.meltdown, topLaws: laws, issuedAt: v.issuedAt };
        board = [...board.filter((b) => b.caseId !== entry.caseId), entry];
        boardListeners.forEach((l) => l(entry));
        queue = Math.max(3, queue - 1);
        return;
      }
      await sleep((opts.replyDelayMs ?? 16_000) * pace);
      await v1.reply(kase.caseId, "But we are making the world a better place.");
    }
  }

  function start() {
    if (started) return;
    started = true;
    void (async () => {
      for (;;) {
        await runCase().catch((err) => console.warn("[mock] case failed", err));
        await sleep((opts.nextCaseMs ?? 30_000) * pace);
      }
    })();
    setInterval(() => (queue = Math.max(3, queue + Math.round(Math.random() * 4 - 1))), 2500);
  }

  const games: Record<GameId, { name: string; score: number }> = {
    whack: { name: "Marta", score: 12_400 },
    swipe: { name: "Jonas", score: 1_850 },
    flappy: { name: "Inès", score: 23 },
    triplicate: { name: "Pau", score: 7_200 },
  };

  return {
    mock: true,
    get board() {
      return board;
    },
    personas: async () => MOCK_PERSONAS,
    async leaderboard(sort, limit) {
      const key = sort === "jail" ? "totalJailMonths" : "totalEur";
      const list = sort === "recent" ? board.slice().sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1)) : board.slice().sort((a, b) => b[key] - a[key]);
      return list.slice(0, limit);
    },
    async leaderboardStream(onEntry, signal) {
      boardListeners.add(onEntry);
      await new Promise<void>((r) => signal.addEventListener("abort", () => r(), { once: true }));
      boardListeners.delete(onEntry);
    },
    wall: (onEntry, signal) => v1.wall(onEntry, signal),
    async stats() {
      start();
      const now = new Date();
      const sec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      return { queue, applicantsToday: 120 + board.length, meanwhileToday: meanwhileAt(sec) };
    },
    async live() {
      start();
      return current ? { ...current } : null;
    },
    async caseStream(caseId, onEvent, signal) {
      const r = rounds.get(caseId);
      if (!r) throw new Error("unknown case");
      r.events.forEach(onEvent);
      if (r.done) return;
      await new Promise<void>((resolve) => {
        const close = () => {
          r.listeners.delete(onEvent);
          r.closers.delete(close);
          resolve();
        };
        r.listeners.add(onEvent);
        r.closers.add(close);
        signal.addEventListener("abort", close, { once: true });
      });
    },
    async gameTop(game) {
      return games[game] ?? null;
    },
  };
}
