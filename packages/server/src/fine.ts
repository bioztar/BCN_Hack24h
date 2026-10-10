import { pick, seeded } from "./seed.js";
/** Fine ceilings, whichever is higher: AI Act Art. 99(3) €35M / 7 %, GDPR Art. 83(5) €20M / 4 %. */
export interface Fine {
  fineEur: number;
  fineBasis: string;
  regime: "ai-act" | "gdpr";
}

export const AI_ACT_BASIS = "€35M or 7% of worldwide turnover, whichever is higher — AI Act Art. 99(3)";
export const GDPR_BASIS = "€20M or 4% of worldwide turnover, whichever is higher — GDPR Art. 83(5)";

/** The worst finding decides the regime: any AI Act provision beats GDPR (and everything else). */
export function calculateFine(revenueEur: number | undefined | null, provisionIds: string[]): Fine {
  const revenue = Number.isFinite(revenueEur) && (revenueEur as number) > 0 ? (revenueEur as number) : 0;
  const aiAct = provisionIds.some((id) => id.startsWith("ai-act-"));
  if (aiAct) return { fineEur: Math.round(Math.max(35_000_000, revenue * 0.07)), fineBasis: AI_ACT_BASIS, regime: "ai-act" };
  return { fineEur: Math.round(Math.max(20_000_000, revenue * 0.04)), fineBasis: GDPR_BASIS, regime: "gdpr" };
}

const UNITS: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, mn: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

/** Deterministic fallback when the model is unavailable: "€2.5M ARR", "revenue of 300k euros". */
export function extractRevenueHeuristic(text: string): number | null {
  const re = /(?:€|eur\s*|\$|usd\s*|£)?\s*(\d+(?:[.,]\d+)?)\s*(k|m|mm|mn|b|bn|thousand|million|billion)?\s*(?:€|eur(?:os?)?|\$|dollars?|usd|£)?\s*(?:in\s+)?(?:arr|mrr|revenue|turnover|sales|a year|per year|annual)/gi;
  let best: number | null = null;
  for (const m of text.matchAll(re)) {
    if (!/[€$£]|eur|usd|dollar|k|m|b|thousand|million|billion/i.test(m[0])) continue;
    let n = Number(m[1]!.replace(",", "."));
    n *= UNITS[(m[2] ?? "").toLowerCase()] ?? 1;
    if (/mrr/i.test(m[0])) n *= 12;
    if (Number.isFinite(n) && (best === null || n > best)) best = n;
  }
  return best;
}

// ───────────── v2: per-provision fines meter (CONTRACT v2 "Fines model") ─────────────

/** The real statutory ceiling a provision is fined under: max(capEur, pct × worldwide turnover). */
export interface Statute {
  /** Short law label for the leaderboard / TL;DR ("AI Act", "GDPR"). */
  law: string;
  basis: string;
  capEur: number;
  pct: number;
  /** Voluntary standards are fined through the statute that makes them bite. */
  via?: string;
}

/** Real national criminal provisions (GDPR offences are criminalised nationally, not by the EU). */
export interface Jail {
  months: number;
  basis: string;
}

const AI_ACT_5: Statute = { law: "AI Act", basis: "AI Act Art. 99(3)", capEur: 35_000_000, pct: 0.07 };
const AI_ACT_OBL: Statute = { law: "AI Act", basis: "AI Act Art. 99(4)", capEur: 15_000_000, pct: 0.03 };
const AI_ACT_INFO: Statute = { law: "AI Act", basis: "AI Act Art. 99(5)", capEur: 7_500_000, pct: 0.01 };
const AI_ACT_GPAI: Statute = { law: "AI Act", basis: "AI Act Art. 101(1)", capEur: 15_000_000, pct: 0.03 };
const GDPR_HIGH: Statute = { law: "GDPR", basis: "GDPR Art. 83(5)", capEur: 20_000_000, pct: 0.04 };
const GDPR_LOW: Statute = { law: "GDPR", basis: "GDPR Art. 83(4)", capEur: 10_000_000, pct: 0.02 };
const NIS2: Statute = { law: "NIS2", basis: "NIS2 Art. 34(4)", capEur: 10_000_000, pct: 0.02 };

/** GDPR Art. 83(5)(a)–(c): principles, lawful basis, consent, special categories, data-subject rights, transfers. */
const GDPR_83_5 = new Set([5, 6, 7, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 44, 45, 46, 47, 48, 49, 58]);
const AI_ACT_GPAI_ARTS = new Set([51, 52, 53, 54, 55, 56]);

const num = (id: string, prefix: string): number | null => {
  const m = new RegExp(`^${prefix}-(\\d+)`).exec(id);
  return m ? Number(m[1]) : null;
};

/** The penalty articles themselves are never fined (citing Art. 99 is not a violation of Art. 99). */
const PENALTY_ARTICLES = new Set(["ai-act-99", "ai-act-100", "ai-act-101", "gdpr-83", "gdpr-84", "nis2-34", "nis2-35", "nis2-36", "dora-50", "dora-51"]);
export const isPenaltyArticle = (provisionId: string): boolean => PENALTY_ARTICLES.has(provisionId.toLowerCase());

/** Statutory ceiling for a cited provision; null = not fineable (penalty articles; DORA, whose only EU-level figure is the CTPP periodic penalty). */
export function statuteFor(provisionId: string): Statute | null {
  const id = provisionId.toLowerCase();
  if (isPenaltyArticle(id)) return null;
  if (id.startsWith("ai-act-")) {
    const n = num(id, "ai-act");
    if (n === 5) return AI_ACT_5;
    if (n !== null && AI_ACT_GPAI_ARTS.has(n)) return AI_ACT_GPAI;
    if (n === 21) return AI_ACT_INFO;
    return AI_ACT_OBL;
  }
  if (id.startsWith("gdpr-")) {
    const n = num(id, "gdpr");
    return n !== null && GDPR_83_5.has(n) ? GDPR_HIGH : GDPR_LOW;
  }
  if (id.startsWith("nis2-")) return NIS2;
  if (id.startsWith("dora-")) return null;
  // Not in the corpus yet; ready for when they are cited.
  if (id.startsWith("dsa-")) return { law: "DSA", basis: "DSA Art. 74(1)", capEur: 0, pct: 0.06 };
  if (id.startsWith("dma-")) return { law: "DMA", basis: "DMA Art. 30(1)", capEur: 0, pct: 0.1 };
  if (id.startsWith("cra-")) return { law: "CRA", basis: "CRA Art. 64(2)", capEur: 15_000_000, pct: 0.025 };
  if (id.startsWith("data-act-")) return { law: "Data Act", basis: "Data Act Art. 40(4) → GDPR Art. 83", capEur: 20_000_000, pct: 0.04 };
  if (id.startsWith("eprivacy-")) return { law: "ePrivacy", basis: "ePrivacy Dir. Art. 15a (national penalties)", capEur: 10_000_000, pct: 0.02 };
  if (id.startsWith("iso27001-") || id.startsWith("soc2-")) return { ...GDPR_LOW, via: "GDPR Art. 32 (security of processing)" };
  return { ...AI_ACT_OBL, via: "AI Act Art. 15 (accuracy, robustness, cybersecurity)" };
}

/**
 * Real national criminal offences for GDPR breaches. One jurisdiction per case (seeded): DE BDSG §42 (unlawful
 * processing of non-public personal data, up to 3 y) or FR Code pénal 226-18 (unlawful collection/processing),
 * 226-19 (special categories), 226-17 (no security measures), 226-22-1 (unlawful transfer) — each up to 5 y.
 * Every other article carries no jail.
 */
export function jailFor(caseId: string, provisionId: string): Jail | null {
  const n = num(provisionId.toLowerCase(), "gdpr");
  if (n === null) return null;
  const de = seeded(caseId, "jurisdiction")() < 0.5;
  if (de) return [5, 6, 7, 9, 10].includes(n) ? { months: 36, basis: "DE BDSG §42" } : null;
  if ([5, 6, 7].includes(n)) return { months: 60, basis: "FR Code pénal art. 226-18" };
  if ([9, 10].includes(n)) return { months: 60, basis: "FR Code pénal art. 226-19" };
  if (n === 32) return { months: 60, basis: "FR Code pénal art. 226-17" };
  if (n >= 44 && n <= 49) return { months: 60, basis: "FR Code pénal art. 226-22-1" };
  return null;
}

/** Findings that justify the comedy escalation: prohibited practices, special-category data, high-risk Annex III. */
const SEVERE = /^(ai-act-5|gdpr-9|gdpr-10|ai-act-annex-iii.*)$/;
export const isSevere = (provisionId: string): boolean => SEVERE.test(provisionId.toLowerCase());

/** Escalation per tier on top of the real ceiling: severe findings ×1, ×3, ×9, ×27, ×81 (meltdown territory); the rest ×1 … ×1.6. */
export const tierMultiplier = (tier: number, severe = false): number => {
  const t = Math.min(5, Math.max(1, tier)) - 1;
  return severe ? 3 ** t : 1 + 0.15 * t;
};

export const shortEur = (n: number): string =>
  n >= 1e9 ? `€${+(n / 1e9).toFixed(2)}bn` : n >= 1e6 ? `€${+(n / 1e6).toFixed(1)}M` : `€${Math.round(n).toLocaleString("en-GB")}`;

const CAPTIONS: readonly string[] = [
  "{label}: statutory maximum {cap}. The Ministry treats this as an opening offer.",
  "Fined under {basis}. Payable in triplicate, in person, in Luxembourg, on a Sunday.",
  "{label}. Proportionate, as certified by the Directorate for the Proportionality of Proportionality.",
  "{basis}: 'whichever is higher'. It is always the higher one.",
  "{label}. You may appeal; the appeal form is itself a breach of {label}.",
  "{label}. Interest accrues from the moment you had the idea.",
  "Ceiling {cap} under {basis}. Your ceiling, our floor.",
  "{label}. Approved by 27 member states and the cat that lives in the Berlaymont.",
  "{label}. Ministry surcharge ×{mult} applied — regulation is Europe's only growth industry.",
  "{label}. The fine has been translated into 24 languages; each translation is billed separately.",
];
const VIA_CAPTIONS: readonly string[] = [
  "{label} is voluntary. The fine, via {via}, is not.",
  "{label}: a standard, not a law. We found a law. {via}.",
];
const JAIL_CAPTIONS: readonly string[] = [
  "{label} — plus {jail} under {jailBasis}. Bring the deck; the cell has a projector.",
  "{label}. {jailBasis}: {jail}. Your cap table now includes a cellmate.",
  "{label}. {jailBasis} allows {jail}. Good behaviour adds paperwork, not parole.",
];
const REPEAT_CAPTIONS: readonly string[] = ["{label} again. Repeat-offender discount: none.", "{label}, second count. The officers enjoyed it the first time."];

export interface FineItem {
  id: string;
  provisionId: string;
  law: string;
  amountEur: number;
  jailMonths: number;
  /** National offence the jail months are under; each offence is sentenced once per case. */
  jailBasis?: string;
  caption: string;
}

export interface FineMeter {
  items: FineItem[];
  totalEur: number;
  totalJailMonths: number;
  meltdown: boolean;
}

export const emptyMeter = (): FineMeter => ({ items: [], totalEur: 0, totalJailMonths: 0, meltdown: false });

const years = (m: number) => (m % 12 === 0 ? `${m / 12} year${m === 12 ? "" : "s"}` : `${m} months`);

/**
 * One fine for one cited provision (null = not fineable): a seeded share (35–100 %) of the real ceiling, times the
 * tier multiplier; repeats of a non-severe finding cost a quarter. Jail: a seeded share (30–100 %) of the national
 * maximum, never above it, once per offence per case.
 */
export function provisionFine(o: { caseId: string; index: number; provisionId: string; label: string; tier: number; revenueEur: number; repeat: boolean; jailBases?: ReadonlySet<string> }): Omit<FineItem, "id"> | null {
  const s = statuteFor(o.provisionId);
  if (!s) return null;
  const rand = seeded(o.caseId, "fine", o.index, o.provisionId);
  const revenue = Number.isFinite(o.revenueEur) && o.revenueEur > 0 ? o.revenueEur : 0;
  // Turnover-only regimes (DSA, DMA) assume a €100M turnover when none was given, so the meter still moves.
  const ceiling = Math.max(s.capEur, s.pct * (revenue || (s.capEur ? 0 : 100_000_000)));
  const severe = isSevere(o.provisionId);
  const mult = tierMultiplier(o.tier, severe);
  const amountEur = Math.round(ceiling * (0.35 + 0.65 * rand()) * mult * (o.repeat && !severe ? 0.25 : 1));
  const statutoryJail = jailFor(o.caseId, o.provisionId);
  const jail = statutoryJail && !o.jailBases?.has(statutoryJail.basis) ? statutoryJail : null;
  const jailMonths = jail ? Math.min(jail.months, Math.max(1, Math.round(jail.months * (0.3 + 0.7 * rand())))) : 0;
  const list = o.repeat ? REPEAT_CAPTIONS : jail ? JAIL_CAPTIONS : s.via ? VIA_CAPTIONS : CAPTIONS;
  const caption = pick(list, rand)
    .replaceAll("{label}", o.label)
    .replaceAll("{basis}", s.basis)
    .replaceAll("{cap}", !s.capEur ? `${+(s.pct * 100).toFixed(1)}% of turnover` : s.pct ? `${shortEur(s.capEur)} or ${+(s.pct * 100).toFixed(1)}% of turnover` : shortEur(s.capEur))
    .replaceAll("{via}", s.via ?? "")
    .replaceAll("{mult}", String(+mult.toFixed(2)))
    .replaceAll("{jail}", jail ? `${years(jailMonths)} (maximum ${years(jail.months)})` : "")
    .replaceAll("{jailBasis}", jail?.basis ?? "");
  return { provisionId: o.provisionId, law: s.law, amountEur, jailMonths, ...(jail ? { jailBasis: jail.basis } : {}), caption };
}

/** Adds a fine to the meter; returns the item and whether this one crossed the meltdown threshold. */
export function addFine(meter: FineMeter, item: FineItem, thresholds: { eur: number; jailMonths: number }): { crossed: boolean } {
  meter.items.push(item);
  meter.totalEur += item.amountEur;
  meter.totalJailMonths += item.jailMonths;
  const crossed = !meter.meltdown && (meter.totalEur >= thresholds.eur || meter.totalJailMonths >= thresholds.jailMonths);
  if (crossed) meter.meltdown = true;
  return { crossed };
}

/** Up to three laws by fined amount, e.g. ["AI Act", "GDPR"]. */
export function topLaws(meter: FineMeter, n = 3): string[] {
  const by = new Map<string, number>();
  for (const i of meter.items) by.set(i.law, (by.get(i.law) ?? 0) + i.amountEur);
  return [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([l]) => l);
}
