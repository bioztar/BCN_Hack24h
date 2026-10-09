const params = new URLSearchParams(location.search);

export const MOCK = params.get("mock") === "1";
/** `?skip=intro` jumps over cookie banner + queue ticket (rehearsals). */
export const SKIP_INTRO = params.get("skip") === "intro";
/** `?speak=1` reads lines without audioUrl through the browser's speech synthesis. */
export const SPEAK = params.get("speak") === "1";

/** Keeps the mock flag (and friends) when linking between the stage and the wall. */
export function withFlags(path: string): string {
  const keep = new URLSearchParams();
  for (const k of ["mock", "speak"]) {
    const v = params.get(k);
    if (v) keep.set(k, v);
  }
  const q = keep.toString();
  return q ? `${path}?${q}` : path;
}

/** Deploy hosts (CONTRACT "Deploy target"). */
export const POCKET_URL = "https://eurocrat.pro7ocol.com/pocket/";
export const REPORT_URL = "https://warden.pro7ocol.com/analyze/";
