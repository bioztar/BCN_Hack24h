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
