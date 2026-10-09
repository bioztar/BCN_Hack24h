import { MELTDOWN_EUR, MELTDOWN_JAIL_MONTHS } from "./types";

export function formatEurFull(n: number): string {
  return `€${Math.max(0, Math.round(n)).toLocaleString("en-GB")}`;
}

/** €1.24 bn · €35.0 M · €912 k · €0 */
export function formatEurShort(n: number): string {
  const v = Math.max(0, n);
  if (v >= 1e12) return `€${(v / 1e12).toFixed(2)} tn`;
  if (v >= 1e9) return `€${(v / 1e9).toFixed(2)} bn`;
  if (v >= 1e6) return `€${(v / 1e6).toFixed(1)} M`;
  if (v >= 1e3) return `€${Math.round(v / 1e3)} k`;
  return `€${Math.round(v)}`;
}

/** 0 → "0 months", 4 → "4 months", 38 → "3 yrs 2 mo", 1236 → "103 years". */
export function formatJail(months: number): string {
  const m = Math.max(0, Math.round(months));
  if (m < 12) return `${m} month${m === 1 ? "" : "s"}`;
  const y = Math.floor(m / 12);
  const r = m % 12;
  if (y >= 100 || r === 0) return `${y.toLocaleString("en-GB")} year${y === 1 ? "" : "s"}`;
  return `${y} yr${y === 1 ? "" : "s"} ${r} mo`;
}

export function meltdownCrossed(eur: number, jailMonths: number): boolean {
  return eur >= MELTDOWN_EUR || jailMonths >= MELTDOWN_JAIL_MONTHS;
}

/** Share of the way to meltdown, 0..1 (whichever threshold is closer). */
export function meltdownProgress(eur: number, jailMonths: number): number {
  return Math.min(1, Math.max(eur / MELTDOWN_EUR, jailMonths / MELTDOWN_JAIL_MONTHS, 0));
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** A number that runs up to its target; targets only ever go up (server totals are monotonic). */
export class Tween {
  private from = 0;
  private to = 0;
  private start = 0;
  constructor(private readonly durMs = 1400) {}
  get target(): number { return this.to; }
  set(target: number, now: number): boolean {
    if (target <= this.to) return false;
    this.from = this.value(now);
    this.to = target;
    this.start = now;
    return true;
  }
  progress(now: number): number {
    return this.to === this.from ? 1 : Math.min(1, (now - this.start) / this.durMs);
  }
  value(now: number): number {
    return this.from + (this.to - this.from) * easeOutCubic(this.progress(now));
  }
  reset(): void {
    this.from = this.to = this.start = 0;
  }
}

/**
 * Slot-machine rendering of `text` (e.g. "€1,240,000,000"): digits settle left → right as
 * progress goes 0 → 1; unsettled digits spin. At progress 1 it is exactly `text`.
 */
export function slotText(text: string, progress: number, rnd: () => number = Math.random): string {
  if (progress >= 1) return text;
  const digits = [...text].filter((c) => c >= "0" && c <= "9").length;
  let k = 0;
  let out = "";
  for (const c of text) {
    if (c < "0" || c > "9") {
      out += c;
      continue;
    }
    const settleAt = 0.15 + (0.8 * (k + 1)) / Math.max(1, digits);
    out += progress >= settleAt ? c : String(Math.floor(rnd() * 10));
    k++;
  }
  return out;
}
