/** "While you were being processed" (CONTRACT v2 "Meanwhile"): deterministic per case, monotonic in elapsed time. */
import type { Meanwhile } from "@dg-roast/shared";
import { seeded } from "./seed.js";

const CHINA_NOTES = [
  "one of them achieved superintelligence",
  "one of them is already AI-Act compliant, out of spite",
  "one of them filed your patent, in your name, in Shenzhen",
  "all open-weights, all trained on our public consultations",
  "the smallest one now runs your former competitor",
];
const US_NOTES = ["and raised ${BN} bn", "and raised ${BN} bn — one of them is now lobbying us", "and raised ${BN} bn before lunch", "and raised ${BN} bn on a deck shorter than your cover letter"];
const EU_NOTES = [
  "you need all of them to open a bank account",
  "each requires the previous one, in triplicate",
  "the forms come with a form to request the forms",
  "one of them regulates the other twenty-six",
  "none of them are available in English yet",
];

/** Seconds per new note: the quips rotate while the counters tick. */
const ROTATE_SEC = 20;

export function meanwhileAt(key: string, elapsedSec: number): Meanwhile {
  const t = Math.max(0, Math.floor(elapsedSec));
  const r = seeded(key, "meanwhile");
  const jitter = () => 0.8 + 0.45 * r();
  const china = Math.floor(1 + (t / 18) * jitter());
  const us = Math.max(1, Math.floor((t / 75) * jitter()));
  const regulations = Math.floor(2 + (t / 9) * jitter());
  const forms = Math.floor(5 + t * 1.7 * jitter());
  const bnPerModel = 9 + Math.floor(r() * 9);
  const offset = Math.floor(r() * 100);
  const slot = offset + Math.floor(t / ROTATE_SEC);
  const at = <T,>(list: readonly T[], k: number) => list[(slot + k) % list.length]!;
  return {
    elapsedSec: t,
    china: { models: china, note: at(CHINA_NOTES, 0) },
    us: { models: us, note: at(US_NOTES, 1).replace("{BN}", String(5 + us * bnPerModel)) },
    eu: { regulations, forms, note: at(EU_NOTES, 2) },
  };
}

export const elapsedText = (sec: number): string => (sec >= 60 ? `${Math.floor(sec / 60)} min ${sec % 60} s` : `${sec} s`);

/** The tier-5 closing line, spoken. Also the deterministic fallback when the model does not deliver it. */
export function meanwhileLine(m: Meanwhile): string {
  const c = m.china.models === 1 ? "one new AI model" : `${m.china.models} new AI models`;
  const u = m.us.models === 1 ? "one" : String(m.us.models);
  return `Meanwhile, while you were being processed, China built ${c}, ${m.china.note}. The United States built ${u}, ${m.us.note}. Europe adopted ${m.eu.regulations} new regulations and ${m.eu.forms} forms. We built you a form.`;
}

export const isMeanwhileLine = (text: string): boolean => /\bmeanwhile\b/i.test(text) && /\bchina\b/i.test(text);

export function meanwhilePrompt(m: Meanwhile): string {
  return `MEANWHILE (final numbers, state them exactly): while the pitcher was being processed (${elapsedText(m.elapsedSec)}), China built ${m.china.models} new AI models (${m.china.note}); the US built ${m.us.models} (${m.us.note}); Europe adopted ${m.eu.regulations} new regulations and ${m.eu.forms} forms the pitcher now has to fill in. The LAST line of this round is the closing line: it starts with "Meanwhile", delivers these numbers in the speaker's own voice, carries a stamp, clip "verdict".`;
}
