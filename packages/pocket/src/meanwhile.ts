import type { Meanwhile } from "./types";

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic 0..1 from a string. */
export function rand01(s: string): number {
  return (hashSeed(s) % 100_000) / 100_000;
}

const CHINA = ["one of them achieved superintelligence", "two of them are already regulating Europe", "one of them wrote this sentence", "one of them now runs a province", "all of them open-weight"];
const US = ["and raised $40 bn", "and a podcast about it", "and lobbied against all of yours", "and IPO'd one of them before lunch", "and a data centre the size of Belgium"];
const EU = ["you now have to fill in to start your startup", "you need all of them to open a bank account", "each in 24 languages, none of them yours", "three of them about forms", "one of them bans the other 26"];

/**
 * Client-side preview of the counter (queue screen, before the server's case stream
 * exists; also the mock server). Monotonic in elapsedSec. China ≫ US; forms ≫ regulations.
 */
export function estimateMeanwhile(seed: string, elapsedSec: number): Meanwhile {
  const s = Math.max(0, elapsedSec);
  const k = 0.8 + 0.4 * rand01(seed);
  const pick = (list: string[], salt: string) => list[hashSeed(seed + salt) % list.length]!;
  return {
    elapsedSec: Math.round(s),
    china: { models: Math.floor((s / 21) * k), note: pick(CHINA, "cn") },
    us: { models: Math.floor((s / 80) * k), note: pick(US, "us") },
    eu: { regulations: Math.floor((s / 9) * k), forms: Math.floor(s * 1.65 * k), note: pick(EU, "eu") },
  };
}

/** Field-wise max (counters never go down on screen). Notes come from `b` when present. */
export function maxMeanwhile(a: Meanwhile | null, b: Meanwhile): Meanwhile {
  if (!a) return b;
  return {
    elapsedSec: Math.max(a.elapsedSec, b.elapsedSec),
    china: { models: Math.max(a.china.models, b.china.models), note: b.china.note || a.china.note },
    us: { models: Math.max(a.us.models, b.us.models), note: b.us.note || a.us.note },
    eu: { regulations: Math.max(a.eu.regulations, b.eu.regulations), forms: Math.max(a.eu.forms, b.eu.forms), note: b.eu.note || a.eu.note },
  };
}

export function formatElapsed(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return m ? `${m} min ${s % 60} s` : `${s} s`;
}

const n = (x: number) => x.toLocaleString("en-GB");

/** "🇨🇳 11 AI models · 🇺🇸 3 · 🇪🇺 27 regulations + 412 forms" */
export function meanwhileLine(m: Meanwhile): string {
  return `🇨🇳 ${n(m.china.models)} AI models · 🇺🇸 ${n(m.us.models)} · 🇪🇺 ${n(m.eu.regulations)} regulations + ${n(m.eu.forms)} forms`;
}

/** The verdict card's paragraph, as [country, sentence] rows. */
export function meanwhileRows(m: Meanwhile): { flag: string; who: string; text: string }[] {
  const pl = (x: number, w: string) => `${n(x)} new ${w}${x === 1 ? "" : "s"}`;
  return [
    { flag: "🇨🇳", who: "China", text: `built ${pl(m.china.models, "AI model")} — ${m.china.note}.` },
    { flag: "🇺🇸", who: "The US", text: `built ${n(m.us.models)} ${m.us.note}.` },
    { flag: "🇪🇺", who: "Europe", text: `adopted ${pl(m.eu.regulations, "regulation")} and ${n(m.eu.forms)} forms ${m.eu.note}.` },
  ];
}
