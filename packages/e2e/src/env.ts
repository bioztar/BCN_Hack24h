const strip = (u: string) => u.replace(/\/+$/, "");

export const BASE_URL = strip(process.env.BASE_URL ?? "https://eurocrat.pro7ocol.com");
export const WARDEN_URL = strip(process.env.WARDEN_URL ?? "https://warden.pro7ocol.com");
/** `E2E_LIVE=0` runs only the UI checks that need no live case (`?mock=1`, static pages, GET shapes). */
export const LIVE = process.env.E2E_LIVE !== "0";
/** Hard cap on live cases (POST /api/case or POST /api/analyze) per full run. */
export const MAX_LIVE_CASES = Number(process.env.E2E_MAX_LIVE_CASES ?? 6);
/** Server-side round budget (stream open → awaiting/verdict). */
export const ROUND_MS = Number(process.env.E2E_ROUND_MS ?? 25_000);
/** UI-side round budget: the server round plus playing every line (TTS or reading time). */
export const UI_ROUND_MS = Number(process.env.E2E_UI_ROUND_MS ?? 150_000);

/** Which project runs each live flow (one live case per spec, not one per browser). */
export const LIVE_PROJECT = {
  stage: process.env.E2E_LIVE_STAGE ?? "desktop-chromium",
  pocket: process.env.E2E_LIVE_POCKET ?? "mobile-webkit",
  analyzer: process.env.E2E_LIVE_ANALYZER ?? "desktop-chromium",
  api: "api",
} as const;

export const PITCH =
  "Rehearsal GmbH (QA run): an AI app that reads job applicants' faces on webcam to score their honesty, " +
  "stores the recordings forever on a US server and sells the scores to landlords. Pre-revenue, post-vibes.";
export const REPLIES = [
  "But we have a privacy policy. It is a PDF of a cat.",
  "Our lawyer is also an AI, so it is compliant by definition.",
  "We will move to Luxembourg. Or the Moon.",
  "Fine. We pivot to blockchain.",
];
export const TIER_NAMES = ["Pre-consultation", "Committee", "Trilogue", "Delegated Act", "Official Journal"] as const;
export const POCKET_URL = "https://eurocrat.pro7ocol.com/pocket/";
