/** ?embed=1: tell the host (iPhone WKWebView or an iframe parent) that a game ended. */
export interface ScoreMessage {
  type: "score";
  game: string;
  score: number;
  rank: number | null;
  title?: string | null;
  name?: string;
  durationMs?: number;
  [k: string]: unknown;
}

interface WebkitWindow {
  webkit?: { messageHandlers?: { eurocrat?: { postMessage(m: unknown): void } } };
}

export function postScore(msg: ScoreMessage): void {
  try {
    (window as unknown as WebkitWindow).webkit?.messageHandlers?.eurocrat?.postMessage(msg);
  } catch {
    /* not in the app */
  }
  try {
    if (window.parent !== window) window.parent.postMessage(msg, "*");
  } catch {
    /* cross-origin parent gone */
  }
}
