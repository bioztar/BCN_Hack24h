const params = new URLSearchParams(location.search);

export const MOCK = params.get("mock") === "1";
/** `?skip=intro` jumps over cookie banner + queue ticket (rehearsals). */
export const SKIP_INTRO = params.get("skip") === "intro";
/** `?speak=1` (default in `?mock=1`, off with `speak=0`) reads lines without audioUrl through the browser's speech synthesis. */
/** Express hearing (one stream, tiers 1→5, verdict, one appeal) by default; `?express=1` / `?express=0` override. */
export const EXPRESS_DEFAULT = true;
export const EXPRESS = params.get("express") === "1" || (EXPRESS_DEFAULT && params.get("express") !== "0");
export const SPEAK = params.get("speak") === "1" || (MOCK && params.get("speak") !== "0");

/** Keeps the mock flag (and friends) when linking between the stage and the wall. */
export function withFlags(path: string): string {
  const keep = new URLSearchParams();
  for (const k of ["mock", "speak", "express"]) {
    const v = params.get(k);
    if (v) keep.set(k, v);
  }
  const q = keep.toString();
  return q ? `${path}?${q}` : path;
}

/** Deploy hosts (CONTRACT "Deploy target"). */
export const POCKET_URL = "https://eurocrat.pro7ocol.com/pocket/";
export const REPORT_URL = "https://warden.pro7ocol.com/analyze/";
