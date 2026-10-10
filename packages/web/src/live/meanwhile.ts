import type { Meanwhile } from "../contract";

export const ZERO: Meanwhile = { elapsedSec: 0, china: { models: 0, note: "" }, us: { models: 0, note: "" }, eu: { regulations: 0, forms: 0, note: "" } };

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const s = (v: unknown) => (typeof v === "string" ? v : "");

export function toMeanwhile(raw: unknown): Meanwhile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, Record<string, unknown> | undefined>;
  if (!r.china || !r.us || !r.eu) return null;
  return {
    elapsedSec: n((raw as Record<string, unknown>).elapsedSec),
    china: { models: n(r.china.models), note: s(r.china.note) },
    us: { models: n(r.us.models), note: s(r.us.note) },
    eu: { regulations: n(r.eu.regulations), forms: n(r.eu.forms), note: s(r.eu.note) },
  };
}

/** Counters never go back (ticks may arrive out of order across stream replays). Notes follow the newest tick. */
export function maxMeanwhile(a: Meanwhile, b: Meanwhile): Meanwhile {
  return {
    elapsedSec: Math.max(a.elapsedSec, b.elapsedSec),
    china: { models: Math.max(a.china.models, b.china.models), note: b.china.note || a.china.note },
    us: { models: Math.max(a.us.models, b.us.models), note: b.us.note || a.us.note },
    eu: { regulations: Math.max(a.eu.regulations, b.eu.regulations), forms: Math.max(a.eu.forms, b.eu.forms), note: b.eu.note || a.eu.note },
  };
}

/** Seconds since 00:00 in Brussels. */
export function secondsSinceMidnight(now: Date, tz = "Europe/Brussels"): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 3600 + get("minute") * 60 + get("second");
}

const DAY_NOTES = {
  china: ["several of them are smarter than this building", "one of them read the AI Act and laughed"],
  us: ["and raised more than our budget", "and lobbied us in their spare time"],
  eu: ["and a consultation on the forms", "all of them mandatory, none of them translated"],
};

/**
 * Day total when the server has no `/api/stats`: the server's average Meanwhile rates
 * (packages/server meanwhile.ts) applied to the seconds since midnight in Brussels.
 */
export function dayMeanwhile(now: Date): Meanwhile {
  const t = secondsSinceMidnight(now);
  const k = Math.floor(t / 30);
  return {
    elapsedSec: t,
    china: { models: Math.floor(1 + t / 17.5), note: DAY_NOTES.china[k % 2]! },
    us: { models: Math.floor(t / 73), note: DAY_NOTES.us[k % 2]! },
    eu: { regulations: Math.floor(2 + t / 8.8), forms: Math.floor(5 + t * 1.74), note: DAY_NOTES.eu[k % 2]! },
  };
}

export function elapsedText(sec: number): string {
  const t = Math.max(0, Math.floor(sec));
  if (t >= 3600) return `${Math.floor(t / 3600)} h ${Math.floor((t % 3600) / 60)} min`;
  return t >= 60 ? `${Math.floor(t / 60)} min ${t % 60} s` : `${t} s`;
}
