/** "Meanwhile" joke for the end screen: what the rest of the world shipped during your round. */
import { pick, rngFor } from "./rng.js";

export interface Meanwhile {
  china: number;
  us: number;
  usRaisedBn: number;
  regulations: number;
  forms: number;
  chinaNote: string;
  line: string;
}

const CN_NOTES = [
  "one of them achieved superintelligence",
  "one of them is open-weights and runs on a toaster",
  "one of them already passed the EU AI Act exam",
  "one of them now writes our forms",
  "two of them merged and founded a city",
];

export function meanwhile(seed: string, durationMs: number): Meanwhile {
  const rng = rngFor(`meanwhile:${seed}`);
  const s = Math.max(1, durationMs / 1000);
  const china = Math.max(1, Math.round(s * 0.044 + rng() * 1.2));
  const us = Math.round(s * 0.012 + rng() * 0.9);
  const usRaisedBn = Math.max(1, Math.round(s * 0.2 + rng() * 9));
  const regulations = Math.max(1, Math.round(s * 0.1 + rng() * 2));
  const forms = Math.round(s * 1.6 + rng() * 30);
  const chinaNote = pick(rng, CN_NOTES);
  const secs = Math.round(s);
  const line =
    `During your ${secs} s, China released ${china} more model${china === 1 ? "" : "s"} — ${chinaNote}. ` +
    `The US released ${us} and raised $${usRaisedBn} bn. ` +
    `Europe adopted ${regulations} new regulation${regulations === 1 ? "" : "s"} and ${forms} forms.`;
  return { china, us, usRaisedBn, regulations, forms, chinaNote, line };
}
