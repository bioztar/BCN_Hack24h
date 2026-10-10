import { rand01 } from "./meanwhile";
import type { FineEvent, Provision, Tier } from "./types";

// Mock-server mirror of the CONTRACT v2 fines model (the real numbers come from the server).

export interface Statutory { eur: number; pct: number; jailMonths: number; basis: string; }

/** Real statutory maxima (AI Act Art. 99, GDPR Art. 83, NIS2 Art. 34, …) + national criminal law where it exists. */
export function statutoryMax(provisionId: string): Statutory {
  const id = provisionId.toLowerCase();
  const art = Number(id.match(/-(\d+)/)?.[1] ?? NaN);
  if (id.startsWith("ai-act")) {
    if (art === 5) return { eur: 35e6, pct: 0.07, jailMonths: 0, basis: "AI Act Art. 99(3)" };
    return { eur: 15e6, pct: 0.03, jailMonths: 0, basis: "AI Act Art. 99(4)" };
  }
  if (id.startsWith("gdpr")) {
    const top = [5, 6, 7, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 44, 45, 46, 47, 48, 49].includes(art);
    return { eur: top ? 20e6 : 10e6, pct: top ? 0.04 : 0.02, jailMonths: 36, basis: `GDPR Art. 83(${top ? 5 : 4}) + BDSG §42` };
  }
  if (id.startsWith("nis2")) return { eur: 10e6, pct: 0.02, jailMonths: 0, basis: "NIS2 Art. 34" };
  if (id.startsWith("cra")) return { eur: 15e6, pct: 0.025, jailMonths: 0, basis: "CRA Art. 64" };
  if (id.startsWith("dsa")) return { eur: 0, pct: 0.06, jailMonths: 0, basis: "DSA Art. 52" };
  if (id.startsWith("dma")) return { eur: 0, pct: 0.1, jailMonths: 0, basis: "DMA Art. 30" };
  if (id.startsWith("eprivacy")) return { eur: 1e6, pct: 0, jailMonths: 60, basis: "national ePrivacy law + Code pénal art. 226-16" };
  return { eur: 5e6, pct: 0.01, jailMonths: 0, basis: "national law (probably)" };
}

/** Comedy scaling as the tier rises. */
export const TIER_EUR_SCALE = [1, 3, 10, 40, 150] as const;
export const TIER_JAIL_SCALE = [1, 2, 4, 8, 16] as const;

const CAPTIONS = [
  "{law}: {amt} for breathing near personal data",
  "{law}: {amt}. Payable in triplicate.",
  "{law}: {amt}, or 7% of your hopes",
  "{law}: {amt} — the stamp alone costs extra",
  "{law}: {amt}. Interest accrues per committee meeting.",
  "{law}: {amt} and a sternly worded letter",
];

export interface Totals { eur: number; jail: number; }

export function mockFine(caseId: string, provision: Provision, tier: Tier, totals: Totals, revenueEur = 0, n = 0): FineEvent {
  const st = statutoryMax(provision.id);
  const share = 0.35 + 0.6 * rand01(`${caseId}|${provision.id}|${tier}|${n}`);
  const base = Math.max(st.eur, st.pct * Math.max(0, revenueEur));
  const amountEur = Math.round((base * share * TIER_EUR_SCALE[tier - 1]!) / 1000) * 1000;
  const jailMonths = Math.round(st.jailMonths * share * TIER_JAIL_SCALE[tier - 1]!);
  totals.eur += amountEur;
  totals.jail += jailMonths;
  const tpl = CAPTIONS[Math.floor(rand01(`${caseId}|cap|${n}`) * CAPTIONS.length)]!;
  const amt = `€${amountEur.toLocaleString("en-GB")}${jailMonths ? ` + ${jailMonths} months` : ""}`;
  return {
    type: "fine",
    id: `fine-${caseId}-${n}`,
    provision,
    amountEur,
    jailMonths,
    totalEur: totals.eur,
    totalJailMonths: totals.jail,
    caption: tpl.replace("{law}", provision.label).replace("{amt}", amt),
  };
}

/** "GDPR Art. 5" → "GDPR"; "AI Act Annex III" → "AI Act"; "ePrivacy Dir. Art. 5" → "ePrivacy". */
export function lawOf(label: string): string {
  return label.replace(/\s+(Dir\.|Reg\.)?\s*(Art\.|Annex|Recital|Article|cl\.|§).*$/i, "").trim() || label;
}
