import { MELTDOWN_EUR, MELTDOWN_JAIL_MONTHS, type RoastEventV2 } from "../contract";

export type FineEvent = Extract<RoastEventV2, { type: "fine" }>;
export type MeltdownEvent = Extract<RoastEventV2, { type: "meltdown" }>;

/** The fines meter as the stage shows it: server totals, never going down, each fine once. */
export interface Meter {
  totalEur: number;
  totalJailMonths: number;
  meltdown: boolean;
  fines: FineEvent[];
}

export function emptyMeter(): Meter {
  return { totalEur: 0, totalJailMonths: 0, meltdown: false, fines: [] };
}

const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0);

/** Applies a `fine` event. Duplicates (stream replays) are ignored; totals are the server's, monotonic. */
export function applyFine(m: Meter, e: FineEvent): Meter {
  if (m.fines.some((f) => f.id === e.id)) return m;
  const totalEur = Math.max(m.totalEur, num(e.totalEur));
  const totalJailMonths = Math.max(m.totalJailMonths, num(e.totalJailMonths));
  return { ...m, totalEur, totalJailMonths, fines: [...m.fines, e] };
}

export function applyMeltdown(m: Meter, e: MeltdownEvent): Meter {
  return { ...m, meltdown: true, totalEur: Math.max(m.totalEur, num(e.totalEur)), totalJailMonths: Math.max(m.totalJailMonths, num(e.totalJailMonths)) };
}

/** 0..1 towards the meltdown — whichever threshold is closer (CONTRACT v2: "whichever first"). */
export function meltdownProgress(m: Pick<Meter, "totalEur" | "totalJailMonths" | "meltdown">): number {
  if (m.meltdown) return 1;
  return Math.min(1, Math.max(m.totalEur / MELTDOWN_EUR, m.totalJailMonths / MELTDOWN_JAIL_MONTHS, 0));
}

function trim(n: number, digits: number): string {
  return n.toFixed(digits).replace(/\.0+$|(\.\d*?)0+$/, "$1");
}

/** "€0", "€950", "€12.5 k", "€35 M", "€1.24 bn", "€3,400 bn". */
export function fmtEurShort(n: number): string {
  const v = Math.max(0, Math.round(num(n)));
  if (v >= 1e9) return `€${v >= 1e12 ? new Intl.NumberFormat("en-GB").format(Math.round(v / 1e9)) : trim(v / 1e9, v >= 1e11 ? 0 : 2)} bn`;
  if (v >= 1e6) return `€${trim(v / 1e6, v >= 1e8 ? 0 : 1)} M`;
  if (v >= 1e4) return `€${trim(v / 1e3, 1)} k`;
  return `€${new Intl.NumberFormat("en-GB").format(v)}`;
}

/** "no jail", "8 months", "1 year", "3 years 4 months", "104 years". */
export function fmtJail(months: number): string {
  const m = Math.max(0, Math.round(num(months)));
  if (m === 0) return "no jail";
  const y = Math.floor(m / 12);
  const r = m % 12;
  const ys = y === 1 ? "1 year" : `${y} years`;
  const ms = r === 1 ? "1 month" : `${r} months`;
  if (y === 0) return ms;
  if (r === 0 || y >= 20) return ys;
  return `${ys} ${ms}`;
}
