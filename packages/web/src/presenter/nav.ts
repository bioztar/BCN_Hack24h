export const NAV_KEY = "eurocrat.stage.nav";
export const TIP_KEY = "eurocrat.stage.tip";
export const REPORT_URL = "https://warden.pro7ocol.com/analyze/";

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function safeStore(): KV | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The presenter bar is visible unless the presenter hid it with H. */
export function navHidden(s: KV | null): boolean {
  try {
    return s?.getItem(NAV_KEY) === "hidden";
  } catch {
    return false;
  }
}

export function setNavHidden(s: KV | null, hidden: boolean): void {
  try {
    s?.setItem(NAV_KEY, hidden ? "hidden" : "visible");
  } catch {
    /* private mode: not remembered */
  }
}

/** True exactly once per browser (always true when storage is unavailable). */
export function firstRun(s: KV | null): boolean {
  try {
    if (!s) return true;
    if (s.getItem(TIP_KEY)) return false;
    s.setItem(TIP_KEY, "1");
    return true;
  } catch {
    return true;
  }
}

const keepMock = (search: string, q: URLSearchParams) => {
  if (new URLSearchParams(search).get("mock") === "1") q.set("mock", "1");
  const s = q.toString();
  return s ? `/?${s}` : "/";
};

/** The v1 hearing driven from this screen; a rehearsal stage hands off to a rehearsal hearing. */
export const playHref = (search: string) => keepMock(search, new URLSearchParams({ play: "1" }));
export const stageHref = (search: string) => keepMock(search, new URLSearchParams());
