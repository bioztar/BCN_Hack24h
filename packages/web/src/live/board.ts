import type { LeaderboardEntry, LeaderboardSort } from "../contract";

export type BoardSort = Exclude<LeaderboardSort, "recent">;

const str = (v: unknown) => (typeof v === "string" ? v : null);
const nonneg = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** Wire → entry; null if it is not a leaderboard entry (SSE pings, junk). */
export function toEntry(raw: unknown): LeaderboardEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const caseId = str(r.caseId);
  const startupName = str(r.startupName);
  if (!caseId || !startupName) return null;
  return {
    caseId,
    startupName,
    founderName: str(r.founderName),
    oneLiner: str(r.oneLiner),
    photoUrl: str(r.photoUrl),
    totalEur: nonneg(r.totalEur),
    totalJailMonths: nonneg(r.totalJailMonths),
    meltdown: r.meltdown === true,
    topLaws: Array.isArray(r.topLaws) ? r.topLaws.filter((x): x is string => typeof x === "string").slice(0, 3) : [],
    issuedAt: str(r.issuedAt) ?? new Date(0).toISOString(),
  };
}

/** Insert or replace by caseId. */
export function upsert(list: LeaderboardEntry[], e: LeaderboardEntry): LeaderboardEntry[] {
  const i = list.findIndex((x) => x.caseId === e.caseId);
  if (i < 0) return [...list, e];
  const next = list.slice();
  next[i] = e;
  return next;
}

/** Same order as the server: the sort key desc, then the other total, then newest first, then caseId. */
export function compare(sort: BoardSort): (a: LeaderboardEntry, b: LeaderboardEntry) => number {
  const [k1, k2] = sort === "jail" ? (["totalJailMonths", "totalEur"] as const) : (["totalEur", "totalJailMonths"] as const);
  return (a, b) => b[k1] - a[k1] || b[k2] - a[k2] || (a.issuedAt < b.issuedAt ? 1 : a.issuedAt > b.issuedAt ? -1 : 0) || (a.caseId < b.caseId ? 1 : a.caseId > b.caseId ? -1 : 0);
}

export function top(list: LeaderboardEntry[], sort: BoardSort, n = 10): LeaderboardEntry[] {
  return list.slice().sort(compare(sort)).slice(0, n);
}

/** Up/down movement per caseId between two rankings (positive = climbed). New entries are absent. */
export function moves(before: string[], after: string[]): Map<string, number> {
  const out = new Map<string, number>();
  after.forEach((id, i) => {
    const j = before.indexOf(id);
    if (j >= 0 && j !== i) out.set(id, j - i);
  });
  return out;
}

/** Same calendar day in Brussels. */
export function sameDay(iso: string, now: Date, tz = "Europe/Brussels"): boolean {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(d) === f.format(now);
}

/**
 * The ticker keeps the funniest recent captions: rough score = punchline length sweet spot +
 * bureaucratic vocabulary + numbers. Deterministic, so the ticker does not shuffle on every update.
 */
const FUNNY = /\b(form|triplicate|annex|stamp|sandbox|consult|committee|delegated|harmoni[sz]ed|queue|lost|fax|strasbourg|brussels|always|meanwhile|china|regulat\w*|article|prohibit\w*|banned?)\b/gi;
export function funniness(text: string): number {
  const len = text.length;
  const shape = len < 25 ? -3 : len <= 140 ? 3 : len <= 220 ? 1 : -2;
  const vocab = Math.min(4, (text.match(FUNNY) ?? []).length);
  const digits = /\d/.test(text) ? 1 : 0;
  const punch = /[.!?]\s+\S.*[.!?]$/.test(text.trim()) ? 1 : 0;
  return shape + vocab + digits + punch;
}

export interface Caption {
  text: string;
  at: number;
}

export function pushCaption(list: Caption[], text: string, at: number, max = 40): Caption[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || list.some((c) => c.text === t)) return list;
  return [...list, { text: t, at }].slice(-max);
}

/** The n funniest, newest wins ties; returned in arrival order for a stable marquee. */
export function tickerPick(list: Caption[], n = 12): Caption[] {
  const ranked = list.slice().sort((a, b) => funniness(b.text) - funniness(a.text) || b.at - a.at).slice(0, n);
  return ranked.sort((a, b) => a.at - b.at);
}
