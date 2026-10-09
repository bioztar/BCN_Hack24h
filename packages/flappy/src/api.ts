export const GAME = "flappy";
const params = new URLSearchParams(location.search);
const flag = (k: string): boolean => params.has(k) && params.get(k) !== "0" && params.get(k) !== "false";
export const MOCK = flag("mock");
export const EMBED = flag("embed");

export interface Session {
  seed: string | number;
  token: string | null;
  local: boolean;
  at: number;
}
export interface Entry {
  name: string;
  score: number;
  me?: boolean;
}
export interface Board {
  entries: Entry[];
  local: boolean;
}
export interface ScoreSubmission {
  name: string;
  score: number;
  durationMs: number;
  session: Session;
  stats: Record<string, string | number>;
}

const LB_KEY = "flappy.lb.v1";
const NAME_KEY = "flappy.name";
const BEST_KEY = "flappy.best";

async function fetchJson<T>(url: string, init?: RequestInit, ms = 3000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const localSeed = (): number => (Math.random() * 2 ** 32) >>> 0;

export async function startSession(): Promise<Session> {
  if (!MOCK) {
    try {
      const r = await fetchJson<{ seed: string | number; token: string }>(`/api/game/start?game=${GAME}`);
      if (r && (typeof r.seed === "string" || typeof r.seed === "number")) return { seed: r.seed, token: r.token ?? null, local: false, at: Date.now() };
    } catch (err) {
      console.info("[flappy] leaderboard offline, local register:", (err as Error).name);
    }
  }
  return { seed: localSeed(), token: null, local: true, at: Date.now() };
}

function readLocal(): Entry[] {
  try {
    const v = JSON.parse(localStorage.getItem(LB_KEY) ?? "[]") as Entry[];
    return Array.isArray(v) ? v.filter((e) => typeof e?.name === "string" && Number.isFinite(e?.score)) : [];
  } catch {
    return [];
  }
}
function writeLocal(entries: Entry[]): void {
  try {
    localStorage.setItem(LB_KEY, JSON.stringify(entries.slice(0, 20)));
  } catch {
    /* private mode */
  }
}
const sortEntries = (a: Entry[]): Entry[] => a.sort((x, y) => y.score - x.score);

function addLocal(name: string, score: number): number {
  const all = readLocal().map((e) => ({ name: e.name, score: e.score }));
  const mine: Entry = { name, score, me: true };
  all.push(mine);
  sortEntries(all);
  const rank = all.indexOf(mine) + 1;
  writeLocal(all.map(({ name: n, score: s }) => ({ name: n, score: s })));
  return rank;
}

export async function submitScore(sub: ScoreSubmission): Promise<{ rank: number | null; local: boolean }> {
  const name = sub.name.trim().slice(0, 24) || "Anonymous applicant";
  if (!sub.session.local && sub.session.token) {
    try {
      const r = await fetchJson<{ rank?: number }>(`/api/game/score`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game: GAME, name, score: sub.score, durationMs: Math.round(sub.durationMs), seed: sub.session.seed, token: sub.session.token, stats: sub.stats }),
      });
      addLocal(name, sub.score);
      return { rank: typeof r.rank === "number" ? r.rank : null, local: false };
    } catch (err) {
      console.info("[flappy] score not filed remotely:", (err as Error).name);
    }
  }
  return { rank: addLocal(name, sub.score), local: true };
}

export async function leaderboard(preferLocal: boolean): Promise<Board> {
  if (!MOCK && !preferLocal) {
    try {
      const r = await fetchJson<unknown>(`/api/game/leaderboard?game=${GAME}&limit=10`);
      const raw = Array.isArray(r) ? r : (r as { entries?: unknown }).entries;
      if (Array.isArray(raw)) {
        const entries = raw
          .map((e) => ({ name: String((e as Entry).name ?? "?").slice(0, 24), score: Number((e as Entry).score) }))
          .filter((e) => Number.isFinite(e.score));
        return { entries: entries.slice(0, 10), local: false };
      }
    } catch {
      /* fall through to local */
    }
  }
  return { entries: sortEntries(readLocal()).slice(0, 10), local: true };
}

export const savedName = (): string => {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
};
export const saveName = (n: string): void => {
  try {
    localStorage.setItem(NAME_KEY, n.slice(0, 24));
  } catch {
    /* ignore */
  }
};
export function bestScore(update?: number): number {
  let best = 0;
  try {
    best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
    if (update !== undefined && update > best) {
      best = update;
      localStorage.setItem(BEST_KEY, String(best));
    }
  } catch {
    if (update !== undefined) best = Math.max(best, update);
  }
  return best;
}

export function postScoreToHost(msg: Record<string, unknown>): void {
  const payload = { type: "score", game: GAME, ...msg };
  try {
    (window as unknown as { webkit?: { messageHandlers?: { eurocrat?: { postMessage(m: unknown): void } } } }).webkit?.messageHandlers?.eurocrat?.postMessage(payload);
  } catch {
    /* not in WKWebView */
  }
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage(payload, "*");
  } catch {
    /* cross-origin */
  }
}
