import type { LeaderboardEntry, LeaderboardSort } from "./types";

const t = (e: LeaderboardEntry) => Date.parse(e.issuedAt) || 0;

export function compareEntries(sort: LeaderboardSort): (a: LeaderboardEntry, b: LeaderboardEntry) => number {
  if (sort === "jail") return (a, b) => b.totalJailMonths - a.totalJailMonths || b.totalEur - a.totalEur || t(b) - t(a);
  if (sort === "recent") return (a, b) => t(b) - t(a) || b.totalEur - a.totalEur;
  return (a, b) => b.totalEur - a.totalEur || b.totalJailMonths - a.totalJailMonths || t(b) - t(a);
}

export function sortEntries(entries: LeaderboardEntry[], sort: LeaderboardSort): LeaderboardEntry[] {
  return [...entries].sort(compareEntries(sort));
}

/** Dedupe by caseId (newer data wins), then sort and cap. */
export function mergeEntries(existing: LeaderboardEntry[], incoming: LeaderboardEntry[], sort: LeaderboardSort, limit = 50): LeaderboardEntry[] {
  const by = new Map<string, LeaderboardEntry>();
  for (const e of existing) by.set(e.caseId, e);
  for (const e of incoming) if (e && typeof e.caseId === "string") by.set(e.caseId, e);
  return sortEntries([...by.values()], sort).slice(0, limit);
}

export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "?") + (w[1]?.[0] ?? "")).toUpperCase();
}
